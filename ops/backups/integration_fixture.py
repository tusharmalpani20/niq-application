#!/usr/bin/env python3
"""Explicit synthetic-only PostgreSQL/GPG/PDF drill; never loads runtime config."""
import json
import os
from pathlib import Path
import socket
import tempfile

import niq_backup as backup


def private_write(path, content):
    path.write_text(content)
    path.chmod(0o600)


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
            # Only fake data: exercise the actual production AES-GCM helper.
            helper = Path(__file__).resolve().parents[2] / "apps/api/src/security/patient-data.ts"
            fixture = json.loads(backup.run(["bun", "-e", "import {encryptPatientBytes} from " + json.dumps(str(helper)) + ";"
                "import {createHash} from 'node:crypto';const key=Buffer.alloc(32,7);"
                "const pdf=Buffer.from('%PDF-1.7\\nSynthetic backup drill\\n%%EOF');"
                "console.log(JSON.stringify({key:key.toString('base64'),ciphertext:encryptPatientBytes(pdf,key).toString('base64'),"
                "size:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')}));"]))
            backup.sql(app, "CREATE TABLE fixture_assessments(id integer PRIMARY KEY, note text); "
                       "INSERT INTO fixture_assessments VALUES (1,'synthetic only'),(2,'synthetic only'); "
                       "CREATE TABLE generated_report_artifacts(encrypted_pdf bytea,sha256 text,size integer); "
                       f"INSERT INTO generated_report_artifacts VALUES (decode('{fixture['ciphertext']}','base64'),"
                       f"'{fixture['sha256']}',{fixture['size']});")
            backup.sql(scoring, "CREATE TABLE fixture_rules(id integer PRIMARY KEY, label text); "
                       "INSERT INTO fixture_rules VALUES (1,'synthetic rule');")
            uploads = root / "uploads"
            uploads.mkdir(mode=0o700)
            private_write(uploads / "fixture.txt", "synthetic uploaded file")
            private_write(root / "application.env", f"NODE_ENV=production\nDATABASE_URL={app}\nREPORT_UPLOAD_ROOT={uploads}\n"
                          f"PATIENT_DATA_ENCRYPTION_KEY={fixture['key']}\nSESSION_SECRET=synthetic-only\n")
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
            backup.restore_test(config, archive)
            leftovers = backup.sql(admin, "SELECT count(*) FROM pg_database WHERE datname LIKE 'niq_restore_test_%';")
            if leftovers != "0":
                raise RuntimeError("Isolated restored databases were not removed")
            if backup.counts(app) != {'public.fixture_assessments': 2, 'public.generated_report_artifacts': 1}:
                raise RuntimeError("Original synthetic application data changed")
            if backup.counts(scoring) != {'public.fixture_rules': 1}:
                raise RuntimeError("Original synthetic scoring data changed")
            print("Synthetic drill verified: application rows 2+1 PDF, scoring rows 1, upload/config hashes, "
                  "saved-PDF decryption and zero leftover restored databases; original fixture databases unchanged")
        finally:
            if (cluster / "postmaster.pid").exists():
                backup.run(["pg_ctl", "-D", str(cluster), "-m", "immediate", "-w", "stop"])
    print("Synthetic PostgreSQL cluster and all fixture files removed")


if __name__ == "__main__":
    main()
