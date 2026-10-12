# Automatic clinical report workflow

Final clinical review is the only approval step. The assigned clinician confirms
the reviewed risk classification and any additional treatment effects, then
completes the review. The confirmed effect IDs are stored with the final review
snapshot. If there are no additional effects, the snapshot records an empty list.

The same database transaction marks the assessment complete and queues its report.
The browser does not need to remain open. The API worker sends an allowlisted fact
packet and the reviewed score to NIQ Scoring. Scoring matches the pinned rules,
runs a writer and an independent reviewer, permits one targeted revision, and
omits passages that remain unsupported. If no Products and doses rule is selected,
the report also omits product exceptions. Missing assessment facts are omitted
without asking the patient for another answer.

Application renders the returned content to PDF on the server. It uses the
organisation theme current at rendering time and stores the PDF bytes, hash,
branding fingerprint, and report content together before marking the report
ready. A theme change during rendering causes the worker to render again. Once
ready, a theme change does not rewrite the stored PDF. The report page displays
the saved PDF and offers the same bytes for download.

The worker retries temporary Scoring failures and recovers interrupted jobs from
the database. Permanent validation failures appear as a failed report status.
The report remains tied to the approved submission, reviewed score revision, and
pinned rule checksum. The clinical approval is recorded in assessment history.
The generated text itself receives automated evidence review, not a second human
approval.

Apply Application database migrations through `0041` before starting the updated
API. Existing approved PDFs remain available with their stored appearance. The
automatic job starts for assessments completed after this change. Previously
completed assessments without an explicit treatment effect decision are not
silently regenerated.
