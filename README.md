# NIQ Application

NIQ Application is the staff-operated clinical workspace for nutritional assessments of cancer patients. Hospital staff register patients, capture assessments and Vital IQ measurements, request scoring, complete clinical reviews and download saved reports. Patients do not sign in to complete their own assessments.

This repository owns patient records and clinical workflow. The independently deployed **NIQ Scoring** service owns governed scoring rules, calculations, treatment-guidance matching, provider integrations and AI report wording. The services communicate through versioned server-to-server APIs and use separate databases.

## Documentation map

| Guide | Contents |
| --- | --- |
| [Frontend](apps/web/README.md) | Browser architecture, development, configuration, builds and static hosting |
| [Backend](apps/api/README.md) | API, database, authentication, background jobs and deployment |
| [Ubuntu BYOC](docs/byoc-deployment.md) | Customer-owned Ubuntu installation, setup interface, Docker, DNS/TLS, updates and rollback |
| [Restricted staging](docs/staging-openrouter.md) | Development-mode staging and connection to central Scoring |
| [Authentication](docs/authentication.md) / [Onboarding](docs/onboarding.md) | Accounts, MFA, invitations and Scoring activation |
| [Assessment operations](docs/assessment-workflow-operations.md) / [Clinical review](docs/clinical-review-workflow.md) | Drafts, submission, correction and approval |
| [Report workflow](docs/automatic-report-workflow.md) / [File storage](docs/report-storage.md) | Automatic PDFs, attachments and recovery boundaries |
| [Backup and restore](docs/backup-recovery.md) / [Key recovery](docs/key-recovery.md) | Recovery points, encryption and operator procedures |
| [Monitoring](docs/monitoring.md) | Sentry, alert routing and operational monitoring |
| [Synthetic restart verification](ops/verification/README.md) | Isolated report-worker crash/restart drill |

The commented [`.env.example`](.env.example) and validated [configuration schema](packages/config/src/index.ts) define settings. Examples are placeholders, not deployment credentials. Historical audits under `docs/` record dated evidence; use these guides and configuration source for operating instructions.

## Architecture and ownership

```text
Staff browser -> React web -> same-origin /api -> Application API
                                                    |
                                                    +-> Application PostgreSQL
                                                    +-> private clinical attachment storage
                                                    +-> central NIQ Scoring API
                                                    +-> optional browser push and Sentry
```

| Area | Responsibility |
| --- | --- |
| Organizations and access | Tenant boundaries, facilities, roles, invitations and user-seat limits |
| Patients | Encrypted demographics, organization-scoped identifiers and authorized history |
| Assessments | Version-bound questionnaires, drafts, submitted snapshots and attachments |
| Vital IQ | Browser capture and scan tracking; provider processing/credentials stay in Scoring |
| Clinical review | Assignment, corrections, reviewed score/classification and final approval history |
| Reports | Queue after final approval, request content, render PDF and retain saved artifacts |
| Notifications | Review-workflow inbox, live updates and optional opt-in browser push |

The Application does not invent a clinical score when Scoring is unavailable. Existing local records and bound drafts can remain accessible; initialization, scoring, scans and report-content requests depend on the relevant central service. Retry uses durable operation identities rather than silently issuing a different clinical result.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React, TypeScript, Vite and the staff/admin browser interface |
| `apps/api` | Hono on Bun, Drizzle/PostgreSQL persistence and background processing |
| `packages/contracts` | Validated request/response schemas shared by browser and API |
| `packages/config` | Server configuration and security constraints |
| `packages/domain` | Framework-independent domain behavior |
| `packages/report-pdf` | Shared report presentation components |
| `packages/monitoring` | Telemetry sanitization and monitoring policy |
| `ops/byoc` | Ubuntu installer and regression checks |
| `ops/backups` | Encrypted backup, writer coordination and isolated restore tools |
| `ops/verification` | Synthetic acceptance tools |

## Local development

### Prerequisites

