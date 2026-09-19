# Administration UI

The administration screens follow NIQ Scoring's compact layout and plain language.

## Theme ownership

`apps/web/src/theme.css` is the central definition for colours, semantic status colours, fonts, platform spacing, corner radii and shadows. `styles.css` maps semantic tokens into Tailwind utilities. `admin.css` contains platform layout rules and consumes those tokens.

Use semantic utilities such as `bg-card`, `text-muted-foreground`, `text-success`, and `bg-success-soft`. Do not add page-specific hex colours or coloured utility palettes. Extend the theme when a new semantic role is needed.

Tenant branding supplies `--brand-primary` and `--brand-secondary`. The platform shell marks the document with `data-app-area="platform"`, selecting the central admin palette. This also themes portal dialogs and prevents organization branding from changing the NIQ administration interface. The marker is removed when the shell unmounts.

## Presentation

- Use shared buttons, tabs, badges, dialogs, and tables.
- Keep icons beside dialog titles and retain descriptive action labels.
- Use `DateDisplay` for short dates with full local timestamps on hover or keyboard focus.
- Keep usage month boundaries labelled UTC.
- Render accepted invitations without an expiry. Do not invent acceptance dates.
- Explain actual action consequences using short sentences without semicolons or em dashes.
- Empty lists have an empty state, not empty pagination.
- Missing integration data is unavailable, never assumed to be zero.
- Rule version names and default assignment mode come from NIQ Scoring.

## Delivery

Make small, focused commits. Check each behavioural change with relevant tests and inspect affected layouts in the browser. Preserve permissions and avoid sending invitations or changing live organization access during visual verification.
