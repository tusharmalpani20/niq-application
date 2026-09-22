import type { FaceScanSession } from "@niq/application-contracts";

import { scanPostureLabels } from "./face-scan-posture";

export function FaceScanResults({ session }: { session: FaceScanSession }) {
  if (!session.result) return null;
  const r = session.result;
  const metrics: Array<[string, number | null, string]> = [
    ["Heart rate", r.vitals.heartRate, "bpm"], ["Oxygen saturation", r.vitals.oxygenSaturation, "%"],
    ["Respiratory rate", r.vitals.respiratoryRate, "breaths/min"],
    ["Systolic pressure", r.vitals.systolic, "mmHg"], ["Diastolic pressure", r.vitals.diastolic, "mmHg"],
    ["Wellness score", r.wellnessScore, "/ 100"], ["Health risk score", r.healthRiskScore, "/ 100"],
  ];
  const extra: Array<[string, string, string]> = [
    ["heartHealthScore", "Heart health score", "/ 100"],
    ["sdnn", "SDNN", "ms"], ["rmssd", "RMSSD", "ms"], ["pnn50", "PNN50", "%"],
    ["cardiacOutput", "Cardiac output", "L/min"], ["meanArterialPressure", "Mean arterial pressure", "mmHg"],
    ["heartUtilisation", "Heart utilisation", "%"], ["heartRateMax", "Maximum heart rate", "bpm"],
    ["heartRateReserve", "Heart-rate reserve", "bpm"], ["targetHeartRateRange", "Target heart-rate range", "bpm"],
    ["vo2max", "VO₂ max", "mL/kg/min"], ["hba1c", "HbA1c", "%"],
    ["diabetesControlScore", "Diabetes control score", "/ 100"], ["stressIndex", "Stress index", ""],
    ["prq", "Pulse-respiration quotient", ""], ["bmi", "Scan BMI", "kg/m²"],
    ["intensity", "Activity intensity", ""], ["totalBodyWater", "Total body water", ""],
    ["bodyWaterPercent", "Body water", "%"], ["bodyFat", "Body fat", "%"],
    ["bloodVolume", "Blood volume", ""], ["caloriesFat", "Fat calorie value", ""],
    ["caloriesCarbohydrate", "Carbohydrate calorie value", ""],
  ];
  return <section aria-label="Face scan results" className="space-y-5">
    <div><h3 className="font-semibold">Face scan results</h3><p className="mt-1 text-xs text-muted-foreground">{session.completedAt ? `Received ${new Date(session.completedAt).toLocaleString()}` : "Result received"}</p></div>
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{metrics.map(([label, value, unit]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value === null ? "Not available" : `${value} ${unit}`}</dd></div>)}</dl>
    {(r.physiologicalScore !== null || r.mentalWellbeingScore !== null || r.additionalMetrics) && <div className="border-t border-border pt-4">
      <h4 className="mb-4 font-semibold">Additional scan results</h4>
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {([["Physiological health score", r.physiologicalScore, "/ 100"], ["Mental wellbeing score", r.mentalWellbeingScore, "/ 100"], ...extra.map(([key, label, unit]) => [label, r.additionalMetrics?.[key] ?? null, unit])] as Array<[string, number | string | null, string]>).map(([label, value, unit]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value === null ? "Not available" : `${value} ${unit}`.trim()}</dd></div>)}
      </dl>
    </div>}
    <div className="border-t border-border pt-4"><p className="text-sm text-muted-foreground">NIQ face-scan points</p><p className="mt-1 font-semibold">{session.score?.status === "SCORED" && session.score.points != null ? session.score.points : "Not available"}</p><p className="mt-1 text-xs text-muted-foreground">Shown separately from the questionnaire score.</p></div>
    <p className="text-xs text-muted-foreground">Scan inputs: {session.context.heightCm} cm · {session.context.weightKg} kg · {scanPostureLabels[session.context.posture]}. Later form edits do not change this scan.</p>
  </section>;
}
