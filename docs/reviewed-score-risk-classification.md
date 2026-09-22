# Reviewed score risk classification

## Behavior

Original questionnaire answers, NIQ score and NIQ risk classification remain unchanged. Score adjustments retain their reasons and history. The effective reviewed total respects item, section and overall overrides; face-scan scores remain separate from the questionnaire total.

NIQ classifies the reviewed total using the assessment's original pinned rule version. The workspace displays this classification beside the reviewed score. Pending or failed classification never displays an older classification as current. Completion requires confirmation for the current reviewed score; an older request cannot satisfy that requirement.

Restoring all questionnaire overrides uses the original NIQ classification again. An unchanged effective total can reuse the previous classification request for that submission, including changes only to face-scan points or items beneath a fixed parent override.

## Requests and recovery

NIQ endpoint: `POST /v1/assessments/classify-reviewed` with `assessmentReference`, `idempotencyKey` and `score`. It authenticates the deployment, resolves the existing assessment binding and uses the same classification helper as original scoring. It does not recalculate questionnaire answers or rebind to newer rules.

A new upstream classification uses one existing SCORING usage. An identical retry reuses its key and does not consume another usage. A score that matches no unique configured category returns `UNMATCHED_CLASSIFICATION`; no rounding or invented label is applied. In particular, decimal totals can fall between integer risk bands.

The application persists encrypted request/result records by scoring submission and score-review revision. Network calls run outside database transactions. Leases prevent duplicate concurrent work; a response is retained with its own request and cannot overwrite a newer reviewed score's classification.

Workspace retry endpoint: `POST /assessments/:id/score-reviews/classification/retry` with the expected original result reference and score-review revision. Only the clinician currently allowed to adjust that assessment may retry. A failed classification leaves the score adjustment saved. The UI explains the pending/unavailable state, offers an eligible retry and refreshes pending results.

## Delivery and verification

This feature requires the updated NIQ Scoring API and workspace API/web application. Applying only the workspace change to an older scoring deployment will show classification unavailable and prevent review completion until the scoring endpoint is available. Existing reviewed records can request classification through Retry; original results remain usable without a new classification.

Migration `0025_abnormal_mesmero.sql` adds encrypted reviewed-risk request/result storage and was applied to both the disposable integration database and local development database. The scoring service needs no schema migration. Database readiness checks the new application table.

Verified on 23 September 2026:

- Application API: 205 tests passed, 957 assertions, all database suites enabled.
- Application web: 146 tests passed, 716 assertions.
- NIQ assessment endpoints and scoring engine: 60 tests passed, 321 assertions.
- Application workspace type checks and production build passed; NIQ workspace type checks passed.
- Local scoring endpoint smoke check returned the expected 401 without credentials, confirming the new route is mounted. No live patient records were changed for verification.
- Existing Vite bundle-size and Turbo lockfile graph warnings remain.

Small commits include application `24b494a`, `01a3dd1`, `a2bcd26`, `5e7d367`, `41f3ee0`, `0902836`, `1f73dbb`, `d77ed14`; scoring `585a042`, `9cb66f7`, `cc9ab17`. Nothing was pushed or deployed remotely.
