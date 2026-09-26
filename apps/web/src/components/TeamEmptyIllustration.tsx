/** A team illustration coloured by the active organization theme. */
export function TeamEmptyIllustration() {
  return <svg className="empty-list-illustration" viewBox="0 0 280 164" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="151" rx="91" ry="8" fill="currentColor" opacity=".07" />
    <circle cx="140" cy="79" r="72" fill="currentColor" opacity=".06" />
    <circle cx="140" cy="79" r="57" stroke="currentColor" opacity=".12" />
    <rect x="61" y="30" width="112" height="95" rx="15" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <circle cx="117" cy="62" r="15" fill="currentColor" opacity=".14" />
    <circle cx="117" cy="59" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M102 82c1-8 7-12 15-12s14 4 15 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M89 102h57" stroke="var(--secondary)" strokeWidth="4" strokeLinecap="round" opacity=".5" />
    <rect x="144" y="62" width="80" height="61" rx="12" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="m154 76 30 22 30-22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m154 108 20-17m40 17-20-17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
    <circle cx="49" cy="91" r="3" fill="currentColor" opacity=".35" />
    <circle cx="236" cy="54" r="3" fill="currentColor" opacity=".35" />
  </svg>;
}
