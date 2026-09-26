import type { ReactNode } from "react";
import type { FaceScanSession } from "@niq/application-contracts";
import { Activity, BicepsFlexed, Brain, CalendarDays, ChartNoAxesCombined, ChevronRight, Droplet, Droplets, Flame, Gauge, Heart, HeartPulse, Percent, PersonStanding, Ruler, ScanFace, Shield, Target, TrendingUp, UserRound, Weight, Wind, Zap, type LucideIcon } from "lucide-react";
import { scanPostureLabels } from "./face-scan-posture";
import { assessFaceScanRange } from "./face-scan-reference-ranges";

type Metric = { key?: string; label: string; value: number | string | null; unit: string; icon?: LucideIcon };
const display = ({ value, unit }: Metric) => value === null ? "—" : `${value} ${unit}`.trim();
const detailIcons: Record<string, LucideIcon> = {
  sdnn: Activity, rmssd: HeartPulse, pnn50: ChartNoAxesCombined,
  cardiacOutput: Heart, meanArterialPressure: Gauge, heartUtilisation: HeartPulse,
  heartRateMax: TrendingUp, heartRateReserve: Activity, targetHeartRateRange: Target,
  stressIndex: Brain, prq: Wind,
  bmi: Weight, vo2max: Wind, intensity: Zap, bodyFat: Percent,
  totalBodyWater: Droplets, bodyWaterPercent: Droplet, bloodVolume: Droplets,
  caloriesFat: Flame, caloriesCarbohydrate: Flame,
  heartHealthScore: HeartPulse, hba1c: Droplet, diabetesControlScore: Gauge,
};

