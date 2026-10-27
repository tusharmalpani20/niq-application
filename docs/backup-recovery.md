# Production backups and isolated restore drills

## Scope and retention

`ops/backups/niq_backup.py` captures **both** application and scoring databases (including saved encrypted PDFs), the application's configured `REPORT_UPLOAD_ROOT`, both private environment files, and explicitly listed server-only configuration/scripts. Git supplies committed source code. List every intentional uncommitted server file under `server_files`; do not assume that a checkout backup is necessary or that unlisted local files are covered.

Backups run only when **both configured environment files say `NODE_ENV=production`**. Keep those files aligned with the running API processes. Development runs exit successfully without reading databases or stopping services. The timer is nightly at 02:00 Asia/Kolkata. Keep the latest 30 successful nightly snapshots and one snapshot in each of the latest 12 represented ISO weeks (weekly copies overlap daily copies). Failed capture, encryption or verification does not prune anything. This retention affects only completed backup archives, never live clinical records. Assessments, reports and valid uploads remain indefinitely. No application cleanup feature is introduced.

Backups on the same server do not protect against server or disk loss. That limitation is accepted for this initial setup; add an independent destination before relying on disaster recovery.

## Provisioning

Requirements: Python 3.10+, PostgreSQL client tools compatible with the server, GnuPG, Bun and the checked-out application's existing crypto helper. Use a dedicated 0700 archive directory, private 0600 configuration/env/passphrase files and trusted parent directories. Allow enough free disk for dumps, files, a tar bundle, encrypted output and a verification extraction simultaneously. Temporary plaintext is restricted to the private archive staging directory and removed on normal completion or failure. A killed process or host crash can leave private staging files; investigate these manually. No automated cleanup of live data is performed.

1. Copy `ops/backups/config.example.json` to a private operator location outside Git and set mode 0600. Confirm every absolute path, including `REPORT_UPLOAD_ROOT`. Missing sources cause failure. Sources containing symlinks or special files are rejected.
2. Generate an independent random recovery passphrase of at least 32 bytes into the configured 0600 file. Never paste it into a command argument, Git, logs or the backup configuration. Keep an additional encrypted recovery copy in a separately controlled location accessible to the named recovery owner. **The recovery passphrase must not be in any captured directory.** If all copies of it are lost, these archives cannot be recovered.
3. Both runtime `.env` files are captured **inside the encrypted archive**, including encryption keys required for old records. Those runtime keys do not decrypt the outer backup. The independent recovery passphrase remains outside it.
4. Configure `quiesce` and `resume` as trusted, noninteractive command arrays. The included `pm2_writers.py` adapter controls only the two NIQ API process names, records which were running and refuses to pause while report work is queued or active. It requires a private `writer_state_file`. A postponed backup is reported as a failure for operator attention, rather than interrupting paid report generation. They must pause **both APIs and every background writer**, wait for in-flight writes to finish, and restart those same processes. Resume must be safe after a partial stop. Otherwise database/files consistency is not guaranteed. The capture always attempts resume, including failures. Never put credentials in these command arrays.
5. Configure an isolated PostgreSQL restore-test login in a private env file containing only `DATABASE_URL`. Prefer a separate PostgreSQL instance/database cluster; it needs CREATEDB but must have no access to live databases. It must reach the `postgres` maintenance database. The CLI rejects superuser/CREATEROLE/replication roles and the live service login on the same endpoint. When using the same PostgreSQL cluster, provision explicit database permissions and verify the restore role cannot connect to live databases (including inherited PUBLIC privileges); the CLI's generated target-name guard does not replace database grants. The tool generates random `niq_restore_test_<uuid>` names, restores only to them and drops them in a finally block. No target name can be supplied by the caller. A killed drill may leave a test database; inspect names manually before removal.
6. Install the example service/timer only after reviewing account/path assumptions. The service's PATH must resolve PostgreSQL tools, GPG and Bun, and the writer control scripts must resolve PM2 correctly. The production gate remains in the CLI even if the timer is enabled. Connect failed runs, stale success (over 26 hours) and disk-capacity alerts to monitoring.

