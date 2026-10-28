# NIQ Application API

The Application API is NIQ's clinical-workflow, authorization and persistence backend. It runs on **Bun**, uses **Hono** for HTTP and **Drizzle/PostgreSQL** for durable state. Install workspace dependencies from the [repository root](../../README.md), not as an independent npm project. See the [frontend guide](../web/README.md) for browser integration.

## Responsibilities and boundaries

The API manages organizations/facilities/staff, encrypted patient records, assessments, clinical review, private uploads, generated PDFs, audit history and workflow notifications. It enforces organization, role and facility access regardless of what the UI displays.

Central **NIQ Scoring** owns rules, calculations, CarePlix integration, provider keys and AI orchestration. This API sends normalized assessment facts through authorized server-to-server calls, stores returned evidence and renders accepted report content. It does not calculate a substitute clinical score during an outage.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Validated startup, services, background loops and Bun HTTP server |
| `src/app.ts`, `src/*-routes.ts` | Routes, security middleware and bounded input handling |
| `src/services` | Administration, assessments/review, Scoring transport, reports and push |
| `src/db` | Connection, schema and readiness requirements |
| `drizzle` | Ordered SQL migrations and journal |
| `src/security` | Credential/patient encryption, session/token hashing, passwords and MFA |
| `src/storage` | Private clinical attachment storage |
| `src/monitoring.ts` | Sanitized operational error capture |
| `assets` | Generated report styles/fonts and PDF assets |
| `../../packages/contracts` | Shared validated API schemas |

## Local setup

Prerequisites: Bun 1.4.0, dedicated PostgreSQL (17 for Docker parity), configured private environment and a compatible Chromium installation for PDFs. Docker supplies Chromium/fontconfig and runtime dependencies. Native API startup does not start PostgreSQL.

Run from the repository root:

```sh
cp .env.example .env
# Configure database, independent secrets and optional integrations.
bun install --frozen-lockfile
bun --env-file=.env run db:migrate
bun run dev
```

To run only the API from that same directory:

```sh
bun --env-file=.env run --filter @niq/application-api dev
```

This script builds frontend print assets before running Bun watch mode. Default direct API is `http://localhost:3000`; browser calls use `/api` through Vite/nginx, which strips that prefix.

## Configuration

Use [`.env.example`](../../.env.example) and [the validation schema](../../packages/config/src/index.ts) for complete defaults, bounds and allowed values. Load the intended environment file explicitly; never print it for troubleshooting.

| Group | Settings and purpose |
| --- | --- |
| Process | `NODE_ENV`, `API_HOST`, `API_PORT`, `APP_REGION`, `DEPLOYMENT_MODE` |
| Database | `DATABASE_URL`, `DATABASE_SSL`; separate Application database |
| Browser origin | `WEB_ORIGIN`, exact scheme/host/port for origin checks |
| Authentication | `AUTH_MODE`, `SESSION_SECRET`, `SESSION_*`, `MFA_*`, `AUTH_*`, `INVITATION_TTL_HOURS` |
| Patient encryption | Base64 32-byte `PATIENT_DATA_ENCRYPTION_KEY` plus key-version label |
| Scoring connection | `SCORING_API_URL`, `SCORING_TIMEOUT_MS`, base64 32-byte `SCORING_CREDENTIAL_ENCRYPTION_KEY` and version label |
| Files | Absolute dedicated `REPORT_UPLOAD_ROOT`, `REPORT_MAX_*` limits |
| Reports | `REPORT_GENERATION_TIMEOUT_MS`; `REPORT_DIAGNOSTICS_ENABLED=true` enables diagnostics and manual PDF generation for new approvals and explicit regenerations; false generates PDFs automatically |
| PDF executable | `REPORT_CHROMIUM_PATH` optionally selects Chromium; the renderer otherwise uses `/usr/bin/chromium` |
| Scans | `FACE_SCAN_ENABLED`, `FACE_SCAN_RECONCILE_INTERVAL_MS` |
| Browser push | All three `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, or none |
| Monitoring | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` |

Generate independent secrets and retain matching encryption keys with backups. Do not rotate encryption by simply replacing a key. No OpenRouter/CarePlix keys belong in this service; activated deployment credentials are encrypted in its database, never exposed as frontend settings.

