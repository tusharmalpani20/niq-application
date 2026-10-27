import json
import unittest
from unittest.mock import patch

import sentry_checkin as sentry


class OperationsTelemetryTests(unittest.TestCase):
    def test_failure_always_finishes_started_checkin_without_exception_contents(self):
        delivered = []
        config = {"sentry_dsn": "configured"}

        def operation():
            raise RuntimeError("private-patient-name-and-password")

        with patch.object(sentry, "send", side_effect=lambda *args: delivered.append(args)):
            with self.assertRaises(RuntimeError):
                sentry.monitored(config, "backup", operation, production=True)
        self.assertEqual([item[1] for item in delivered], ["check_in", "event", "check_in"])
        self.assertEqual(delivered[0][2]["status"], "in_progress")
        self.assertEqual(delivered[2][2]["status"], "error")
        self.assertEqual(delivered[0][2]["check_in_id"], delivered[2][2]["check_in_id"])
        self.assertNotIn("private-patient", json.dumps(delivered))

    def test_success_finishes_with_ok(self):
        delivered = []
        with patch.object(sentry, "send", side_effect=lambda *args: delivered.append(args)):
            sentry.monitored({"sentry_dsn": "configured"}, "backup", lambda: None, production=True)
        self.assertEqual([item[2]["status"] for item in delivered], ["in_progress", "ok"])
        self.assertEqual(delivered[0][2]["monitor_config"]["timezone"], "Asia/Kolkata")

    def test_development_drill_never_registers_production_monitor(self):
        with patch.object(sentry, "send") as telemetry:
            sentry.monitored({"sentry_dsn": "configured", "restore_monitor_slug": "quarterly"}, "restore-test", lambda: None)
            telemetry.assert_not_called()

    def test_failure_of_manual_restore_is_reported_without_a_cron_monitor(self):
        with patch.object(sentry, "send") as telemetry:
            with self.assertRaises(ValueError):
                sentry.monitored({"sentry_dsn": "configured"}, "restore-test", lambda: int("invalid"))
        self.assertEqual(telemetry.call_count, 1)
        self.assertEqual(telemetry.call_args.args[1], "event")

    def test_dsn_validation_rejects_non_sentry_secret_urls_and_redirects(self):
        key = "a" * 32
        self.assertEqual(sentry.endpoint(f"https://{key}@o123.ingest.us.sentry.io/456")[0], "https://o123.ingest.us.sentry.io/api/456/envelope/")
        for dsn in (f"http://{key}@o123.ingest.sentry.io/456", f"https://{key}:secret@o123.ingest.sentry.io/456",
                    f"https://{key}@o123.ingest.sentry.io.evil.test/456", f"https://{key}@o123.ingest.sentry.io/456?secret=x",
                    f"https://{key}@o123.ingest.sentry.io:444/456", f"https://{key}@localhost/456"):
            with self.subTest(dsn=dsn), self.assertRaises(ValueError):
                sentry.endpoint(dsn)
        self.assertIsNone(sentry.NoRedirects().redirect_request(None, None, 302, "redirect", {}, "https://evil.test"))


if __name__ == "__main__":
    unittest.main()
