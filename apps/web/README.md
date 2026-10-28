# NIQ Application web

The browser interface for NIQ Application, the clinical workspace used by hospital teams to register patients, complete nutritional assessments, review results and download the issued clinical report. Hospital administration, facility management and Scoring activation live in the same interface with role-based access.

The frontend talks to the Application API. The API owns authentication, authorization, PostgreSQL access, report generation and integration with the separately hosted NIQ Scoring service. OpenRouter, Scoring deployment credentials, database passwords and other provider secrets belong on servers, never in this bundle.

## Architecture and technology

- React 19, TypeScript and React Router provide the single-page application and client routing.
- Vite builds the static application and provides the local development server.
- Tailwind CSS, shared UI components, React Aria and Lucide icons provide styling and accessible controls.
- `@niq/application-contracts` defines shared schemas and permission names used by API clients and screens.
- `@niq/application-report-pdf` shares report presentation components; PDF.js displays saved PDF files in the diagnostic report workspace.
- The CarePlix SDK powers the explicitly started Vital IQ camera flow when enabled by the API.
- Optional Sentry browser monitoring uses the shared `@niq/monitoring` sanitization policy.

The issued PDF is generated and saved by the backend. Rendering a browser preview does not replace the server's saved artifact.

## Source layout

| Location | Responsibility |
| --- | --- |
| `src/main.tsx` | Browser startup, router and error monitoring |
| `src/App.tsx` | Route definitions and lazy-loaded pages |
| `src/components/` | Authenticated shells, navigation and shared UI primitives |
| `src/pages/` | Patient, organization, facility, user, sign-in and setup pages |
| `src/features/assessments/` | Questionnaire, clinical review, Vital IQ, report status and PDF views |
| `src/features/notifications/` | Notification inbox, live workspace events and browser push enrollment |
| `src/lib/` | API clients, permissions, branding and display helpers |
| `src/styles.css`, `src/theme.css`, `src/admin.css` | Shared application styling |
| `public/` | Logos, push service worker, manifest and PDF.js assets |
| `vite.config.ts` | Build configuration, environment directory and development proxy |
| `nginx.conf`, `Dockerfile` | Static container hosting and API reverse proxy |

## Routes and access

| Route | Purpose |
| --- | --- |
| `/sign-in`, `/verify` | Sign-in and MFA verification |
| `/invite/:token` | Invitation acceptance |
| `/setup` | Protected first-organization setup for a client-cloud installation |
| `/` | Organization overview |
| `/patients`, `/patients/new`, `/patients/:patientLocator` | Patient registration, directory and detail |
| `/assessments`, `/assessments/new`, `/assessments/:assessmentId` | Assessment list, creation, editing and clinical review |
| `/assessments/:assessmentId/generated-report` | Restricted report diagnostics and saved PDF preview |
| `/facilities`, `/facilities/:facilityId` | Facility directory and administration |
| `/users` | Organization staff administration |
| `/settings/branding`, `/settings/scoring` | Branding and Scoring connection management |
| `/admin/organizations`, `/admin/organizations/new`, `/admin/organizations/:organizationSlug` | NIQ platform organization administration |
| `/admin/administrators` | NIQ platform administrator management |

Authenticated shells load the current user from the API before rendering protected areas. NIQ platform administrators and organization users have separate shells. Organization routes and actions also respect membership permissions. Client-side visibility is a convenience; the API must authorize every request independently.

Authentication uses server-managed cookies with credentialed requests. Do not introduce browser-stored API keys or duplicate session tokens in local storage.

## Local development

Use Bun **1.4.0**, matching the repository's `packageManager`. Install from the repository root so workspace packages and the lockfile resolve together. These commands are relative to `niq-application`, not to `apps/web`:

```sh
cp .env.example .env
bun install --frozen-lockfile
```

Configure the root `.env`, provision the Application database and migrate it using the [backend instructions](../api/README.md). Then start both API and web through the workspace command:

```sh
bun run dev
```

To run only this frontend from the repository root:

```sh
bun run --cwd apps/web dev
```

The API must still run separately. The frontend listens on `http://localhost:5173` with a strict port. Vite proxies `/api/*` to `http://localhost:3000/*`, removing the `/api` prefix. For example, `/api/v1/auth/me` reaches API route `/v1/auth/me`.

