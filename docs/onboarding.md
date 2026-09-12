# Onboarding foundation

NIQ is a controlled B2B product; there is no public organization signup.

1. An authorized NIQ operator provisions an organization and its user entitlement.
2. The system creates a one-time invitation for the first organization administrator. Only a hash of the token is retained.
3. The administrator activates an identity, configures branding, and optionally creates facilities.
4. The administrator invites medical users. Active users plus pending invitations consume the organization limit; deactivated users do not.
5. Patients do not receive accounts in Phase 1.

On-premises bootstrap should eventually exchange a single-use NIQ activation token for a deployment identity. That provisioning API is intentionally absent until the central scoring identity protocol is agreed.

## Authentication acceptance gate

Before enabling `AUTH_MODE=local` or `AUTH_MODE=oidc`, implement and review:

- Password hashing or OIDC validation, account enumeration protection and rate limiting
- Secure, rotating, HTTP-only same-site sessions with CSRF protection
- MFA for privileged and production-support access
- Invitation expiry, single use, revocation and resend semantics
- Password reset, session revocation, suspension and termination workflows
- Audit events for successful and failed authentication and administrative changes
- Emergency support access with approval, expiry and enhanced audit logging
