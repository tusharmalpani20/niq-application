import { Activity, ClipboardList, Droplets, HeartPulse, ShieldCheck, Stethoscope, Utensils, type LucideIcon } from "lucide-react";
import { useBranding } from "@/lib/branding-context";
import { BrandMarks } from "@/components/BrandMarks";
import type { GeneratedReport } from "./generated-report-api";
import { cleanWeights, metricText, reportAge, reportDate, reportGuidance, weightChange } from "./generated-report-format";
import { weightChartPoints } from "./generated-report-chart";
import "./generated-report.css";

type ReportSheetProps = { number: number; title: string; icon: LucideIcon; children: React.ReactNode; report: GeneratedReport };

function ReportSheet({ number, title, icon: Icon, children, report }: ReportSheetProps) {
  const { branding } = useBranding();
  return <section className="cr-sheet" aria-label={title}>
    <header className="cr-sheet-header"><div className="cr-sheet-heading"><span className="cr-section-number">{String(number).padStart(2, "0")}</span><Icon size={21} aria-hidden="true"/><h2>{title}</h2></div><BrandMarks className="cr-report-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/></header>
    <div className="cr-sheet-content">{children}</div>
    <footer className="cr-sheet-footer"><span>{branding.displayName} · Clinical nutrition report</span><span>{report.assessment.reference} · {String(number).padStart(2, "0")}</span></footer>
  </section>;
}

