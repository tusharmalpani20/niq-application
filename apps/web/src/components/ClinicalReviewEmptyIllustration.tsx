/** A review illustration coloured by the active organization theme. */
export function ClinicalReviewEmptyIllustration() {
  return <svg className="empty-list-illustration" viewBox="0 0 280 164" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="150" rx="91" ry="8" fill="currentColor" opacity=".07" />
    <circle cx="140" cy="79" r="72" fill="currentColor" opacity=".06" />
    <circle cx="140" cy="79" r="57" stroke="currentColor" opacity=".12" />
    <rect x="68" y="23" width="134" height="116" rx="15" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M88 48h70" stroke="var(--secondary)" strokeWidth="5" strokeLinecap="round" opacity=".55" />
    <path d="M88 68h85M88 83h73M88 98h53" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".28" />
    <circle cx="189" cy="103" r="26" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
    <circle cx="189" cy="103" r="15" fill="currentColor" opacity=".11" />
    <path d="m182 103 5 5 9-11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m208 122 17 17" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <circle cx="50" cy="93" r="3" fill="currentColor" opacity=".35" />
    <circle cx="234" cy="53" r="3" fill="currentColor" opacity=".35" />
  </svg>;
}