- Bun **1.4.0**, pinned in `package.json`.
- A dedicated Application PostgreSQL database. Docker pins PostgreSQL **17.6**; use PostgreSQL 17 for local parity. Native startup does not create or start PostgreSQL.
- NIQ Scoring when testing rule binding, scoring, scans or report content.
- Chromium/system libraries for server-side PDFs. The API image includes Chromium and fontconfig; native setups need a compatible executable and dependencies.

Run from this repository root:

```sh
cp .env.example .env
# Edit .env: database connection, independent secrets and optional integrations.
bun install --frozen-lockfile
bun --env-file=.env run db:migrate
bun run dev
```

Replace example secrets. Generate independent security values with `openssl rand -hex 32`; generate each 32-byte encryption key with `openssl rand -base64 32`. Restrict `.env` permissions and keep it out of Git.

| Local endpoint | Purpose |
| --- | --- |
| `http://localhost:5173` | Application Vite development server |
| `http://localhost:3000` | Application API |
| `http://localhost:3000/health` | Process liveness |
| `http://localhost:3000/ready` | Database/schema readiness |
| `http://localhost:4100` | Separate Scoring API default |

The browser uses `/api`; Vite forwards to port 3000 and removes the prefix. Application preview and Scoring's development web server can both use 4173; choose another preview port when running both.

### First account and Scoring connection

