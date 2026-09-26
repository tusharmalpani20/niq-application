/** A patient record illustration that follows the current organization's colours. */
export function PatientEmptyIllustration() {
  return <svg className="patient-empty-illustration" viewBox="0 0 280 164" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="150" rx="91" ry="8" fill="currentColor" opacity=".07" />
    <circle cx="140" cy="79" r="72" fill="currentColor" opacity=".06" />
    <circle cx="140" cy="79" r="57" stroke="currentColor" opacity=".12" />
    <rect x="51" y="33" width="169" height="104" rx="15" transform="rotate(-8 51 33)" fill="currentColor" opacity=".11" />
    <rect x="62" y="25" width="169" height="112" rx="16" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M62 106h169" stroke="currentColor" opacity=".16" />
    <circle cx="105" cy="69" r="24" fill="currentColor" opacity=".12" />
    <circle cx="105" cy="63" r="7" stroke="currentColor" strokeWidth="2.5" />
    <path d="M91 83c2-8 8-12 14-12s12 4 14 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M143 55h57M143 67h46" stroke="var(--secondary)" strokeWidth="5" strokeLinecap="round" opacity=".55" />
    <path d="M84 120h39m12 0h29" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".27" />
    <path d="M195 118h18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".27" />
    <circle cx="249" cy="87" r="3" fill="currentColor" opacity=".38" />
  </svg>;
}
