# Clinical review and assessment correction — implementation plan

Status: implemented 23 September 2026. See companion implementation log, permissions/state guide, history/operations guide and verification record for delivered behavior and limits.
Date: 23 September 2026.
Plan audit: revised 23 September 2026; see section 16 and the companion plan audit.
Application repository: `/home/tm/Desktop/work/NIQ/application/niq-application`.
Primary documentation directory: `/home/tm/Desktop/work/NIQ/application/docs`.
Version-controlled copy of this plan: `niq-application/docs/clinical-review-workflow.md`.

## 1. Purpose

Extend scored assessments with a clinical review queue, accountable ownership, transfer and release, return-to-draft correction, rescoring and final completion. Preserve every persisted version and workflow action without replacing the original scoring evidence.

This plan supersedes the earlier clinical review draft that excluded correction/rescoring and suggested an administrator submission fallback. The confirmed decisions below take precedence over that draft and over any partially written code.

Implementation was separately authorized after this plan and audit were completed. No incomplete workflow code should be represented as finished functionality.

## 2. Confirmed product decisions

1. Only the original assessment creator can initially send a scored assessment for clinical review. Do not add an Organization rules tab or configurable submission rule now.
2. Doctors, Nutritionists and Other Medical Personnel, including nurses, can claim and conduct reviews. Self-review is allowed.
3. Organization admins manage assignment and can return reviews for correction. They cannot claim, perform score review or complete clinical reviews. Support users cannot perform clinical review actions.
4. Before clinical submission, an eligible clinician with access can return a scored assessment to draft. Once in clinical review, only its assigned reviewer or an organization admin can return it to draft.
5. Returning to draft requires a reason and identifies the correction person. Default to the original creator; permit choosing another eligible clinician.
6. The correction person updates answers, saves, resubmits for scoring and explicitly resends the corrected assessment for review. This is the exception to original-creator-only clinical submission.
7. On resubmission, route to the previous reviewer when they remain available and eligible; otherwise return to the unclaimed queue.
8. Preserve earlier score adjustments, but never automatically apply them to the new calculated score.
9. Allow both transfer to a named eligible clinician and release to the unclaimed queue. The current reviewer or admin can perform either action; a reason is required.
10. Completion requires a final remark. A completed review cannot be reopened, including by an admin.
11. Preserve answer versions, scoring attempts/results, score adjustments, return notes, assignment changes, final remarks, actors and timestamps. A full historical UI is not required immediately.
12. Detailed intervention fields remain undefined and are outside this implementation. The completion remark is included.

## 3. Domain terms

- **Assessment:** one persistent assessment identity/reference, potentially containing multiple correction and scoring cycles.
- **Calculated score:** the authoritative result received from NIQ Scoring for one frozen submission.
- **Score adjustment:** an existing reasoned override of points, associated with a particular calculated result; never a replacement for that result.
- **Clinical review:** the post-scoring ownership and completion workflow.
- **Review queue:** clinical reviews waiting to be claimed or already assigned; not all scored assessments automatically appear here.
- **Reviewer:** the sole currently assigned eligible clinical member.
- **Correction person:** the eligible clinical member responsible for a returned draft and its resubmission.
- **Correction cycle:** return to draft, edits, rescoring, and explicit resubmission for clinical review.
- **Original creator:** the immutable membership that created the assessment. Assignment does not change this identity.

Use distinct action labels: Calculate score / Retry scoring, Send for clinical review, Claim review, Transfer review, Release to queue, Return to draft, Resend for clinical review, Complete review. Avoid calling scoring submission and clinical submission simply “Submit” without context.

## 4. State model

Keep scoring state and clinical ownership distinguishable. Reuse existing assessment states where appropriate, with durable cycle and review metadata rather than inferring ownership from UI text.