Use the exact frontend origin configured by the API's `WEB_ORIGIN`; mixing `localhost`, `127.0.0.1` and different ports can break cookies or origin validation. NIQ Scoring is a separate workspace: do not run a second frontend on the same port. This app's preview defaults to `4173`, which can conflict with the Scoring admin frontend.

## Environment and feature settings

Vite's `envDir` points to the repository root, so its normal `.env` and mode-specific environment files are read there. Only variables deliberately exposed with `VITE_` are available in the browser bundle. Every such value is public and normally fixed at build time. A server environment change does not alter an already-built static bundle.

| Setting | Where it belongs | Effect |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | Frontend build environment | Enables browser error reporting when nonempty |
| `VITE_SENTRY_ENVIRONMENT` | Frontend build environment | Labels the Sentry environment |
| `VITE_SENTRY_RELEASE` | Frontend build environment | Identifies the deployed release |
| `WEB_ORIGIN` | Application API environment | Defines the permitted browser origin |
| `REPORT_DIAGNOSTICS_ENABLED` | Application API environment | Controls report diagnostic tools and manual PDF generation independently of `NODE_ENV` |
| `FACE_SCAN_ENABLED` | Application API environment | Enables new Vital IQ scans |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Application API environment | Enables optional browser push delivery |
| `BYOC_SETUP_TOKEN`, `BYOC_SETUP_EXPIRES_AT` | Application API environment | Authorizes the one-time client-cloud setup flow |

The API exposes an authorized `developmentToolsEnabled` capability to the frontend. It controls the Clinical report link and diagnostic report route. Keep `REPORT_DIAGNOSTICS_ENABLED=false` on client installations. For new approvals and explicit regenerations, `true` generates the report content and waits for manual PDF generation in the Clinical report workspace. With `false`, report content and PDFs are generated automatically. Permitted PDF downloads remain available in both modes. Changing the setting does not rewrite existing report jobs. Restart the API after changing this setting.

Never create `VITE_` variants of private configuration such as database URLs, provider keys, setup tokens or Scoring activation credentials.

## Checks, tests and builds

Run from the repository root:

```sh
bun run --cwd apps/web check
bun run --cwd apps/web test
bun run --cwd apps/web build
```

The build runs TypeScript project checks and Vite, producing `apps/web/dist/`. Tests use Bun and, where needed, JSDOM and React Testing Library. Tests should cover observable workflows and permissions without contacting paid services.

To inspect a build locally:

```sh
bun run --cwd apps/web preview
```

Vite preview is a build inspection server, not the production host. It inherits the configured development `/api/` proxy to `localhost:3000`, so the API must run separately. Preview defaults to port `4173`; configure the API's `WEB_ORIGIN` to the exact preview origin and restart the API before testing authenticated requests there. If Scoring already uses that port, choose another port with `bun run --cwd apps/web preview --port 5174` and use that origin instead. Changing the preview port does not change the API's allowed origin automatically.

## Deployment

Deploy the frontend with the Application API using the repository's [deployment guide](../../docs/deployment.md). For a dedicated customer Ubuntu server, use the [BYOC installer and operator guide](../../docs/byoc-deployment.md), which handles host prerequisites, DNS, TLS, containers and setup. Running the web container alone does not provision an organization or database.

The frontend image is built with repository root as context:

```sh
docker build -f apps/web/Dockerfile -t niq-application-web:<release> .
```

The runtime image serves the built bundle with unprivileged nginx on port `8080`; its API upstream is the Compose service `api:3000`. The Dockerfile accepts the three `VITE_SENTRY_*` values as build arguments. Rebuild the image when browser monitoring configuration changes.

The standalone BYOC Compose file forwards those Sentry build arguments; the base Compose file does not. For the base recipe, explicitly supply the public build arguments through the deployment configuration rather than assuming that root `.env` values enter the image. Neither shipped recipe forwards the backend VAPID trio, so browser push requires an explicit reviewed API-environment pass-through as described in the backend guide.

A correct deployment must preserve these routing and security properties:

