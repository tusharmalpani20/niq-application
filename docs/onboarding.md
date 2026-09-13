# Onboarding foundation

NIQ is a controlled B2B product; there is no public organization signup.

1. An authorized NIQ operator provisions an organization and its user entitlement.
2. The system creates a one-time invitation for the first organization administrator. Only a hash of the token is retained.
3. The administrator activates an identity, configures branding, and optionally creates facilities.
4. The administrator invites medical users. Active users plus pending invitations consume the organization limit; deactivated users do not.
5. Patients do not receive accounts in Phase 1.

Scoring-service access uses a separate activation flow. An NIQ operator provisions the customer and deployment in the central scoring platform, then issues a short-lived, single-use activation token. The NIQ application administrator enters that token on the organization detail screen. The application backend exchanges it server-to-server and stores the resulting deployment credential using AES-256-GCM with a separately configured encryption key. The browser receives only connection metadata and never receives the permanent credential. Scoring remains unavailable when the scoring URL or encryption key is not configured.

## NIQ administrator flow

The bootstrap account has `platformRole=NIQ_ADMIN`. After password and MFA verification it is routed to `/admin/organizations`; organization users are routed to the clinical workspace. The NIQ administrator creates an organization, initial entitlement and first organization-administrator invitation atomically. Development may expose the one-time invitation URL on screen; production must deliver it through the approved notification adapter.

## Authentication acceptance gate

Before enabling `AUTH_MODE=local` or `AUTH_MODE=oidc`, implement and review:

- Password hashing or OIDC validation, account enumeration protection and rate limiting
- Secure, rotating, HTTP-only same-site sessions with CSRF protection
- MFA for privileged and production-support access
- Invitation expiry, single use, revocation and resend semantics
- Password reset, session revocation, suspension and termination workflows
- Audit events for successful and failed authentication and administrative changes
- Emergency support access with approval, expiry and enhanced audit logging
