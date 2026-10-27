# Ubuntu BYOC deployment

NIQ Application runs in the customer's cloud. NIQ Scoring and provider credentials remain on NIQ infrastructure. This is a dedicated **Ubuntu 24.04 LTS** server installation, not an Ubuntu operating-system installer.

## Prerequisites

- Fresh dedicated Ubuntu 24.04 LTS, at least two CPUs, 4 GiB RAM and 20 GiB free disk. Size production storage for retained records and local encrypted backups.
- Root/sudo installation access and a trusted checkout/release of NIQ Application.
- Domain with all A/AAAA records pointing directly to this server's supplied public IPs. Disable CDN proxying for this installer. DNS failure stops setup before packages, certificates or containers are changed, including on reruns. It rechecks DNS after lengthy builds and immediately before certificate issuance and Application launch.
- Cloud firewall allows inbound TCP 80/443, restricted administrator SSH access, and outbound HTTPS/DNS/package/image registry access. This installer does not change SSH or cloud firewalls. Remove stale AAAA records if IPv6 is unavailable.
- Online NIQ Scoring HTTPS base URL and organization deployment activation token. Provider/OpenRouter/CarePlix secrets must not be installed on this server.
- Production OTP delivery must be configured and tested before staff access. The current OTP integration status is a separate acceptance gate; do not enable fixed/development OTP in production.

## Preflight and installation

From the trusted source checkout (replace every placeholder):

```sh
python3 ops/byoc/install.py preflight \
  --domain niq.hospital.example --server-ip <public-ip> \
  --email <certificate-contact-email> --scoring-url https://<niq-scoring-host> \
  --release <git-commit>

sudo python3 ops/byoc/install.py install \
  --domain niq.hospital.example --server-ip <public-ip> \
  --email <certificate-contact-email> --scoring-url https://<niq-scoring-host> \
  --release <git-commit>
```

Repeat `--server-ip` for every published IPv4 and IPv6 target. Correct DNS and rerun exactly the same command after a DNS failure. The installer is not run from the setup webpage.

The installer installs Ubuntu's `docker.io` and `docker-compose-v2`, nginx, Certbot and utilities. PostgreSQL client 17 comes from the official PGDG signed Noble repository so backups match the PostgreSQL 17 container. Node/Bun and application dependencies are inside containers. No host Bun/Node installation is needed.

It builds version-tagged images, migrates the database and starts a fixed `niq-byoc` Compose project. Migrations and host backups use the private database-owner credential. API requests use a separate `niq_app` login with no superuser, role-creation, database-creation or row-security bypass privileges, and append-only audit permissions. The installer generates its independent password once and preserves it on reruns. PostgreSQL is private except for a loopback-only backup connection; API and frontend also bind only to loopback. Host nginx handles HTTPS, direct API proxying and long PDF/SSE connections. Certbot's systemd timer renews certificates automatically. Ports 80/443 must remain reachable for HTTP validation/renewal.

## First hospital administrator

Open `https://<domain>/setup`. Retrieve `/etc/niq/setup-token` through the trusted administrator channel; the file is root-readable only. Never paste this credential into a URL, issue or log.

The setup credential expires after 24 hours. Complete setup promptly. If it expires, run `sudo python3 /opt/niq/current/ops/byoc/install.py renew-setup-key`. This rotates only the setup credential/expiry, recovers its private operator file and recreates only the API container. This does not bypass the database's completed-setup guard.

The setup interface creates one hospital organization and its first **Hospital Administrator**, not an NIQ platform administrator. No `BOOTSTRAP_TOKEN` is configured by this deployment. Complete online Scoring activation through the existing organization connection screen. `BYOC_USER_LIMIT` defaults to 100 and can be set explicitly in the private environment before first organization creation. After setup succeeds, the operator can clear both `BYOC_SETUP_TOKEN` and `BYOC_SETUP_EXPIRES_AT` and recreate the API container to disable the setup endpoint entirely; upgrades preserve this disabled state.

## Private files and persistence

- `/etc/niq/byoc.env`: private database password, encryption/session keys and runtime setup configuration, mode 0600.
- `/etc/niq/setup-token`: initial setup secret, mode 0600. Delete this redundant file after successful setup; do not delete encryption keys.
- `/opt/niq/releases/<release>`: trusted versioned source used for images and operation scripts.
- `/opt/niq/current`: last successfully started release; `/opt/niq/state.json` contains non-secret checkpoints.
- Docker `niq-byoc_application-postgres`: persistent database.
- `/var/lib/niq/report-uploads`: persistent uploaded reports and generated PDFs, owned by the API container's actual UID/GID.
- `/etc/niq-backup`: independent backup encryption passphrase and private Application-only backup configuration.
- `/var/backups/niq`: encrypted local archives. Passphrase is intentionally outside the archive trees. Keep its recovery copy separately. The archive covers Application data/configuration, not the entire Ubuntu filesystem. Host nginx configuration and TLS certificates can be recreated by the installer; include additional reviewed server files explicitly if required.

