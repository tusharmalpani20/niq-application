# Tenant UI follow-up audit — 19 September 2026

Scope: Overview, patient list/registration/details/history, assessment list, Users and invitations, Facilities, Branding, scoring connection, shared theme and navigation. Assessment creation remains excluded. No live invitations, account changes, patient registrations or scoring disconnects were submitted during browser checks.

## Corrected in this review

- Scoring connection banner follows central tenant primary tokens. Enabled badges keep semantic success green, disconnect stays destructive red.
- Scoring and Overview refresh controls use icons, accessible names and hover/focus tooltips. Disconnect uses the same pattern and retains confirmation.
- Empty patient history now explains the next step with one New assessment action. The duplicate header action is hidden only on that empty tab.
- Invite cannot open before facility permissions finish loading or after loading fails.
- Branding loading failures offer Retry.
- Users distinguish global suspension/deactivation from disabled organization membership. Global account problems direct admins to NIQ support rather than presenting a misleading enable action.

## Remaining findings

1. **Production invitation delivery is incomplete.** The API only exposes activation tokens when development disclosure is enabled. No production mail delivery or alternate secure link handoff is implemented. Creating or regenerating an invitation in production therefore has no actionable delivery step. Do not label this as email sent. Requires choosing and implementing the delivery flow.
2. **Invitation actions do not reflect facility scope.** Organization details return invitations without facility scope, while mutation authorization checks that scope. Restricted administrators can see actions that the server rejects. Expose an authorized capability per invitation or return a scoped management list. Server authorization must remain enforced.
3. **Unsaved Branding and browser Back.** Sidebar navigation, ordinary links and unload are guarded. Browser Back can still discard drafts because the application uses BrowserRouter without a route blocker. A router-level guard or draft restoration should cover this.
4. **Saved-logo removal is unavailable.** Upload replacement and undoing an unsaved replacement work. The existing API has no saved-logo removal contract.
5. **Usage period is monthly.** Overview uses actual calendar-month scoring counters, not rolling 30-day totals. Rolling totals require a historical usage endpoint.

## Verification and coverage

- Web TypeScript, 18 web tests and production web build pass; existing large-bundle warning remains.
- Browser verified tenant banner colour, named icon controls, disconnect confirmation and patient empty state with exactly one action.
- The prior implementation pass verified desktop/mobile layouts and ran the wider suite (144 passing tests, 9 database integration cases skipped). This follow-up changes UI only; it does not establish new end-to-end coverage for live account mutations or production delivery.
