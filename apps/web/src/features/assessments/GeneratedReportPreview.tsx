import { Activity, ArrowRight, BicepsFlexed, Brain, Calculator, CalendarDays, ChartNoAxesCombined, CircleDot, ClipboardList, Droplets, Gauge, HeartPulse, Leaf, Package, Ruler, Scale, ShieldCheck, Soup, Stethoscope, TriangleAlert, TrendingDown, Utensils, Wind, type LucideIcon } from "lucide-react";
import { reportFaceScanAdditionalMetricGroups, riskColorHex } from "@niq/application-contracts";
import { useBranding } from "@/lib/branding-context";
import { BrandMarks } from "@/components/BrandMarks";
import { AssessmentBmiCard } from "./AssessmentBmiCard";
import type { GeneratedReport } from "./generated-report-api";
import { cleanWeights, metricText, reportAge, reportDate, reportGuidance, weightChange } from "./generated-report-format";
import { weightChartPoints } from "./generated-report-chart";
import "./generated-report.css";

type ReportSheetProps = { number: number; title: string; icon: LucideIcon; children: React.ReactNode; report: GeneratedReport; compact?: boolean; className?: string };
type ReportMetric = GeneratedReport["metrics"][number];

const metricIcons: Record<string, LucideIcon> = {
  current_weight_kg: Scale,
  height_cm: Ruler,
  bmi: Calculator,
  weight_loss_percent: TrendingDown,
  appetite_status: Soup,
  fluid_intake: Droplets,
  functional_capacity: Activity,
  protein_intake: Utensils,
  wellness_score: HeartPulse,
  health_risk_score: ShieldCheck,
  heart_rate: HeartPulse,
  oxygen_saturation: Droplets,
  respiratory_rate: Wind,
  systolic: Gauge,
  diastolic: Gauge,
  stress_index: Activity,
  stress_band: Activity,
  sdnn: HeartPulse,
  rmssd: HeartPulse,
  pnn50: HeartPulse,
  cardiac_output: HeartPulse,
  mean_arterial_pressure: Gauge,
  heart_utilisation: HeartPulse,
  heart_rate_max: HeartPulse,
  heart_rate_reserve: HeartPulse,
  target_heart_rate_range: Gauge,
  prq: Wind,
  scan_bmi: Calculator,
  vo2max: Wind,
  intensity: BicepsFlexed,
  body_fat: Scale,
  total_body_water: Droplets,
  body_water_percent: Droplets,
  blood_volume: Droplets,
  heart_health_score: HeartPulse,
  diabetes_control_score: ShieldCheck,
  physiological_score: Activity,
  mental_wellbeing_score: Brain,
};

function MetricIcon({ id, label }: { id: string; label: string }) {
  const Icon = metricIcons[id] ?? (label === "Reported dietary symptom" ? Stethoscope : Activity);
  return <span className="cr-metric-icon"><Icon size={22} aria-hidden="true" /></span>;
}

function VitalScoreCard({ metric }: { metric: ReportMetric }) {
  const score = Number(metric.value);
  const ring = metric.id !== "vital_iq_points" && Number.isFinite(score) && score >= 0 && score <= 100;
  return <div className="cr-vital-score-card"><span>{metric.label}</span>{ring
    ? <div className="cr-vital-score-ring" style={{ background: `conic-gradient(var(--brand-primary, #34b5b9) ${score}%, color-mix(in srgb, var(--brand-primary, #34b5b9) 15%, white) 0)` }}><div><strong>{metric.value}</strong><small>{metric.unit}</small></div></div>
    : <div className="cr-vital-score-value"><strong>{metric.value}</strong><small>{metric.unit || "points"}</small></div>}</div>;
}

