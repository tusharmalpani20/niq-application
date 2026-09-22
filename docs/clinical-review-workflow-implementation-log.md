# Clinical review implementation log

## 23 September 2026 — implementation started

User authorized implementation of the audited plan. Earlier skeleton contracts must be replaced to include correction cycles, reasoned handover/release, correction assignment, resubmission and permanent completion.

### Scoring compatibility gate

Read NIQ Scoring assessment routes/binding logic. Ran:

`bun test apps/api/src/assessment-routes.test.ts apps/api/src/final-assessment-routes.test.ts`

Result: 14 passed, 104 assertions. Existing approved-profile test scores different answers under the same assessment binding with distinct idempotency keys; retries return the identical stored response; changed payload with an existing key conflicts. No NIQ Scoring change is required for correction calculations.

A new corrected calculation consumes another scoring usage. A retry of that calculation does not consume an additional usage. The original rule/version binding stays pinned; unavailable quota or binding remains a scoring error, not a clinical completion.

### Parallel implementation boundaries

- Contracts, lifecycle service, schema/migration, queue/routes and score-adjustment scoping.
- Draft save and scoring integration, explicit current submission, cycle history.
- Report/scan ownership and historical evidence protection.
- Clinical review and correction UI using shared controls.

No production or live patient data will be mutated for automated testing.

## Delivered implementation

Small logical commits (no push):

- f699016: review actions and guarded dialogs.
- 64cc9f8: clinical review queue.
- 9e77006: editor ownership integration.
- 28cfa9f: action contracts and role boundaries.
- 76dfe03: cycles and encrypted history migration.
- 62a7e29: persisted scoring cycles and stale-result protection.
- f1a86e2: historical report evidence.
- 99b2ffa: frozen scan evidence and recovery boundaries.
- 1481f0e: correction draft/recovery UI separation.
- 00a0051: score adjustments scoped to current submission and owner.
- 6b0ded4: atomic lifecycle commands and API queue.
- 79b5197: membership and patient access locking.
- 73ac132: scoped current-submission foreign key and readiness.
- ab2fff4: complete correction/rescoring integration coverage.
- 29e4eef: admin score-review permission regression expectation.

Migrations are applied locally. Documentation is maintained in the requested application/docs directory and mirrored in the application repository. See the verification record for passed checks and the pre-existing legacy facility test fixture failures; see history/operations for migration, retries, evidence retention and deferred scope.

## Follow-up implementation audit

Audited and fixed stale scoring-result identity, membership/facility authorization race, contact revision/history, pending-scoring scan recovery and recipient refresh. Repaired legacy verification fixtures. All 197 API and 140 web tests pass. See clinical-review-implementation-audit-2026-09-23.md for detailed evidence and commits.

## Reviewed-risk classification extension

Reviewed totals now receive NIQ classification under the pinned rule version, with durable retries, encrypted history and a completion gate. See [reviewed-score-risk-classification.md](reviewed-score-risk-classification.md) for usage semantics, migration and verification. Original NIQ results remain unchanged.
