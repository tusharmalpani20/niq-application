# Assessment implementation audit — 20 September 2026

Scope: audit the delivered assessment workflow against the implementation plan and final workbook; fix confirmed defects in small commits. No Scoring repository changes or live scoring calculations.

## Findings fixed

| Finding | Impact and resolution | Evidence |
| --- | --- | --- |
| Report refresh could accept a new answer revision with stale local answers | Prevents overwriting concurrent edits: dirty local answers are retained behind a conflict; clean local state adopts saved answers | Two editor concurrency regressions |
| Initialization response could navigate after leaving or changing account | Scope-keyed state and lifecycle fencing prevent late responses changing the new screen | Navigation/account-switch tests, original StrictMode/replay tests |
| Delayed binding changed assessment start time | Original initialization timestamp now persists, keeping the reference year/age consistent | Delayed-binding database regression |
| Batch recovery stopped on cooldown/conflict or selected inaccessible initialization | Scope and lease filters, eligible retry selection, and per-item conflict isolation allow the remaining batch to progress | Disposable PostgreSQL recovery regression |
| Scoring rejection guidance was discarded | Known field issues now persist encrypted, use bounded locally generated messages, and link to controls after refresh; migration 0016 and readiness updated | Rejection adapter/lifecycle tests and editor focus regression |
| Inactive partial answers blocked draft save | Bounded inactive values stay reversible but are excluded from effective/scoring payloads; reactivation restores validation | Hidden partial-number and eight conditional-path regressions |
| UI allowed longer text than save API | Shared 2,000-character limit now matches controls and both validation paths | Boundary validation tests |
| Review links only selected a section | Named fields receive focus through guarded navigation, with section-heading fallback; error links respect report dirty/busy protection | Component regression and rendered browser focus check |
| Upload requests could wait indefinitely in browser | Five-minute transport timeout, pre-read cancellation, stable retry identity and reset progress | Report transport tests |
| Brand link text failed contrast | Report download links and shared clinical link buttons use existing accessible brand ink; platform fallback remains intact | Browser axe check initially reproduced 3.8:1 contrast, then zero violations |

## Verification

- `bun run check`, `bun run test`, `bun run build`: passed after final changes.
- Ordinary workspace test suite: 208 pass, 22 environment-dependent API tests skipped. These skips are not presented as tested integrations.
- Separate workflow/scoring run against disposable PostgreSQL: 22 pass, 81 assertions. Provider responses are controlled fixtures; no real provider quota used.
- Browser used actual components and a temporary synthetic fixture in an isolated session. Review error link focused `assessment-field-height_cm` in the rendered browser.
- No horizontal overflow at 360, 390, 768 or 1440 widths; 200% CSS enlarged-content reflow at 1440 also passed. CSS zoom is a reflow proxy, not native-browser zoom certification.
- Automated WCAG A/AA checks on the rendered personal-details/rejection state: zero violations in default and very light yellow brand palettes. This does not certify every dynamic state or all assistive technologies.
- Source workbook rechecked for field ownership, options, requiredness and conditional paths. Height boundary, effective answer projection, report reservations/storage containment/cancellation, and immutable submission evidence reviewed.
- Migration 0016 applied to development and disposable databases. Local API `/ready` returned `ok` after migration.
- Temporary QA files removed; isolated QA browser and disposable database stopped. Existing application and Scoring development services preserved.
- Production build still warns about large JS chunks and Turbo dependency-lock metadata; neither prevents the build.

## Boundaries and follow-up

Live scoring remains to be exercised in a scoped test deployment. This audit verifies local lifecycle behavior and provider contracts using fixtures, not a live provider calculation. Deferred face-scan integration and editable lab inputs remain deferred as agreed. Same-key administrator reconciliation is explicit; abandoned provider operations cannot be resolved safely by issuing a fresh key. Production malware scanning/storage operations remain deployment work documented in the storage notes.

The audit fixes confirmed defects; it does not establish that every possible race, browser/device, permission permutation or provider failure is exhaustively verified.

## Small logical commits

- `1357052` fix: preserve assessment start time through binding recovery
- `52771ad` fix(reports): bound upload waits and preserve retry identity
- `d98a432` fix(assessment): align text validation with save limit
- `ea189f0` fix(reports): reset retry progress and use accessible brand links
- `b410d0b` fix: keep assessment recovery batches progressing
- `30d05aa` test(assessment): cover all conditional workbook paths
- `7048917` fix(assessment): keep inactive draft answers reversible
- `2cf8596` fix(assessments): focus review errors through guarded section navigation
- `7634ef0` fix(assessments): guard answer revisions during report refresh
- `748ec6b` feat: persist assessment rejection guidance
- `52d4a5f` fix: retain safe field guidance after scoring rejection
- `76fd877` fix(assessments): link persisted scoring rejections to affected fields
- `46b1254` fix: require rejection migration before reporting API ready
- `48d23ee` fix(assessment): fence initialization after navigation and scope changes
- `9fbc678` fix(theme): use accessible brand ink for clinical link buttons