Do not delete volumes or run `docker compose down --volumes`. Do not rotate encryption keys during reinstall. The installer rejects symlinked, non-root-owned or publicly accessible managed directories, uses a private no-follow lock and preserves existing secrets, rejects changed domain/Scoring URL and uses an exclusive deployment lock.

Optional Sentry DSNs can be added to `byoc.env` before rebuilding: `SENTRY_DSN` for the API, `VITE_SENTRY_DSN` for the browser, `SENTRY_OPERATIONS_DSN` for backup failures. Browser DSNs are public build-time configuration, never provider API keys. `SENTRY_ENVIRONMENT` defaults to production. Diagnostics remain disabled independently of production mode.

## Backup acceptance and schedule

The installer creates Application-only encrypted backup configuration and enables `niq-byoc-backup.timer` (02:00 Asia/Kolkata). Existing backup retention applies: 30 daily and 12 weekly archives. It does not add automatic deletion of clinical records, reports or uploads.

Before production handover, provision `/etc/niq-backup/restore-test.env` with a separate, restricted restore-test PostgreSQL account/database target. The restore-test account must be denied access to the source application database. Run the backup and isolated restore drill documented in the backup runbook; verify database rows, decrypted files, artifact checksums and normal PDF access. No installer status can substitute for that drill.

```sh
sudo systemctl status niq-byoc-backup.timer certbot.timer
sudo python3 /opt/niq/current/ops/backups/niq_backup.py backup --config /etc/niq-backup/config.json
```

Backups are production-only. Do not set production merely to exercise a development backup. Before running backup/restore manually, include `/usr/lib/postgresql/17/bin` in PATH. Scheduled jobs already do so. On upgrade and rollback, the installer refreshes only generated backup source/Compose/helper paths while preserving recovery keys and storage. It refuses active backup capture/recovery state or customized backup commands rather than rewriting them.

## Updates and rollback

Prepare a clean trusted new source release. Take a fresh backup and prove that it restores before acknowledging `--backup-verified`:

```sh
sudo python3 ops/byoc/install.py upgrade \
  --domain niq.hospital.example --server-ip <public-ip> \
  --email <certificate-contact-email> --scoring-url https://<niq-scoring-host> \
  --release <new-git-commit> --backup-verified
sudo python3 ops/byoc/install.py status
sudo python3 ops/byoc/install.py rollback
```

The backup flag is an explicit operator attestation, not an automatic restore test. Never reuse a release identifier for different source. Installation checkpoints allow reruns after build/certificate/readiness failures without rotating data keys or requesting certificates again after their successful checkpoint.

Rollback automatically switches images only when both releases have identical migration histories and no migration is incomplete. Database schema changes require coordinated restoration of the verified pre-upgrade database, files and configuration; do not run old application code against a newer schema. Old releases, images and clinical data are not automatically deleted. A failed upgrade can require manual restoration; it is not claimed to be zero-downtime.

## Remaining fresh-server acceptance

Local verification completed during implementation:

- Application web: 397 tests passed; Application API: 328 passed, 114 optional database tests skipped in that suite. Setup, activation recovery and restricted database privileges were also exercised separately against disposable PostgreSQL databases.
- Scoring API: 478 passed, 18 optional database tests skipped; activation and scoring recovery database checks passed separately.
- Installer: 28 regression tests passed, including rejection of environment-line injection/invalid Scoring ports and incomplete backup setup status. Compose configuration validated without a running Docker daemon.
- Backups: 40 unit tests passed, including validation of a recovery key left by partial setup and retry after an interrupted configuration refresh. A real isolated restore drill applied 44 Application and 35 Scoring migrations and restored both combined and Application-only archives, encrypted uploads and saved PDFs.
- The setup interface was exercised in a browser with synthetic data. No paid provider calls or client data were used.

Local stdlib tests replace DNS and privileged operations with doubles. They establish validation ordering, private-key preservation, command selection and rollback gates; they do not establish real installation success.

On the later fresh Ubuntu test server verify: correct and incorrect DNS, TLS issuance and renewal (`certbot renew --dry-run`), package installation, full Docker builds, one-time Hospital Administrator setup/concurrency, production OTP, scoring activation and outage recovery, real PDF generation/download, backup/isolated restore, reboot recovery, upgrade failure/resume and rollback. Never rerun paid AI just to test container installation without authorization.

## Upstream installation references

- Ubuntu Docker packages: https://packages.ubuntu.com/noble/docker-compose-v2
- Ubuntu TLS setup: https://ubuntu.com/server/docs/how-to/security/obtain-tls-certificates/
- PostgreSQL official signed APT repository: https://www.postgresql.org/download/linux/ubuntu/
- Certbot instructions and renewal: https://certbot.eff.org/instructions?ws=nginx&os=ubuntufocal