| Assessment state | Review/correction context | Available next steps |
|---|---|---|
| DRAFT | Initial questionnaire | Save and submit for scoring under existing permissions |
| SCORING_PENDING | Current cycle has a frozen submission | Wait/recover the same scoring request |
| SCORING_UNAVAILABLE | Current scoring attempt uncertain/unavailable | Retry/reconcile existing request; do not treat it as scored |
| SCORED | Current result, not sent for clinical review | Adjust points as permitted; initial creator sends for review; eligible clinician returns to draft |
| UNDER_REVIEW | Unassigned | Eligible clinician claims; admin assigns or returns to draft |
| UNDER_REVIEW | Assigned | Assigned clinician adjusts points, transfers, releases, returns to draft or completes; admin manages assignment/return |
| DRAFT | Returned for correction with correction person | Assigned correction person edits and submits for scoring |
| SCORED | Correction scored, awaiting explicit resubmission | Correction person reviews current result and resends for clinical review |
| COMPLETED | Final remark and completion event saved | Read-only; no reopen, edits, reassignment or rescoring |

Track whether SCORED belongs to a correction cycle. Rescoring success must not automatically send a corrected assessment to clinical review or mark it completed.

Distinguish “Awaiting reviewer,” “In review,” “Returned for correction,” and “Awaiting resubmission” in user-facing context even when underlying assessment status is shared.

## 5. Permissions and access

### 5.1 Action rules

| Action | Authorized actor |
|---|---|
| Initial send for clinical review | Original creator with current assessment-submission permission and access (including an admin creator) |
| Claim unassigned review | Eligible clinician, including original creator |
| Adjust scores during assigned review | Current reviewer only |
| Transfer/release assigned review | Current reviewer or organization admin |
| Assign an unclaimed review | Organization admin |
| Return assigned/unassigned clinical review to draft | Current reviewer where assigned, or organization admin |
| Return scored assessment before review to draft | Eligible clinician with access |
| Edit returned draft / submit corrected answers for scoring | Assigned correction person |
| Resend corrected assessment for clinical review | Assigned correction person |
| Complete review | Current reviewer, with required completion remark |
| Reopen completed assessment | Nobody |

Sending to the queue is an administrative handoff, not performing a clinical review. An admin who originally created the assessment may send it, but cannot claim it, adjust clinical scores or complete it. No other admin receives a creator-ownership bypass.

Preserve existing initial-draft collaboration behavior unless required to enforce the new returned-draft ownership. Admin management must not accidentally grant clinical-review capability through the current “all permissions” pattern. Inspect and narrow score-adjustment authorization accordingly; document changes to existing admin capabilities.

### 5.2 Scope checks

Server enforcement must check active organization, active account and membership, correct organization, eligible role, access to both the assessment facility and the patient’s current facility, and the action’s ownership/state preconditions. Do not rely on hidden buttons.

Recipient lists must include only eligible clinical members within that same access scope. Revalidate at command execution, not just when the picker opens. Disabled accounts, removed memberships, changed roles and revoked facility access are ineligible. Previous actor names/identities remain in history after deactivation.

### 5.3 Unavailable people

There is no agreed leave-calendar/availability feature. Treat account/membership/access eligibility as the automatic availability signal. Absence of an otherwise active reviewer is handled by admin transfer/release. Do not add a leave-management system.

If the original creator is not eligible to correct, require an eligible replacement instead of assigning an inaccessible draft. If a correction person later loses access, allow admin correction reassignment with a reason and history; this is necessary to avoid trapping the correction cycle.

If the creator cannot perform an initial clinical submission, do not silently give admins a submission bypass. This limitation must be documented and surfaced; any future exception needs a separate product decision.

## 6. Transition details

### Send and claim

- Require a successfully persisted, current calculated result and no unresolved scoring request.
- Require all local edits/score adjustments to be saved before workflow transitions.
- Initial send moves the assessment to an unclaimed review queue.
- Claim atomically sets the actor as the sole reviewer. A losing concurrent claimant receives a conflict and fresh state.
- Self-review is explicitly allowed. An admin is not an eligible reviewer merely because they can manage assignments.

### Transfer and release

- Transfer requires a different eligible recipient and a nonblank reason. It takes effect immediately; recipient acceptance is not part of this scope.
- Release requires a reason and clears current ownership, preserving all saved work.
- Admin assignment/reassignment uses the same eligible-recipient restrictions and required reason.
- A prior reviewer’s stale page cannot continue making adjustments after handover.

### Return to draft

