# Local assessment report storage

`LocalReportStorage` is a filesystem adapter, not an authorization or attachment lifecycle service. Its contract is in `apps/api/src/storage/report-storage.ts`. No S3 dependency or provider configuration is introduced.

## Configuration and keys

Construct with `{ root, maxFileBytes }`. The application configuration must provide an absolute dedicated `REPORT_UPLOAD_ROOT` **outside the checkout, Git, served/public directories and temporary OS cleanup directories**. The adapter rejects filesystem root and relative paths. Example development location: a private application data directory under the service account home. No production default is selected here.

Use `<organizationId>/<patientId>/<assessmentId>/<fileId>.<verified-extension>`. All IDs must be server-generated; original filenames are database/display metadata only. The scope may contain alphanumerics, underscore and hyphen; slash, dot segments and encoding tricks are rejected. Media types are PDF, JPEG and PNG, mapped from signatures to `pdf`, `jpg`, `png`. Signature checks are an allowlist gate, **not malware scanning or full document validation**. Do not render reports as trusted HTML. Decide quarantine/scanning before deployment outside controlled local use.

The caller supplies the per-file byte limit. Proposed 10 MB/file, 10 files/group, 20 groups/assessment and 100 MB/assessment in the implementation plan are provisional; aggregate/group limits belong in central configuration and database reservation logic, not this adapter.

## Lifecycle integration

1. Authorize organization, facility, patient, assessment and report ownership. Register attachment reservation, upload request key and lease in the database before reading body bytes. Reserve count and byte totals under a short transaction.
2. Call `stage(scope, fileId, source, { expectedMediaType?, signal? })`. It streams into a private generated `.staging/<UUID>.part` in the same assessment filesystem directory, caps bytes, detects signature, calculates SHA-256, flushes and closes. It returns a `StagedReport` receipt. It removes staging on read/write/validation failure and abort. Pass a raw bounded file stream from multipart parsing, not a prebuffered unrestricted request.
3. Persist the staging receipt and use the current database lease token to fence finalization. Recheck editable assessment and reservations; do not hold a transaction during incoming network streaming.
4. `promote(receipt)` atomically publishes a hard link at the final key without overwriting an existing object, then unlinks staging. A crash or unlink error after publication can leave both names: inspect database lifecycle and reconcile; do not generate another file ID or blindly mark ready. File bytes and database state are not a single transaction.
5. Mark metadata ready only with the correct lease and draft revision. If cancellation/freezing wins, remove promoted/staged bytes using `remove` and `discard`, and release reservations. Expired or interrupted metadata must also recover when no bytes remain.
6. Download only ready, authorized attachments using `open(scope, objectKey)`. It returns `{stream,size}`; stream completion/cancellation closes the file descriptor. Set attachment Content-Disposition with a safely encoded original filename, verified Content-Type, nosniff, private/no-store headers. Never expose filesystem paths or provide public static hosting.
7. Removal first makes database metadata inaccessible, then invokes idempotent `remove`. Retry physical deletion failures without restoring access. Preserve submitted manifests and their files.

`discard(receipt)` removes staging only. `remove(scope,key)` removes final bytes only; neither follows symlinks. Scope checks protect key boundaries but do not replace caller authorization.

## Recovery and cleanup

`cleanup(scope, { olderThan, limit, isProtected })` visits staging and final objects within one scope, with a bounded entry count and age cutoff. The callback must protect valid active leases, ready attachments and immutable submitted manifests. Database errors fail closed. A cleanup grace period must exceed the lease/reconciliation window.

**Coordinate cleanup with upload finalization.** A callback that merely reads references is insufficient if a concurrent writer can transition that candidate afterward. Before returning false, the lifecycle owner must claim/fence the expired candidate in the database (or hold the relevant lock throughout deletion) so it cannot become ready concurrently. Unregistered old objects can be removed only after reference checks and the grace period. Unknown directories/symlinks are skipped, not traversed. Process scopes in bounded batches with persistent scheduling/cursors; callers must avoid repeatedly scanning only the same protected entries. Metadata lease recovery is separate from byte cleanup.

## Operational boundaries

- Private directory/file modes are 0700/0600. Existing directory permissions are not rewritten: validate ownership and restrict service account and ancestors at provisioning.
- All ancestor directories and final opens are checked for symlinks. The service account/root ancestors must not be writable by untrusted local users. Node path-based filesystem operations cannot secure against a privileged local actor racing ancestor replacement; container/OS ownership must enforce that boundary.
- Storage is single-host or requires a shared durable volume. Do not run independent API replicas with unrelated local disks.
- Monitor capacity/inodes. Disk-write failures must leave attachments non-ready. Hard links require a compatible filesystem and staging/final paths on the same filesystem.
- Back up database and file objects together with a consistent recovery point. Restore metadata/objects together and reconcile pending states; verify hashes when migrating to S3.
- Publication is atomic for readers; this is not a guarantee against power loss before directory metadata is durable. Reconciliation must detect missing bytes after unexpected host failure and never report a missing attachment as available.
- Never log report bytes, original filenames, health data or absolute paths routinely.

## Verification

`bun test apps/api/src/storage` exercises real disposable files: staged visibility, SHA-256, atomic no-overwrite, interrupted/oversized/invalid/signature-mismatch uploads, stalled-read cancellation, cross-scope/traversal attacks, symlink rejection, protected cleanup and PDF/JPEG/PNG recognition. API TypeScript check: `bun --filter @niq/application-api check`.
