# Authentication and tenant onboarding

There is no public signup endpoint. The first NIQ administrator is created once through `POST /v1/bootstrap`, protected by the independent `BOOTSTRAP_TOKEN`. Remove that token from the runtime environment after bootstrap. Bootstrap activates the account but does not create an authenticated session; the administrator must complete normal password and OTP sign-in.

NIQ administrators create customer organizations. Organization administrators create facilities and one-time invitations. Pending invitations reserve a user seat. Expired invitations are released before another invitation is created, deactivated memberships release seats, and reactivation is checked transactionally by the database trigger.

## Local OTP delivery

Set `DEV_OTP_DELIVERY=true` only on a developer workstation. The OTP is emitted to the API console. Production configuration rejects this setting. A production notification adapter must be connected before local authentication is enabled there.

## Session model

- The browser receives an opaque `HttpOnly`, `SameSite=Strict` cookie.
- Only an HMAC-SHA-256 hash of the token is stored in PostgreSQL.
- Sessions expire after the configured TTL and are revoked on sign-out or membership deactivation.
- Password failures are keyed by an HMAC of normalized email, and temporary lockout is shared across API replicas through PostgreSQL.
- MFA challenges are one-time, expire quickly, and stop accepting guesses at the configured attempt limit.
- The verification screen uses server-issued expiry and retry counts. Resending is
  cooldown-protected, capped per challenge, rotates both the challenge token and
  OTP, and invalidates the previous code.

## Local bootstrap example

Use values from your uncommitted `.env`; never paste real credentials into source control or shell history on a shared machine.

```bash
curl -X POST http://127.0.0.1:3000/v1/bootstrap \
  -H 'content-type: application/json' \
  -H 'x-bootstrap-token: YOUR_BOOTSTRAP_TOKEN' \
  --data '{"legalName":"NIQ","displayName":"NIQ","slug":"niq","adminEmail":"admin@example.com","adminDisplayName":"NIQ Admin","adminPassword":"replace-with-a-strong-local-password","userLimit":null}'
```

After it succeeds, sign in through the browser, read the development OTP from the API console, and complete the MFA screen. The frontend validates and performs the sign-in, MFA, invitation-acceptance, session-check and sign-out calls through the corresponding `/v1/auth/*` endpoints.

## Security boundaries

Organization IDs are checked against the authenticated session; they are not trusted merely because they appear in a URL. NIQ platform administrators may manage all organizations. Customer administrators may manage only their own organization. Clinical-role restrictions remain intentionally coarse for Phase 1, but tenant isolation is always enforced.