- Require a reason and correction person before confirming.
- Preserve the submitted answer snapshot, result, score adjustments, report references, relevant scan/result associations and review ownership/history for the old cycle.
- Retain previous reviewer identity for later routing, then remove active clinical-review ownership while corrections are pending.
- Create a new editable working version seeded from the last submitted answers. Do not reuse or mutate an old frozen scoring submission.
- Make the return reason and assigned correction person visible to the person doing the work.
- Block return while scoring is pending or uncertain; recover that request first.
- Completed assessments cannot take this transition.

### Correct and rescore

- Enforce correction ownership on all mutation routes, including answer saves and scoring submission, plus report/scan operations that affect the cycle.
- Reuse existing answer validation and dependency clearing; record both direct edits and resulting persisted dependent-field changes.
- Every successful draft save gets an immutable revision snapshot or losslessly replayable change event; actor and timestamp are required.
- Use a new scoring idempotency key for a new corrected submission. Retry/recovery within the same submission reuses its existing key.
- Keep historical results available for audit, but never present an old result as the current corrected result.
- Current score adjustments start clean against the new result; previous adjustment history remains linked to the previous submission/cycle.
- Correction ownership lasts until explicit clinical resubmission, including while the corrected result is SCORED. Only the correction person may adjust that result before resending; a generic pre-review permission check must not bypass this ownership. Admin correction reassignment is allowed in returned DRAFT or correction SCORED, but not during an in-flight/uncertain scoring request.
- While the correction is pending, preserve previous reviewer separately from correction person. The previous reviewer has no clinical mutation rights until ownership returns on resend.

### Resend and complete

- Only the correction person explicitly resends that cycle after successful scoring.
- Return ownership to the previous reviewer if still eligible and not explicitly replaced. Otherwise enqueue unassigned; show what happened.
- Preserve the last reviewer through multiple correction cycles without confusing them with the correction person. If returned before any reviewer claimed it, previous reviewer is null and resend goes to the unclaimed queue. A release clears current ownership: do not resurrect a historical released reviewer when a later admin returns unassigned work to draft.
- Completion requires current reviewer ownership, a current score, no outstanding correction/scoring operations, and a nonblank final remark.
- Snapshot the final reviewed score and its revisions/references at completion.
- Set completion timestamp here. Audit the current use of `completedAt` on scoring success and separate “scored at” from actual clinical completion.
- Reject every completed-record mutation path, not only the completion panel’s controls.

## 7. History and persistence design

Finalize schema design after reviewing existing submissions, answers, score-review entries, reports and scan persistence. Prefer extending these responsibilities rather than creating a second conflicting scoring system.

Required durable information:

- Review state, current reviewer, correction person, original creator, previous reviewer and cycle number/identifier.
- Monotonic workflow revision and stable command request keys.
- Immutable events for send, claim, assignment, transfer, release, return, correction reassignment, save, scoring submit/result/failure, resend and completion.
- Actor membership/user identity and display-name snapshot, server timestamp, source/target state, source/target owner and reason where required.
- Answer snapshots or complete reconstructable diffs per persisted revision, associated with cycle and actor.
- Frozen scoring inputs and rule/version binding, scoring request/result identifiers and all past results.
- Score-adjustment entries scoped to their exact submission/result, with prior/new points and reasons.
- Report/file and scan references needed to reconstruct each submitted cycle. A later report edit/removal must not make historical submissions unreconstructable.

“Track everything” means all persisted clinical/workflow changes, not every unsaved keystroke. Failed/denied attempts may enter ordinary security audit with safe metadata; they must not appear as accepted clinical transitions.

Store sensitive snapshots, names and free-text notes using existing encryption patterns. General audit logs contain IDs and event metadata, not clinical answers or note bodies. Preserve retention/deletion obligations: history is append-only through ordinary application actions, not an exemption from authorized retention policy.

Add organization-scoped foreign keys and indexes for queue state, owner/correction person and history lookup. Existing records need a safe migration/backfill strategy; do not claim to reconstruct historical changes that were not previously retained. Record the audit coverage boundary.

## 8. Concurrency, retries and transaction boundaries

- Lock the assessment/workflow row for every transition and score mutation that depends on ownership.
- Validate expected workflow revision inside the same transaction as permission/state checks and writes.
- Persist state, assignment, event and audit together. Roll back all on failure.
- Persist request IDs/keys to make response-loss replay safe; same key with a different payload must conflict.
- Serialize claim versus claim, transfer versus score adjustment, return versus score adjustment, and completion versus adjustment.
- A request begun before a return must never write an old score result into a new cycle. Bind worker/recovery writes to submission and cycle identity.
- Reject stale changes with a clear reload message. Keep unsaved local content until the user chooses how to proceed.
- Revalidate recipient/actor eligibility at action time and consider membership-change races in the locking strategy.

