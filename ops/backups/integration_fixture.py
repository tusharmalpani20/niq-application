#!/usr/bin/env python3
"""Explicit synthetic-only PostgreSQL/GPG/PDF drill; never loads runtime config."""
import json
import os
from pathlib import Path
import socket
import tempfile

import niq_backup as backup
from pm2_writers import admission_barrier


def private_write(path, content):
    path.write_text(content)
    path.chmod(0o600)


def prove_admission_barrier(app, scoring):
    # Only synthetic tables in the temporary cluster. A timed-out write must
    # become valid immediately after release, proving lock rather than SQL failure.
    environments = {'application': {'DATABASE_URL': app}, 'scoring': {'DATABASE_URL': scoring}}
    statements = [(app, "INSERT INTO generated_reports SELECT * FROM generated_reports WHERE false"),
                  (scoring, "INSERT INTO report_content_jobs SELECT * FROM report_content_jobs WHERE false"),
                  (scoring, "INSERT INTO report_generation_runs SELECT * FROM report_generation_runs WHERE false"),
                  (scoring, "UPDATE report_content_jobs SET status='PROCESSING' WHERE false")]
    with admission_barrier(environments):
        for url, statement in statements:
            # Read-only queue checks remain available while writes wait.
            backup.sql(url, 'SELECT 1;')
            try:
                backup.sql(url, "SET statement_timeout='150ms'; BEGIN; " + statement + '; ROLLBACK;')
            except RuntimeError:
                continue
            raise RuntimeError('Report admission escaped the backup barrier')
    for url, statement in statements:
        backup.sql(url, 'BEGIN; ' + statement + '; ROLLBACK;')
    print('Synthetic admission barrier verified: queued/direct reservations and worker claims blocked; reads continue')


