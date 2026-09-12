# Compliance baseline

This engineering baseline supports, but does not by itself establish, compliance with applicable law or customer contracts.

- Tenant context is mandatory for access to patient and assessment data.
- Authorization must be enforced server-side; a successful sign-in is not authorization.
- Production authentication must include secure session handling, account lifecycle controls and MFA for privileged access.
- Sensitive data must be encrypted in transit and at rest. Secrets must not be committed or logged.
- Application audit events are separate from redacted operational logs. The database rejects ordinary audit-event mutation; production runtime credentials must not own the schema.
- Audit reads, writes, exports, overrides, configuration changes and administrative actions.
- Send the scoring and notification providers only the minimum necessary data.
- Do not put health data in SMS, email, analytics, tracing or exception messages.
- Do not use production patient data in development or tests.
- Retention, deletion, legal hold, data-subject request and incident-response procedures require approved operational policies.
- Maintain subprocessors, agreements, regional transfer controls and customer deployment responsibilities outside the source code.

India-first deployment does not remove the need to prepare HIPAA/GDPR controls before US/EU processing. Clinical functionality also requires a formal medical-device applicability decision before production use.
