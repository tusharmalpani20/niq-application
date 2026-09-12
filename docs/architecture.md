# Architecture

## Boundaries

The API is a modular monolith. Organization, facility, identity, patient, assessment, document, notification and audit capabilities share one deployment and database while remaining separate domain modules. The scoring system is an external service with its own release lifecycle and data store.

An organization is the tenant and security boundary. A facility is optional operational metadata within an organization; it does not create another deployment or database. A hospital group normally has one central application and may record several branches.

All patient-owned rows carry `organization_id`. Repository queries must require organization context. Facility scoping may be introduced later without changing the tenant boundary.

## Scoring integration

The application stores the assessment, sends a minimal pseudonymous scoring request, and persists the returned immutable result. A result records the external request ID, scoring version, rule checksum and calculated time. If scoring is disabled or unreachable, the assessment remains saved with a retryable status. Historical results are never recalculated silently.

## Measurement provenance

The UI never asks a clinician to select the measurement source. It attempts the configured automated face-scan workflow first. If that automated attempt is unavailable, the workflow exposes the approved fallback fields and records `AUTOMATED_MANUAL_FALLBACK`; successful provider results record `AUTO_FACE_SCAN`.

## Dependency direction

`apps/*` may depend on `packages/*`. Domain and contracts packages do not depend on Hono, PostgreSQL, a cloud provider, MSG91 or a face-scan vendor. Provider adapters remain inside the API application.