function ResultGroup({ title, icon: Icon, availability, outOfRangeCount = 0, children }: { title: string; icon: LucideIcon; availability?: string; outOfRangeCount?: number; children: ReactNode }) {
  return <details className="group overflow-hidden rounded-xl border border-border bg-card">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
      <Icon className={`size-4 shrink-0 ${outOfRangeCount ? "text-warning" : "text-primary"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span>{title}</span>
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
    return <div key={metric.label} className="flex min-w-0 items-start justify-between gap-4 py-2 text-sm">
      <dt className="flex min-w-0 items-start gap-2 text-muted-foreground">
        {metric.icon && <metric.icon className={`mt-0.5 size-4 shrink-0 ${assessment?.outside ? "text-warning" : "text-muted-foreground/70"}`} aria-hidden="true" />}
        <span>{metric.label}</span>
      </dt>
      <dd className="min-w-0 shrink-0 text-right font-medium tabular-nums" aria-label={metric.value === null ? "Not available" : undefined}>
        {display(metric)}
        {assessment?.outside && <span className="block max-w-72 text-[11px] font-normal leading-tight text-warning">Normal range: {assessment.reference}</span>}
      </dd>
    </div>;
  })}</dl>;
}

export function FaceScanResults({ session }: { session: FaceScanSession }) {
  if (!session.result) return null;
  const r = session.result;
  const metric = (key: string, label: string, unit = ""): Metric => ({ key, label, unit, icon: detailIcons[key], value: r.additionalMetrics?.[key] ?? null });
  const groups: Array<{ title: string; icon: LucideIcon; metrics: Metric[] }> = [
    { title: "Heart & circulation", icon: HeartPulse, metrics: [
      metric("sdnn", "SDNN", "ms"), metric("rmssd", "RMSSD", "ms"), metric("pnn50", "PNN50", "%"),
      metric("cardiacOutput", "Cardiac output", "L/min"), metric("meanArterialPressure", "Mean arterial pressure", "mmHg"),
      metric("heartUtilisation", "Heart utilisation", "%"), metric("heartRateMax", "Maximum heart rate", "bpm"),
      metric("heartRateReserve", "Heart-rate reserve", "bpm"), metric("targetHeartRateRange", "Target heart-rate range", "bpm"),
      metric("stressIndex", "Stress index"), metric("prq", "Pulse-respiration quotient"),
    ] },
    { title: "Body & fitness", icon: BicepsFlexed, metrics: [
      metric("bmi", "Scan BMI", "kg/m²"), metric("vo2max", "VO₂ max", "mL/kg/min"), metric("intensity", "Activity intensity"),
      metric("bodyFat", "Body fat", "%"), metric("totalBodyWater", "Total body water"), metric("bodyWaterPercent", "Body water", "%"),
      metric("bloodVolume", "Blood volume"), metric("caloriesFat", "Fat calorie value"), metric("caloriesCarbohydrate", "Carbohydrate calorie value"),
    ] },
    { title: "Other scores", icon: ChartNoAxesCombined, metrics: [
      metric("heartHealthScore", "Heart health score", "/ 100"),
      { label: "Physiological health score", value: r.physiologicalScore, unit: "/ 100", icon: Activity },
      { label: "Mental wellbeing score", value: r.mentalWellbeingScore, unit: "/ 100", icon: Brain },
      metric("hba1c", "HbA1c", "%"), metric("diabetesControlScore", "Diabetes control score", "/ 100"),
    ] },
  ];
  // A partial pressure reading must not look like a complete measurement.
  const bloodPressure = r.vitals.systolic === null && r.vitals.diastolic === null ? null : `${r.vitals.systolic ?? "—"}/${r.vitals.diastolic ?? "—"}`;
  const vitals: Metric[] = [
    { key: "heartRate", label: "Heart rate", value: r.vitals.heartRate, unit: "bpm", icon: Activity },
    { key: "bloodPressure", label: "Blood pressure", value: bloodPressure, unit: "mmHg", icon: Gauge },
    { key: "oxygenSaturation", label: "Oxygen saturation", value: r.vitals.oxygenSaturation, unit: "%", icon: Droplets },
    { key: "respiratoryRate", label: "Breathing", value: r.vitals.respiratoryRate, unit: "/min", icon: Wind },
  ];
  const scores: Array<Metric & { icon: LucideIcon }> = [
    { label: "Vital IQ score", value: session.score?.status === "SCORED" ? session.score.points ?? null : null, unit: "", icon: ScanFace },
    { label: "Wellness score", value: r.wellnessScore, unit: "/100", icon: HeartPulse },
    { label: "Health risk score", value: r.healthRiskScore, unit: "/100", icon: Shield },
  ];
  return <section aria-label="Face scan results" className="@container space-y-4">
    <p role="status" className="text-xs text-muted-foreground">Completed{session.completedAt ? ` · ${new Date(session.completedAt).toLocaleString()}` : ""}</p>
    <dl className="grid gap-4 rounded-xl border border-border bg-card py-4 @min-[30rem]:grid-cols-3">
      {scores.map(item => <div key={item.label} className="min-w-0 px-4"><dt className="flex items-center gap-2 text-sm text-muted-foreground"><item.icon className="size-4 shrink-0 text-primary" aria-hidden="true" />{item.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value ?? "—"}{item.value != null && item.unit && <span className="ml-1 text-base font-normal text-muted-foreground">{item.unit}</span>}</dd></div>)}
    </dl>
    <dl className="grid grid-cols-2 gap-3 @min-[44rem]:grid-cols-4">{vitals.map(item => {
      const assessment = item.key ? assessFaceScanRange(item.key, item.value, session.context) : null;
      return <div key={item.label} className="min-w-0 rounded-xl border border-border bg-card p-3">
        <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{item.icon && <item.icon className={`size-4 shrink-0 ${assessment?.outside ? "text-warning" : ""}`} aria-hidden="true" />}{item.label}</dt>
        <dd className="mt-2 flex flex-wrap items-baseline gap-x-1 font-semibold tabular-nums"><span className="text-xl">{item.value ?? "—"}</span>{item.value !== null && <span className="text-sm font-normal">{item.unit}</span>}</dd>
        {assessment?.outside && <p className="mt-2 text-[11px] leading-tight text-warning">Normal range: {assessment.reference}</p>}
      </div>;
    })}</dl>
    {groups.map(group => {
      const outOfRangeCount = group.metrics.filter(item => item.key && assessFaceScanRange(item.key, item.value, session.context)?.outside).length;
      return <ResultGroup key={group.title} title={group.title} icon={group.icon} availability={`${group.metrics.filter(item => item.value !== null).length}/${group.metrics.length} available`} outOfRangeCount={outOfRangeCount}>
        <MetricRows metrics={group.metrics} context={session.context}/>
      </ResultGroup>;
    })}
    <ResultGroup title="Scan details" icon={ScanFace}>
      <MetricRows context={session.context} metrics={[
        { label: "Date of birth at scan", value: session.context.dob, unit: "", icon: CalendarDays },
        { label: "Gender at scan", value: session.context.gender === "female" ? "Female" : "Male", unit: "", icon: UserRound },
        { label: "Height at scan", value: session.context.heightCm, unit: "cm", icon: Ruler },
        { label: "Weight at scan", value: session.context.weightKg, unit: "kg", icon: Weight },
        { label: "Posture", value: scanPostureLabels[session.context.posture], unit: "", icon: PersonStanding },
      ]}/>
    </ResultGroup>
  </section>;
}