## 9. API and shared contracts

Add typed, validated contracts for review projection, queue item, eligible recipient, cycle summary and commands. Suggested command family: SEND, CLAIM, ASSIGN/TRANSFER, RELEASE, RETURN_TO_DRAFT, REASSIGN_CORRECTION, RESEND, COMPLETE.

Use explicit schemas per action. Require expected revision and request key; require recipient/reason/remark only for relevant actions, reject inappropriate properties, and set documented length limits.

Suggested endpoints, adjusted to existing routing conventions:

- GET organization clinical-review queue, with scoped filters/pagination.
- GET assessment clinical-review state and permitted actions.
- GET eligible reviewer/correction recipients for the assessment.
- POST assessment clinical-review command.
- Extend existing draft/scoring/score-adjustment routes with cycle and ownership enforcement.

Keep reference-to-ID resolution tenant scoped. Send server-derived allowed actions to simplify UI without replacing server enforcement. Prevent queue responses from exposing private history/notes unnecessarily.

## 10. UI plan

- Add Clinical reviews within Assessments using existing tabs/navigation patterns.
- Provide waiting, my reviews, and completed views; expose returned correction work to its correction person and admins so it cannot disappear between queues.
- Show assessment/patient reference, facility, stage, current responsible person and relevant dates. Use pagination and scoped search.
- Add a review panel to the scored assessment view with only permitted actions.
- Show current return note/correction responsibility and workflow status. Full answer-history browsing can wait.
- Use existing score adjustment controls; server permissions make completed and nonowned reviews read-only.
- Transfer/assign dialogs use shared searchable controls, no silently selected recipient, required reason and explicit action labels.
- Return dialog shows what returning means, default correction person if eligible, replacement picker and required reason.
- Complete dialog requires final remark and explains that completion cannot be reopened.
- Use shared unsaved-change confirmation for workflow dialogs. Disable transitions while an answer/score/note edit or save is in progress; avoid silently discarding content.
- Handle loading, no eligible recipients, no results, unavailable connection, revoked permissions, stale revisions and retry states.
- Verify keyboard focus, labels, mobile layout, org theme and dd/mm/yyyy conventions.

The status filter should reflect implemented states and any legacy states actually present; avoid presenting unused statuses as available workflow steps.

## 11. Mandatory documentation during implementation

**Document the whole implementation in `/home/tm/Desktop/work/NIQ/application/docs`, not only in code or the final chat response.**

Maintain these files there:

1. `clinical-review-workflow-implementation-plan.md` — this plan, kept current with approved decisions and completion status.
2. `clinical-review-workflow-implementation-log.md` — small entries for each delivered slice: behavior, touched areas, migration implications, checks/results and commit hashes.
3. `clinical-review-workflow-permissions-and-states.md` — final state diagram/table, role/ownership matrix, correction and handover rules.
4. `clinical-review-workflow-history-and-operations.md` — persistence/encryption, audit coverage, migration/backfill, retries, support procedures and limits.
5. `clinical-review-workflow-verification.md` — tests run, browser scenarios, concurrency evidence, known limitations and unresolved failures.

The primary directory is currently outside a Git repository. Maintain matching version-controlled documents under `niq-application/docs` so documentation changes are included in small commits. Do not silently initialize a new repository in the parent directory. Update both copies together and verify they match. Link this plan from related assessment operations and organization-role documentation when implementation begins.

Never record patient information, credentials, invitation tokens or live clinical screenshots in documentation or test artifacts.

## 12. Implementation sequence and small logical commits

Each commit must have one coherent responsibility, include relevant tests, and avoid unrelated formatting. Commit only reviewed files; do not bulk-stage a shared working tree. Keep every intermediate commit buildable where practical. Do not push unless requested.

Suggested slices (split further where needed; do not combine the whole feature):

