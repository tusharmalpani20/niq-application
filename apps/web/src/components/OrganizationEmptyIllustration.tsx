type Variant = "all" | "active" | "suspended" | "closed" | "search";

/** A filtered organization list, using the current theme color. */
export function OrganizationEmptyIllustration({ variant }: { variant: Variant }) {
  return <svg className="empty-list-illustration" viewBox="0 0 280 164" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="151" rx="91" ry="8" fill="currentColor" opacity=".07" />
    <circle cx="140" cy="79" r="72" fill="currentColor" opacity=".06" />
    <circle cx="140" cy="79" r="57" stroke="currentColor" opacity=".12" />
    <rect x="69" y="47" width="142" height="93" rx="12" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M111 47V34a8 8 0 0 1 8-8h42a8 8 0 0 1 8 8v13" stroke="currentColor" strokeWidth="2" />
    <path d="M69 73h142" stroke="currentColor" opacity=".18" />
    <rect x="86" y="87" width="19" height="18" rx="4" fill="currentColor" opacity=".15" />
    <rect x="113" y="87" width="19" height="18" rx="4" fill="currentColor" opacity=".15" />
    <rect x="86" y="113" width="19" height="18" rx="4" fill="currentColor" opacity=".15" />
    <path d="M150 140v-31a11 11 0 0 1 22 0v31" stroke="currentColor" strokeWidth="2" />
    <circle cx="194" cy="102" r="27" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    {variant === "active" ? <path d="m183 102 8 8 15-17" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
    {variant === "suspended" ? <path d="M187 92v20m14-20v20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /> : null}
    {variant === "closed" ? <path d="m186 94 16 16m0-16-16 16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /> : null}
    {variant === "all" ? <path d="M194 92v20m-10-10h20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /> : null}
    {variant === "search" ? <><circle cx="191" cy="99" r="8" stroke="currentColor" strokeWidth="3" /><path d="m197 105 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></> : null}
    <circle cx="48" cy="98" r="3" fill="currentColor" opacity=".3" />
    <circle cx="232" cy="58" r="3" fill="currentColor" opacity=".3" />
  </svg>;
}
