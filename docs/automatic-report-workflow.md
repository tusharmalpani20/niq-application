# Automatic clinical report workflow

Final clinical review is the only approval step. The assigned clinician confirms
the reviewed risk classification and any additional treatment effects, then
completes the review. The confirmed effect IDs are stored with the final review
snapshot. If there are no additional effects, the snapshot records an empty list.

The same database transaction marks the assessment complete and queues its report.
The browser does not need to remain open. The API worker sends an allowlisted fact
packet and the reviewed score to NIQ Scoring. Scoring matches the pinned rules,
runs a GPT-6.1 Sol manager that assigns GPT-6 Luna workers for writing, independent
review, source coverage, conditional-effect summaries and highlighting. Both models
request medium reasoning where supported. The manager reviews the assembled report
after bounded writer revisions and source audits. It does not restart the full
workflow after its final decision. Deterministic evidence
checks remain mandatory. If the model workflow cannot approve the report, the worker
uses the verified matched-rule fallback automatically. If no Products and doses rule is selected,
the report also omits product exceptions. Missing assessment facts are omitted
without asking the patient for another answer.

“Writer revision” is a task of the original Luna writer role, not an additional
agent. The revision request carries the existing draft, the source evidence, the
writer instructions and the reviewer’s concrete feedback. The manager adjudicates
rejected reviewer feedback before requesting a repair, and the reviewer checks the
repaired draft again. Calls are stateless; the application passes that context
explicitly instead of relying on a persistent chat session.

Application renders the returned content to PDF on the server. It uses the
organisation theme current at rendering time and stores the PDF bytes, hash,
branding fingerprint, and report content together before marking the report
ready. A theme change during rendering causes the worker to render again. Once
ready, a theme change does not rewrite the stored PDF. The report page displays
the saved PDF and offers the same bytes for download.

The worker retries temporary Scoring failures and recovers interrupted jobs from
the database. Permanent validation failures appear as a failed report status.
When generated text is marked `REVIEW_REQUIRED`, the worker preserves that
historical review and queues a successor generation from the same frozen,
clinically approved assessment source. Each successor uses a fresh Scoring
idempotency key; an in-progress Scoring job keeps its original key while it is
polled. Recovery only advances the latest report for the assessment and carries
the automatic attempt ceiling forward, so older flagged reviews are not
regenerated after a newer report exists. Flagged text and issues are never
cleared into a ready report. A clean generation still requires the existing
final clinical assessment approval. Report validation and PDF finalization then
run automatically without a second human review. Legacy Scoring jobs marked
`REVIEW_REQUIRED` are also reclaimed automatically and rebuilt from verified rules
under a separate recovery key. Synchronous report requests use the same verified
fallback policy. Exhausted recovery or an invalid approved source is a technical
failure, never permission to publish flagged text. The status endpoint presents
recoverable reviews as queued so the client keeps polling, and quarantines legacy
ready artifacts with unresolved issues before scheduling recovery.
The report remains tied to the approved submission, reviewed score revision, and
pinned rule checksum. The clinical approval is recorded in assessment history.
The generated text itself receives automated evidence review, not a second human
approval. Manager and worker calls, actual models, measured tokens, reasoning effort,
timing and failures are visible in Scoring AI Usage. The temporary subscription proxy
is development-only and can be switched back to OpenRouter.

Schema 4 reports provide separate `foodSafetyAdvice` and `redFlagsAdvice` passages.
Food safety appears in Recommendations; urgent triggers, thresholds and contacts
appear together in Red flags. Conditional antimetabolite cards share a single main
heading and introduction. Structured supplement cards show name, numeric dose, timing,
preparation, duration and approved benefits. Product exclusions still control the
selected plan but are not explained in patient-facing prose. Interpretation uses
the exact frozen nutritional-status mapping and avoids repeating clinical facts.

The assessment asks for weight 1 month ago, and report comparisons use “Weight 1
Month Ago.” Existing dummy assessments use that same convention by agreement.
Treatment Start Date is displayed only from an entered assessment date; future
treatment remains planned. Older saved PDFs are not rewritten by this release.
Regenerate a report from the app to apply the updated narrative and layout together.

Apply Scoring migrations through `0030` before starting the manager workflow. This
allows the manager, coverage and summarizer stages and reasoning effort to be stored.

Apply Application database migrations through `0041` before starting the updated
API. Existing approved PDFs remain available with their stored appearance. The
automatic job starts for assessments completed after this change. Previously
completed assessments without an explicit treatment effect decision are not
silently regenerated.

## Wording and layout ownership

Each instruction has one home. Nutrition targets belong in Intervention, reported
symptom care in its own advice, condition guidance under named condition headings,
routine monitoring in Monitoring, food handling in Food safety, and urgent contact triggers
in Red flags. Source coverage examines these fields together and counts an equal
risk/status target once. A conditional mention of kidney disease in another rule
does not establish a matched kidney comorbidity. Reviewers must identify a concrete
claim, omission or action ambiguity, rather than reject harmless wording differences. Conditional assessments for a possible effect may stay in its card, but must not be repeated in Monitoring.

The manager reviews the initial draft, adjudicates worker concerns and source-audit gaps, and makes the final decision. Corrections return to the original writer context and only flagged fields change. A final rejection gets one bounded targeted repair with all approval checks repeated. Required clinical passages are never deleted to force a pass. Typography failure keeps verified text and uses exact-span deterministic emphasis.

HTML sections flow continuously. PDF pagination uses the same content and a small
repeating brand header, with physical page numbers from print margin boxes. Score and summary cards stay together during pagination. Condition
headings use the internal `### Condition name` convention and render as headings,
never bullets. Exact-span emphasis is applied after review, including possible-effect
cards. Deterministic emphasis retains readable fallback advice when optional model
highlight selections are incomplete. No new illustrations are part of this change.

The rule fallback groups source headings, moves monitoring and urgent warnings to
their assigned sections, and preserves the source thresholds and urgency. Ambiguous
source quantities are never completed with an invented unit. Source conflicts may
still prevent automatic finalization and leave a report eligible for regeneration.
