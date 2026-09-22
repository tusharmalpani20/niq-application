# Clinical review verification — 23 September 2026

## Passed

- Workspace TypeScript checks: all five packages.
- Workspace production build: all five packages. Existing Vite large-chunk and Turbo lockfile graph warnings remain.
- API suite with assessment and profile PostgreSQL variables: 187 passed, 9 skipped, 0 failed; 872 assertions. Skips are the separately configured facility fixture group (including its hooks).
- Web suite: 135 passed, 670 assertions.
- Assessment lifecycle focused suite: 21 passed, 173 assertions, including two real return/save/rescore/resend cycles and final completion.
- Clinical lifecycle focused suite: 9 passed, 56 assertions, including concurrent claims, concurrent completion/adjustment, inactive/out-of-scope recipients, replay, encryption and audit rollback.
- NIQ Scoring compatibility: 14 passed, 104 assertions. Same assessment binding supports corrected calculations with distinct keys.
- Migrations 0023 and 0024 applied successfully to disposable PostgreSQL and local development database.
- Read-only browser smoke check: existing assessment list and new Clinical reviews tab load under the signed-in organization admin; queue shows its empty state with search and stage filter. No live assessment was changed for testing.

Counts from focused suites overlap the full suites and should not be added together.

## Remaining verification limitation

The separately enabled legacy `facility-access.test.ts` suite has 6 failures and 1 pass: its temporary patient table lacks `encrypted_external_reference`, and its old encrypted-profile fixture also predates the current representation. These fixtures were not changed by this feature. A temporary diagnostic schema adjustment exposed the second fixture mismatch and was reverted. New clinical-review tests independently exercise organization/facility eligibility and reject out-of-scope recipients, but this older fixture suite remains failing.

Browser verification was a read-only smoke check, not a live clinician handover exercise. Stateful clinical behavior was verified with API integration tests and rendered UI tests. Intervention fields and a full history comparison screen remain intentionally deferred.
