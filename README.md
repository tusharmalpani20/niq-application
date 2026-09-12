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

Prerequisites: Bun 1.4, Docker and Docker Compose.

```bash
cp .env.example .env
docker compose up -d postgres
bun install
bun run db:migrate
bun run dev
```

Use `bun run db:generate` only after intentionally changing the Drizzle schema.

The API listens on `http://localhost:3000` and the web application on `http://localhost:5173` by default.

## Important status

This is a foundation, not a production-ready clinical system. Authentication is deliberately disabled until the identity, MFA, password recovery and session-management decisions are approved. The sign-in route returns a structured `AUTH_NOT_CONFIGURED` response. Clinical scoring belongs exclusively to the scoring service and no temporary score is calculated here.

See [Architecture](docs/architecture.md), [Compliance baseline](docs/compliance-baseline.md), and [Deployment](docs/deployment.md).