function CoverArtwork() {
  return <div className="cr-cover-art" aria-hidden="true">
    <div className="cr-cover-art-rings"><div className="cr-cover-art-core"><Leaf strokeWidth={1.4}/></div></div>
    <span className="cr-cover-art-badge cr-cover-art-badge-heart"><HeartPulse strokeWidth={1.8}/></span>
    <span className="cr-cover-art-badge cr-cover-art-badge-food"><Utensils strokeWidth={1.8}/></span>
    <span className="cr-cover-art-badge cr-cover-art-badge-water"><Droplets strokeWidth={1.8}/></span>
  </div>;
}

function ReportSheet({ number, title, icon: Icon, children, report, compact = false, className = "" }: ReportSheetProps) {
  const { branding } = useBranding();
  return <section className={`cr-sheet${compact ? " cr-sheet-compact" : ""}${className ? ` ${className}` : ""}`} aria-label={title}>
    <header className="cr-sheet-header"><div className="cr-sheet-heading"><span className="cr-section-number">{String(number).padStart(2, "0")}</span><Icon size={21} aria-hidden="true"/><h2>{title}</h2></div><BrandMarks className="cr-report-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/></header>
    <div className="cr-sheet-content">{children}</div>
    <footer className="cr-sheet-footer"><span>{branding.displayName} · Clinical nutrition report</span><span>{report.assessment.reference} · {String(number).padStart(2, "0")}</span></footer>
  </section>;
}

const adviceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

function adviceSentences(text: string) {
  return Array.from(adviceSegmenter.segment(text), item => item.segment.trim()).filter(Boolean);
}

function ReviewedAdvice({ title, text, icon: Icon, action = false, columns = false }: { title: string; text: string | undefined; icon: LucideIcon; action?: boolean; columns?: boolean }) {
  if (!text?.trim()) return null;
  const PointIcon = action ? ArrowRight : CircleDot;
  return <section className={`cr-advice-block${action ? " cr-advice-action" : ""}${columns ? " cr-advice-columns" : ""}`}><div className="cr-advice-heading"><span className="cr-advice-icon"><Icon size={20} aria-hidden="true"/></span><h3>{title}</h3></div><ul className="cr-advice-points">{adviceSentences(text).map((sentence, index) => <li key={index}><PointIcon size={15} aria-hidden="true"/><span>{sentence}</span></li>)}</ul></section>;
}

function singleGuidanceTitle(report: GeneratedReport, type: "comorbidity" | "toxicity", fallback: string) {
  const titles = [...new Set(reportGuidance(report, type).map(item => item.title.trim()).filter(Boolean))];
  return titles.length === 1 ? titles[0]! : fallback;
}

function ProductPlan({ report }: { report: GeneratedReport }) {
  const section = reportGuidance(report, "product").find(item => item.title.toLowerCase() === "product plan");
  if (!section) return null;
  const [dose, duration] = section.text.split("\n").map(part => part.trim()).filter(Boolean);
  if (!dose) return null;
  const products = dose.split(/\s+\+\s+/).map(part => {
    const scoop = /^([^:]+):\s*(\d+(?:\.\d+)?)\s+(.+)$/.exec(part);
    if (scoop) return { name: scoop[1]!.trim(), quantity: scoop[2]!, detail: scoop[3]!.trim() };
    const regular = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(part);
    if (regular) return { name: regular[2]!.trim(), quantity: regular[1]!, detail: "per day" };
    return { name: part.trim(), quantity: "", detail: "" };
  });
  return <section className="cr-supplement"><div className="cr-advice-heading"><span className="cr-advice-icon"><Package size={20} aria-hidden="true"/></span><h3>Supplement recommendation</h3></div>
    <div className="cr-supplement-items">{products.map((product, index) => <div className="cr-supplement-item" key={`${product.name}-${index}`}>
      <div><h4>{product.name}</h4>{product.detail && <p>{product.detail}</p>}</div>{product.quantity && <div className="cr-supplement-quantity"><strong>{product.quantity}</strong><span>Quantity</span></div>}
    </div>)}</div>
    {duration && <p className="cr-supplement-duration"><CalendarDays size={17} aria-hidden="true"/><span>Duration</span><strong>{duration}</strong></p>}
  </section>;
}