Do not run backups while a deployment changes either environment or source files. The local lock prevents simultaneous backup captures; deployment coordination is still required.

## Commands

Run with the service account's restricted environment. Command arguments contain paths only, never database passwords or passphrases:

```sh
python3 ops/backups/niq_backup.py backup --config /private/operator/config.json
python3 ops/backups/niq_backup.py restore-test --config /private/operator/config.json --archive /private/backups/niq-YYYYMMDDTHHMMSS.tar.gpg
python3 -m unittest discover -s ops/backups -p 'test_*.py'
python3 ops/backups/integration_fixture.py
```

The optional `integration_fixture.py` command initializes a new temporary PostgreSQL cluster on a random loopback port and creates only synthetic databases, a fake upload and a fake encrypted PDF. Its production flags exist only inside temporary fixture environment files; it never reads real runtime configuration. It exercises capture and isolated restore, asserts original fixture row counts remain unchanged and no restored databases remain, then stops and removes the entire temporary cluster. Local socket/process permissions and `initdb`/`pg_ctl` are required. No Sentry events or AI calls are made.

After decryption/authentication the drill checks all captured file SHA-256 values, restores both databases into generated temporary databases, compares every restored table's row count with the quiesced capture, and decrypts one saved PDF using the backed-up key through the application's existing helper. It verifies that PDF's signature, length and stored SHA-256. If no saved PDF exists the drill explicitly reports that check skipped. Secrets, SQL errors and report bytes are never printed. A successful drill does not switch either running application to the test data.

Run the first drill before enabling production backups, after major schema/encryption changes, and at least quarterly. Use a controlled fixture if no production archive exists yet. Record archive date, success/failure, row/file verification and the operator in an access-restricted operations log without clinical content. Operational readiness requires an actual successful drill; unit tests alone are not one.

## Sentry operations monitoring

Optionally set `sentry_dsn` in the private config to the operations project's cloud Sentry DSN. Only standard HTTPS cloud ingestion endpoints are accepted; redirects, passwords in the DSN, nonstandard ports and query parameters are rejected. Outbound events contain fixed operation names/status only. Exception messages, filesystem paths, SQL, report bytes and configuration are never included. Failed backup and restore drills produce generic error events. Telemetry delivery failures are logged generically and do not interrupt service resume or backup completion.

The production backup reports `in_progress` and a final `ok`/`error` under `backup_monitor_slug` (default `niq-production-backup`), with a nightly 02:00 Asia/Kolkata cron schedule, 60-minute check-in margin and 180-minute runtime limit. **The development gate exits before creating any check-in.** Create/enable the corresponding missed-run alert only when both APIs move to production; otherwise development intentionally does not heartbeat it. Route failures and missed runs to the agreed operations email in Sentry. If a process is killed, the runtime/missed-run monitor detects the missing final heartbeat.

Manual restore drills generate failure events but no cron monitor by default. If drills are scheduled quarterly, explicitly create that Sentry monitor with cron `0 4 1 1,4,7,10 *`, timezone Asia/Kolkata and an appropriate runtime/margin, then set `restore_monitor_slug` in the private config and schedule the matching first-day-of-quarter drill at 04:00. Only production drills heartbeat that monitor. A quarterly reminder/manual procedure is also acceptable; do not enable missed-run alerts for an unscheduled manual task.

## Live recovery

This tool deliberately has **no live restore command**. Recovery must be reviewed separately: stop all writers, preserve the damaged state, verify archive integrity in isolation, restore matching databases/uploads/configuration together, check encryption keys and saved PDF hashes, then start the services and validate access. Never overwrite a live database from a routine drill. Preserve old patient-data encryption keys while any retained records or backups depend on them.