1. Approved detailed plan and documentation convention — documentation only.
2. Shared lifecycle/action contracts and validation tests.
3. Clinical-review eligibility/permission helpers and tests, including admin clinical restrictions.
4. Review/cycle persistence schema, constraints and migration.
5. Immutable answer-version and cycle history support with tests.
6. Current-result and adjustment scoping per scoring submission with regression tests.
7. Send-to-review transition and scoped queue/read API.
8. Atomic claim transition and concurrency tests.
9. Transfer/admin assignment with reason and recipient access checks.
10. Release-to-queue transition and audit tests.
11. Return-to-draft and correction assignment with preserved historical snapshots.
12. Correction ownership and admin correction reassignment enforcement.
13. New-cycle scoring/retry integration and explicit resend routing.
14. Completion remark, final snapshot and comprehensive write locking.
15. Review queue UI and accessible filtering.
16. Review ownership/action panel and assignment dialogs.
17. Return/correction/resend UI and unsaved-change protection.
18. Completion/history summary UI and regression tests.
19. Integration/browser audit fixes, each as a separate focused fix where meaningful.
20. Final verification and operations documentation, with matching copies in the requested directory.

Update implementation log alongside each slice. Record migration order and any temporary compatibility boundary. Feature-gate incomplete entry points if needed; do not expose actions before server enforcement exists.

## 13. Test and acceptance matrix

### Permissions

- Initial creator with submission permission can send, including an admin creator; noncreator clinician/admin/support cannot bypass initial submission ownership.
- All three clinical roles can claim, including self-review; admin/support cannot claim, adjust clinical scores or complete.
- Assigned reviewer alone can adjust during review; former owner is rejected after transfer/release.
- Admin can assign/reassign/release/return without being given clinical ownership.
- Wrong org, inactive user/membership, wrong facility, moved patient and revoked role are denied.
- Recipient picker and mutation endpoint enforce the same eligibility; fabricated recipient IDs fail.

### Lifecycle and reasons

- Draft, pending and uncertain scoring cannot enter clinical review.
- Send does not occur automatically after scoring.
- Reasons are required for transfer/release/return/reassignment; whitespace-only text is rejected.
- Return seeds editable answers without mutating old snapshots.
- Only correction person edits/rescores/resends returned cycle, including current-cycle score adjustments before resend; eligible replacement can be assigned if necessary.
- Resend returns to eligible previous reviewer or unclaimed queue if ineligible; explicit transfer/release history is respected.
- Completion requires assignee, current result and final remark; completed work cannot reopen or mutate through any API.

### Scoring and history

- A corrected submission uses a new scoring request key; retry uses the same key.
- Previous results and score adjustments remain intact; current adjustments reset for new result.
- Historical answers, reasons, ownership and attached evidence can be reconstructed per cycle.
- Delayed old scoring/scan responses cannot overwrite new-cycle state or final reviewed evidence.
- Multiple correction cycles and rejected/uncertain scoring responses behave correctly.
- Audit/encrypted records retain evidence without leaking note/answer contents into ordinary logs.

### Concurrency and recovery

- Simultaneous claims have exactly one winner.
- Duplicate commands replay safely; payload mismatch conflicts.
- Stale transfer, return, score adjustment and completion cannot overwrite newer work.
- Transaction failures leave no partial assignment/history updates.
- Scoring recovery remains tied to the correct cycle and does not re-complete returned work.

### UI and existing behavior

- All action visibility, required notes, pickers and disabled states match server permissions.
- Cancel/close/outside/Escape protect changed dialog contents.
- Conflict feedback preserves local edits and offers refresh.
- Keyboard/mobile layouts and navigation remain usable.
- Existing patient, assessment draft/report/scan, scoring and score-adjustment tests remain passing.
- Run project checks/builds and meaningful PostgreSQL integration tests against disposable data, never live patient records.

## 14. Risks and implementation audit checkpoints

Inspect these known existing-code boundaries before building on them:

- Score adjustment service currently assumes a single latest submission and may reject historical entries from other submissions. Make this cycle-aware without losing old reviews.
- Scoring success currently populates `completedAt`; distinguish scoring from clinical completion safely for existing records.
- Draft save replaces current answer rows. Add immutable history before enabling correction workflows.
- Reports and face scans have their own mutability/recovery rules; audit every route, background write and file-deletion path against frozen-cycle evidence.
- Role permissions currently give organization admins a broad superset. The accepted workflow explicitly excludes them from clinical review.
- Existing partial review work was started before clarification and is not authoritative. Inspect/rework its contracts/schema; do not treat it as an approved completed implementation.

