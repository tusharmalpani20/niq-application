export function ApplicationLogo({ className = "", decorative = false }: { className?: string; decorative?: boolean }) {
  return <img src="/nutra-iq-logo.png" alt={decorative ? "" : "Nutra-IQ"} className={className} />;
}
