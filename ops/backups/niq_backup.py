#!/usr/bin/env python3
"""Private, encrypted same-host backups. Never restores over a live database."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import uuid
from zoneinfo import ZoneInfo
import sentry_checkin

ZONE = ZoneInfo("Asia/Kolkata")
ARCHIVE = re.compile(r"^niq-(\d{8}T\d{6})\.tar\.gpg$")


def private_file(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise ValueError("Configuration and passphrase files must be private regular files (0600)")
    return path


def env_file(path):
    result = {}
    for line in private_file(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key.strip()):
            raise ValueError("Unsupported environment file syntax")
        parsed = shlex.split(value, comments=True)
        if len(parsed) > 1:
            raise ValueError("Quote environment values containing spaces")
        result[key.strip()] = parsed[0] if parsed else ""
    return result


def production(environments):
    return all(env.get("NODE_ENV") == "production" for env in environments)


def run(command, *, environment=None, data=None):
    # Child stderr can contain connection strings or clinical values. Never forward it.
    result = subprocess.run(command, env=environment, input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=3600)
    if result.returncode:
        raise RuntimeError(f"{Path(command[0]).name} failed (exit {result.returncode}); details suppressed")
    return result.stdout


def gpg_operation(arguments, passphrase):
    # Symmetric loopback operations still contact gpg-agent. Isolate its home
    # from operator profiles, first-use startup state and ambient GNUPGHOME.
    # A short path also avoids Unix-domain socket length limits.
    with tempfile.TemporaryDirectory(prefix="niq-gpg-", dir="/tmp") as home:
        environment = dict(os.environ, GNUPGHOME=home)
        try:
            return run(["gpg", "--homedir", home, "--no-options", "--batch", "--no-symkey-cache",
                        "--pinentry-mode", "loopback", "--passphrase-fd", "0", *arguments],
                       environment=environment, data=passphrase + b"\n")
        finally:
            # Only stop this operation's agent; never affect the operator's agent.
            run(["gpgconf", "--homedir", home, "--kill", "gpg-agent"], environment=environment)


def db_env(url):
    from urllib.parse import urlsplit, unquote, parse_qsl
    parsed = urlsplit(url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise ValueError("Use an explicit PostgreSQL URI")
    # Ambient libpq service/host overrides must not redirect an isolated drill.
    environment = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    # libpq environment defaults do NOT expand a URI in PGDATABASE. Split the
    # connection into private env values rather than exposing its URI in argv.
    if not parsed.path.startswith("/") or len(parsed.path) == 1:
        raise ValueError("PostgreSQL URI must name a database")
    environment["PGDATABASE"] = unquote(parsed.path[1:])
    environment["PGHOST"] = parsed.hostname
    environment["PGPORT"] = str(parsed.port or 5432)
    if parsed.username:
        environment["PGUSER"] = unquote(parsed.username)
    if parsed.password:
        environment["PGPASSWORD"] = unquote(parsed.password)
    options = {"sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT", "sslcert": "PGSSLCERT",
               "sslkey": "PGSSLKEY", "application_name": "PGAPPNAME", "connect_timeout": "PGCONNECT_TIMEOUT"}
    for key, value in parse_qsl(parsed.query):
        if key not in options:
            raise ValueError("Unsupported PostgreSQL URI query option")
        environment[options[key]] = value
    environment["PGCONNECT_TIMEOUT"] = "15"
    return environment


def sql(url, statement):
    return run(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
               environment=db_env(url), data=statement.encode()).decode().strip()


def counts(url):
    tables = sql(url, "SELECT quote_ident(schemaname)||'.'||quote_ident(tablename) FROM pg_tables "
                 "WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;").splitlines()
    return {table: int(sql(url, f"SELECT count(*) FROM {table};")) for table in tables}


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def copy_source(source, target):
    source = Path(source)
    if not source.is_absolute() or not source.exists() or source.is_symlink():
        raise ValueError("Backup inputs must exist and be absolute non-symlink paths")
    if source.is_dir():
        for entry in source.rglob("*"):
            if entry.is_symlink() or (not entry.is_dir() and not entry.is_file()):
                raise ValueError("Backup sources cannot contain symlinks or special files")
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


def retention_candidates(paths):
    """Keep 30 newest nightly snapshots plus one per ISO week for 12 weeks."""
    snapshots = []
    for path in paths:
        match = ARCHIVE.fullmatch(path.name)
        if match and path.is_file() and not path.is_symlink():
            snapshots.append((dt.datetime.strptime(match[1], "%Y%m%dT%H%M%S"), path))
    snapshots.sort(reverse=True)
    keep = set()
    days = set()
    for timestamp, path in snapshots:
        day = timestamp.date()
        if day not in days and len(days) < 30:
            days.add(day)
            keep.add(path)
    weeks = set()
    for timestamp, path in snapshots:
        week = timestamp.isocalendar()[:2]
        if week not in weeks and len(weeks) < 12:
            weeks.add(week)
            keep.add(path)
    return [path for _, path in snapshots if path not in keep]


def safe_extract(archive, destination):
    destination = Path(destination)
    if destination.is_symlink():
        raise ValueError("Unsafe extraction destination")
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.stat().st_mode & 0o077:
        raise ValueError("Extraction destination must be private")
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            name = Path(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir()) or member.sparse:
                raise ValueError("Unsafe backup archive entry")
        # Python 3.10 compatible: never apply archive ownership, modes or links,
        # and never overwrite an existing file (including the tar being read).
        for member in tar.getmembers():
            name = Path(member.name)
            parents = name.parts if member.isdir() else name.parent.parts
            current = destination
            for part in parents:
                current = current / part
                if current.is_symlink() or (current.exists() and not current.is_dir()):
                    raise ValueError("Unsafe archive parent")
                current.mkdir(mode=0o700, exist_ok=True)
            if member.isfile():
                source = tar.extractfile(member)
                if source is None:
                    raise ValueError("Missing archive file content")
                descriptor = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with source, os.fdopen(descriptor, "wb") as output:
                    shutil.copyfileobj(source, output)


def load_config(path):
    config = json.loads(private_file(path).read_text())
    if set(config["environments"]) != {"application", "scoring"}:
        raise ValueError("Both application and scoring environment files are required")
    for command in ("quiesce", "resume"):
        if not isinstance(config.get(command), list) or not config[command] or not all(isinstance(arg, str) for arg in config[command]):
            raise ValueError("Explicit quiesce and resume command arrays are required")
    return config


def validate_locations(config, upload_root):
    root = Path(config["backup_root"]).resolve()
    secret = Path(config["passphrase_file"]).resolve()
    inputs = [Path(upload_root), *map(Path, config.get("server_files", [])),
              *map(Path, config.get("environments", {}).values())]
    for source in inputs:
        resolved = source.resolve()
        if resolved == Path("/") or resolved == root or resolved in root.parents or root in resolved.parents:
            raise ValueError("Backup storage and source locations must be disjoint")
        if resolved == secret or resolved in secret.parents:
            raise ValueError("Never bundle the external recovery passphrase")


def backup(config):
    try:
        environments = {name: env_file(path) for name, path in config["environments"].items()}
    except Exception:
        sentry_checkin.failure(config, "backup")
        raise
    if not production(environments.values()):
        print("Backup skipped: both applications must use NODE_ENV=production")
        return
    return sentry_checkin.monitored(config, "backup", lambda: capture(config, environments), production=True)


def capture(config, environments):
    root = Path(config["backup_root"])
    if not root.is_absolute() or root == Path("/") or root.is_symlink():
        raise ValueError("A dedicated absolute backup directory is required")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.stat().st_mode & 0o077:
        raise ValueError("Backup directory must have mode 0700")
    passphrase = private_file(config["passphrase_file"]).read_bytes().rstrip(b"\r\n")
    if len(passphrase) < 32:
        raise ValueError("Use a randomly generated recovery passphrase of at least 32 bytes")
    upload_root = environments["application"].get("REPORT_UPLOAD_ROOT")
    if not upload_root:
        raise ValueError("REPORT_UPLOAD_ROOT must be explicit before production backups")
    validate_locations(config, upload_root)
    # A failed capture never reaches retention. The lock also prevents overlapping timers.
    with (root / ".lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        timestamp = dt.datetime.now(ZONE).strftime("%Y%m%dT%H%M%S")
        final = root / f"niq-{timestamp}.tar.gpg"
        if final.exists():
            raise ValueError("Snapshot already exists")
        partial = root / (final.name + ".partial")
        try:
            with tempfile.TemporaryDirectory(prefix=".capture-", dir=root) as temporary:
                stage = Path(temporary)
                # Quiesce must stop BOTH APIs/workers and drain writes. Resume even on failure.
                try:
                    run(config["quiesce"])
                    manifest = {"format": 1, "timezone": "Asia/Kolkata", "counts": {}}
                    for name, environment in environments.items():
                        run(["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--file", str(stage / f"{name}.dump")],
                            environment=db_env(environment["DATABASE_URL"]))
                        manifest["counts"][name] = counts(environment["DATABASE_URL"])
                        copy_source(config["environments"][name], stage / f"{name}.env")
                    copy_source(upload_root, stage / "uploads")
                    for number, source in enumerate(config.get("server_files", [])):
                        copy_source(source, stage / f"server-{number}")
                    manifest["server_sources"] = config.get("server_files", [])
                    manifest["hashes"] = {str(p.relative_to(stage)): digest(p) for p in stage.rglob("*") if p.is_file()}
                    (stage / "manifest.json").write_text(json.dumps(manifest))
                finally:
                    run(config["resume"])
                bundle = stage / "snapshot.tar"
                with tarfile.open(bundle, "w") as tar:
                    for entry in stage.iterdir():
                        if entry != bundle:
                            tar.add(entry, arcname=entry.name)
                gpg_operation(["--yes", "--symmetric", "--cipher-algo", "AES256", "--output", str(partial), str(bundle)], passphrase)
                # Authenticate and check all captured files before publishing or pruning.
                verify_archive(partial, passphrase, stage / "verify")
                with partial.open("rb") as stream:
                    os.fsync(stream.fileno())
                os.replace(partial, final)
                directory_fd = os.open(root, os.O_DIRECTORY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            for expired in retention_candidates(root.iterdir()):
                expired.unlink()
            print("Backup complete: encrypted snapshot verified; retention applied")
        finally:
            partial.unlink(missing_ok=True)


def verify_archive(archive, passphrase, destination):
    destination.mkdir(mode=0o700)
    bundle = destination / "snapshot.tar"
    gpg_operation(["--output", str(bundle), "--decrypt", str(archive)], passphrase)
    safe_extract(bundle, destination)
    manifest = json.loads((destination / "manifest.json").read_text())
    for name, expected in manifest["hashes"].items():
        path = Path(name)
        if path.is_absolute() or ".." in path.parts or digest(destination / path) != expected:
            raise ValueError("Backup integrity verification failed")
    return manifest


def restore_test(config, archive):
    # Restore drills can run against controlled fixtures in development, but should
    # only heartbeat a production monitor if the runtime production gate passes.
    try:
        live = production(env_file(path) for path in config["environments"].values())
    except Exception:
        sentry_checkin.failure(config, "restore-test")
        raise
    return sentry_checkin.monitored(config, "restore-test", lambda: restore_isolated(config, archive), production=live)


def restore_isolated(config, archive, verify_restored=None):
    from urllib.parse import urlsplit, urlunsplit
    passphrase = private_file(config["passphrase_file"]).read_bytes().rstrip(b"\r\n")
    admin = env_file(config["restore_test_env"])["DATABASE_URL"]
    role = sql(admin, "SELECT CASE WHEN rolcreatedb AND NOT rolsuper AND NOT rolcreaterole "
               "AND NOT rolreplication THEN 'restricted' ELSE 'unsafe' END FROM pg_roles WHERE rolname=current_user;")
    if role != "restricted":
        raise ValueError("Restore drills require a restricted CREATEDB role, never a database superuser")
    for environment_path in config["environments"].values():
        live = urlsplit(env_file(environment_path)["DATABASE_URL"])
        test = urlsplit(admin)
        if (live.hostname, live.port or 5432, live.username) == (test.hostname, test.port or 5432, test.username):
            raise ValueError("Restore drills cannot reuse a live service database login")
    created = []
    with tempfile.TemporaryDirectory(prefix="niq-restore-test-") as temporary:
        stage = Path(temporary) / "contents"
        manifest = verify_archive(Path(archive), passphrase, stage)
        try:
            for name in ("application", "scoring"):
                database = "niq_restore_test_" + uuid.uuid4().hex
                # No caller-supplied target names or live URL accepted for restore.
                run(["createdb", "--maintenance-db=postgres", "--template=template0", database], environment=db_env(admin))
                created.append(database)
                parsed = urlsplit(admin)
                target = urlunsplit(parsed._replace(path="/" + database))
                run(["pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "--dbname", database, str(stage / f"{name}.dump")],
                    environment=db_env(target))
                if counts(target) != manifest["counts"][name]:
                    raise ValueError("Restored table counts differ from backup")
                if name == "application":
                    pdf = sql(target, "SELECT json_build_object('ciphertext', encode(encrypted_pdf,'base64'), "
                              "'sha256', sha256, 'size', size) FROM generated_report_artifacts LIMIT 1;")
                    if pdf:
                        value = json.loads(pdf)
                        settings = env_file(stage / "application.env")
                        value.update(key=settings.get("PATIENT_DATA_ENCRYPTION_KEY"), session=settings["SESSION_SECRET"])
                        run(["bun", str(Path(__file__).with_name("verify_pdf.ts"))], data=json.dumps(value).encode())
                        print("Restored PDF: decryption, PDF signature, size and SHA-256 verified")
                    else:
                        print("Restored PDF check skipped: backup contains no saved PDF artifact")
                # Acceptance fixtures can exercise restored service relationships before
                # the generated test databases are removed; the CLI exposes no target/hook.
                if verify_restored:
                    verify_restored(name, target, stage)
            print("Restore test passed: both isolated databases and captured file hashes verified")
        finally:
            failed = False
            for database in reversed(created):
                try:
                    run(["dropdb", "--maintenance-db=postgres", "--force", database], environment=db_env(admin))
                except (RuntimeError, subprocess.TimeoutExpired):
                    failed = True
            if failed:
                raise RuntimeError("Restore-test database removal failed; inspect isolated test database names")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["backup", "restore-test"])
    parser.add_argument("--config", required=True)
    parser.add_argument("--archive")
    args = parser.parse_args()
    config = load_config(args.config)
    if args.command == "backup":
        backup(config)
    elif args.archive:
        restore_test(config, args.archive)
    else:
        parser.error("restore-test requires --archive")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired):
        # Config parser, libpq and filesystem exceptions can contain private values.
        print("NIQ backup operation failed; inspect private configuration and dependencies")
        raise SystemExit(1)
