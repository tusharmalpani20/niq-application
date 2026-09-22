# Assessment workflow operations

## Configuration and migration

Apply all API Drizzle migrations before starting the assessment routes. Migration 0013 creates durable initialization, report and submission tables; 0014 adds manual/reused measurement provenance; 0015 adds retry budgets. New uploads require a dedicated absolute `REPORT_UPLOAD_ROOT` outside source/Git/public directories, owned by the API account. File/group/assessment limits are centralized in application config. See [local report storage](report-storage.md).

The organization needs an active NIQ Scoring connection assigned an approved `NIQ_FINAL_ASSESSMENT` format-2 questionnaire. The old TEST questionnaire cannot silently become a clinical questionnaire. A failed initialization remains a durable handle; retry that handle after fixing the connection/configuration. It does not authorize creating a new remote reference for the same attempt.

## Identity, confidentiality and permissions

Only current organization MEDICAL and ORGANIZATION_ADMIN memberships may access this workflow. SUPPORT and platform NIQ_ADMIN are excluded. Every request checks organization and current facility access plus the patient. Assessment reference sent to scoring is the generated initialization ID; patient identity never goes to scoring.

The pinned scoring origin, deployment and scoring organization identity are recorded before the start request. Credential rotation on the same deployment is allowed; changing deployment blocks recovery without reopening a frozen submission. Restore the original deployment or reconcile operationally. Never change bindings or checksums to force a request through.

Patient context, answers, submissions, raw scoring results and measurements are AES-GCM envelopes using the existing patient encryption key. Report labels/date metadata and original filenames are database metadata; file bytes are private local storage and require authenticated download. Preserve encryption keys when backing up/restoring. Logs/audits contain identifiers, revisions, changed field keys and status codes, not answer values, phone numbers or report contents.

## Durable recovery

Initialization shells exist before remote calls and use a 120-second lease. Repeated caller request keys return the same initialization. Scoring submissions freeze the answer/attachment snapshot and idempotency key before contacting the provider, with a separate 120-second lease. An expired lease can be claimed again; the token fences a late worker from overwriting the new worker's result.

Draft saves require exact optimistic revisions. A successful submission freezes editing. Transport errors, wrong connection, unknown responses and `REQUEST_IN_PROGRESS` do **not** reopen editing or issue another key. Only a validated pre-charge answer rejection reopens the draft; another submission requires changed answers. Every old snapshot remains preserved.

User retry endpoint: `POST /v1/organizations/:organizationId/assessments/:assessmentId/submission/retry`. Retries use the original key. Five-second backoff prevents rapid repeated calls. After three unsuccessful attempts the submission enters `RECONCILIATION_REQUIRED`; regular retries stop contacting scoring. The application cannot safely fix an abandoned provider operation itself.

An organization administrator may explicitly check the **same key** through `POST .../submission/reconcile` after its 60-second cooldown. This never allocates another key or force-reopens the draft. If the provider remains in progress, inspect the provider's durable operation/usage state with its operator procedures. Do not delete provider idempotency records or alter clinical result evidence manually.

`POST /v1/organizations/:organizationId/assessment-recovery` is an authenticated bounded manual recovery operation. It resumes up to ten accessible initializations owned by the actor and checks up to ten accessible draft/pending assessments, reclaiming expired upload leases and checking same-key scoring requests. It is safe after restart because handles, bindings, snapshots and keys persist in PostgreSQL. There is no background retry daemon; routine form reads recover expired upload metadata, while remote retry is explicit. A session with changed access cannot recover outside its current facility scope.

## Reports and cleanup

Uploads reserve count and declared bytes under the assessment lock, then stream without retaining that lock. Each upload carries a stable request key and SHA-256 content fingerprint. Retries compare filename/type/size/digest. READY replay returns the existing file; PENDING replay asks the caller to wait; REMOVED keys cannot resurrect attachments. Failed transfers can retry with a fresh lease but keep the logical file identity. Physical object keys include the attempt token to prevent an old cleanup handler deleting a later upload's bytes.

Transfer leases last five minutes and the transfer is cancelled before expiry. Submission refuses pending uploads. Finalization rechecks lease and draft status under the assessment lock. Cancellation makes metadata inaccessible before filesystem cleanup. Files referenced by any frozen submission remain retained even when a rejected draft removes the report.

