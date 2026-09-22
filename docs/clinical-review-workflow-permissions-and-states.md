# Clinical review permissions and states

Implemented 23 September 2026. Verification results are recorded separately.

## Clinical roles

Doctor, Nutritionist and Other Medical Personnel may claim and complete work within their organization and facility access. Self-review is allowed. Organization administrators manage assignment and correction returns but do not adjust clinical scores, claim or complete reviews. Support has no clinical review access.

## Ownership

| Stage | Responsible person | Main actions |
|---|---|---|
| Initial draft | Existing assessment collaborators | Save/score |
| Initially scored | Original creator submits to queue | Send for clinical review |
| Waiting for reviewer | Nobody | Clinician claims; admin assigns |
| In review | Current reviewer | Adjust, transfer, release, return, complete |
| Returned draft | Correction person | Correct and rescore |
| Corrected and scored | Correction person | Adjust new score, explicitly resend |
| Completed | Final reviewer recorded | Read only |

An admin who is the original creator may send to review as a handoff but is not an eligible clinical reviewer. No other admin bypasses initial creator ownership.

Return defaults to the creator as correction person only when eligible; otherwise select an eligible clinician. Return, transfer, release and reassignment require a reason. Completion requires a final remark. No completion reopening exists.

Resend routes to the reviewer recorded at return if still eligible, otherwise the unclaimed queue. Returning unclaimed/released work records no previous reviewer. All mutations enforce current membership, organization/facility scope and revision on the server.

## Scoring and review are different submissions

Calculate score freezes answers for NIQ Scoring. Send for clinical review places a successfully scored assessment in the clinical workflow. A correction creates a new scoring submission under the same assessment reference; it does not automatically resend for clinical review. Old adjustments do not carry forward onto the new score.