**NIQ-hosted:** configure a temporary independent `BOOTSTRAP_TOKEN`, start the API and use the [administrator CLI](docs/authentication.md#initial-administrator-cli). It creates an NIQ platform administrator for customer provisioning. Remove the token and restart after use. There is no public staff signup.

**Customer BYOC:** use the Ubuntu installer and `/setup` with its private, expiring key. It creates one Hospital Administrator (`USER` with `ORGANIZATION_ADMIN` membership), not an NIQ administrator. It does not bypass sign-in/MFA. Production SMTP, invitation and OTP delivery must be configured before production staff access. Development/fixed OTP is forbidden in production.

An NIQ operator provisions the customer's central Scoring deployment and supplies its activation token. The organization administrator enters it in connection settings. The backend exchanges it and stores the permanent credential encrypted; the browser receives connection metadata only. Set `SCORING_API_URL` and `SCORING_CREDENTIAL_ENCRYPTION_KEY` first. A base URL may include a proxy prefix such as `https://scoring.example.com/api`.

## Configuration

| Group | Main variables |
| --- | --- |
| Runtime/origin | `NODE_ENV`, `APP_REGION`, `DEPLOYMENT_MODE`, `API_HOST`, `API_PORT`, `WEB_ORIGIN` |
| Database | `DATABASE_URL`, `DATABASE_SSL`; use a separate database and deployment-appropriate DB role |
| Authentication | `AUTH_MODE`, `SESSION_SECRET`, session/MFA/invitation limits; `oidc` is reserved, not implemented |
| Encryption | `PATIENT_DATA_ENCRYPTION_KEY`, `SCORING_CREDENTIAL_ENCRYPTION_KEY` and their `*_KEY_VERSION` labels |
| Scoring | `SCORING_API_URL`, `SCORING_TIMEOUT_MS`; credentials come from activation, not hard-coded identity variables |
| Files/reports | Absolute `REPORT_UPLOAD_ROOT`, `REPORT_MAX_*`, `REPORT_GENERATION_TIMEOUT_MS` |
| Vital IQ | `FACE_SCAN_ENABLED`, `FACE_SCAN_RECONCILE_INTERVAL_MS`; disabling capture does not stop recovery |
| Push | All of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, or none |
| Diagnostics | `REPORT_DIAGNOSTICS_ENABLED`, independent of `NODE_ENV`; true requires manual PDF generation for new approvals and explicit regenerations, false generates PDFs automatically; keep false for clients |
| Monitoring | Server `SENTRY_*` and public browser `VITE_SENTRY_*` |
| One-time setup | Hosted `BOOTSTRAP_TOKEN` or BYOC `BYOC_SETUP_TOKEN` + `BYOC_SETUP_EXPIRES_AT` |

Do not place database passwords, OpenRouter/CarePlix keys or deployment credentials in `VITE_*`. Provider secrets belong to Scoring. Keep data-encryption keys stable across upgrades and recover them with matching data. Replacing an environment key is not a safe key-rotation procedure.

For Docker, check the selected Compose file's explicit environment/build mappings: a host `.env` entry is not automatically passed into a container or static bundle. In particular, browser push needs an added VAPID pass-through in the supplied recipes; base Compose also needs explicit monitoring mappings. See the backend and frontend deployment sections.

## Build and verification

From the repository root:

```sh
bun run check
bun run build
bun run test
```

Focused checks:

```sh
bun run --cwd apps/web check
bun run --cwd apps/web test
bun run --cwd apps/api check
bun run --cwd apps/api test
python3 -m unittest discover -s ops/byoc -p 'test_*.py'
python3 -m unittest discover -s ops/backups -p 'test_*.py'
```

API build/test scripts prepare browser report-print assets first. PDF tests need a host able to launch Chromium. Backup encryption checks need GnuPG and its local agent socket. PostgreSQL acceptance suites are opt-in and require their guarded disposable database URLs. Skips do not establish database acceptance. Never use client databases or paid provider runs for installation-only verification.

## Deployment

### Ubuntu customer cloud (BYOC)

Use [the BYOC runbook](docs/byoc-deployment.md) and standalone `compose.byoc.yaml`. The client hosts Application, PostgreSQL and private uploads; NIQ hosts Scoring.

The Ubuntu 24.04 installer validates resources and exact public DNS targets, and stops on missing/wrong DNS. It installs host Docker/nginx/Certbot/PostgreSQL backup utilities, builds containers, applies migrations, provisions a restricted runtime DB role, configures HTTPS/renewal and prepares production-only backups. Bun and application dependencies remain inside containers. The setup interface then creates the hospital and first administrator. Follow the runbook for exact install/update/rollback commands and fresh-server acceptance.

### NIQ-managed hosting and restricted staging

See [deployment concepts](docs/deployment.md) and [staging instructions](docs/staging-openrouter.md). Base `compose.yaml` defines production-mode services and durable database/upload volumes. Restricted staging explicitly combines it with `compose.staging.yaml`. BYOC uses its own standalone file, not that combination.

For native hosting, build both artifacts, apply migrations with a trusted account, run `apps/api/dist/index.js` with Bun from `apps/api`, and serve `apps/web/dist` through an HTTPS web server. Forward `/api/`, preserve HTTPS headers, support bounded uploads/long PDF responses and unbuffered notification streams. Vite development/preview is not the production web server. Keep site-specific domains, allowed hosts, PM2 files and secrets outside tracked source.

### Storage and operations

- PostgreSQL contains encrypted patient data, assessment/review snapshots, jobs and **encrypted generated PDF bytes**. Uploaded clinical documents use private `REPORT_UPLOAD_ROOT`; do not serve it as a public directory.
- Authorized downloads return saved bytes and do not regenerate a report. PDF controls become available only when an artifact exists.
- Back up database, files and matching keys/configuration together. Application-only BYOC archives exclude central Scoring data; central operations back up Scoring separately.
- Encrypted production backups retain 30 daily and 12 weekly recovery points. This does not delete patient records or issued reports. Perform isolated restore acceptance before handover.
- Keep the API running for report, scan recovery and push jobs, independently of browser sessions.
- Sentry requires DSNs and appropriate network/CSP rules. Configure email recipients in Sentry; this does not implement staff OTP or workflow email delivery.

## Troubleshooting

1. Check `/health`, then `/ready`. Liveness with missing migrations is not readiness.
2. Apply all shipped migrations before starting a release. Generate migrations only for intentional schema changes. Legacy reviewed-result backfill is a separate data operation, not routine installation.
3. For Scoring failures, check URL/prefix, outbound access, activated deployment, entitlements and credential key. Preserve request identity for uncertain retries.
4. For missing PDFs, inspect saved job state and redacted failures before rerunning paid generation. Do not expose diagnostic tools publicly.
5. For missing files, check mounted storage, ownership and matching database recovery point. Do not run `docker compose down --volumes` on retained data.
6. For push, check VAPID, browser permission, secure context and active session. In-app notifications do not require push configuration.
7. For production OTP errors, configure delivery rather than enabling development OTP.