function targetValue(text: string, label: "energy" | "protein") {
  const match = new RegExp(`${label}[:\\s]*([0-9]+(?:\\.[0-9]+)?\\s*[–-]\\s*[0-9]+(?:\\.[0-9]+)?\\s*${label === "energy" ? "kcal" : "g"}\\s*\\/\\s*kg\\s*\\/\\s*day)`, "i").exec(text);
  return match?.[1]?.replace(/\s+/g, " ") ?? null;
}

function nutritionTargets(report: GeneratedReport) {
  const source = reportGuidance(report, "nutrition").map(item => item.text).join("\n");
  return [
    { label: "Energy target", value: targetValue(source, "energy"), icon: Activity },
    { label: "Protein target", value: targetValue(source, "protein"), icon: BicepsFlexed },
  ].filter((item): item is { label: string; value: string; icon: LucideIcon } => Boolean(item.value));
}

function renalIndividualizationGuidance(report: GeneratedReport) {
  return reportGuidance(report, "comorbidity").find(section =>
    (section.id === "comorbidity_kidney_disease" || /\b(kidney|renal)\b/i.test(section.title)) &&
    /\bindividuali[sz]/i.test(section.text));
}

function WeightTrend({ report }: { report: GeneratedReport }) {
  const weights = cleanWeights(report);
  if (!weights.length) return null;
  const points = weightChartPoints(weights);
  const change = weightChange(report);
  return <section className="cr-panel cr-weight-panel"><div className="cr-panel-title"><h3>Weight trend</h3>{change && <span className={`cr-change ${change.percentage < 0 ? "cr-change-down" : ""}`}>{change.percentage > 0 ? "+" : ""}{change.percentage.toFixed(1)}% from {change.basis}</span>}</div>
    {points.length >= 2 ? <><svg className="cr-weight-chart" viewBox="0 0 600 170" role="img" aria-label={`Weight from ${weights[0]!.kg} kilograms (${weights[0]!.label || reportDate(weights[0]!.date)}) to ${weights[weights.length - 1]!.kg} kilograms (${weights[weights.length - 1]!.label || reportDate(weights[weights.length - 1]!.date)})`}>
      {[45, 88, 130].map(y => <line key={y} x1="45" x2="565" y1={y} y2={y} stroke="#d8e8e8" strokeDasharray="4 5" />)}
      <polygon points={`${points[0]!.x},132 ${points.map(item => `${item.x},${item.y}`).join(" ")} ${points[points.length - 1]!.x},132`} fill="var(--brand-primary, #34b5b9)" opacity=".08" />
      <polyline points={points.map(item => `${item.x},${item.y}`).join(" ")} fill="none" stroke="var(--brand-primary, #34b5b9)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((item, index) => <g key={`${item.date ?? "undated"}-${index}`}><circle cx={item.x} cy={item.y} r="6" fill="white" stroke="var(--brand-primary, #34b5b9)" strokeWidth="3"/><text x={item.x} y={item.y - 14} textAnchor="middle" className="cr-chart-value">{item.kg} kg</text></g>)}
    </svg><div className="cr-chart-dates">{weights.map((item, index) => <span key={`${item.date ?? "undated"}-${index}`}>{item.label || reportDate(item.date)}</span>)}</div></> : <p className="cr-single-weight"><strong>{weights[0]!.kg} kg</strong><span>Recorded {weights[0]!.label || reportDate(weights[0]!.date)}</span></p>}
  </section>;
}

// Measurement-only prose adds little beside the saved values and chart.
function isObservationOnlyFinding(text: string) {
  const mentionsMeasurement = /\b(weight|blood pressure|bp|bmi|heart rate|oxygen|saturation|score|fluid intake|appetite|protein intake)\b/i.test(text);
  const addsClinicalMeaning = /\b(malnutrition|nutritional|dehydration|inadequate|poor intake|reduced intake|treatment|surgery|cancer|diagnosis|symptoms?|requires?|recommend|intervention|monitor|significant|severe|moderate|mild|concerning|abnormal|elevated|outside reference|high blood pressure|low blood pressure|meets|criteria|suggests?|indicates?|consistent with|due to|at risk|urgent|urgency|warrant|assess|review|follow up|concern|impact|impair|referral|escalat|because|therefore)\b/i.test(text);
  return /\d/.test(text) && mentionsMeasurement && !addsClinicalMeaning && text.trim().split(/\s+/).length <= 45;
}

export function GeneratedReportPreview({ report }: { report: GeneratedReport }) {
  const { branding } = useBranding();
  const faceMetrics = report.metrics.filter(metric => metric.source === "face_scan" && metric.id !== "hba1c");
  const faceMetric = (id: string) => faceMetrics.find(metric => metric.id === id);
  const faceScores = ["vital_iq_points", "wellness_score", "health_risk_score"].map(faceMetric).filter((metric): metric is ReportMetric => Boolean(metric));
  const bloodPressure = faceMetric("systolic") && faceMetric("diastolic")
    ? `${faceMetric("systolic")!.value}/${faceMetric("diastolic")!.value}` : null;
  const faceVitals = faceMetrics.filter(metric => ["heart_rate", "oxygen_saturation", "respiratory_rate", ...(bloodPressure ? [] : ["systolic", "diastolic"])].includes(metric.id));
  const faceDetailGroups = reportFaceScanAdditionalMetricGroups.map(group => ({
    ...group,
    metrics: [
      ...group.metrics.map(item => faceMetric(item.id)).filter((metric): metric is ReportMetric => Boolean(metric)),
      ...(group.id === "other" ? ["physiological_score", "mental_wellbeing_score", "stress_band"].map(faceMetric).filter((metric): metric is ReportMetric => Boolean(metric)) : []),
    ],
  })).filter(group => group.metrics.length > 0);
  const assessmentMetrics = report.metrics.filter(metric => metric.source === "assessment");
  const statusMetrics = assessmentMetrics.filter(metric => ["weight_loss_percent", "appetite_status", "fluid_intake", "functional_capacity", "protein_intake"].includes(metric.id));
  const clinicalFinding = report.narrative.keyFindings?.trim();
  const showClinicalFinding = Boolean(clinicalFinding && !isObservationOnlyFinding(clinicalFinding));
  const hasProductPlan = reportGuidance(report, "product").some(item => item.title.toLowerCase() === "product plan");
  const renalGuidance = renalIndividualizationGuidance(report);
  const targets = renalGuidance ? [] : nutritionTargets(report);
  const hasNutritionPage = Boolean(report.narrative.nutritionAdvice?.trim() || report.narrative.treatmentAdvice?.trim() || hasProductPlan || targets.length || renalGuidance);
  const denseNutrition = (report.narrative.nutritionAdvice?.length ?? 0) + (report.narrative.treatmentAdvice?.length ?? 0) > 900;
  const hasCareAdvice = Boolean(report.narrative.conditionAdvice?.trim() || report.narrative.effectsAdvice?.trim());
  const riskColor = riskColorHex(report.classification?.color);
  let page = 0;
  const nextPage = () => ++page;
  const age = reportAge(report.patient.dateOfBirth, report.assessment.completedAt);
  const overviewMetric = (id: string) => assessmentMetrics.find(metric => metric.id === id);
  const overviewNumber = (id: string) => {
    const raw = overviewMetric(id)?.value.trim();
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const height = overviewNumber("height_cm");
  const weight = overviewNumber("current_weight_kg");
  const showBmiReference = Boolean(overviewMetric("bmi") && height && weight);
  const keyMetrics = assessmentMetrics.filter(metric => metric.id === "current_weight_kg" || metric.id === "height_cm");
  const otherMetrics = assessmentMetrics.filter(metric => !["current_weight_kg", "height_cm", ...(showBmiReference ? ["bmi"] : []), ...statusMetrics.map(item => item.id)].includes(metric.id));
  return <article className="clinical-report" aria-label="Generated clinical nutrition report">
    <section className="cr-sheet cr-cover" aria-label="Report cover">
      <div className="cr-cover-top"><BrandMarks className="cr-cover-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/><span>Personalised clinical nutrition</span></div>
      <div className="cr-cover-main"><div className="cr-cover-copy"><h1>Medical<br/><em>Nutrition</em><br/>Therapy Report</h1><p className="cr-cover-name">{report.patient.displayName}</p><p>{report.patient.reference} · {report.assessment.reference}</p>{report.assessment.completedAt && <p>Assessment: {reportDate(report.assessment.completedAt)}</p>}</div>
        <CoverArtwork/>
      </div>
      <footer className="cr-sheet-footer"><span>{branding.displayName}</span><span>01</span></footer>
    </section>
    <ReportSheet number={nextPage() + 1} title="Patient overview" icon={ClipboardList} report={report}>
      <div className="cr-overview-head"><div className="cr-overview-hero"><div className="cr-avatar" aria-hidden="true">{report.patient.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("")}</div><div><h3>{report.patient.displayName}</h3><p>{[report.patient.reference, age === null ? null : `${age} years`, report.patient.gender].filter(Boolean).join(" · ")}</p>{report.assessment.completedAt && <p>Assessment completed {reportDate(report.assessment.completedAt)}</p>}</div></div>
        {keyMetrics.length > 0 && <div className="cr-overview-key">{keyMetrics.map(metric => <div className="cr-metric-card" key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong>{metric.measuredAt && <small>{reportDate(metric.measuredAt)}</small>}</div>)}</div>}
      </div>
      {showBmiReference && <div className="cr-report-bmi"><AssessmentBmiCard answers={{ height_cm: height!, current_weight_kg: weight!, ...(age === null ? {} : {age}) }} showAnchor={false}/></div>}
      {report.narrative.overview && <div className="cr-feature-panel"><span className="cr-kicker">Clinical overview</span><p>{report.narrative.overview}</p></div>}
      {otherMetrics.length > 0 && <div className="cr-overview-observations"><h3>Assessment observations</h3><div className="cr-metric-grid">{otherMetrics.map(metric => <div className="cr-metric-card" key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong>{metric.measuredAt && <small>{reportDate(metric.measuredAt)}</small>}</div>)}</div></div>}
    </ReportSheet>
    {faceMetrics.length > 0 && <ReportSheet number={nextPage() + 1} title="Vital IQ measurements" icon={HeartPulse} report={report}>
      {faceScores.length > 0 && <div className="cr-vital-scores">{faceScores.map(metric => <VitalScoreCard key={metric.id} metric={metric}/>)}</div>}
      {(faceVitals.length > 0 || bloodPressure) && <div className="cr-vital-highlights">{faceVitals.map(metric => <div className={`cr-vital-highlight${metric.outsideReferenceRange ? " cr-vital-outside" : ""}`} key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong>{metric.outsideReferenceRange && metric.referenceRange && <small>Reference: {metric.referenceRange}</small>}</div>)}{bloodPressure && <div className={`cr-vital-highlight${faceMetric("systolic")?.outsideReferenceRange ? " cr-vital-outside" : ""}`}><MetricIcon id="systolic" label="Blood pressure"/><span>Blood pressure</span><strong>{bloodPressure} mmHg</strong>{faceMetric("systolic")?.outsideReferenceRange && faceMetric("systolic")?.referenceRange && <small>Reference: {faceMetric("systolic")!.referenceRange}</small>}</div>}</div>}
      {faceDetailGroups.length > 0 && <div className="cr-vital-detail-grid">{faceDetailGroups.map(group => { const Icon = group.id === "circulation" ? HeartPulse : group.id === "fitness" ? BicepsFlexed : ChartNoAxesCombined; return <section className="cr-vital-detail" key={group.id}><h3><Icon size={17} aria-hidden="true"/>{group.title}</h3><dl>{group.metrics.map(metric => <div key={metric.id}><dt><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span></dt><dd className={metric.outsideReferenceRange ? "cr-vital-outside-value" : undefined}>{metricText(metric)}{metric.outsideReferenceRange && metric.referenceRange && <small>Reference: {metric.referenceRange}</small>}</dd></div>)}</dl></section>; })}</div>}
    </ReportSheet>}
    {(report.classification || report.weightHistory.length > 0 || statusMetrics.length > 0 || showClinicalFinding) && <ReportSheet number={nextPage() + 1} title="Nutrition status and findings" icon={Activity} report={report} compact>
      <div className={`cr-status-overview${statusMetrics.length ? "" : " cr-status-single"}`}>{report.classification && <div className="cr-score-card" style={{ borderColor: riskColor, backgroundColor: `color-mix(in srgb, ${riskColor} 10%, white)` }}><span>Nutrition risk</span><strong style={{ color: riskColor }}>{report.classification.score}</strong><span>NIQ points</span><b style={{ color: riskColor }}>{report.classification.label}</b></div>}
        {statusMetrics.length > 0 && <section className="cr-status-evidence"><h3>Assessment indicators</h3><div className="cr-status-metrics">{statusMetrics.map(metric => <div className="cr-status-metric" key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong></div>)}</div></section>}
      </div>
      {showClinicalFinding && <section className="cr-clinical-interpretation"><h3>Clinical interpretation</h3><p>{clinicalFinding}</p></section>}
      <WeightTrend report={report}/>
    </ReportSheet>}
    {hasNutritionPage && <ReportSheet number={nextPage() + 1} title="Nutrition plan" icon={Utensils} report={report} compact className={`cr-sheet-nutrition${denseNutrition ? " cr-sheet-nutrition-dense" : ""}`}>
      <div className="cr-care-stack">
      {targets.length > 0 && <section className="cr-nutrition-targets"><h3>Daily nutrition targets</h3><div className="cr-nutrition-target-grid">{targets.map(target => { const Icon = target.icon; return <div className="cr-nutrition-target-card" key={target.label}><Icon size={22} aria-hidden="true"/><span>{target.label}</span><strong>{target.value}</strong></div>; })}</div></section>}
      {renalGuidance && <section className="cr-renal-caution"><div className="cr-advice-heading"><span className="cr-advice-icon"><TriangleAlert size={20} aria-hidden="true"/></span><h3>Individualise nutrition targets</h3></div><p>{renalGuidance.text}</p></section>}
      <ReviewedAdvice title="Nutrition guidance" text={report.narrative.nutritionAdvice} icon={Soup} columns/>
      <ProductPlan report={report}/>
      <ReviewedAdvice title="During treatment" text={report.narrative.treatmentAdvice} icon={ShieldCheck} columns/></div>
    </ReportSheet>}
    {(hasCareAdvice || report.narrative.actionSummary || report.narrative.monitoringSummary) && <ReportSheet number={nextPage() + 1} title="Care and next steps" icon={ShieldCheck} report={report} compact className="cr-sheet-care">
      <div className="cr-care-grid"><ReviewedAdvice title={singleGuidanceTitle(report, "comorbidity", "Other health conditions")} text={report.narrative.conditionAdvice} icon={HeartPulse}/>
      <ReviewedAdvice title={singleGuidanceTitle(report, "toxicity", "Treatment effects and nutrition")} text={report.narrative.effectsAdvice} icon={Droplets}/>
      <ReviewedAdvice title="What to do" text={report.narrative.actionSummary} icon={Utensils} action/>
      <ReviewedAdvice title="What to monitor" text={report.narrative.monitoringSummary} icon={ChartNoAxesCombined} action/></div>
    </ReportSheet>}
  </article>;
}