`reports.cleanup(actor, organizationId, assessmentId)` expires dead leases and visits at most 200 filesystem entries with a 24-hour grace period while holding the assessment lock. It skips scopes with active transfers and protects ready/submitted objects. This prevents cleanup racing publication. Recovery invokes this bounded operation; larger stores need externally scheduled bounded traversal across scopes. Inspect stuck files/age without logging their original names. Pending metadata recovery does not depend on staging files existing.

## Verification

`bun test src/services/assessment-workflow.test.ts` includes a unit case and opt-in PostgreSQL integration cases. Set `ASSESSMENT_TEST_DATABASE_URL` to a **disposable migrated test database only**. Fixtures are generated per run and intentionally remain in that disposable database for inspection; upload folders are temporary and removed. Do not point it at application development or production data.

Cases cover durable start/replay, encrypted snapshots, role/organization/live facility access, concurrent revisions, digest replay/download, upload cancellation racing submission, uncertain scoring retries, connection changes, retry budgets, explicit reconciliation, immutable report evidence and expired worker fencing. Scoring responses are contract fixtures; these tests consume no provider quota and do not claim live scoring-provider verification.

## Organization assessment references

Assessments have a stable `ASM-000001` display reference, derived from their persisted positive serial. The sequence is independent per organization and shared across its facilities; it does not reset each year. The database enforces uniqueness on `(organization_id, serial_number)`, locks the organization counter during allocation, and prevents changing an assigned serial or organization. Failed transactions do not consume numbers; deleting an assessment does not rewind the counter. Numbers beyond six digits expand without truncation.

Migration 0017 assigns existing assessments serials in creation-time/ID order within each organization and starts each counter after its maximum. Apply the migration before deploying API code that reads serials.

Read links accept either `ASM-000001` in the authenticated organization or the existing opaque ID. New UI links use the reference; mutations, private file paths and NIQ Scoring references continue using immutable internal IDs. An identical display reference in another organization never grants access. UI report titles use the same assessment reference; supporting upload labels and filenames remain unchanged. There is currently no generated PDF export endpoint; the intended filename for a future export is `ASM-000001-report.pdf`.

Verification for this change: workspace check/build pass; ordinary suite: 225 passes / 24 environment-dependent skips. Separate disposable PostgreSQL targeted run: 43 passes / 175 assertions verifies concurrent allocation, independent organizations, cross-branch sequencing, rollback, immutable serials and authorized reference resolution. Populated-database backfill check found zero ordering mismatches. Local migration applied and API health returned 200; disposable database stopped. No live assessment answers were changed.

## Reviewed points

A scored assessment opens in a compact, expandable summary. Staff with existing clinical assessment access may adjust scored items, section totals or the overall total. Patient answers and the original NIQ result are never rewritten. Unanswered or unresolved items cannot receive reviewed points.

Before the first adjustment, reviewed values and score history are hidden. After any adjustment, NIQ and reviewed values are distinct and history remains available even after restoring original values. Item changes recalculate the section and total unless those levels have explicit overrides. Overrides persist until explicitly restored. The NIQ classification describes the original score only; reviewed points do not claim a new risk classification.

The application stores encrypted append-only events with actor identity/name, before value, new override (or reset), required reason, timestamp, original result reference and revision. An audit event is committed in the same transaction. Database triggers reject updates/deletes of review rows. Resets create new entries and also require a reason. Older entries without reasons remain readable. Revision checks reject concurrent stale edits, and request keys make identical retries idempotent. A stale editor reloads after cancellation. Reasons and point values are excluded from general audit logs and retained in encrypted review events.

GET/POST `/v1/organizations/:organizationId/assessments/:assessmentId/score-reviews` use existing session, origin and assessment/facility authorization. Deploy the additive score-review migration before enabling this UI. No NIQ Scoring service change is needed for manual reviews.

The editor is inline within the assessment form at all screen sizes. It uses organization colour tokens and existing controls. The application sidebar and shared modal styles are unchanged. Verified with API/web TypeScript checks, 19 focused UI/contract/service/route tests and mobile/tablet/laptop browser inspection. Actual patient scores were not modified during UI verification.