function GuidanceCards({ report, kinds }: { report: GeneratedReport; kinds: Array<GeneratedReport["guidance"]["sections"][number]["kind"]> }) {
  const entries = kinds.flatMap(kind => reportGuidance(report, kind));
  if (!entries.length) return null;
  return <div className="cr-guidance-grid">{entries.map(item => <article className="cr-guidance-card" key={item.id}>
    <p className="cr-guidance-type">{item.kind === "product" ? "Product plan" : item.kind === "radiotherapy" ? "Radiotherapy" : item.kind === "comorbidity" ? "Co-morbidity" : item.kind === "treatment" ? "Treatment" : "Nutrition"}</p>
    <h3>{item.title}</h3><p>{item.text}</p>
  </article>)}</div>;
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

function toxicitySource(item: GeneratedReport["guidance"]["sections"][number]) {
  if (item.matchSource === "assessment_answer") return item.matchedAnswerLabels?.length
    ? `Patient-reported in assessment: ${item.matchedAnswerLabels.join(", ")}` : "Patient-reported in assessment";
  if (item.matchSource === "weight_change") return item.matchedAnswerLabels?.length
    ? `Recorded weight change: ${item.matchedAnswerLabels.join(", ")}` : "Recorded weight change";
  if (item.matchSource === "clinician_confirmation") return "Clinician-confirmed for this patient";
  return "Possible effect from an earlier report";
}

export function GeneratedReportPreview({ report }: { report: GeneratedReport }) {
  const { branding } = useBranding();
  const faceMetrics = report.metrics.filter(metric => metric.source === "face_scan");
  const assessmentMetrics = report.metrics.filter(metric => metric.source === "assessment");
  const toxicities = reportGuidance(report, "toxicity");
  const hasLegacyToxicities = toxicities.some(item => !item.matchSource || item.matchSource === "unknown");
  const hasMatchedToxicities = toxicities.some(item => item.matchSource && item.matchSource !== "unknown");
  const nutritionRules = ["nutrition", "radiotherapy", "product", "comorbidity", "treatment"] as const;
  const hasNutritionGuidance = nutritionRules.some(kind => reportGuidance(report, kind).length > 0);
  let page = 0;
  const nextPage = () => ++page;
  const age = reportAge(report.patient.dateOfBirth, report.assessment.completedAt);
  return <article className="clinical-report" aria-label="Generated clinical nutrition report">
    <section className="cr-sheet cr-cover" aria-label="Report cover">
      <div className="cr-cover-top"><BrandMarks className="cr-cover-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/><span>Personalised clinical nutrition</span></div>
      <div className="cr-cover-main"><div className="cr-cover-copy"><span className="cr-kicker">{report.status === "APPROVED" ? "Approved assessment report" : "Draft for clinical review"}</span><h1>Medical<br/><em>Nutrition</em><br/>Therapy Report</h1><p className="cr-cover-name">{report.patient.displayName}</p><p>{report.patient.reference} · {report.assessment.reference}</p>{report.assessment.completedAt && <p>Assessment: {reportDate(report.assessment.completedAt)}</p>}</div>
        <svg className="cr-cover-art" viewBox="0 0 420 470" aria-hidden="true"><path d="M520 39C338-32 191 85 169 207s55 184 158 248" fill="none" stroke="var(--brand-primary, #34b5b9)" strokeWidth="77" opacity=".13"/><path d="M513 96C390 48 263 127 249 247c-10 91 49 148 132 178" fill="none" stroke="var(--brand-secondary, var(--brand-primary, #34b5b9))" strokeWidth="16" opacity=".65"/><circle cx="304" cy="213" r="57" fill="var(--brand-primary, #34b5b9)" opacity=".17"/><path d="M206 414c9-76 41-113 98-113s89 37 98 113" fill="var(--brand-primary, #34b5b9)" opacity=".22"/></svg>
      </div>
      <div className="cr-cover-bottom"><div><ShieldCheck size={20} aria-hidden="true"/><span>Rule-based guidance</span></div><div><Stethoscope size={20} aria-hidden="true"/><span>{report.status === "APPROVED" ? "Clinician approved" : "Clinical review required"}</span></div><div><HeartPulse size={20} aria-hidden="true"/><span>Built around the assessment</span></div></div>
      <footer className="cr-sheet-footer"><span>{branding.displayName}</span><span>01</span></footer>
    </section>
    <ReportSheet number={nextPage() + 1} title="Patient overview" icon={ClipboardList} report={report}>
      <div className="cr-overview-hero"><div className="cr-avatar" aria-hidden="true">{report.patient.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("")}</div><div><h3>{report.patient.displayName}</h3><p>{[report.patient.reference, age === null ? null : `${age} years`, report.patient.gender].filter(Boolean).join(" · ")}</p>{report.assessment.completedAt && <p>Assessment completed {reportDate(report.assessment.completedAt)}</p>}</div></div>
      {report.narrative.overview && <div className="cr-feature-panel"><span className="cr-kicker">Clinical overview</span><p>{report.narrative.overview}</p></div>}
      {assessmentMetrics.length > 0 && <div className="cr-metric-grid">{assessmentMetrics.map(metric => <div className="cr-metric-card" key={metric.id}><span>{metric.label}</span><strong>{metricText(metric)}</strong>{metric.measuredAt && <small>{reportDate(metric.measuredAt)}</small>}</div>)}</div>}
    </ReportSheet>
    {faceMetrics.length > 0 && <ReportSheet number={nextPage() + 1} title="Vital IQ · Face scan" icon={HeartPulse} report={report}>
      <p className="cr-section-intro">Readings captured with the face scan. NIQ assessment risk is shown separately on the next page.</p>
      <div className="cr-metric-grid cr-vital-grid">{faceMetrics.map(metric => <div className="cr-metric-card" key={metric.id}><Activity size={22} aria-hidden="true"/><span>{metric.label}</span><strong>{metricText(metric)}</strong>{metric.measuredAt && <small>{reportDate(metric.measuredAt)}</small>}</div>)}</div>
    </ReportSheet>}
    {(report.classification || report.weightHistory.length > 0 || report.narrative.keyFindings) && <ReportSheet number={nextPage() + 1} title="Nutrition status & findings" icon={Activity} report={report}>
      <div className="cr-status-row">{report.classification && <div className="cr-score-card"><span>NIQ assessment</span><strong>{report.classification.score}</strong><span>points</span><b>{report.classification.label}</b></div>}{report.narrative.keyFindings && <div className="cr-feature-panel cr-findings"><span className="cr-kicker">Key findings</span><p>{report.narrative.keyFindings}</p></div>}</div>
      <WeightTrend report={report}/>
    </ReportSheet>}
    {hasNutritionGuidance && <ReportSheet number={nextPage() + 1} title="Nutrition & care plan" icon={Utensils} report={report}>
      <p className="cr-section-intro">Guidance matched to this assessment and its saved rule version. A clinician should individualise the plan.</p>
      <GuidanceCards report={report} kinds={[...nutritionRules]}/>
    </ReportSheet>}
    {toxicities.length > 0 && <ReportSheet number={nextPage() + 1} title={hasMatchedToxicities ? "Matched treatment effects & nutrition guidance" : "Possible treatment effects · earlier report"} icon={Droplets} report={report}>
      {hasMatchedToxicities && <p className="cr-section-intro">This nutrition guidance follows assessment answers, recorded weight change, or clinician confirmation. It does not establish that treatment caused an effect.</p>}
      {hasLegacyToxicities && <p className="cr-caution">Some guidance in this earlier report lists possible drug-class effects. Those entries are not confirmed symptoms for this patient.</p>}
      <div className="cr-toxicity-list">{toxicities.map(item => <div className="cr-toxicity-row" key={item.id}><div><span className="cr-guidance-type">{item.drugClass || "Selected drug class"}</span><h3>{item.title}</h3><small>{toxicitySource(item)}</small></div><p>{item.text}</p></div>)}</div>
    </ReportSheet>}
    {(report.narrative.actionSummary || report.narrative.monitoringSummary) && <ReportSheet number={nextPage() + 1} title="Action plan & monitoring" icon={ShieldCheck} report={report}>
      <div className="cr-action-grid">{report.narrative.actionSummary && <section className="cr-panel"><div className="cr-panel-title"><h3>Action plan</h3><Utensils size={20} aria-hidden="true"/></div><p>{report.narrative.actionSummary}</p></section>}{report.narrative.monitoringSummary && <section className="cr-panel"><div className="cr-panel-title"><h3>What to monitor</h3><HeartPulse size={20} aria-hidden="true"/></div><p>{report.narrative.monitoringSummary}</p></section>}</div>
      <div className="cr-review-note"><ShieldCheck size={20} aria-hidden="true"/><p>This report was prepared from a saved assessment and rule version. Review new or worsening symptoms with the treating clinical team.</p></div>
    </ReportSheet>}
  </article>;
}
