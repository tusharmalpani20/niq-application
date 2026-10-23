# NIQ Application

The main NIQ clinical workflow application. This repository is independent from the centrally operated scoring platform and never embeds clinical scoring rules.

## Workspace

- `apps/web` — React, TypeScript and Vite clinician/admin interface
- `apps/api` — Hono API and PostgreSQL/Drizzle persistence
- `packages/contracts` — transport-safe request/response schemas
- `packages/config` — validated runtime configuration
- `packages/domain` — framework-independent business rules

Drizzle migrations live under `apps/api/drizzle`; `/ready` reports healthy only after the expected schema and migration ledger exist. `docker compose up` runs the one-shot migration service before starting the API.

## Local development

Prerequisites: Bun 1.4 and PostgreSQL 16 or later. The application does not start or manage PostgreSQL.

```bash
cp .env.example .env
bun install
bun run db:migrate

# After this release's migration, populate approved results from encrypted reviews.
bun --env-file=.env run db:backfill-final-results
bun run dev
```

The commented [`.env.example`](.env.example) is the canonical reference for every environment variable, its valid values, default, and security constraints. Scoring customer/deployment identity is provisioned through the scoring activation workflow, not through application environment variables.

Use `bun run db:generate` only after intentionally changing the Drizzle schema.

The API listens on `http://localhost:3000` and the web application on `http://localhost:5173` by default.

## Current workflows and limits

The web application uses the API for organization administration, facilities, users, patients, assessments, scoring results and clinical review. It supports drafts, report attachments, questionnaire scoring through NIQ Scoring, score adjustments, correction cycles, review history and completion. The clinical review queue is filtered and paginated by the API. See [Assessment workflow operations](docs/assessment-workflow-operations.md) and [Clinical review workflow](docs/clinical-review-workflow.md).

Clinical scoring belongs exclusively to NIQ Scoring; this application persists the returned result and does not calculate a temporary clinical score. Each assessment retains its scoring-rule binding across correction cycles. A new face scan uses that binding, including when the rule has since been retired; Scoring rejects a scan without a usable mapping before reserving usage.

Local authentication is invite-only. Passwords use Argon2id, sessions and invitation tokens are stored only as keyed hashes, and administrator sign-in requires an OTP challenge. `DEV_OTP_DELIVERY=true` supports local development and is rejected in production. A production OTP delivery adapter is still required. Authenticated mutations require the configured browser Origin. Invitation details and scoring connection metadata are limited to authorized administrators. See [Authentication and onboarding](docs/authentication.md).

This is still not a production-ready clinical deployment. Completed-assessment PDFs are saved in PostgreSQL and downloaded through authorized API routes. Compose mounts private uploaded-report storage in a persistent volume. Back up both volumes and the deployment encryption keys. See [Report storage](docs/report-storage.md) and [Deployment](docs/deployment.md).

See [Architecture](docs/architecture.md), [Compliance baseline](docs/compliance-baseline.md), and [Deployment](docs/deployment.md).

## Face-scan operations

Keep `FACE_SCAN_ENABLED=false` until CarePlix onboarding, eligibility, capture limits and a controlled staging scan have been verified. Provider credentials and callback handling belong to central NIQ Scoring; never add them to this application or its browser configuration. Configure the application scoring URL, activate the organization's deployment connection, and retain its credential encryption key and patient-data encryption key securely. Compose forwards these keys and the face-scan settings from the deployment environment.

Apply all migrations before starting the API; Compose runs migrations first. The API process runs a bounded database reconciliation loop every `FACE_SCAN_RECONCILE_INTERVAL_MS` milliseconds (default 30000), independently of browser sessions. No separate application worker command is required. Keep the API running to retrieve pending results even when new capture is disabled. Remote failed/expired attempts are checked every five minutes for delayed evidence. Completed scan evidence never rewrites submitted questionnaire results.

After an outage, restore the same scoring origin, deployment and organization identity; rotating its credential is supported. An uncertain request must keep its existing operation key. A definitive setup rejection allows an explicit new attempt after configuration is corrected. Monitor the redacted `Face scan reconciliation unavailable` warning and Scoring's backlog/reconciliation metrics. The application accepts at most 2 MiB and 12000 RGB samples per upload; confirm these provisional limits with measured SDK output before enablement and configure the reverse proxy consistently. No live provider integration or production rollout is implied by the automated fixtures.

## Browser push alerts

The notification bell stores actionable workflow messages without VAPID. To enable optional browser push alerts:

1. Run `bunx web-push generate-vapid-keys --json` once and retain the generated key pair.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:ops@example.com` in the application's `.env` or deployment secrets. Set all three together. Use a monitored operations email address for the subject, keep the private key server-side, and back it up with the deployment configuration. Do not commit it. Reuse the same key pair across API restarts and deployments; changing it requires users to subscribe again.
3. Apply the latest migrations and restart the API. Each user then opens the notification bell, turns on push alerts for that device, and grants the browser's notification permission.

The API retries queued push deliveries. Push subscriptions belong to the signed-in session and are revoked on sign-out; users opt in again after signing back in. Push messages contain only a generic task description; assessment details require sign-in. On iPhone, push alerts require HTTPS and opening the app from an Add to Home Screen icon. A phone visiting the LAN HTTP development address cannot receive them.

## OpenRouter staging server

See [Restricted staging deployment](docs/staging-openrouter.md) for the explicit development-mode Compose override, shared scoring network, secrets and PDF checks.
