# Assessment form implementation log

Delivered 20 September 2026 in `application/niq-application`. No scoring repository changes, deployment reassignment or push.

## Delivered

- Authorized patient/facility picker, direct patient entry and durable resumable initialization.
- Version-bound six-section final questionnaire, saved drafts, conditional controls, field-weighted completion and review with missing-field links.
- Patient profile owns contact information; assessment context reads it, with explicit profile update for missing phone. The final workbook Sheet1 B7/C7 marks Contact mandatory.
- Editable previous eligible height for calendar-year age 18+, frozen reference year, provenance and separate fresh manual weight.
- Multiple report groups with label, optional purpose, exact or month/year date and multiple authenticated private files. Label/date/attachment required when submitting a report group.
- Approved initial limits: PDF/JPEG/PNG, 10 MB/file, 10 files/report, 20 reports and 100 MB/assessment; server configuration is exposed to the UI.
- Encrypted answer/context/result snapshots, optimistic revisions, immutable submissions and same-key scoring retry with bounded administrator reconciliation.
- Authoritative section results separate from completion, partial/unresolved states, accessible central branding and content-width responsive navigation.

## References

See [reference catalogue and images](../../docs/assessment-form-references.md), [implementation plan](../../docs/assessment-form-implementation-plan.md) and [plan audit](../../docs/assessment-form-plan-audit-2026-09-20.md).

Authoritative field source: `Document Recieved/Final NIQ Assessment Form_with section_field_details.xlsx`. Scoring source: `application/niq-scoring/docs/rules/final-assessment-integration.md` and `assessment-api.md`. Future scan reference: `Document Recieved/CarePlix-Integration-Reference(1).pdf`. The excluded `nutra-iq-app` UX was not used.

Implementation-specific documentation lives in `niq-application/docs/assessment-field-manifest.md`, `assessment-workflow-operations.md` and `report-storage.md`.

## Verification

- Workspace typechecks, test suite and production build pass. Suite: 196 passing tests; 20 environment-dependent API tests skipped in the ordinary suite.
- Separate disposable PostgreSQL run: 10 passing tests, 42 assertions. Covers authorization, durable initialization, revisions, uploads and submission races, frozen evidence, connection changes, bounded retries and lease fencing. These use contract fixtures, not live scoring calls.
- Browser checks used real components with synthetic fixtures in an isolated browser: widths 360/390/768/1024/1440 had no horizontal overflow; mobile section sheet and focus behavior checked. Enlarged content at CSS zoom 200% also had no horizontal overflow; this is a reflow proxy, not a native browser zoom certification.
- Automated browser accessibility checks: zero violations for the rendered questionnaire in default and light brand palettes. This is not a complete accessibility certification of every state.
- Read-only compatibility check passed for the approved local final questionnaire profiles TEST-5, TEST-1, TEST-2 and TEST 6 (six sections, 42 fields).
- Local migrations 0013–0015 applied; application restarted and readiness passed. Ignored local environment points REPORT_UPLOAD_ROOT to `/home/tm/Desktop/work/NIQ/runtime/report-uploads` outside source/public assets.
- Disposable PostgreSQL and isolated QA browser stopped, synthetic QA entry files removed. User application and scoring services remain running.
- Build retains non-blocking large JavaScript chunk and Turbo dependency-lock metadata warnings.

## Deliberate boundaries

Live CarePlix integration is deferred. Editable lab inputs are deferred by user decision until units are defined; lab report files are supported. No live scoring calculation was performed and no provider quota was consumed. Provider end-to-end operation remains to be verified in a scoped test deployment. Remote abandoned reservations require explicit same-key reconciliation; there is no background recovery daemon or unsafe fresh-key workaround. Production malware scanning and storage operations must be configured before expanding beyond the controlled local environment.

## Small logical commit record

Commits below are ordered oldest first. Package checks and focused tests were run during implementation; the full verification above covers the integrated result. Individual commit titles describe scope rather than implying every acceptance scenario was tested independently.

