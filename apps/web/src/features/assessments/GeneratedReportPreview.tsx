import { Activity, BicepsFlexed, Calculator, ChartNoAxesCombined, ClipboardList, Droplets, Gauge, HeartPulse, Leaf, Package, Ruler, Scale, ShieldCheck, Soup, Stethoscope, TrendingDown, Utensils, Wind, type LucideIcon } from "lucide-react";
import { reportFaceScanAdditionalMetricGroups, riskColorHex } from "@niq/application-contracts";
import { useBranding } from "@/lib/branding-context";
import { BrandMarks } from "@/components/BrandMarks";
import { AssessmentBmiCard } from "./AssessmentBmiCard";
import type { GeneratedReport } from "./generated-report-api";
import { cleanWeights, metricText, reportAge, reportDate, reportGuidance, weightChange } from "./generated-report-format";
import { weightChartPoints } from "./generated-report-chart";
import "./generated-report.css";

type ReportSheetProps = { number: number; title: string; icon: LucideIcon; children: React.ReactNode; report: GeneratedReport };
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

function ReportSheet({ number, title, icon: Icon, children, report }: ReportSheetProps) {
  const { branding } = useBranding();
  return <section className="cr-sheet" aria-label={title}>
    <header className="cr-sheet-header"><div className="cr-sheet-heading"><span className="cr-section-number">{String(number).padStart(2, "0")}</span><Icon size={21} aria-hidden="true"/><h2>{title}</h2></div><BrandMarks className="cr-report-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/></header>
    <div className="cr-sheet-content">{children}</div>
    <footer className="cr-sheet-footer"><span>{branding.displayName} · Clinical nutrition report</span><span>{report.assessment.reference} · {String(number).padStart(2, "0")}</span></footer>
  </section>;
}

function ReviewedAdvice({ title, text }: { title: string; text: string | undefined }) {
  if (!text?.trim()) return null;
  return <article className="cr-guidance-card"><h3>{title}</h3><p>{text}</p></article>;
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
  return <section className="cr-panel"><div className="cr-panel-title"><h3>Products in your plan</h3><Utensils size={20} aria-hidden="true"/></div>
    <div className="cr-metric-grid">{products.map((product, index) => <div className="cr-metric-card" key={`${product.name}-${index}`}>
      <span className="cr-metric-icon"><Package size={22} aria-hidden="true" /></span><span>{product.name}</span>{product.quantity && <strong>{product.quantity}</strong>}{product.detail && <small>{product.detail}</small>}
    </div>)}</div>
    {duration && <p>{duration}</p>}
  </section>;
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
  const hasProductPlan = reportGuidance(report, "product").some(item => item.title.toLowerCase() === "product plan");
  const hasNutritionGuidance = Boolean(report.narrative.nutritionAdvice?.trim() || report.narrative.treatmentAdvice?.trim() || hasProductPlan);
  const hasCareAdvice = Boolean(report.narrative.conditionAdvice?.trim() || report.narrative.effectsAdvice?.trim());
  const isFinal = report.status === "READY" || report.status === "APPROVED";
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
  const otherMetrics = assessmentMetrics.filter(metric => !["current_weight_kg", "height_cm", ...(showBmiReference ? ["bmi"] : [])].includes(metric.id));
  return <article className="clinical-report" aria-label="Generated clinical nutrition report">
    <section className="cr-sheet cr-cover" aria-label="Report cover">
      <div className="cr-cover-top"><BrandMarks className="cr-cover-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/><span>Personalised clinical nutrition</span></div>
      <div className="cr-cover-main"><div className="cr-cover-copy"><span className="cr-kicker">{isFinal ? "Final clinical report" : "Draft for clinical review"}</span><h1>Medical<br/><em>Nutrition</em><br/>Therapy Report</h1><p className="cr-cover-name">{report.patient.displayName}</p><p>{report.patient.reference} · {report.assessment.reference}</p>{report.assessment.completedAt && <p>Assessment: {reportDate(report.assessment.completedAt)}</p>}</div>
        <CoverArtwork/>
      </div>
      <div className="cr-cover-bottom"><div><ShieldCheck size={20} aria-hidden="true"/><span>Assessment findings</span></div><div><Stethoscope size={20} aria-hidden="true"/><span>{isFinal ? "Assessment approved" : "Clinical review required"}</span></div><div><HeartPulse size={20} aria-hidden="true"/><span>Built around the assessment</span></div></div>
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
      {faceDetailGroups.length > 0 && <div className="cr-vital-detail-grid">{faceDetailGroups.map(group => { const Icon = group.id === "circulation" ? HeartPulse : group.id === "fitness" ? BicepsFlexed : ChartNoAxesCombined; return <section className="cr-vital-detail" key={group.id}><h3><Icon size={17} aria-hidden="true"/>{group.title}</h3><dl>{group.metrics.map(metric => <div key={metric.id}><dt>{metric.label}</dt><dd className={metric.outsideReferenceRange ? "cr-vital-outside-value" : undefined}>{metricText(metric)}{metric.outsideReferenceRange && metric.referenceRange && <small>Reference: {metric.referenceRange}</small>}</dd></div>)}</dl></section>; })}</div>}
    </ReportSheet>}
    {(report.classification || report.weightHistory.length > 0 || report.narrative.keyFindings) && <ReportSheet number={nextPage() + 1} title="Nutrition status & findings" icon={Activity} report={report}>
      <div className="cr-status-row">{report.classification && <div className="cr-score-card" style={{ borderColor: riskColor, backgroundColor: `color-mix(in srgb, ${riskColor} 10%, white)` }}><span>NIQ assessment</span><strong style={{ color: riskColor }}>{report.classification.score}</strong><span>points</span><b style={{ color: riskColor }}>{report.classification.label}</b></div>}{report.narrative.keyFindings && <div className="cr-feature-panel cr-findings"><span className="cr-kicker">Key findings</span><p>{report.narrative.keyFindings}</p></div>}</div>
      <WeightTrend report={report}/>
    </ReportSheet>}
    {hasNutritionGuidance && <ReportSheet number={nextPage() + 1} title="Nutrition & care plan" icon={Utensils} report={report}>
      <div className="cr-guidance-grid"><ReviewedAdvice title="Nutrition guidance" text={report.narrative.nutritionAdvice}/><ReviewedAdvice title="During treatment" text={report.narrative.treatmentAdvice}/></div>
      <ProductPlan report={report}/>
    </ReportSheet>}
    {(hasCareAdvice || report.narrative.actionSummary || report.narrative.monitoringSummary) && <ReportSheet number={nextPage() + 1} title="Care and next steps" icon={ShieldCheck} report={report}>
      {hasCareAdvice && <div className="cr-guidance-grid"><ReviewedAdvice title="Other health conditions" text={report.narrative.conditionAdvice}/><ReviewedAdvice title="Treatment effects and nutrition" text={report.narrative.effectsAdvice}/></div>}
      <div className="cr-action-grid">{report.narrative.actionSummary && <section className="cr-panel"><div className="cr-panel-title"><h3>Action plan</h3><Utensils size={20} aria-hidden="true"/></div><p>{report.narrative.actionSummary}</p></section>}{report.narrative.monitoringSummary && <section className="cr-panel"><div className="cr-panel-title"><h3>What to monitor</h3><HeartPulse size={20} aria-hidden="true"/></div><p>{report.narrative.monitoringSummary}</p></section>}</div>
      <div className="cr-review-note"><ShieldCheck size={20} aria-hidden="true"/><p>This report was prepared from a saved assessment and rule version. Review new or worsening symptoms with the treating clinical team.</p></div>
    </ReportSheet>}
  </article>;
}