Resolve technical choices within these agreed rules. If implementation reveals a consequential product ambiguity, document the specific case and ask before choosing a new behavior. Do not add Organization rules, availability calendars, intervention schemas, notifications or completed-review reopening implicitly.

## 15. Definition of done

- Entire agreed initial and correction lifecycle works with database-enforced scope and ownership.
- Every persisted change and transition is historically attributable; prior calculated and adjusted scores remain intact.
- Concurrent and replayed requests cannot corrupt ownership or cycles.
- Completed assessments are final.
- Relevant tests and build pass; browser results and any limitations are documented.
- All documentation listed in section 11 exists and reflects actual delivered behavior in the requested directory and repository copies.
- Work is delivered as small logical commits with a clean accounting of unrelated/unfinished changes; nothing is pushed without instruction.


## 16. Audit corrections and additional implementation invariants

These clarifications close implementation gaps without adding Organization rules, reopening or new clinical fields.

### 16.1 Ownership and administrative boundaries

- Initial creator identity alone is insufficient: current active membership, submission permission and scope are still required. Admin creators can send as an administrative handoff, but cannot perform clinical score adjustments or reviews.
- An admin creator is not automatically an eligible correction person. The Return dialog must require an eligible clinical replacement when its usual default is ineligible.
- If no eligible correction recipient exists, reject return with clear guidance; do not create an ownerless correction draft. Admin assignment management is still limited to recipients within the record's required facility scope.
- Initial-draft collaboration remains unchanged. Correction-cycle ownership must cover field saves, report create/edit/remove/upload, scan start/upload and any inline patient-contact mutation through the assessment, as well as scoring and score adjustment endpoints. Global patient profile edits remain governed by their existing permissions and must not silently rewrite frozen evidence.
- A clinician taking a scored correction back to DRAFT before resend must still satisfy correction ownership; do not interpret the generic “eligible clinician before review” rule as permission to take another person's correction cycle.
- All transfer/assignment actions reject the already-current assignee as a no-op. Release of already-unassigned work is rejected, except replay of the same accepted request.

### 16.2 Scoring versions, snapshots and clinical evidence

- Preserve the assessment reference and original creation timestamp across cycles. Record separate cycle-opened, scoring-submitted, scored, review-submitted and completed timestamps.
- Pin the existing scoring deployment/rule binding for corrections where supported by the current scoring contract. Verify upstream support for multiple scoring submissions against one assessment binding before implementing this design. If upstream requires a new binding, create a linked, auditable correction binding; never silently overwrite an earlier binding or switch scoring rules.
- Verify how age, patient demographics and reused height are derived on correction: retain original assessment-time semantics unless explicitly refreshed through existing supported behavior. Snapshot the actual patient inputs used for every scoring submission and record differences. Do not change assessment age merely because correction happens later.
- Add an explicit current submission/cycle pointer. Do not use “latest by createdAt” as the sole authority: timestamps can tie and old requests can finish late.
- Route score-review reads and writes by current submission. Query historical adjustments separately; the current service's “all rows belong to latest submission” check must be replaced, not removed without a scope guard.
- Lock a completed review's final projection to exact questionnaire result, score-review revision and scan-result revision. Subsequent patient-profile changes or background recovery must not change the completed clinical summary.
- For old assessments lacking immutable draft history, retain a baseline snapshot and the date history recording began. Do not describe pre-baseline edits as fully reconstructable.

### 16.3 Reports and scans across correction cycles

