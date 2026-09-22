# Clinical review history and operations

Implemented 23 September 2026. See the permissions/state guide and verification record alongside this document.

## Persisted evidence

`assessment_history` stores encrypted events containing the acting membership, timestamp, assessment revision, correction cycle, command key where applicable, and relevant before/after payloads. Draft saves, scoring submissions/results/failures, review commands, reports and face scans preserve persisted changes. Unsaved keystrokes are not history. Generic audit records contain identifiers rather than clinical notes.

Every scoring submission retains its frozen questionnaire, evidence references and result. `assessments.current_submission_id` identifies the active calculation; a scoped foreign key prevents pointing at another assessment or organization. Returning to draft clears that pointer, increments the cycle and restores the submitted questionnaire for correction. Historical submissions remain intact. Score adjustments are tied to their submission, so previous adjustments never modify a corrected calculation.

Completion stores the final clinical score projection and final remark and prohibits further assessment, score, evidence and review mutations. No reopen operation exists. Current global patient profile permissions remain separate from the frozen assessment record.

## Scans and reports

An active scan, live scan lease or unresolved reconciliation blocks lifecycle transitions. Returning to draft makes the previous cycle's scan non-current. Scan recovery cannot overwrite a closed cycle, reviewed or completed assessment. Closed-cycle scans are frozen; late provider output is not appended to those rows. This is stricter than the optional historical-only late-result handling discussed in the plan.

Frozen report manifests preserve historical evidence. Removing a report from the editable draft does not delete files still referenced by a historical manifest. File reads retain organization/assessment authorization. Cleanup checks references and protects against response-loss retries.

## Retries and concurrency

Review commands carry expected workflow and score revisions plus a request key. Replaying the same command does not repeat its transition or history event; changing its payload with that key conflicts. Stale actions require reload. Assessment-row locking serializes claims, handovers, returns, completion and score adjustments. Current membership and patient/facility eligibility are checked on mutation.

Scoring retries reuse a calculation key. A corrected calculation uses a new key under the original pinned rule binding and consumes another scoring usage. A lost response is recovered without starting another calculation. Results can update the current assessment only when their submission pointer, cycle and lease still match.

## Migration and deployment

Apply migrations before serving the new code. Migration 0023 adds cycles, clinical state, encrypted history and current submission tracking; it backfills existing current submissions and records a baseline of existing workflow data. Migration 0024 adds the scoped submission foreign key and supporting unique index. Database readiness rejects the missing new schema.

Both migrations were applied to the disposable integration database and local development `niq_application` database. No production deployment or push was performed. Retain normal database/file backups and encryption keys. Do not roll back by deleting history or completed snapshots; use a forward migration if a defect is found.

Legacy baseline records do not reconstruct changes that were overwritten before this feature. Existing completion timestamps remain legacy data; the migration does not invent a reviewer or final remark.

## Operational boundaries

An absent or disabled reviewer is handled by an authorized admin reassigning or releasing the review with a reason. The correction person may be reassigned similarly. Resend restores the prior reviewer only while eligible, otherwise returns to the queue. There is no leave calendar, organization-rules page, intervention form or full historical comparison UI.

The queue is paginated for clients but currently filters authorized records in memory. Move filtering/pagination into database queries if organization volumes make this costly. Clinical roles and facility restrictions remain server enforced regardless of UI visibility.
