"""Minimal allowlisted Sentry operations events; never serializes exceptions."""
import datetime as dt
import json
import re
import sys
import time
import uuid
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


def endpoint(dsn):
    parsed = urlsplit(dsn)
    if (parsed.scheme != "https" or parsed.password is not None or parsed.port not in (None, 443)
            or parsed.query or parsed.fragment or not parsed.hostname
            or not re.fullmatch(r"[a-zA-Z0-9.-]+\.ingest(?:\.[a-z]+)?\.sentry\.io", parsed.hostname)
            or not re.fullmatch(r"[a-fA-F0-9]{32}", parsed.username or "")
            or not re.fullmatch(r"/[0-9]+", parsed.path)):
        raise ValueError("Use a cloud Sentry project DSN with HTTPS and no private secret")
    return f"https://{parsed.hostname}/api{parsed.path}/envelope/", parsed.username


def send(dsn, kind, payload):
    if not dsn:
        return
    try:
        url, public_key = endpoint(dsn)
        header = {"sent_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        if kind == "event": header["event_id"] = payload["event_id"]
        body = (json.dumps(header) + "\n"
                + json.dumps({"type": kind}) + "\n" + json.dumps(payload) + "\n").encode()
        request = Request(url, data=body, headers={"Content-Type": "application/x-sentry-envelope",
                          "X-Sentry-Auth": f"Sentry sentry_version=7,sentry_key={public_key},sentry_client=niq-ops/1"})
        with build_opener(NoRedirects()).open(request, timeout=10) as response:
            if not 200 <= response.status < 300:
                raise ValueError("Sentry rejected operation event")
    except Exception:
        # Telemetry outages must not interrupt recovery, resume, or backup completion.
        print("NIQ operations telemetry delivery failed", file=sys.stderr)


def failure(config, action):
    if action not in ("backup", "restore-test"):
        raise ValueError("Unsupported operation")
    send(config.get("sentry_dsn"), "event", {"event_id": uuid.uuid4().hex, "timestamp": time.time(),
         "platform": "python", "level": "error", "message": f"NIQ {action} failed",
         "fingerprint": ["niq-operations", action], "tags": {"component": "operations", "operation": action}})


def monitored(config, action, operation, *, production=False):
    slug = config.get("backup_monitor_slug", "niq-production-backup") if action == "backup" else config.get("restore_monitor_slug")
    # Never create a production cron monitor for a development gate or manual dev drill.
    enabled = bool(production and slug and config.get("sentry_dsn"))
    check_in = uuid.uuid4().hex
    started = time.monotonic()

    def check(status):
        if not enabled:
            return
        payload = {"check_in_id": check_in, "monitor_slug": slug, "status": status,
                   "environment": "production", "duration": time.monotonic() - started}
        if action == "backup":
            payload["monitor_config"] = {"schedule": {"type": "crontab", "value": "0 2 * * *"},
                "timezone": "Asia/Kolkata", "checkin_margin": 60, "max_runtime": 180,
                "failure_issue_threshold": 1, "recovery_threshold": 1}
        send(config.get("sentry_dsn"), "check_in", payload)

    check("in_progress")
    try:
        result = operation()
    except BaseException:
        failure(config, action)
        check("error")
        raise
    check("ok")
    return result