1. Serve `/api/` through the Application API and remove exactly that prefix. API errors must never fall back to `index.html`.
2. Serve other application routes through an SPA fallback so a reload of a patient or assessment URL resolves to `index.html`.
3. Terminate HTTPS at the trusted public proxy. Preserve the original `Host` and forwarded HTTPS scheme through the proxy chain. Do not replace an outer `https` scheme with a container's internal `http` scheme.
4. Allow long report-generation/download requests and the organization `/live` Server-Sent Events stream. Disable proxy buffering and caching for the live endpoint so notifications arrive promptly. The BYOC host proxy supplies the long-lived API configuration; check equivalent settings in any custom proxy.
5. Match body limits and timeouts to the backend's bounded upload and Vital IQ signal endpoints. Keep sensitive uploads outside the static web root.
6. Retain security headers and the explicit CarePlix SDK resource allowlist. The shipped nginx policy permits camera use from the same origin and blocks microphone use. If enabling a browser Sentry DSN, ensure the effective Content Security Policy also permits that DSN's ingest endpoint; otherwise the browser will block delivery.
7. Serve the push service worker at `/niq-push-sw.js` on the application's origin. Do not rewrite that resource to the SPA document.

Production hosting does not require a running Vite server or host Node installation when using the container image.

## Notifications and live updates

The notification bell displays the authenticated user's organization inbox, unread count, links, mark-read actions and dismissal actions. Its content comes from the API's persisted notifications, not from a separate browser-only message store. A `BroadcastChannel` synchronizes inbox changes across tabs when supported.

The frontend opens a credentialed Server-Sent Events connection to `/api/v1/organizations/:organizationId/live` while visible. It refreshes affected screens on workspace changes, catches up after reconnection/focus and closes the stream when hidden. An SSE refresh is a UI synchronization mechanism, not an email or phone notification.

Browser push is optional and requires backend VAPID configuration, a secure browser context, service-worker/Push API support and explicit user permission. The user turns it on or off for the current device from the notification bell. The service worker displays an OS/browser notification and opens a safe assessment route when clicked. On iPhone, the application must be added to the Home Screen and opened there. Enrollment in one browser/device does not enroll every device.

The frontend does not configure SMTP, send SMS or deliver WhatsApp messages. Delivery channels and event recipients are determined by backend services. See the [API README](../api/README.md) for server behavior and [monitoring guide](../../docs/monitoring.md) for operational Sentry alerts.

## First hospital setup

On a BYOC installation, `/setup` accepts the operator's private setup key and creates the organization and its first Hospital Administrator. It creates an organization administrator, not an NIQ platform administrator. The backend enforces expiry, one-time completion and concurrency protection; merely opening this public route grants no administration access.

The browser keeps the setup key only in memory and does not place it in a URL or persistent browser storage. Deliver it through the trusted operator channel. The setup interface reports configured prerequisites and explicitly warns when production OTP delivery is unavailable. Completing setup does not bypass the normal sign-in and MFA workflow.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank page or missing assets | Verify the release's complete `dist/` content and base-origin deployment, then inspect browser network errors |
| API response contains HTML | `/api/` is reaching the SPA fallback instead of the API reverse proxy |
| Sign-in loop or origin error | Verify cookies, the exact `WEB_ORIGIN`, HTTPS and forwarded scheme |
| Clinical report link is missing | Verify the server's diagnostic flag and the user's permissions; use ordinary PDF download for issued reports |
| Download PDF is disabled | The API has not reported an available saved PDF; inspect backend report status instead of enabling the button locally |
| No immediate inbox refresh | Inspect the authenticated live stream and reverse-proxy buffering/timeouts |
| Push control is missing | Check backend VAPID configuration, browser support, secure context and device permissions |
| Camera cannot start | Check HTTPS, browser permission, API scan capability and the vendor resource policy |
| Browser Sentry receives nothing | Check build-time DSN, deployed release, CSP and outbound browser connectivity |

## Further documentation

- [Repository overview](../../README.md)
- [Application API](../api/README.md)
- [Architecture](../../docs/architecture.md)
- [Authentication](../../docs/authentication.md)
- [Organization roles](../../docs/organization-roles.md)
- [Automatic report workflow](../../docs/automatic-report-workflow.md)
- [Report storage](../../docs/report-storage.md)
- [BYOC deployment](../../docs/byoc-deployment.md)
