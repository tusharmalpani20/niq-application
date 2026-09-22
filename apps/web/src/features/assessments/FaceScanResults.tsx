import type { ReactNode } from "react";
import type { FaceScanSession } from "@niq/application-contracts";
import { ChevronRight } from "lucide-react";
import { scanPostureLabels } from "./face-scan-posture";

type Metric = { label: string; value: number | string | null; unit: string };
const display = ({ value, unit }: Metric) => value === null ? "Not available" : `${value} ${unit}`.trim();

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group overflow-hidden rounded-xl border border-border bg-card">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />{title}
    </summary>
    <div className="border-t border-border px-4 py-3">{children}</div>
  </details>;
}

function MetricRows({ metrics }: { metrics: Metric[] }) {
  return <dl className="grid gap-x-8 @min-[40rem]:grid-cols-2">{metrics.map(metric => <div key={metric.label} className="flex min-w-0 items-baseline justify-between gap-4 py-2 text-sm">
    <dt className="min-w-0 text-muted-foreground">{metric.label}</dt><dd className="shrink-0 font-medium tabular-nums">{display(metric)}</dd>
  </div>)}</dl>;
}

export function FaceScanResults({ session }: { session: FaceScanSession }) {
  if (!session.result) return null;
  const r = session.result;
  const metric = (key: string, label: string, unit = ""): Metric => ({ label, unit, value: r.additionalMetrics?.[key] ?? null });
  const groups: Array<{ title: string; metrics: Metric[] }> = [
    { title: "Heart & circulation", metrics: [
      metric("sdnn", "SDNN", "ms"), metric("rmssd", "RMSSD", "ms"), metric("pnn50", "PNN50", "%"),
      metric("cardiacOutput", "Cardiac output", "L/min"), metric("meanArterialPressure", "Mean arterial pressure", "mmHg"),
      metric("heartUtilisation", "Heart utilisation", "%"), metric("heartRateMax", "Maximum heart rate", "bpm"),
      metric("heartRateReserve", "Heart-rate reserve", "bpm"), metric("targetHeartRateRange", "Target heart-rate range", "bpm"),
      metric("stressIndex", "Stress index"), metric("prq", "Pulse-respiration quotient"),
    ] },
    { title: "Body & fitness", metrics: [
      metric("bmi", "Scan BMI", "kg/m²"), metric("vo2max", "VO₂ max", "mL/kg/min"), metric("intensity", "Activity intensity"),
      metric("bodyFat", "Body fat", "%"), metric("totalBodyWater", "Total body water"), metric("bodyWaterPercent", "Body water", "%"),
      metric("bloodVolume", "Blood volume"), metric("caloriesFat", "Fat calorie value"), metric("caloriesCarbohydrate", "Carbohydrate calorie value"),
    ] },
    { title: "Other scores", metrics: [
      metric("heartHealthScore", "Heart health score", "/ 100"),
      { label: "Physiological health score", value: r.physiologicalScore, unit: "/ 100" },
      { label: "Mental wellbeing score", value: r.mentalWellbeingScore, unit: "/ 100" },
      metric("hba1c", "HbA1c", "%"), metric("diabetesControlScore", "Diabetes control score", "/ 100"),
    ] },
  ];
  // A partial pressure reading must not look like a complete measurement.
  const bloodPressure = r.vitals.systolic === null && r.vitals.diastolic === null ? null : `${r.vitals.systolic ?? "—"}/${r.vitals.diastolic ?? "—"}`;
  const vitals: Metric[] = [
    { label: "Heart rate", value: r.vitals.heartRate, unit: "bpm" },
    { label: "Blood pressure", value: bloodPressure, unit: "mmHg" },
    { label: "Oxygen saturation", value: r.vitals.oxygenSaturation, unit: "%" },
    { label: "Breathing", value: r.vitals.respiratoryRate, unit: "/min" },
  ];
  const unavailable = groups.flatMap(group => group.metrics).filter(item => item.value === null);
  return <section aria-label="Face scan results" className="@container space-y-4">
    <div><h3 className="text-lg font-semibold">Face scan results</h3><p className="mt-1 text-xs text-muted-foreground">Scan complete{session.completedAt ? ` · ${new Date(session.completedAt).toLocaleString()}` : ""}</p></div>
    <dl className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-card py-4">
      {[{ label: "Wellness score", value: r.wellnessScore }, { label: "Health risk score", value: r.healthRiskScore }].map(item => <div key={item.label} className="min-w-0 px-4"><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value ?? "—"}{item.value !== null && <span className="ml-1 text-base font-normal text-muted-foreground">/100</span>}</dd></div>)}
    </dl>
    <dl className="grid grid-cols-2 gap-3 @min-[44rem]:grid-cols-4">{vitals.map(item => <div key={item.label} className="min-w-0 rounded-xl border border-border bg-card p-3"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-2 flex flex-wrap items-baseline gap-x-1 font-semibold tabular-nums"><span className="text-xl">{item.value ?? "—"}</span>{item.value !== null && <span className="text-sm font-normal">{item.unit}</span>}</dd></div>)}</dl>
    {groups.map(group => {
      const available = group.metrics.filter(item => item.value !== null);
      return available.length ? <ResultGroup key={group.title} title={group.title}><MetricRows metrics={available}/></ResultGroup> : null;
    })}
    {unavailable.length > 0 && <ResultGroup title={`Unavailable results · ${unavailable.length}`}>
      <p className="mb-2 text-sm text-muted-foreground">These measurements were not available in this scan.</p>
      <ul className="grid gap-2 text-sm text-muted-foreground @min-[40rem]:grid-cols-2">{unavailable.map(item => <li key={item.label}>{item.label}</li>)}</ul>
    </ResultGroup>}
    <ResultGroup title="Scan details">
      <MetricRows metrics={[
        { label: "Height at scan", value: session.context.heightCm, unit: "cm" },
        { label: "Weight at scan", value: session.context.weightKg, unit: "kg" },
        { label: "Posture", value: scanPostureLabels[session.context.posture], unit: "" },
        { label: "NIQ face-scan points", value: session.score?.status === "SCORED" ? session.score.points ?? null : null, unit: "" },
      ]}/>
      <p className="mt-2 text-xs text-muted-foreground">Scan inputs stay unchanged when the form is edited. Face-scan points are separate from the questionnaire score.</p>
    </ResultGroup>
  </section>;
}
