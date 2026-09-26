/** A questionnaire illustration that inherits the organization's colour tokens. */
export function AssessmentEmptyIllustration() {
  return <svg className="empty-list-illustration" viewBox="0 0 280 164" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="150" rx="91" ry="8" fill="currentColor" opacity=".07" />
    <circle cx="140" cy="79" r="72" fill="currentColor" opacity=".06" />
    <circle cx="140" cy="79" r="57" stroke="currentColor" opacity=".12" />
    <rect x="72" y="28" width="146" height="115" rx="14" transform="rotate(7 72 28)" fill="currentColor" opacity=".1" />
    <rect x="66" y="22" width="146" height="116" rx="15" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <rect x="115" y="15" width="48" height="15" rx="7" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M91 49h70" stroke="var(--secondary)" strokeWidth="5" strokeLinecap="round" opacity=".55" />
    <rect x="90" y="66" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2" opacity=".7" />
    <path d="m93 72 3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M114 72h63" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".38" />
    <rect x="90" y="91" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2" opacity=".7" />
    <path d="m93 97 3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M114 97h49" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".38" />
    <path d="M90 120h81" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".2" />
    <circle cx="223" cy="108" r="18" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M223 99v9l6 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="44" cy="94" r="3" fill="currentColor" opacity=".35" />
  </svg>;
}