`AUTH_MODE=local` enables password/invitation/MFA. `disabled` disables authentication routes; `oidc` is reserved, not implemented. Production requires explicit encryption settings and secure cookies. Client-cloud production additionally requires local authentication and HTTPS origins/Scoring. Development OTP/fixed-code flags are prohibited in production. Production SMTP/OTP and invitation delivery need their delivery integration; an unconfigured adapter fails instead of exposing an OTP.

## Accounts and Scoring activation

- **NIQ-hosted:** temporary `BOOTSTRAP_TOKEN` protects one-time platform-administrator creation. Use [the CLI](../../docs/authentication.md#initial-administrator-cli), supply protected JSON on stdin, then remove the token/restart. Normal sign-in and MFA still apply.
- **Customer BYOC:** `/setup` uses a private expiring key to create one hospital and Hospital Administrator, not an NIQ administrator. It creates no signed-in session. Existing installations cannot be reinitialized; see [the runbook](../../docs/byoc-deployment.md).
- **Scoring:** an NIQ operator issues the correct customer's deployment token. The Application durably saves the attempt identity before exchanging it, retains the credential encrypted and shows only metadata to the browser. A configured `/api` gateway prefix is preserved and redirects are refused. See [onboarding/recovery](../../docs/onboarding.md).

## Database operations

From the root:

```sh
bun --env-file=.env run db:migrate
# Only for intentional schema changes:
bun --env-file=.env run db:generate
```

Apply all shipped migrations before startup. `/ready` verifies the connection, expected schema and migration ledger; it does not run migrations. Use a trusted migration account. BYOC runs a separate provisioning stage that grants the `niq_app` runtime role data access and read-only ledger access without schema creation or audit-history mutation privileges. Other deployments must arrange their own migration/runtime role separation.

Legacy approved results can be reconstructed through an explicit operator backfill:

```sh
bun --env-file=.env run db:backfill-final-results
```

Review the command source and [assessment operations](../../docs/assessment-workflow-operations.md) first. Backfill is a data operation, not a routine prerequisite for a new database or each release. Never run an older incompatible binary against a newer schema.

## HTTP and security

| Endpoint family | Purpose |
| --- | --- |
| `/health` | Process liveness |
| `/ready` | Database/schema readiness, 200 or 503 |
| `/v1/auth/*` | Sign-in, invitation acceptance, MFA, session and sign-out |
| `/v1/bootstrap` | Protected one-time hosted platform setup |
| `/v1/setup/status`, `/v1/setup/complete` | Protected client-cloud hospital setup |
| Organization/patient/assessment route modules | Authorized records, review, Scoring operations and saved-file access |

Read route modules and contracts for payloads. Browser authentication uses an opaque HttpOnly SameSite cookie, with keyed token hashes stored server-side. Passwords use Argon2id. Mutations enforce the configured browser origin. Tenant/facility IDs in URLs do not grant access. Request/response/upload bounds protect streaming and storage operations.

Log operational codes rather than patient data, document contents, tokens, passwords or provider prompts. The deliberate local-only development OTP adapter is unsuitable for production logs.

## Background jobs and reports

The API process runs these loops; no separate Application worker command is required:

| Work | Cadence | Behavior |
| --- | --- | --- |
| Reports | 5 seconds | Final review queues generation transactionally; durable state and leases support recovery |
| Vital IQ reconciliation | Configured interval, default 30 seconds | Retrieves pending/late Scoring evidence, even with new capture disabled |
| Browser push | 10 seconds | Processes due queued deliveries with current recipient/session checks |

Jobs continue without an open browser. Multiple API instances require matching keys and shared durable attachment storage; unrelated local disks are not interchangeable.

Final review is the clinical approval step. Scoring supplies reviewed narrative or verified matched-rule fallback; invalid source/configuration or technical failures can still block publication. The Application uses Chromium/prepared assets to render and stores **encrypted PDF bytes in PostgreSQL**, with hash and revision/source metadata. Download returns saved bytes without another model call. Uploaded clinical attachments are separate private filesystem objects.

In-app workflow alerts and SSE updates are implemented. Browser push additionally needs VAPID, permission and a session-bound subscription. Staff email/SMS/WhatsApp are separate delivery integrations. Report status changes refresh the UI; they do not themselves create a report-ready bell/push message.

### Notification events and recipients

| Event | Recipient |
| --- | --- |
| Assessment sent/resubmitted or released to the review queue | Retained assigned reviewer, or eligible reviewers when unassigned |
| Review transferred | Newly assigned reviewer |
| Assessment ownership transferred | New owner |
| Review returned for correction | Selected correction person |
| Correction responsibility reassigned | New correction person |
| Clinical review completed | Most recent sender/resender, with creator fallback; no self-notification |
| Scoring failed | Current assessment owner, with initiating actor fallback |

Review-pool recipients must be active clinical staff in the same organization with the required assessment and patient facility access. Inbox access and push dispatch recheck relevance and authorization. Push skips read/dismissed, obsolete, unauthorized or signed-out-session deliveries. A delivery stops after five failed send attempts total (the initial attempt plus up to four retries); this is not an exactly-once external delivery guarantee. Messages use generic task descriptions rather than patient names or clinical detail.

SSE workspace refreshes also cover changes without notification recipients, including saved report/PDF state changes. `SCAN_FAILED` is a defined message type but has no emitting workflow; its presence in the catalog is not an active scan-failure notification. There is no automatic PDF-ready bell/push event, real staff email/SMS/WhatsApp sender or invitation-email sender. Development OTP logging is separate from production OTP delivery. Sentry's technical alert emails are managed through Sentry rules and recipients rather than this inbox.

## Build and native deployment

From the root:

```sh
bun run --cwd apps/api check
bun run --cwd apps/api build
```

Build compiles the web application, prepares report CSS/fonts and bundles `apps/api/dist/index.js` with an external source map. Retain `apps/api/assets`, runtime dependencies and native libraries; the JS bundle is not a standalone executable. `sharp` and `playwright-core` remain runtime externals.

For native startup, run from `apps/api` with an operator-created private environment file:

```sh
cd apps/api
bun --env-file=/etc/niq/application.env dist/index.js
```

Use a service manager and dedicated service account. A reverse proxy must terminate HTTPS, forward same-origin `/api/`, preserve forwarded HTTPS protocol, bound uploads, allow long PDF responses and disable buffering for live streams. Check `/health` and `/ready` separately. Do not serve private attachments statically.

## Docker and Ubuntu BYOC

- Base `compose.yaml`: Application stack with production-mode services and persistent database/upload volumes.
- `compose.staging.yaml`: explicit restricted-development override; see [staging](../../docs/staging-openrouter.md).
- Standalone `compose.byoc.yaml`: customer-cloud package with separate migration/runtime credentials, loopback-only host ports and dedicated persistence. Do not merge it with the base stack.

Follow [BYOC installation](../../docs/byoc-deployment.md) for DNS validation, packages, TLS/renewal, setup keys, updates and schema-aware rollback. Example `.env` values or bare container startup are not complete production configuration. Keep site-specific domains, SSH/PM2 settings and keys outside tracked source.

Optional settings must reach the container, not just the host environment file. Both shipped Application Compose recipes use explicit API `environment` lists and do not forward the `VAPID_*` trio; enabling browser push there requires a reviewed deployment configuration change forwarding all three values. The BYOC recipe forwards API Sentry settings and browser Sentry build arguments, while the base recipe does not. For the base recipe, add the intended API monitoring values and frontend build arguments explicitly. Native processes can read these values directly from their private environment. Never forward an entire secret environment file into a frontend build.

## Verification and operations

From the repository root:

```sh
bun run --cwd apps/api test
bun run --cwd apps/api check
```

The test script prepares report assets first. PDF tests require a host able to launch Chromium. Opt-in PostgreSQL tests require guarded disposable databases; read each suite before setting `BYOC_TEST_DATABASE_URL`, `SCORING_ACTIVATION_TEST_DATABASE_URL` or `AUDIT_TEST_DATABASE_URL`. They can create triggers/roles, truncate fixture rows and exercise transactions. Never use client data.

Use [synthetic restart verification](../../ops/verification/README.md) for report process-death checks without paid generation. Use [backup/restore procedures](../../docs/backup-recovery.md) to capture database/files/configuration consistently and restore into a source-isolated target. Do not delete volumes, manually force job status or replace issued PDFs to simulate success.

For failures: inspect readiness/migrations first, then redacted Scoring/worker errors, service connectivity/entitlements, PDF executable/assets and private-storage permissions. Preserve uncertain request keys. Keep encryption keys with their corresponding recovery point. Configure [Sentry](../../docs/monitoring.md) and alert recipients there; Sentry email is separate from clinical email/OTP delivery.
