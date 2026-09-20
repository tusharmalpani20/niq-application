# NIQ Application

The main NIQ clinical workflow application. This repository is independent from the centrally operated scoring platform and never embeds clinical scoring rules.

## Workspace

- `apps/web` — React, TypeScript and Vite clinician/admin interface
- `apps/api` — Hono API and PostgreSQL/Drizzle persistence
- `packages/contracts` — transport-safe request/response schemas
- `packages/config` — validated runtime configuration
- `packages/domain` — framework-independent business rules

The initial Drizzle migration is committed under `apps/api/drizzle`; `/ready` reports healthy only after the expected schema and migration ledger exist. A full `docker compose up` runs the one-shot migration service before starting the API.

## Local development

Prerequisites: Bun 1.4 and PostgreSQL 16 or later. The application does not start or manage PostgreSQL.

```bash
cp .env.example .env
bun install
bun run db:migrate
bun run dev
```

The commented [`.env.example`](.env.example) is the canonical reference for every environment variable, its valid values, default, and security constraints. Scoring customer/deployment identity is provisioned through the scoring activation workflow, not through application environment variables.

Use `bun run db:generate` only after intentionally changing the Drizzle schema.

The API listens on `http://localhost:3000` and the web application on `http://localhost:5173` by default.

## Important status

This is a foundation, not a production-ready clinical system. Local authentication is invite-only. Passwords use Argon2id, sessions and invitation tokens are stored only as keyed hashes, and administrator sign-in requires an OTP challenge. `DEV_OTP_DELIVERY=true` prints OTPs for local development and is rejected in production. See [Authentication and onboarding](docs/authentication.md).

Clinical scoring belongs exclusively to the scoring service and no temporary score is calculated here.

The current clinical workspace screens are a responsive workflow prototype backed by pseudonymous sample rows. Authentication is connected to the API; patient, assessment, facility, user and branding screens must be connected to their repositories before production use. The agreed frontend direction is React/Vite with Zod at transport boundaries, TanStack Router/Query/Table, React Hook Form, and shadcn/Tailwind components. The prototype intentionally does not claim that migration is complete.

See [Architecture](docs/architecture.md), [Compliance baseline](docs/compliance-baseline.md), and [Deployment](docs/deployment.md).

## Face-scan operations

Keep `FACE_SCAN_ENABLED=false` until CarePlix onboarding, eligibility, capture limits and a controlled staging scan have been verified. Provider credentials and callback handling belong to central NIQ Scoring; never add them to this application or its browser configuration. Configure the application scoring URL, activate the organization's deployment connection, and retain its credential encryption key and patient-data encryption key securely. Compose forwards these keys and the face-scan settings from the deployment environment.

Apply migrations before starting the updated API (`0018_naive_azazel.sql` adds durable scan attempts). Compose runs migrations first. The API process runs a bounded database reconciliation loop every `FACE_SCAN_RECONCILE_INTERVAL_MS` milliseconds (default 30000), independently of browser sessions; the existing process/container restart policy supervises it. No separate application worker command is required. Keep the API running to retrieve pending results even when new capture is disabled. Remote failed/expired attempts are checked every five minutes for delayed evidence. Completed scan evidence never rewrites submitted questionnaire results.

After an outage, restore the same scoring origin, deployment and organization identity; rotating its credential is supported. An uncertain request must keep its existing operation key. A definitive setup rejection allows an explicit new attempt after configuration is corrected. Monitor the redacted `Face scan reconciliation unavailable` warning and Scoring's backlog/reconciliation metrics. The application accepts at most 2 MiB and 12000 RGB samples per upload; confirm these provisional limits with measured SDK output before enablement and configure the reverse proxy consistently. No live provider integration or production rollout is implied by the automated fixtures.
