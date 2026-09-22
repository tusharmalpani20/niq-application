# Clinical review plan audit — 23 September 2026

Scope: documentation audit only. Implementation remains paused.

Plan: [Clinical review implementation plan](clinical-review-workflow.md).

## Findings addressed

| Gap | Correction |
|---|---|
| Requiring an eligible clinician creator could prevent an admin creator from sending for review | Distinguish administrative handoff from performing review; creator still needs submission permission and scope |
| Correction SCORED could inherit generic score-adjustment/return permissions | Keep correction ownership until explicit resend; protect all associated mutation routes |
| “Previous reviewer” could accidentally resurrect someone who released the review | Capture current owner at return; null means resend to queue |
| No eligible default correction recipient | Require an explicit eligible replacement; never create an ownerless correction draft |
| Latest-submission ordering and historical score entries are incompatible with multiple cycles | Require an explicit current pointer and submission-scoped adjustments |
| Existing completedAt is populated at scoring success | Separate scoring and clinical completion and specify legacy migration safeguards |
| Historical file retention alone does not ensure retrieval after removal | Preserve manifests/content and provide authorized historical retrieval independent of working-set status |
| Async scan updates could change final reviewed evidence | Freeze exact result revisions and fence late writes by cycle; resolve active operations before finalization |
| Idempotent replay could fail after ownership/state changes caused by first request | Define replay authorization/payload/state precedence without duplicating transitions |
| Workflow revision alone may not detect newer score edits | Include score-review revision in handover/finalization preconditions |
| Migration/old-server compatibility was underspecified | Add inventory, baseline coverage, coordinated rollout and rollback restrictions |

## Code evidence inspected

Paths are relative to `application/niq-application`:

- `apps/api/src/services/assessment-workflow.ts`: editable checks, current answer replacement, submission selection, scoring result writes and completedAt behavior.
- `apps/api/src/services/assessment-score-reviews.ts`: current SCORED restriction and assumption that adjustment rows all belong to the latest scoring submission.
- `apps/api/src/services/assessment-workflow-reports.ts`: draft mutation checks, live upload checks, READY-only download and submission-manifest-aware cleanup.
- `apps/api/src/services/assessment-face-scan.ts`: current-session flags, draft capture/upload checks and asynchronous projection/recovery.
- `apps/api/src/services/facility-access.ts`: current database-resolved facility membership checks.
- `packages/contracts/src/roles.ts`: administrator permission superset requiring explicit review capability separation.
- `apps/web/src/features/assessments/AssessmentScoreReview.tsx`: adjustment visibility and save/conflict behavior.

## Verification performed

- Compared lifecycle and permissions with all confirmed user decisions, including no Organization rules, no reopening, admin assignment-only clinical role, and correction-person resubmission.
- Reviewed correction/assignment edge cases, persistence dependencies and asynchronous state changes.
- Added explicit acceptance cases and implementation gates rather than claiming unimplemented behavior is verified.
- Checked primary and repository plan copies match and documentation diff has no whitespace errors.
- Application tests were not run for this documentation-only audit; no runtime code was changed.

## Remaining implementation gates

Verify scoring binding reuse, scan evidence validity after input changes, and actual legacy data before enabling correction transitions. These are technical checks to perform during implementation. Any consequential new product decision discovered there must be documented and raised, rather than inferred silently.

Earlier incomplete code remains uncommitted and was not treated as a source of approved behavior. This audit does not authorize continuing it.
