# Clinical review implementation audit — 23 September 2026

## Fixed findings

1. **Old score forms could modify a new scoring cycle.** Adjustment revisions reset per submission, so revision alone was insufficient. Requests now require the displayed result reference; the UI preserves the result and revision from when editing began. Result or permission changes block stale saves. Regression includes a correction cycle with matching revision zero but a different result.
2. **Facility revocation could race review mutations.** Clinical commands and score adjustments now re-authorize assessment access after acquiring the current membership lock. PostgreSQL tests simulate losing assessment-facility access while retaining patient-home-facility access.
3. **Contact save used a stale questionnaire revision.** Saving dirty answers first advances the revision; contact updates now use the returned revision. A rendered UI regression covers this sequence.
4. **Contact corrections lacked before/after assessment history.** Assessment-context contact updates now append encrypted previous/new values with the actor in the same transaction as the update. Generic audit metadata still excludes contact values.
5. **Pending-scoring scan recovery used an incorrect status name.** Replaced PENDING_SCORING with SCORING_PENDING and centralized the typed recovery status list for SQL and projection checks. A PostgreSQL regression executes background recovery while scoring is pending.
6. **Assignment conflict recovery retained outdated recipients.** Reload now refreshes eligible people, clears a revoked selection, and preserves the user's note.
7. **Legacy integration fixtures prevented complete verification.** Facility temporary tables now include the current assessment serial and encrypted MRN fields, with valid encrypted values. Optional profile tests no longer throw during configuration when their database variable is omitted.

## Verification

- API: 197 passed, no failures or skips, 905 assertions, all PostgreSQL integration groups enabled against a disposable database.
- Web: 140 passed, no failures, 694 assertions.
- Contracts and unconfigured optional profile suite: six passed; four database hooks/tests correctly skipped without the database variable.
- Workspace TypeScript checks and production build passed for all five packages.
- Existing build warnings: large browser bundle and Turbo lockfile graph warnings.
- No live patient data modified for this audit. Stateful checks use isolated PostgreSQL and rendered UI tests; this audit did not repeat a live browser clinician handover.

## Commits

- f4e6604 — legacy fixtures and optional suite setup.
- c1bb6f5 — encrypted assessment contact history.
- c624c4c — scoring-result identity guard.
- 86cc752 — scan recovery status correction.
- 0442942 — facility authorization race protection.
- 16ee72d — contact revision handling.
- d8c2c1d — stale score-edit protection.
- 638761e — recipient eligibility refresh.
- f1c4227 — background scan recovery regression.

The previously reported six facility-suite failures are resolved. Existing intentional scope limits remain: no intervention form, organization rules page, completion reopening or full history comparison screen. Queue filtering still occurs in memory within authorized records.
