# Organization roles

Each membership and invitation stores one distinct role. Doctor, Nutritionist, and Other Medical Personnel initially share the same permissions, but have separate entries in `packages/contracts/src/roles.ts` so their access can diverge later. They are roles, not separate copies of a user's personal profile.

| Capability | Organization admin | Doctor / Nutritionist / Other Medical Personnel | Support |
| --- | --- | --- | --- |
| View/register patients and list assessments | Yes | Yes | Yes |
| Open/edit/submit assessments | Yes | Yes | No |
| Face scans, reports, score review | Yes | Yes | No |
| View facilities | Yes | Yes | Yes |
| Manage facilities/users/invitations/branding/scoring connection | Yes | No | No |
| Reconcile uncertain submissions | Yes | No | No |

Existing organization, active-account, facility assignment, assessment-state, and concurrency checks still apply. Platform administrators remain separate from organization roles. Clinical roles do not receive organization administration permissions.

The business requirements identify Doctors, Nutritionists, and Other Medical Personnel; they do not provide a granular permission matrix. This implementation preserves the previous Medical role's capabilities for all three, rather than introducing new clinical restrictions. Support retains its existing registration/list access.

## Migration and deployment

Migration 0022 renames the existing PostgreSQL MEDICAL enum value to OTHER_MEDICAL in place and adds DOCTOR and NUTRITIONIST. Existing memberships, pending invitations, defaults, and facility assignments are preserved. Existing Medical accounts cannot reliably be classified as doctors or nutritionists from the old role alone, so they become Other Medical Personnel.

Deploy the migration together with the updated API and frontend; old builds expecting MEDICAL are not compatible after the rename. Run `bun run db:migrate` with the deployment's DATABASE_URL before serving the updated application. Permissions are maintained centrally in code; this change does not introduce a permission-editor screen or change existing users' roles to a guessed profession.