def main():
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="niq-synthetic-restore-") as temporary:
        root = Path(temporary)
        cluster = root / "postgres"
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        backup.run(["initdb", "-D", str(cluster), "-U", "fixture_admin", "--auth=trust", "--no-locale", "--encoding=UTF8"])
        try:
            backup.run(["pg_ctl", "-D", str(cluster), "-l", str(root / "postgres.log"), "-o",
                        f"-h 127.0.0.1 -p {port} -k {root}", "-w", "start"])
            admin = f"postgresql://fixture_admin@127.0.0.1:{port}/postgres"
            backup.sql(admin, "CREATE ROLE fixture_app LOGIN; CREATE ROLE fixture_scoring LOGIN; "
                       "CREATE ROLE fixture_restore LOGIN CREATEDB;")
            backup.sql(admin, "CREATE DATABASE fixture_app OWNER fixture_app;")
            backup.sql(admin, "CREATE DATABASE fixture_scoring OWNER fixture_scoring;")
            app = f"postgresql://fixture_app@127.0.0.1:{port}/fixture_app"
            scoring = f"postgresql://fixture_scoring@127.0.0.1:{port}/fixture_scoring"
            helper = Path(__file__).with_name('actual_schema_fixture.ts')
            uploads = root / "uploads"
            uploads.mkdir(mode=0o700)
            def fixture(action, url, **extra):
                value = {"action": action, "url": url, "uploads": str(uploads), **extra}
                return json.loads(backup.run(['bun', str(helper)], data=json.dumps(value).encode()))
            applied_app = fixture('migrate', app, kind='application')['migrations']
            applied_scoring = fixture('migrate', scoring, kind='scoring')['migrations']
            metadata = fixture('seed', app)
            fixture('verify', app, metadata=metadata)
            backup.sql(scoring, "INSERT INTO clients(id,name) VALUES ('00000000000000000000000001','Synthetic rule tenant');")
            # Explicit grants: the restore account cannot connect to either source DB.
            backup.sql(admin, "REVOKE CONNECT ON DATABASE fixture_app, fixture_scoring FROM PUBLIC;")
            for database in ('fixture_app', 'fixture_scoring'):
                forbidden = f"postgresql://fixture_restore@127.0.0.1:{port}/{database}"
                try:
                    backup.sql(forbidden, 'SELECT 1;')
                except RuntimeError:
                    continue
                raise RuntimeError('Restore account can access a source database')
            prove_admission_barrier(app, scoring)
            from compose_writers import TABLES, IDLE
            with admission_barrier({'application': {'DATABASE_URL': app}}, TABLES):
                if backup.sql(app, IDLE) != '0':
                    raise RuntimeError('Application-only fixture is not idle')
                for table in TABLES['application'].split(', '):
                    try:
                        backup.sql(app, "SET statement_timeout='100ms'; BEGIN; INSERT INTO " + table + " SELECT * FROM " + table + " WHERE false; ROLLBACK;")
                    except RuntimeError:
                        continue
                    raise RuntimeError('Application-only admission escaped backup fence')
            print('Application-only admission fences verified on real schema')
            original_counts = {'application': backup.counts(app), 'scoring': backup.counts(scoring)}
            fixture_key = metadata['key']
            private_write(root / "application.env", f"NODE_ENV=production\nDATABASE_URL={app}\nREPORT_UPLOAD_ROOT={uploads}\n"
                          f"PATIENT_DATA_ENCRYPTION_KEY={fixture_key}\nSESSION_SECRET={metadata['secret']}\n")
            private_write(root / "scoring.env", f"NODE_ENV=production\nDATABASE_URL={scoring}\n")
            private_write(root / "restore.env", f"DATABASE_URL=postgresql://fixture_restore@127.0.0.1:{port}/postgres\n")
            private_write(root / "recovery", os.urandom(48).hex())
            private_write(root / "server-config.txt", "synthetic server-only config")
            config = {"environments": {"application": str(root / "application.env"), "scoring": str(root / "scoring.env")},
                      "backup_root": str(root / "archives"), "passphrase_file": str(root / "recovery"),
                      "restore_test_env": str(root / "restore.env"), "quiesce": ["true"], "resume": ["true"],
                      "server_files": [str(root / "server-config.txt")]}
            backup.backup(config)
            archive = next((root / "archives").glob("*.tar.gpg"))
            def verify_restored(name, target, contents):
                if name == 'application':
                    settings = backup.env_file(contents / 'application.env')
                    fixture('verify', target, metadata=metadata, uploads=str(contents / 'uploads'),
                            key=settings['PATIENT_DATA_ENCRYPTION_KEY'], session=settings['SESSION_SECRET'])
                    try:
                        fixture('verify', target, metadata=metadata, uploads=str(contents / 'uploads'),
                                key='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', session=settings['SESSION_SECRET'])
                    except RuntimeError:
                        pass
                    else:
                        raise RuntimeError('An incorrect encryption key decrypted the restored PDF')
                elif backup.sql(target, "SELECT name FROM clients;") != 'Synthetic rule tenant':
                    raise RuntimeError('Restored scoring tenant changed')
            backup.restore_isolated(config, archive, verify_restored=verify_restored)
            # BYOC captures/restores Application alone; remote Scoring is neither
            # configured nor contacted by this second archive path.
            application_only = dict(config, environments={"application": config["environments"]["application"]},
                                    backup_root=str(root / "application-archives"))
            backup.backup(application_only)
            application_archive = next((root / "application-archives").glob("*.tar.gpg"))
            backup.restore_isolated(application_only, application_archive, verify_restored=verify_restored)
            try:
                backup.restore_isolated(application_only, archive)
            except ValueError:
                pass
            else:
                raise RuntimeError("Application-only restore accepted a combined archive")
            print("Application-only backup and restore verified, including encrypted PDF and uploaded files")
            leftovers = backup.sql(admin, "SELECT count(*) FROM pg_database WHERE datname LIKE 'niq_restore_test_%';")
            if leftovers != "0":
                raise RuntimeError("Isolated restored databases were not removed")
            if backup.counts(app) != original_counts['application'] or backup.counts(scoring) != original_counts['scoring']:
                raise RuntimeError("Original synthetic database row counts changed")
            print(f"Actual-schema drill verified: {applied_app} application + {applied_scoring} scoring migrations, encrypted patient/assessment/PDF and upload relationships, "
                  "authorized download, wrong-key/hash rejection, tenant/facility denials, restore-login isolation and zero leftover test databases")
        finally:
            if (cluster / "postmaster.pid").exists():
                backup.run(["pg_ctl", "-D", str(cluster), "-m", "immediate", "-w", "stop"])
    print("Synthetic PostgreSQL cluster and all fixture files removed")


if __name__ == "__main__":
    main()
