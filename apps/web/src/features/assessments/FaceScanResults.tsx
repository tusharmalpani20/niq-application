import type { FaceScanSession } from "@niq/application-contracts";

export function FaceScanResults({ session }: { session: FaceScanSession }) {
  if (!session.result) return null;
  const r = session.result;
  const metrics: Array<[string, number | null, string]> = [
    ["Heart rate", r.vitals.heartRate, "bpm"], ["Oxygen saturation", r.vitals.oxygenSaturation, "%"],
    ["Respiratory rate", r.vitals.respiratoryRate, "breaths/min"],
    ["Systolic pressure", r.vitals.systolic, "mmHg"], ["Diastolic pressure", r.vitals.diastolic, "mmHg"],
    ["Wellness score", r.wellnessScore, "/ 100"], ["Health risk score", r.healthRiskScore, "/ 100"],
  ];
  return <section aria-label="Face scan results" className="space-y-5">
    <div><h3 className="font-semibold">Face scan results</h3><p className="mt-1 text-xs text-muted-foreground">{session.completedAt ? `Received ${new Date(session.completedAt).toLocaleString()}` : "Result received"}</p></div>
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{metrics.map(([label, value, unit]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value === null ? "Not available" : `${value} ${unit}`}</dd></div>)}</dl>
    <div className="border-t border-border pt-4"><p className="text-sm text-muted-foreground">NIQ face-scan points</p><p className="mt-1 font-semibold">{session.score?.status === "SCORED" && session.score.points != null ? session.score.points : "Not available"}</p><p className="mt-1 text-xs text-muted-foreground">Shown separately from the questionnaire score.</p></div>
    <p className="text-xs text-muted-foreground">Scan inputs: {session.context.heightCm} cm · {session.context.weightKg} kg · Resting. Later form edits do not change this scan.</p>
  </section>;
}
