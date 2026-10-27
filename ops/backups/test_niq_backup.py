import datetime as dt
import io
import json
import os
from pathlib import Path
import tarfile
import shutil
import tempfile
import unittest
from unittest.mock import patch

import niq_backup as backup


class BackupSafetyTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("gpg"), "GPG required for encryption roundtrip")
    def test_real_encrypted_archive_roundtrip_and_wrong_passphrase(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            home = root / "gnupg"
            home.mkdir(mode=0o700)
            source = root / "source"
            source.mkdir()
            (source / "upload.pdf").write_bytes(b"%PDF-fixture")
            manifest = {"hashes": {"upload.pdf": backup.digest(source / "upload.pdf")}}
            (source / "manifest.json").write_text(json.dumps(manifest))
            bundle = root / "source.tar"
            with tarfile.open(bundle, "w") as tar:
                for entry in source.iterdir():
                    tar.add(entry, arcname=entry.name)
            archive = root / "archive.gpg"
            passphrase = b"test-only-independent-backup-passphrase"
            with patch.dict(os.environ, {"GNUPGHOME": str(home)}):
                backup.run(["gpg", "--no-options", "--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
                            "--symmetric", "--cipher-algo", "AES256", "--output", str(archive), str(bundle)], data=passphrase + b"\n")
                restored = backup.verify_archive(archive, passphrase, root / "restored")
                self.assertEqual(restored, manifest)
                self.assertEqual((root / "restored/upload.pdf").read_bytes(), b"%PDF-fixture")
                with self.assertRaises(RuntimeError):
                    backup.verify_archive(archive, b"wrong-recovery-passphrase", root / "rejected")

    def test_connection_secrets_are_environment_only_and_ssl_survives_database_override(self):
        result = backup.db_env("postgresql://operator:password%40example@db.example:5433/postgres?sslmode=verify-full")
        self.assertEqual(result["PGPASSWORD"], "password@example")
        self.assertEqual(result["PGHOST"], "db.example")
        self.assertEqual(result["PGSSLMODE"], "verify-full")
        self.assertEqual(result["PGDATABASE"], "postgres")

    def test_requires_both_production_environments(self):
        self.assertFalse(backup.production([{"NODE_ENV": "production"}, {"NODE_ENV": "development"}]))
        self.assertFalse(backup.production([{}, {"NODE_ENV": "production"}]))
        self.assertTrue(backup.production([{"NODE_ENV": "production"}] * 2))

    def test_retains_30_daily_and_12_weekly_snapshots(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            latest = dt.datetime(2026, 10, 27, 2)
            snapshots = []
            for day in range(120):
                path = root / f"niq-{latest - dt.timedelta(days=day):%Y%m%dT%H%M%S}.tar.gpg"
                path.touch()
                snapshots.append(path)
            sentinel = root / "patient-upload.pdf"
            sentinel.touch()
            expired = set(backup.retention_candidates(root.iterdir()))
            self.assertFalse(expired.intersection(snapshots[:30]))
            self.assertNotIn(sentinel, expired)
            retained = [path for path in snapshots if path not in expired]
            self.assertEqual(len(retained), 37)  # 30 daily span 5 weeks; retain 7 older weekly copies.
            self.assertIn(snapshots[72], retained)
            self.assertIn(snapshots[119], expired)

    def test_rejects_traversal_and_symlinks_in_archive(self):
        for name, kind in [("../escaped", tarfile.REGTYPE), ("link", tarfile.SYMTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / "invalid.tar"
                with tarfile.open(archive, "w") as tar:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    tar.addfile(member, io.BytesIO(b""))
                with self.assertRaises(ValueError):
                    backup.safe_extract(archive, root / "output")

    def test_rejects_recovery_key_included_by_source_directory(self):
        config = {"backup_root": "/private/backups", "passphrase_file": "/private/secrets/recovery", "server_files": ["/private/secrets"]}
        with self.assertRaises(ValueError):
            backup.validate_locations(config, "/private/uploads")

    def test_extracts_private_files_without_archive_modes_or_overwrites(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "fixture.tar"
            with tarfile.open(archive, "w") as tar:
                member = tarfile.TarInfo("nested/file")
                member.mode = 0o777
                member.size = 4
                tar.addfile(member, io.BytesIO(b"safe"))
            backup.safe_extract(archive, root / "output")
            target = root / "output/nested/file"
            self.assertEqual(target.read_bytes(), b"safe")
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(target.parent.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                backup.safe_extract(archive, root / "output")

    def test_rejects_backup_directory_inside_uploaded_files(self):
        config = {"backup_root": "/private/uploads/backups", "passphrase_file": "/private/recovery"}
        with self.assertRaises(ValueError):
            backup.validate_locations(config, "/private/uploads")

    def test_development_does_not_quiesce_or_capture(self):
        config = {"environments": {"application": "app", "scoring": "score"}}
        with patch.object(backup, "env_file", return_value={"NODE_ENV": "development"}), patch.object(backup, "run") as command, patch.object(backup.sentry_checkin, "send") as telemetry:
            backup.backup(config)
            command.assert_not_called()
            telemetry.assert_not_called()

    def test_failed_capture_resumes_services_and_never_prunes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            key = root / "recovery"
            key.write_text("x" * 48)
            key.chmod(0o600)
            uploads = root / "uploads"
            uploads.mkdir()
            config = {"environments": {"application": "app", "scoring": "score"}, "backup_root": str(root / "backups"),
                      "passphrase_file": str(key), "quiesce": ["stop-services"], "resume": ["start-services"]}
            settings = {"NODE_ENV": "production", "DATABASE_URL": "postgres://localhost/test", "REPORT_UPLOAD_ROOT": str(uploads)}
            calls = []

            def command(args, **kwargs):
                calls.append(args[0])
                if args[0] == "pg_dump":
                    raise RuntimeError("failed capture")
                return b""

            with patch.object(backup, "env_file", return_value=settings), patch.object(backup, "run", side_effect=command), patch.object(backup, "retention_candidates") as retention:
                with self.assertRaises(RuntimeError):
                    backup.backup(config)
                self.assertEqual(calls, ["stop-services", "pg_dump", "start-services"])
                retention.assert_not_called()
            self.assertEqual([p.name for p in (root / "backups").iterdir()], [".lock"])

    def test_restore_rejects_superuser_before_any_database_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            key = Path(temporary) / "recovery"
            key.write_text("x" * 48)
            key.chmod(0o600)
            config = {"passphrase_file": str(key), "restore_test_env": "test", "environments": {"application": "app", "scoring": "score"}}
            with patch.object(backup, "env_file", return_value={"DATABASE_URL": "postgres://super@localhost/postgres"}), patch.object(backup, "sql", return_value="unsafe"), patch.object(backup, "run") as command:
                with self.assertRaises(ValueError):
                    backup.restore_isolated(config, "unused")
                command.assert_not_called()

    def test_restore_rejects_live_database_service_login(self):
        with tempfile.TemporaryDirectory() as temporary:
            key = Path(temporary) / "recovery"
            key.write_text("x" * 48)
            key.chmod(0o600)
            config = {"passphrase_file": str(key), "restore_test_env": "test", "environments": {"application": "app", "scoring": "score"}}
            settings = lambda path: {"DATABASE_URL": "postgres://worker@localhost/" + ("postgres" if path == "test" else "live")}
            with patch.object(backup, "env_file", side_effect=settings), patch.object(backup, "sql", return_value="restricted"), patch.object(backup, "run") as command:
                with self.assertRaises(ValueError):
                    backup.restore_isolated(config, "unused")
                command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
