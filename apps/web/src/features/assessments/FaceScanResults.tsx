import type { ReactNode } from "react";
import type { FaceScanSession } from "@niq/application-contracts";
import { ChevronRight } from "lucide-react";
import { scanPostureLabels } from "./face-scan-posture";
import { assessFaceScanRange } from "./face-scan-reference-ranges";

type Metric = { key?: string; label: string; value: number | string | null; unit: string };
const display = ({ value, unit }: Metric) => value === null ? "—" : `${value} ${unit}`.trim();

function ResultGroup({ title, availability, outOfRangeCount = 0, children }: { title: string; availability?: string; outOfRangeCount?: number; children: ReactNode }) {
  return <details className="group overflow-hidden rounded-xl border border-border bg-card">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={outOfRangeCount ? "text-warning" : undefined}>{title}</span>
        {outOfRangeCount > 0 && <span className="block text-xs font-normal text-warning tabular-nums">{outOfRangeCount} outside range</span>}
      </span>
      {availability && <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{availability}</span>}
    </summary>
    <div className="border-t border-border px-4 py-3">{children}</div>
  </details>;
}

function MetricRows({ metrics, context }: { metrics: Metric[]; context: FaceScanSession["context"] }) {
  return <dl className="grid gap-x-8 @min-[40rem]:grid-cols-2">{metrics.map(metric => {
    const assessment = metric.key ? assessFaceScanRange(metric.key, metric.value, context) : null;
    return <div key={metric.label} className={`flex min-w-0 items-baseline justify-between gap-4 py-2 text-sm ${assessment?.outside ? "text-warning" : ""}`}>
      <dt className={`min-w-0 ${assessment?.outside ? "" : "text-muted-foreground"}`}>{metric.label}</dt>
      <dd className="min-w-0 shrink-0 text-right font-medium tabular-nums" aria-label={metric.value === null ? "Not available" : undefined}>
        {display(metric)}
        {assessment?.outside && <span className="block text-xs font-normal">Outside report range · {assessment.reference}</span>}
      </dd>
    </div>;
  })}</dl>;
}

export function FaceScanResults({ session }: { session: FaceScanSession }) {
  if (!session.result) return null;
  const r = session.result;
  const metric = (key: string, label: string, unit = ""): Metric => ({ key, label, unit, value: r.additionalMetrics?.[key] ?? null });
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
    { key: "heartRate", label: "Heart rate", value: r.vitals.heartRate, unit: "bpm" },
    { key: "bloodPressure", label: "Blood pressure", value: bloodPressure, unit: "mmHg" },
    { key: "oxygenSaturation", label: "Oxygen saturation", value: r.vitals.oxygenSaturation, unit: "%" },
    { key: "respiratoryRate", label: "Breathing", value: r.vitals.respiratoryRate, unit: "/min" },
  ];
  return <section aria-label="Face scan results" className="@container space-y-4">
    <p role="status" className="text-xs text-muted-foreground">Completed{session.completedAt ? ` · ${new Date(session.completedAt).toLocaleString()}` : ""}</p>
    <dl className="grid gap-4 rounded-xl border border-border bg-card py-4 @min-[30rem]:grid-cols-3">
      {[{ label: "Vital IQ score", value: session.score?.status === "SCORED" ? session.score.points : null, unit: "" }, { label: "Wellness score", value: r.wellnessScore, unit: "/100" }, { label: "Health risk score", value: r.healthRiskScore, unit: "/100" }].map(item => <div key={item.label} className="min-w-0 px-4"><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value ?? "—"}{item.value != null && item.unit && <span className="ml-1 text-base font-normal text-muted-foreground">{item.unit}</span>}</dd></div>)}
    </dl>
    <dl className="grid grid-cols-2 gap-3 @min-[44rem]:grid-cols-4">{vitals.map(item => {
      const assessment = item.key ? assessFaceScanRange(item.key, item.value, session.context) : null;
      return <div key={item.label} className={`min-w-0 rounded-xl border border-border bg-card p-3 ${assessment?.outside ? "text-warning" : ""}`}>
        <dt className={`text-xs ${assessment?.outside ? "" : "text-muted-foreground"}`}>{item.label}</dt>
        <dd className="mt-2 flex flex-wrap items-baseline gap-x-1 font-semibold tabular-nums"><span className="text-xl">{item.value ?? "—"}</span>{item.value !== null && <span className="text-sm font-normal">{item.unit}</span>}</dd>
        {assessment?.outside && <p className="mt-2 text-xs">Outside report range · {assessment.reference}</p>}
      </div>;
    })}</dl>
    {groups.map(group => {
      const outOfRangeCount = group.metrics.filter(item => item.key && assessFaceScanRange(item.key, item.value, session.context)?.outside).length;
      return <ResultGroup key={group.title} title={group.title} availability={`${group.metrics.filter(item => item.value !== null).length}/${group.metrics.length} available`} outOfRangeCount={outOfRangeCount}>
        <MetricRows metrics={group.metrics} context={session.context}/>
      </ResultGroup>;
    })}
    <ResultGroup title="Scan details">
      <MetricRows context={session.context} metrics={[
        { label: "Date of birth at scan", value: session.context.dob, unit: "" },
        { label: "Gender at scan", value: session.context.gender === "female" ? "Female" : "Male", unit: "" },
        { label: "Height at scan", value: session.context.heightCm, unit: "cm" },
        { label: "Weight at scan", value: session.context.weightKg, unit: "kg" },
        { label: "Posture", value: scanPostureLabels[session.context.posture], unit: "" },
      ]}/>
    </ResultGroup>
  </section>;
}