- `9e3fc94` feat(assessments): define versioned workbook form overlay
- `71f5183` feat(api): validate version-bound assessment scoring requests
- `6892933` feat(storage): add bounded scoped local report adapter
- `be9eb64` docs(storage): document report lifecycle and recovery boundaries
- `7a7001f` feat(api): summarize authoritative assessment section scores
- `a7d419f` feat(assessments): validate answers and calculate required completion
- `f0260c1` feat(assessments): select prior adult height with provenance
- `a98c692` fix(api): reject unsafe scoring inputs before transport
- `b061307` test(assessments): guard unsupported questionnaire projections
- `4a45868` fix(assessments): source required contact from patient profile
- `7ef5a6a` fix(assessments): render overlay in workbook field order
- `dc48e84` feat(assessments): expose form and height contracts
- `c1869f3` feat(assessments): persist initialization submissions and reports
- `b0fb256` feat(contracts): define assessment workflow and report inputs
- `487e560` feat(assessments): render themed conditional questionnaire controls
- `6b2913a` test(assessments): cover conditional progress and provide UI fixture
- `34a0097` feat(assessments): select authorized patient before draft creation
- `575f9a1` feat(web): add scoped report upload transport with retry keys
- `2123071` test(assessments): use authentic public questionnaire fixture
- `d8128d8` feat(web): add report metadata and multi-file assessment editor
- `19e33da` test(web): verify report retry identity and confirmed upload progress
- `bb9b48c` feat(config): centralize local assessment upload limits
- `aa0635d` feat(assessments): implement pinned draft and scoring lifecycle
- `fdd2010` feat(reports): add draft metadata and fenced file lifecycle
- `8a7138c` feat(api): expose authorized assessment workflow routes
- `b0a72d5` test(assessments): verify resumed drafts and conflict preservation
- `bd1258b` feat(assessments): guard unsaved drafts across navigation
- `73b2b87` feat(assessments): add section review and mobile navigation
- `c6c32ee` feat(assessments): replace prototype with persisted form editor
- `417ba69` feat(contracts): add saved assessment score display projection
- `4e454d5` feat(web): present verified assessment totals and section subtotals
- `de4ba43` fix(web): bind report upload retries to file content checksum
- `2492636` fix(assessments): recover initialization across refresh and response loss
- `6336edc` feat(assessments): wire authenticated workflow endpoints
- `a1789c7` feat(assessments): show validated scoring results in editor
- `e423042` fix(theme): derive readable brand text for light workspace surfaces
- `4312af7` fix(theme): apply tenant ink and accessible client muted text
- `ad359c8` fix(web): size assessment fields to available content width
- `744c135` feat(web): collapse assessment review sections with clear missing answers
- `033ba2f` fix(theme): ensure selected navigation brand contrast
- `4ad59e4` fix(db): create report uniqueness before attachment foreign key
- `b26ebcd` feat(measurements): distinguish manual and previous height provenance
- `159f299` fix(assessments): encrypt clinical snapshots and tighten lifecycle guards
- `b4ce8c0` fix(reports): fence upload retries and preserve submitted evidence
- `a65ca5d` fix(api): validate report fingerprints and preserve body limit errors
- `097251d` test(assessments): exercise PostgreSQL revisions and upload races
- `5bdfb2f` test(assessments): enforce origin body and schema readiness guards
- `250d89a` fix(assessments): use accessible tenant ink for navigation
- `09984dc` feat(assessments): search authorized patients by medical record number
- `250c25d` fix(contracts): expose manual and reused measurement provenance
- `607b997` fix(config): allow report uploads to remain explicitly disabled
- `2a634fa` feat(scoring): persist submission retry budgets and backoff
- `2219e6e` fix(scoring): require same-key reconciliation after bounded retries
- `29035b5` fix(reports): honor requests cancelled before streaming starts
- `6b96a4d` test(scoring): cover reconciliation rejection and expired workers
- `bc9d556` docs(assessments): explain durable recovery and encrypted storage
- `bd8046a` fix(assessments): explain scoring recovery and preserve patient context
- `fae5ca6` fix(web): reconcile uncertain report creation without duplicate retry
- `87bf819` fix(assessments): start authorized patient flow without extra confirmation
- `30acd66` fix(reports): use server configured limits throughout upload UI
- `d753768` fix(measurements): keep fresh weight separate from reused height
- `fed7188` test(web): verify report limit display follows server configuration
- `f1a6731` fix(web): explain unresolved scoring components with server reasons
- `88ff641` fix(assessments): adapt section navigation to available content width
- `9f74be9` fix(reports): pass assessment upload limits to report editor
- `d9783ca` fix(reports): keep report purpose optional as planned
