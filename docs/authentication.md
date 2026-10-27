# Authentication and tenant onboarding

There is no public signup endpoint. The first NIQ administrator is created once through `POST /v1/bootstrap`, protected by the independent `BOOTSTRAP_TOKEN`. The CLI below calls that endpoint; no setup frontend is needed. Production starts normally without this token, and the endpoint is closed when it is absent. Remove the token from the runtime environment and restart the API after bootstrap. The database refuses bootstrap once an NIQ administrator exists, including concurrent requests from multiple API replicas. Bootstrap activates the account but does not create an authenticated session; the administrator must complete normal password and OTP sign-in.

NIQ administrators create customer organizations. Organization administrators create facilities and one-time invitations. Pending invitations reserve a user seat. Expired invitations are released before another invitation is created, deactivated memberships release seats, and reactivation is checked transactionally by the database trigger.

## Local OTP delivery

Set `DEV_OTP_DELIVERY=true` only on a developer workstation. The OTP is emitted to the API console. Production configuration rejects this setting. A production notification adapter must be connected before local authentication is enabled there.

For local testing, set `NODE_ENV=development` and `DEV_FIXED_OTP=true`, then restart the API. New sign-ins and resends use `000000` for every account that requires MFA. Passwords, account checks, expiry, attempt limits and single-use challenges still apply. Existing challenges retain their previous code until resend. This flag enables development delivery and is rejected outside development. Keep it off for production and use the real delivery adapter. In fixed-code mode, a resend rotates the challenge token but retains `000000`.

## Session model

- The browser receives an opaque `HttpOnly`, `SameSite=Strict` cookie.
- Only an HMAC-SHA-256 hash of the token is stored in PostgreSQL.
- Sessions expire after the configured TTL and are revoked on sign-out or membership deactivation.
- Password failures are keyed by an HMAC of normalized email, and temporary lockout is shared across API replicas through PostgreSQL.
- MFA challenges are one-time, expire quickly, and stop accepting guesses at the configured attempt limit.
- The verification screen uses server-issued expiry and retry counts. Resending is
  cooldown-protected, capped per challenge, rotates both the challenge token and
  OTP, and invalidates the previous code.

## Initial administrator CLI

Use values from your uncommitted `.env`; never paste real credentials into source control, command arguments or shell history on a shared machine. Configure an independent random `BOOTSTRAP_TOKEN` of at least 32 characters only for initial setup, then start the API. Use a restricted editor to create a mode-600 JSON file outside the repository containing these fields:

```json
{"legalName":"NIQ","displayName":"NIQ","slug":"niq","adminEmail":"admin@example.com","adminDisplayName":"NIQ Admin","adminPassword":"replace-with-a-strong-password","userLimit":null}
```

From `apps/api`, submit that file through stdin:

```bash
bun --env-file=../../.env run admin:bootstrap < /secure/path/bootstrap.json
```

The default API address is `http://127.0.0.1:3000`. Set `BOOTSTRAP_API_URL` in the command environment for another port or host. Non-loopback addresses require HTTPS. Redirects are refused so credentials cannot be forwarded to another endpoint. The CLI prints only success or a generic error, never submitted credentials or server response bodies.

After success, delete the temporary credential file, remove `BOOTSTRAP_TOKEN` from the API environment and restart the API. Sign in through the browser and complete normal MFA. In development only, the OTP can be read from the API console when development delivery is enabled. Production still requires a real OTP delivery adapter. The frontend validates and performs sign-in, MFA, invitation acceptance, session check and sign-out through `/v1/auth/*`.

## Security boundaries

Organization IDs are checked against the authenticated session; they are not trusted merely because they appear in a URL. NIQ platform administrators may manage all organizations. Customer administrators may manage only their own organization. Clinical-role restrictions remain intentionally coarse for Phase 1, but tenant isolation is always enforced.
