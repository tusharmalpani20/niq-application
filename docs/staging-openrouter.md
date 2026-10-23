# Restricted development staging server

This setup deliberately runs the application API with `NODE_ENV=development`.
Report diagnostics are controlled separately by `REPORT_DIAGNOSTICS_ENABLED`, which
defaults to `false`. Keep it false on client servers. Trusted local diagnostics can set
it to `true`, then restart the API and refresh the browser session. This flag controls
report workspace visibility and its preview/regenerate/refresh APIs independently of
`NODE_ENV`. Automatic report generation and authorized PDF downloads stay available.
Keep access restricted
to the team using a VPN or an authenticated reverse proxy. This is not the production
rollout. The normal `compose.yaml` continues to use production mode.

## Prepare configuration

Requires Docker Engine, Docker Compose 2.24.4 or newer, and a checkout of both
`niq-application` and `niq-scoring` at their latest committed versions.

1. Copy `deploy/staging.env.example` to a file outside the checkout, such as
   `/etc/niq/application-staging.env`, owned by the deployment operator with mode `600`.
2. Replace all placeholders. Generate independent session/bootstrap/database secrets
   with `openssl rand -hex 32`. Generate each encryption key separately using
   `openssl rand -base64 32`. Keep keys stable across restarts and back them up securely.
   Use a hex database password to avoid URL escaping problems.
3. Set `WEB_ORIGIN` to the exact HTTPS browser origin, without a trailing slash.
   Keep `SECURE_COOKIES=true` for HTTPS staging. Production always uses secure cookies,
   while local HTTP development defaults to `SECURE_COOKIES=false`.
   The staging override uses local authentication. `DEV_OTP_DELIVERY=true` explicitly
   enables development OTP delivery, while fixed OTP stays disabled. Invitations and
   bootstrap follow [Authentication and onboarding](authentication.md).
4. Follow `niq-scoring/docs/staging-openrouter.md` to configure its separate private
   environment file, including the OpenRouter API key. The clinical application does
   not receive that key. Do not copy local `.env` files, patient databases, or generated
   artifacts into either Docker image.

## Start services

Create the shared network once, then start scoring using its staging guide:

```bash
docker network inspect niq-staging >/dev/null 2>&1 || docker network create niq-staging
```

From the application checkout:

```bash
docker compose --env-file /etc/niq/application-staging.env -f compose.yaml -f compose.staging.yaml config --quiet
docker compose --env-file /etc/niq/application-staging.env -f compose.yaml -f compose.staging.yaml up -d --build
```

Migrations run before the API starts. The application talks to scoring at
`http://niq-scoring-api:4100` on `niq-staging`. Do not use `localhost` for inter-container
traffic. The scoring Compose override must provide the `niq-scoring-api` network alias.
Both databases remain on their own private networks.

Web and API ports bind only to `127.0.0.1:8080` and `127.0.0.1:3000` on the server.
Configure a host HTTPS reverse proxy for the restricted staging domain, forwarding to
`127.0.0.1:8080`. Set its request-body limit to at least 12 MiB and read timeout to at
least 750 seconds for uploads/PDF rendering. `/api` is already forwarded by the web
container to the application API. Serve the application and its API under the same origin.
If a reverse proxy runs in another container, join the application's edge network rather
than trying to reach its own localhost.

## Verify before sharing

- Check `curl --fail http://127.0.0.1:3000/ready`, container health and redacted logs.
- Bootstrap the first administrator and activate the organization's scoring connection
  using the normal one-time activation flow. A clean database does not include existing
  local users, rules, products or assessments. Arrange an approved migration/import or
  create staging fixtures through supported workflows.
- Confirm scoring reports `openrouter` and verify the chosen model IDs against the funded
  account. Then complete one agreed assessment. Normal accepted report generation saves
  its PDF automatically. Historical test records marked for HTML review may still require
  the diagnostics-only Generate PDF action, with explicit diagnostics access. Check agent approval, saved PDF, download
  from the assessment and assessment list, and browser PDF preview.
- The API image includes Chromium, fontconfig and generated report assets. Uploaded
  attachments persist in `application-reports`, writable by the non-root `niq` user.
  Generated PDFs persist encrypted in PostgreSQL. Back up both data volumes and retain
  the matching encryption keys. `docker compose down -v` destroys these volumes.

No real OpenRouter call or server deployment is implied by repository checks. This
staging configuration postpones production OTP/invitation delivery and the remaining
production controls. Remove the staging override for production and complete those
controls before public patient use.

## Existing native staging installations

If the server runs Bun and Vite under PM2 instead of Docker, keep its PM2 ecosystem
file, absolute paths and site names in operator-managed files on that server. Do not
copy these site-specific settings into the shared source files. Use private API `.env`
files for `SECURE_COOKIES=true`, `WEB_ORIGIN` and other deployment values.

The installed Vite 7.1.4 supports `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`. Set this
environment variable on the web process to the single exact deployed hostname, without
a scheme or path, then restart it with the updated environment. It adds that hostname
to Vite's default allowed hosts without changing `vite.config.ts`. Do not use unrestricted
`allowedHosts: true`. Do not rely on the API `.env` to configure the separate web process.

Keep local operator scripts and legacy disk PDF artifacts outside tracked source. They
are not part of the supported report download workflow. Standard report generation and
the generated-report PDF download route use the saved assessment artifacts. Preserve
any legacy files separately before reconciling an existing server checkout.