- Snapshot report labels, dates, purpose, file identity and integrity metadata for each frozen submission. A correction can update current metadata or detach a report without altering old manifests.
- Retain file content while any retained submission references it; cleanup must inspect all cycles. Historical authorized retrieval must not depend solely on the current file being marked READY, because a later correction may remove it from the current view.
- Reuse immutable evidence references rather than physically copying files on every cycle. Enforce upload limits on the intended working set and document retained-history storage implications.
- Active scan capture/upload/processing or uncertain scan recovery must be resolved or explicitly cancelled through existing supported flows before sending/returning/completing a review. Do not freeze a changing scan projection as final evidence.
- A terminal failed/unavailable optional scan does not by itself require an invented mandatory rescan. Persist the exact available/unavailable state and apply the existing scoring completeness rules.
- Returning to draft retains the selected completed face scan, including its original capture date, inputs and results. Unrelated questionnaire corrections do not require another scan. A new scan must be explicitly started; it replaces the current selection without deleting earlier evidence.
- If changed correction inputs affect a prior scan's validity, do not silently relabel that scan as newly measured or recalculate it locally. Verify the existing provider/scoring contract, preserve its original input snapshot, and clearly distinguish retained historical evidence from any new scan.
- Late recovery may append a provider result to historical scan records for reconciliation, but cannot mutate a closed cycle's reviewed or completed projection. Serialize these decisions against workflow transitions.

### 16.4 Commands, races and failure recovery

- Define command replay precedence: authenticate and authorize record access, locate an existing matching actor/request key, verify payload identity, and return the accepted outcome/current projection without repeating the transition. Do not reject a legitimate replay solely because the first request changed the status or owner. A revoked actor still cannot read protected results.
- Check both workflow and score-review revisions for transitions that freeze or hand over clinical work. A completion based on a stale score must conflict even if ownership is unchanged.
- Establish one documented lock order for assessment, cycle/submission, review entries and membership/access changes to prevent deadlocks. Remote scoring/scan calls run outside database locks, with conditional write-back tied to the originating cycle and lease.
- UI busy flags are not concurrency enforcement. A second tab or another client must encounter the same server-side state and revision rules.
- Admin correction reassignment, recipient deactivation and facility changes require tests alongside review reassignment. Stale UI must never resurrect revoked ownership.

### 16.5 Migration and rollout

- Inventory existing UNDER_REVIEW/COMPLETED records, assignment values and actual submission results before backfill. Do not infer completed clinical approval merely from a scored record's populated completedAt.
- Backfill scored-at from authoritative result/submission timestamps. Preserve ambiguous legacy timestamps/history rather than destroying them. Legacy COMPLETED records remain locked; flag missing completion provenance rather than manufacturing an actor or remark.
- Document how unsupported/inconsistent legacy states appear and how support diagnoses them; do not silently convert them to editable drafts.
- Test migration on a disposable copy, including rerun behavior, existing score adjustments and retained file references. Generate migration metadata using the project's normal tooling.
- Do not expose new UI transitions until migration and backend enforcement are installed. Avoid concurrent old/new API versions that can bypass ownership on shared mutation routes; use a coordinated rollout or explicit compatibility guard.
- Prefer additive schema changes. Document rollback restrictions once correction cycles exist; an old application version must not be restarted against new workflow data without a compatibility assessment.

### 16.6 Additional acceptance cases

- Admin creator can initially send but cannot claim, adjust points or complete; noncreator admin cannot initially send.
- Returned cycle's previous reviewer cannot edit during correction, and another clinician cannot take over correction SCORED through a generic return/adjust endpoint.
- Returning a never-assigned or released review and resending it produces unclaimed work, not an invented previous owner.
- Missing/ineligible original creator requires explicit correction replacement; no recipient leaves state unchanged.
- Concurrent score adjustment versus completion/return/transfer produces a single consistent score revision and ownership outcome.
- Accepted command response loss retries do not append duplicate notes/history, while changed-payload key reuse fails.
- Late scoring and scan completions cannot change current-cycle pointers or completed projections.
- Removed current files remain retrievable as authorized historical evidence while retained; cleanup cannot remove referenced content.
- Initial record and multiple correction cycles preserve distinct bindings, answer snapshots and results, including equal-timestamp and delayed-result cases.
- Migration of existing SCORED versus legacy COMPLETED does not create false clinical completion history.

## 17. Plan audit outcome

Audited against confirmed conversation decisions and existing workflow, score-adjustment, report, scan and facility-access code on 23 September 2026. Corrected administrative submission eligibility, post-rescoring correction ownership, previous-reviewer routing, evidence finalization, replay ordering, historical retrieval and rollout requirements.

No application behavior was changed during the plan audit. Implementation was subsequently authorized. External scoring/scan protocol capabilities and migration data inventory are explicit implementation verification gates, not assumed working features. Record their findings in the required implementation log before enabling correction transitions.
