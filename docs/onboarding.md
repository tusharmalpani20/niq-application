# Onboarding foundation

NIQ is a controlled B2B product; there is no public organization signup.

1. An authorized NIQ operator provisions an organization and its user entitlement.
2. The system creates a one-time invitation for the first organization administrator. Only a hash of the token is retained.
3. The administrator activates an identity, configures branding, and optionally creates facilities.
4. The administrator invites medical users. Active users plus pending invitations consume the organization limit; deactivated users do not.
5. Patients do not receive accounts in Phase 1.

Scoring-service access uses a separate activation flow. An NIQ operator provisions the customer and deployment in the central scoring platform, then issues a short-lived, single-use activation token. The scoring organization must use the application organization's ULID as its external reference. The NIQ application administrator enters the token on the organization detail screen; the application backend includes that reference in its server-to-server exchange. The scoring service verifies that the deployment permits the mapped organization before consuming the token. The application then stores the scoring service's organization ID and the resulting deployment credential, encrypting the credential with AES-256-GCM and a separately configured key. The browser receives only connection metadata and never receives the permanent credential. Scoring remains unavailable when the scoring URL or encryption key is not configured.

After activation, the Application backend uses that credential to request the deployment-scoped organization snapshot from NIQ Scoring. No caller-selected organization ID is sent to Scoring. Deployment mode, service availability, scoring and face-scan monthly limits, and current-month usage are validated and displayed live without being persisted in the Application database. Only the Application-owned user limit remains local. An expired or revoked service credential requires a new activation token.

## NIQ administrator flow

The bootstrap account has `platformRole=NIQ_ADMIN`. After password and MFA verification it is routed to `/admin/organizations`; organization users are routed to the clinical workspace. The NIQ administrator creates an organization, initial entitlement and first organization-administrator invitation atomically. Development may expose the one-time invitation URL on screen; production must deliver it through the approved notification adapter.

The administrator may add a PNG, JPEG or WebP organization logo during onboarding. Logos are limited to 2 MB, their actual file signature is checked against the declared type, and the initial implementation stores the tenant-bound binary in PostgreSQL so the same deployment package works in NIQ-hosted, client-cloud and on-premises environments. The authenticated logo endpoint returns private, non-sniffable responses; logos are not embedded in organization list responses.

## Facility access

Invitation facility assignments become facility memberships when the invitation is accepted.
An organization membership with no facility assignments represents “All facilities.”
One or more assignments restrict patient lists, patient detail lookups (including references),
patient registration, facility lists, and facility updates to those facilities. These checks
apply to medical, support, and organization-admin users. Existing NIQ platform-admin access
is unchanged. A facility-restricted administrator cannot issue an invitation granting broader
facility access.

Assignments are evaluated in each data query, so no sign-out is needed after an assignment
change. Inactive facilities retain their assignments and do not grant wider access. A patient
without a home facility is visible only to users with organization-wide access.

Assessment APIs are not implemented yet; the assessment UI currently uses demonstration
records. Future assessment list, detail, creation, scoring, and export endpoints must enforce
the same facility boundary before returning or changing stored assessment data.

The PostgreSQL access tests use temporary tables. Run
`FACILITY_TEST_SOCKET=/path/to/isolated/socket bun test apps/api/src/services/facility-access.test.ts`
against a disposable PostgreSQL instance on port 55439; the tests skip when this variable is absent.

## Authentication acceptance gate

Before enabling `AUTH_MODE=local` or `AUTH_MODE=oidc`, implement and review:

- Password hashing or OIDC validation, account enumeration protection and rate limiting
- Secure, rotating, HTTP-only same-site sessions with CSRF protection
- MFA for privileged and production-support access
- Invitation expiry, single use, revocation and resend semantics
- Password reset, session revocation, suspension and termination workflows
- Audit events for successful and failed authentication and administrative changes
- Emergency support access with approval, expiry and enhanced audit logging
