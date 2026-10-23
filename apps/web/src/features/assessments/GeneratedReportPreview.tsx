import { Activity, BicepsFlexed, Brain, Calculator, CalendarDays, ChartNoAxesCombined, CircleDot, ClipboardCheck, ClipboardList, ClipboardPlus, Crosshair, Droplets, Drumstick, Egg, FileSearch, Flame, FlaskConical, createLucideIcon, Gauge, HandHeart, HeartPulse, Leaf, ListChecks, Package, Pill, Radiation, Ruler, Scale, ShieldCheck, ShieldPlus, Soup, Sprout, Stethoscope, TriangleAlert, TrendingDown, Utensils, Wind, type LucideIcon } from "lucide-react";
import { reportFaceScanAdditionalMetricGroups, riskColorHex } from "@niq/application-contracts";
import { useBranding } from "../../lib/branding-context";
import type { TenantBranding } from "../../lib/branding";
import { BrandMarks } from "../../components/BrandMarks";
import { AssessmentBmiCard } from "./AssessmentBmiCard";
import type { GeneratedReport } from "./generated-report-api";
import { metricText, nutritionTargetValue, reportAge, reportDate, reportGuidance } from "./generated-report-format";
import { WeightTrend } from "./GeneratedReportWeightTrend";
import { ProductRecommendationCards } from "./ProductRecommendationCards";
import { formatGenderAnswer } from "./formatGenderAnswer";
import { readableClosingSummary, isSymptomCareReference, patientReportedCare, readableReportEmphasis, withoutRepeatedTargets } from "./report-readability";
import "./generated-report.css";

type ReportBranding = Required<TenantBranding>;
type ReportSheetProps = { number: number; title: string; icon: LucideIcon; children: React.ReactNode; report: GeneratedReport; branding: ReportBranding; compact?: boolean; className?: string };
type ReportMetric = GeneratedReport["metrics"][number];

const WalkingPerson = createLucideIcon("WalkingPerson", [
  ["circle", { cx: "14", cy: "4", r: "2", key: "head" }],
  ["path", { d: "m7 21 4-7m5 7-3-8m-7-4 5-3 4 4 4 1m-8-5-1 6", key: "walk" }],
]);

const WeighingScale = createLucideIcon("WeighingScale", [
  ["rect", { x: "4", y: "3", width: "16", height: "18", rx: "3", key: "body" }],
  ["path", { d: "M8 8a4 4 0 0 1 8 0v2H8Z", key: "dial" }],
  ["path", { d: "m12 8 2-2M8 14v3m8-3v3", key: "indicator" }],
]);

const metricIcons: Record<string, LucideIcon> = {
  current_weight_kg: WeighingScale,
  height_cm: Ruler,
  bmi: Calculator,
  weight_loss_percent: TrendingDown,
  appetite_status: Soup,
  fluid_intake: Droplets,
  functional_capacity: WalkingPerson,
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
  return <span className="cr-metric-icon"><Icon size={22} style={id === "current_weight_kg" ? { width: 22, height: 22 } : undefined} aria-hidden="true" /></span>;
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
    <img src="/report-cover-food.webp" alt="" />
  </div>;
}

function reportFooterLabel(report: GeneratedReport, branding: ReportBranding) {
  return [branding.displayName, report.assessment.facilityName, report.assessment.reference]
    .filter(part => part?.trim()).join(" · ");
}

function ReportSheet({ number, title, icon: Icon, children, report, branding, compact = false, className = "" }: ReportSheetProps) {
  return <section className={`cr-sheet${compact ? " cr-sheet-compact" : ""}${className ? ` ${className}` : ""}`} aria-label={title}>
    <header className="cr-sheet-header"><div className="cr-sheet-heading"><Icon size={21} aria-hidden="true"/><h2>{title}</h2></div><BrandMarks className="cr-report-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/></header>
    <div className="cr-sheet-content"><div className="cr-content-title"><Icon size={21} aria-hidden="true"/><h2>{title}</h2></div>{children}</div>
    <footer className="cr-sheet-footer"><span>{reportFooterLabel(report, branding)}</span><span>{String(number).padStart(2, "0")}</span></footer>
  </section>;
}

const adviceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

function adviceSentences(text: string) {
  // Keep punctuation inside an emphasized phrase from splitting its ** markers.
  const highlights: string[] = [];
  const protectedText = text.replace(/\*\*[^*]+\*\*/g, match => {
    const token = `NARRATIVEHIGHLIGHT${highlights.length}TOKEN`;
    highlights.push(match);
    // Retain sentence boundaries when the terminal punctuation is inside bold.
    return /[.!?]\*\*$/u.test(match) ? `${token}.` : token;
  });
  // Explicit line breaks in reviewed advice separate points even when a line
  // has no terminal punctuation. Segment each line independently so a missing
  // full stop cannot merge adjacent recommendations into one bullet.
  return protectedText.split(/\r?\n/).flatMap(line => Array.from(adviceSegmenter.segment(line), item => item.segment.trim()))
    .filter(Boolean)
    .map(sentence => sentence.replace(/NARRATIVEHIGHLIGHT(\d+)TOKEN(\.)?/g, (_, index: string, dot: string | undefined) => {
      const marked = highlights[Number(index)] ?? "";
      return marked + (/[.!?]\*\*$/u.test(marked) ? "" : dot ?? "");
    }));
}

function summarySentences(text: string | undefined, count: number) {
  return adviceSentences(text ?? "").slice(0, count);
}

function interpretationParagraphs(values: Array<string | undefined>) {
  const seenFirstLines = new Set<string>();
  const paragraphs = values.filter((value): value is string => Boolean(value?.trim()));
  const status = paragraphs.find(value => /^(?:Well nourished|Moderately nourished|Severely malnourished)$/i.test(value.trim()));
  const rendered = status && paragraphs.some(value => value !== status && value.replace(/\*\*/g, "").toLocaleLowerCase().includes(status.toLocaleLowerCase()))
    ? paragraphs.filter(value => value !== status) : paragraphs;
  return rendered.flatMap(value => {
    const text = value.trim();
    if (!text) return [];
    const sentences = adviceSentences(text);
    const first = (sentences[0] ?? text).replace(/\*\*/g, "").replace(/^\s*(?:your\s+)?(?:nutritional status|clinical interpretation)\s*(?::|is|was recorded as)\s*/i, "").trim();
    const key = first.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (key && seenFirstLines.has(key)) {
      const remaining = sentences.slice(1).join(" ").trim();
      return remaining ? [remaining] : [];
    }
    if (key) seenFirstLines.add(key);
    return [text];
  });
}

// Render authored markdown as React text nodes so saved content cannot become HTML.
function NarrativeText({ text, formatted = false }: { text: string; formatted?: boolean }) {
  const parts = (formatted ? text : readableReportEmphasis(text)).split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong className="cr-narrative-emphasis" key={index}>{part.slice(2, -2)}</strong>
    : part)}</>;
}

type AdviceGroup = { heading?: string; text: string };
const legacyConditionHeading = /^(?:diabetes|thyroid(?: disease| disorder)?|kidney disease|chronic kidney disease|renal disease|hypertension|high blood pressure|cardiovascular disease|heart disease|dyslipidaemia|dyslipidemia|liver disease|celiac disease|coeliac disease|reflux|gastroesophageal reflux|gout|osteoporosis|anaemia|anemia)(?:\s+(?:management|care|guidance|considerations?))?$/i;

function adviceGroups(text: string): AdviceGroup[] {
  const groups: AdviceGroup[] = [];
  let current: AdviceGroup = { text: "" };
  const flush = () => { if (current.text.trim()) groups.push({ ...current, text: current.text.trim() }); };
  for (const line of text.split(/\r?\n/)) {
    const markdown = /^\s*#{2,3}\s+(.+?)\s*$/.exec(line);
    const legacy = /^\s*([^:\n]{2,48}):\s*(.*)$/.exec(line);
    const standaloneLegacy = /^\s*([^:\n]{2,48})\s*$/.exec(line);
    const heading = markdown?.[1]?.trim()
      ?? (legacy && legacyConditionHeading.test(legacy[1]!.trim()) ? legacy[1]!.trim() : null)
      ?? (standaloneLegacy && legacyConditionHeading.test(standaloneLegacy[1]!.trim()) ? standaloneLegacy[1]!.trim() : null);
    if (heading) {
      flush();
      current = { heading, text: legacy?.[2]?.trim() ?? "" };
      continue;
    }
    current.text += `${current.text ? "\n" : ""}${line.trim().replace(/^[-*•]\s+/, "")}`;
  }
  flush();
  return groups.length ? groups : [{ text }];
}

function ReviewedAdvice({ title, text, icon: Icon, action = false, columns = false, id }: { title: string; text: string | undefined; icon: LucideIcon; action?: boolean; columns?: boolean; id?: string }) {
  if (!text?.trim()) return null;
  const PointIcon = CircleDot;
  return <section id={id} className={`cr-advice-block${action ? " cr-advice-action" : ""}${columns ? " cr-advice-columns" : ""}`}><div className="cr-advice-heading"><span className="cr-advice-icon"><Icon size={20} aria-hidden="true"/></span><h3>{title}</h3></div>{adviceGroups(readableReportEmphasis(text)).map((group, groupIndex) => <div className="cr-advice-group" key={groupIndex}>{group.heading && <h4>{group.heading}</h4>}<ul className="cr-advice-points">{adviceSentences(group.text).map((sentence, index) => <li key={index}><PointIcon size={15} aria-hidden="true"/><span><NarrativeText text={sentence} formatted/></span></li>)}</ul></div>)}</section>;
}

function singleGuidanceTitle(report: GeneratedReport, type: "comorbidity" | "toxicity", fallback: string) {
  const titles = [...new Set(reportGuidance(report, type)
    .filter(item => item.certainty !== "possible").map(item => item.title.trim()).filter(Boolean))];
  return titles.length === 1 ? titles[0]! : fallback;
}

function possibleEffectPages(report: GeneratedReport) {
  const sections = reportGuidance(report, "toxicity").filter(item => item.certainty === "possible");
  const pages: typeof sections[] = [];
  let current: typeof sections = [];
  let characters = 0;
  for (const section of sections) {
    const length = section.title.length + section.text.length;
    if (current.length && (current.length >= 3 || characters + length > 900)) {
      pages.push(current);
      current = [];
      characters = 0;
    }
    current.push(section);
    characters += length;
  }
  if (current.length) pages.push(current);
  return pages;
}

function ProductPlan({ report }: { report: GeneratedReport }) {
  const selected = report.productPlans?.filter(plan => plan.items.length) ?? [];
  const readableDuration = (duration: string) => duration.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date => reportDate(date));
  if (selected.length) return <ProductRecommendationCards report={report} plans={selected}/>;
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
  return <section className="cr-supplement"><div className="cr-advice-heading"><span className="cr-advice-icon"><Package size={20} aria-hidden="true"/></span><h3>Nutritional supplement recommendations</h3></div>
    <div className="cr-supplement-cards">{products.map((product, index) => <article className="cr-supplement-card" key={`${product.name}-${index}`}><h4>{product.name}</h4><dl>
      <div><dt>Dose</dt><dd>{product.quantity || "—"}</dd></div><div><dt>Timing</dt><dd>{product.detail || "—"}</dd></div><div><dt>Preparation</dt><dd>—</dd></div><div><dt>Duration</dt><dd>{readableDuration(duration || "—")}</dd></div><div className="cr-supplement-benefits"><dt>Key benefits</dt><dd>—</dd></div>
    </dl></article>)}</div>
    {duration && <p className="cr-supplement-duration"><CalendarDays size={17} aria-hidden="true"/><span>Duration</span><strong>{readableDuration(duration)}</strong></p>}
  </section>;
}

function clinicalFactIcon(label: string, value: string): LucideIcon {
  const normalized = label.toLowerCase();
  const answer = value.toLowerCase();
  if (normalized.includes("diagnosis")) return Stethoscope;
  if (normalized.includes("stage")) return ChartNoAxesCombined;
  if (normalized.includes("treatment") && normalized.includes("start")) return CalendarDays;
  if (normalized.includes("treatment status")) {
    if (answer.includes("newly diagnosed")) return ClipboardPlus;
    if (answer.includes("post")) return ClipboardCheck;
    if (answer.includes("palliative")) return HandHeart;
    return Stethoscope;
  }
  if (normalized.includes("treatment")) {
    if (answer.includes("chemotherapy")) return FlaskConical;
    if (answer.includes("immunotherapy")) return ShieldPlus;
    if (answer.includes("radiation") || answer.includes("radiotherapy")) return Radiation;
    if (answer.includes("targeted")) return Crosshair;
    if (answer.includes("hormonal") || answer.includes("hormone")) return Droplets;
    return Stethoscope;
  }
  if (normalized.includes("drug")) return Pill;
  if (normalized.includes("condition") || normalized.includes("morbid")) return ClipboardList;
  if (normalized.includes("diet")) {
    if (answer.includes("non-vegetarian")) return Drumstick;
    if (answer.includes("vegetarian")) return Sprout;
    if (answer.includes("eggetarian")) return Egg;
    return Leaf;
  }
  if (normalized.includes("symptom")) return HeartPulse;
  return CircleDot;
}

const clinicalFactLabels: Record<string, string> = {
  diet: "Diet Preference",
  "planned treatment start": "Treatment Start Date",
  "other conditions": "Co-morbidities",
  "reported symptoms": "Patient reported symptoms",
};

function ClinicalFacts({ report }: { report: GeneratedReport }) {
  if (!report.clinicalFacts?.length) return null;
  return <section className="cr-clinical-facts"><h3>Clinical background</h3><dl>{report.clinicalFacts.map(fact => {
    const label = clinicalFactLabels[fact.label.trim().toLowerCase()] ?? fact.label;
    const Icon = clinicalFactIcon(label, fact.value);
    return <div key={fact.label}><dt><span className="cr-clinical-fact-icon" aria-hidden="true"><Icon size={15}/></span>{label}</dt><dd>{fact.value}</dd></div>;
  })}</dl></section>;
}

function nutritionTargets(report: GeneratedReport) {
  return [
    { label: "Energy target", value: nutritionTargetValue(report, "energy"), icon: Flame },
    { label: "Protein target", value: nutritionTargetValue(report, "protein"), icon: BicepsFlexed },
  ].filter((item): item is { label: string; value: string; icon: LucideIcon } => Boolean(item.value));
}

function renalIndividualizationGuidance(report: GeneratedReport) {
  return reportGuidance(report, "comorbidity").find(section =>
    (section.id === "comorbidity_kidney_disease" || /\b(kidney|renal)\b/i.test(section.title)) &&
    /\bindividuali[sz]/i.test(section.text));
}

// Measurement-only prose adds little beside the saved values and chart.
function isObservationOnlyFinding(text: string) {
  const mentionsMeasurement = /\b(weight|blood pressure|bp|bmi|heart rate|oxygen|saturation|score|fluid intake|appetite|protein intake)\b/i.test(text);
  const addsClinicalMeaning = /\b(malnutrition|nutritional|nutrition (?:support|care|risk)|dehydration|inadequate|poor intake|reduced intake|treatment|surgery|cancer|diagnosis|symptoms?|requires?|recommend|intervention|monitor(?:s|ed|ing)?|watch(?:es|ed|ing)?|prevent(?:s|ed|ing)?|protect|priorit(?:y|ies)|significant|severe|moderate|mild|concerning|abnormal|elevated|outside reference|high blood pressure|low blood pressure|meets|criteria|suggests?|indicates?|consistent with|due to|at risk|urgent|urgency|warrant|assess|review|follow up|concern|impact|impair|referral|escalat|because|therefore)\b/i.test(text);
  return /\d/.test(text) && mentionsMeasurement && !addsClinicalMeaning && text.trim().split(/\s+/).length <= 45;
}

function GeneratedReportPreviewWithContext({ report }: { report: GeneratedReport }) {
  const { branding } = useBranding();
  return <GeneratedReportPreviewContent report={report} branding={branding}/>;
}

export function GeneratedReportPreview({ report, branding }: { report: GeneratedReport; branding?: ReportBranding }) {
  return branding
    ? <GeneratedReportPreviewContent report={report} branding={branding}/>
    : <GeneratedReportPreviewWithContext report={report}/>;
}

function GeneratedReportPreviewContent({ report, branding }: { report: GeneratedReport; branding: ReportBranding }) {
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
  const hasProductPlan = Boolean(report.productPlans?.some(plan => plan.items.length)) || reportGuidance(report, "product").some(item => item.title.toLowerCase() === "product plan");
  const renalGuidance = renalIndividualizationGuidance(report);
  const targets = renalGuidance ? [] : nutritionTargets(report);
  const hasNutritionPage = Boolean(report.narrative.nutritionAdvice?.trim() || report.narrative.treatmentAdvice?.trim() || hasProductPlan || targets.length || renalGuidance);
  const denseNutrition = (report.narrative.nutritionAdvice?.length ?? 0) + (report.narrative.treatmentAdvice?.length ?? 0) > 900;
  const hasConditionAdvice = Boolean(report.narrative.conditionAdvice?.trim());
  const hasRecommendations = Boolean(report.narrative.effectsAdvice?.trim() || report.narrative.foodSafetyAdvice?.trim() || report.narrative.actionSummary?.trim() || report.narrative.monitoringSummary?.trim());
  const possibleSections = reportGuidance(report, "toxicity").filter(item => item.certainty === "possible");
  const antimetaboliteSections = possibleSections.filter(item => /antimetabolite/i.test(item.drugClass ?? ""));
  const otherPossiblePages = possibleEffectPages(report).map(sections => sections.filter(item => !antimetaboliteSections.includes(item))).filter(sections => sections.length);
  const conditionTitle = singleGuidanceTitle(report, "comorbidity", "Condition-specific guidance");
  // Legacy saved references can reuse the recorded care, without removing it
  // from Recommendations. Newly generated cards contain their own full advice.
  const reportedCare = patientReportedCare(report.narrative.effectsAdvice);
  const reportedSymptomEvidence = (report.narrativeEvidence?.effectsAdvice ?? []).filter(id => /^fact:(?:assessment_(?:gastrointestinal_symptoms|dietary_symptoms)_|clinician_toxicity_)/.test(id));
  const recordedMouthOnly = report.clinicalFacts?.some(fact => /^(?:Patient reported symptoms|Reported symptoms)$/i.test(fact.label) && /^(?:Mouth Ulcers\s*\/\s*Mucositis|Mouth sores|Mouth ulcers|Mucositis)$/i.test(fact.value.trim())) ?? false;
  const mouthCareEvidence = recordedMouthOnly || reportedSymptomEvidence.length > 0 && reportedSymptomEvidence.every(id => /mouth|mucositis/i.test(id));
  const showRecommendations = hasRecommendations;
  const possibleEffectBody = (section: GeneratedReport["guidance"]["sections"][number]) => {
    const text = isSymptomCareReference(section.text) && /mouth|mucositis/i.test(section.title) && mouthCareEvidence && reportedCare
      ? reportedCare : section.text;
    return <ul className="cr-advice-points">{adviceSentences(readableReportEmphasis(text)).map((sentence, index) =>
      <li key={index}><CircleDot size={15} aria-hidden="true"/><span><NarrativeText text={sentence} formatted/></span></li>)}</ul>;
  };
  const hasInterpretation = Boolean(report.narrative.overview?.trim() || showClinicalFinding || report.nutritionalStatus?.trim());
  // Saved reports predating the reviewed closing synthesis still get a short
  // recap drawn only from their already-reviewed narrative passages.
  const overallSummary = report.narrative.overallSummary?.trim() || [
    showClinicalFinding ? clinicalFinding : report.narrative.overview,
    report.narrative.nutritionAdvice,
    report.narrative.actionSummary,
    report.narrative.monitoringSummary,
  ].flatMap(text => summarySentences(text, 1)).slice(0, 4).join(" ");
  const savedTreatmentDateIsFuture = Boolean(report.decision.plannedTreatmentStartDate && report.assessment.completedAt && report.decision.plannedTreatmentStartDate > report.assessment.completedAt.slice(0, 10));
  const plannedTreatment = savedTreatmentDateIsFuture || (report.clinicalFacts?.some(fact => /^planned treatment$/i.test(fact.label)) ?? false);
  const summaryFacts = report.clinicalFacts?.filter(fact => /^(diagnosis|treatment status|current treatment|planned treatment|treatment start date)$/i.test(fact.label)).slice(0, 4) ?? [];
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
  const coverage = report.assessmentAnswerCoverage;
  // Round down so an incomplete form is never presented as 100% complete.
  const completionPercentage = coverage && coverage.total > 0
    ? Math.floor(Math.min(coverage.total, Math.max(0, coverage.answered)) * 100 / coverage.total)
    : null;
  const keyMetrics = assessmentMetrics.filter(metric => metric.id === "current_weight_kg" || metric.id === "height_cm");
  const otherMetrics = assessmentMetrics.filter(metric => !["current_weight_kg", "height_cm", ...(showBmiReference ? ["bmi"] : []), ...statusMetrics.map(item => item.id)].includes(metric.id));
  const observationGroups = [...new Set(otherMetrics.map(metric => metric.label))].map(label => ({
    label: label === "Reported dietary symptom" ? "Reported dietary symptoms" : label,
    values: otherMetrics.filter(metric => metric.label === label).map(metricText).join(", "),
  }));
  return <article className="clinical-report" aria-label="Generated clinical nutrition report">
    <section className="cr-sheet cr-cover" aria-label="Report cover">
      <div className="cr-cover-top"><BrandMarks className="cr-cover-brand" organizationLogoUrl={branding.logoUrl} organizationName={branding.displayName}/></div>
      <div className="cr-cover-main"><div className="cr-cover-copy"><h1>Nutritional<br/><em>Assessment</em><br/>Protocol Report</h1><p className="cr-cover-tagline">Precision Nutrition Assessment for Better Cancer Care</p><p className="cr-cover-name">{report.patient.displayName}</p><p>{report.patient.reference} · {report.assessment.reference}</p>{report.assessment.completedAt && <p>Assessment: {reportDate(report.assessment.completedAt)}</p>}</div>
        <CoverArtwork/>
      </div>
      <footer className="cr-sheet-footer"><span>{reportFooterLabel(report, branding)}</span><span>01</span></footer>
    </section>
    <ReportSheet number={nextPage() + 1} title="Patient overview" icon={ClipboardList} report={report} branding={branding}>
      <div className="cr-overview-head"><div className="cr-overview-hero"><div className="cr-avatar" aria-hidden="true">{report.patient.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("")}</div><div><h3>{report.patient.displayName}</h3><p>{[report.patient.reference, age === null ? null : `${age} years`, report.patient.gender ? formatGenderAnswer(report.patient.gender) : null].filter(Boolean).join(" · ")}</p>{report.assessment.completedAt && <p>Assessment completed {reportDate(report.assessment.completedAt)}</p>}</div></div>
        {keyMetrics.length > 0 && <div className="cr-overview-key">{keyMetrics.map(metric => <div className="cr-metric-card" key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong></div>)}</div>}
      </div>
      {completionPercentage !== null && <p className="cr-answer-coverage"><ClipboardCheck size={17} aria-hidden="true"/><span>This report is based on an assessment that was <strong>{completionPercentage}% complete</strong>.</span></p>}
      {showBmiReference && <div className="cr-report-bmi"><AssessmentBmiCard answers={{ height_cm: height!, current_weight_kg: weight!, ...(age === null ? {} : {age}) }} showAnchor={false}/></div>}
      <ClinicalFacts report={report}/>
    </ReportSheet>
    {faceMetrics.length > 0 && <ReportSheet number={nextPage() + 1} title="Vital IQ measurements" icon={HeartPulse} report={report} branding={branding} className="cr-sheet-vital">
      {faceScores.length > 0 && <div className="cr-vital-scores">{faceScores.map(metric => <VitalScoreCard key={metric.id} metric={metric}/>)}</div>}
      {(faceVitals.length > 0 || bloodPressure) && <div className="cr-vital-highlights">{faceVitals.map(metric => <div className={`cr-vital-highlight${metric.outsideReferenceRange ? " cr-vital-outside" : ""}`} key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong>{metric.outsideReferenceRange && metric.referenceRange && <small>Reference: {metric.referenceRange}</small>}</div>)}{bloodPressure && <div className={`cr-vital-highlight${faceMetric("systolic")?.outsideReferenceRange ? " cr-vital-outside" : ""}`}><MetricIcon id="systolic" label="Blood pressure"/><span>Blood pressure</span><strong>{bloodPressure} mmHg</strong>{faceMetric("systolic")?.outsideReferenceRange && faceMetric("systolic")?.referenceRange && <small>Reference: {faceMetric("systolic")!.referenceRange}</small>}</div>}</div>}
      {faceDetailGroups.length > 0 && <div className="cr-vital-detail-grid">{faceDetailGroups.map(group => { const Icon = group.id === "circulation" ? HeartPulse : group.id === "fitness" ? BicepsFlexed : ChartNoAxesCombined; return <section className="cr-vital-detail" key={group.id}><h3><Icon size={17} aria-hidden="true"/>{group.title}</h3><dl>{group.metrics.map(metric => <div key={metric.id}><dt><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span></dt><dd className={metric.outsideReferenceRange ? "cr-vital-outside-value" : undefined}>{metricText(metric)}{metric.outsideReferenceRange && metric.referenceRange && <small>Reference: {metric.referenceRange}</small>}</dd></div>)}</dl></section>; })}</div>}
    </ReportSheet>}
    {(report.classification || report.weightHistory.length > 0 || statusMetrics.length > 0 || observationGroups.length > 0 || hasInterpretation) && <ReportSheet number={nextPage() + 1} title="Nutrition status" icon={Gauge} report={report} branding={branding} compact>
      <div className={`cr-status-overview${statusMetrics.length || observationGroups.length ? "" : " cr-status-single"}`}>{report.classification && <div className="cr-score-card" style={{ borderColor: riskColor, backgroundColor: `color-mix(in srgb, ${riskColor} 10%, white)` }}><strong style={{ color: riskColor }}>{report.classification.score}</strong><span>NIQ score</span><b style={{ color: riskColor }}>{report.classification.label}</b></div>}
        {(statusMetrics.length > 0 || observationGroups.length > 0) && <section className="cr-status-evidence"><h3>Assessment indicators</h3><div className="cr-status-metrics">{statusMetrics.map(metric => <div className="cr-status-metric" key={metric.id}><MetricIcon id={metric.id} label={metric.label}/><span>{metric.label}</span><strong>{metricText(metric)}</strong></div>)}{observationGroups.map(group => <div className="cr-status-metric" key={group.label}><span className="cr-metric-icon"><Stethoscope size={16} aria-hidden="true"/></span><span>{group.label}</span><strong>{group.values}</strong></div>)}</div></section>}
      </div>
      {completionPercentage !== null && <p className="cr-answer-coverage"><ClipboardCheck size={17} aria-hidden="true"/><span>This report is based on an assessment that was <strong>{completionPercentage}% complete</strong>.</span></p>}
      <WeightTrend report={report}/>
      {hasInterpretation && <section className="cr-clinical-interpretation"><div className="cr-advice-heading"><span className="cr-advice-icon"><FileSearch size={20} aria-hidden="true"/></span><h3>Nutritional interpretation</h3></div><p><NarrativeText text={interpretationParagraphs([showClinicalFinding ? clinicalFinding : report.narrative.overview, report.nutritionalStatus?.trim()]).map(paragraph => /^(?:Well nourished|Moderately nourished|Severely malnourished)$/i.test(paragraph) ? `Your nutritional status is ${paragraph.toLocaleLowerCase()}.` : paragraph.replace(/\s*\n\s*/g, " ")).join(" ")}/></p></section>}
    </ReportSheet>}
    {hasNutritionPage && <ReportSheet number={nextPage() + 1} title="Intervention" icon={Utensils} report={report} branding={branding} compact className={`cr-sheet-nutrition${denseNutrition ? " cr-sheet-nutrition-dense" : ""}`}>
      <div className="cr-care-stack">
      {targets.length > 0 && <section className="cr-nutrition-targets"><h3>Daily nutrition targets</h3><div className="cr-nutrition-target-grid">{targets.map(target => { const Icon = target.icon; return <div className="cr-nutrition-target-card" key={target.label}><Icon size={22} aria-hidden="true"/><span>{target.label}</span><strong>{target.value}</strong></div>; })}</div></section>}
      {renalGuidance && <section className="cr-renal-caution"><div className="cr-advice-heading"><span className="cr-advice-icon"><TriangleAlert size={20} aria-hidden="true"/></span><h3>Individualise nutrition targets</h3></div><p><NarrativeText text={renalGuidance.text}/></p></section>}
      <ReviewedAdvice title="Nutrition guidance" text={withoutRepeatedTargets(report.narrative.nutritionAdvice, targets)} icon={Utensils} columns/>
      <ReviewedAdvice title={plannedTreatment ? "Preparation for treatment" : "During treatment"} text={report.narrative.treatmentAdvice} icon={ShieldCheck} columns/>
      <ProductPlan report={report}/></div>
    </ReportSheet>}
    {hasConditionAdvice && <ReportSheet number={nextPage() + 1} title="Other health conditions (Co-morbidities)" icon={HeartPulse} report={report} branding={branding} compact className="cr-sheet-care">
      <div className="cr-care-grid"><ReviewedAdvice title={conditionTitle} text={report.narrative.conditionAdvice} icon={HeartPulse}/></div>
    </ReportSheet>}
    {antimetaboliteSections.length > 0 && <ReportSheet number={nextPage() + 1} title="Possible effects of antimetabolite chemotherapy" icon={TriangleAlert} report={report} branding={branding} compact className="cr-sheet-possible-effects">
      <p className="cr-possible-intro">These side effects may occur during antimetabolite chemotherapy, but not everyone experiences them. The guidance below explains what to do if they occur. Contact your care team about new or worsening symptoms.</p>
      <div className="cr-possible-list">{antimetaboliteSections.map(section => <section className="cr-possible-effect" key={section.id}>
        <div className="cr-possible-effect-heading"><span className="cr-advice-icon"><TriangleAlert size={19} aria-hidden="true"/></span><div><h3>{section.title}</h3></div></div>
        {possibleEffectBody(section)}
      </section>)}</div>
    </ReportSheet>}
    {otherPossiblePages.map((sections, index) => <ReportSheet key={index} number={nextPage() + 1} title="Possible treatment effects" icon={TriangleAlert} report={report} branding={branding} compact className="cr-sheet-possible-effects">
      <p className="cr-possible-intro">These are possible treatment effects. The guidance explains what to do if they occur. Contact your care team about new or worsening symptoms.</p>
      <div className="cr-possible-list">{sections.map(section => <section className="cr-possible-effect" key={section.id}>
        <div className="cr-possible-effect-heading"><span className="cr-advice-icon"><TriangleAlert size={19} aria-hidden="true"/></span><div><span className="cr-guidance-type">Possible effect{section.drugClass ? ` · ${section.drugClass}` : ""}</span><h3>{section.title}</h3></div></div>
        {possibleEffectBody(section)}
      </section>)}</div>
    </ReportSheet>)}
    {report.narrative.redFlagsAdvice?.trim() && <ReportSheet number={nextPage() + 1} title="When to contact your care team" icon={TriangleAlert} report={report} branding={branding} compact className="cr-sheet-care cr-sheet-red-flags"><div className="cr-care-grid"><ReviewedAdvice id="cr-red-flags" title="When to seek urgent help" text={report.narrative.redFlagsAdvice} icon={TriangleAlert}/></div></ReportSheet>}
    {showRecommendations && <ReportSheet number={nextPage() + 1} title="Recommendations" icon={ListChecks} report={report} branding={branding} compact className="cr-sheet-care">
      <div className="cr-care-grid">{<ReviewedAdvice id="cr-reported-symptom-care" title={singleGuidanceTitle(report, "toxicity", "Reported symptom care")} text={reportedCare} icon={Droplets}/>}
      <ReviewedAdvice id="cr-food-safety" title="Food safety" text={report.narrative.foodSafetyAdvice} icon={ShieldCheck}/>
      <ReviewedAdvice title="Care actions" text={report.narrative.actionSummary} icon={ListChecks} action/>
      <ReviewedAdvice title="Monitoring plan" text={report.narrative.monitoringSummary} icon={ChartNoAxesCombined} action/></div>
    </ReportSheet>}
    <ReportSheet number={nextPage() + 1} title="Report summary" icon={ClipboardList} report={report} branding={branding} compact className="cr-sheet-summary">
      <div className="cr-summary-hero" style={{ borderColor: riskColor }}><div className="cr-summary-score"><span className="cr-summary-fact-label"><span className="cr-clinical-fact-icon" aria-hidden="true"><Gauge size={15}/></span>NIQ score</span><div className="cr-summary-score-circle" style={{ borderColor: riskColor }} role="img" aria-label={`${report.classification.score} points, ${report.classification.label}`}><strong style={{ color: riskColor }}>{report.classification.score}</strong><span>points</span></div><small style={{ color: riskColor }}>{report.classification.label}</small></div>
        {summaryFacts.length > 0 && <div className="cr-summary-facts">{summaryFacts.map(fact => {
          const Icon = clinicalFactIcon(fact.label, fact.value);
          return <p key={fact.label}><span className="cr-summary-fact-label"><span className="cr-clinical-fact-icon" aria-hidden="true"><Icon size={15}/></span>{fact.label}</span><strong>{fact.value}</strong></p>;
        })}</div>}
      </div>
      {completionPercentage !== null && <p className="cr-answer-coverage"><ClipboardCheck size={17} aria-hidden="true"/><span>This report is based on an assessment that was <strong>{completionPercentage}% complete</strong>.</span></p>}
      {overallSummary && <section className="cr-summary-brief" aria-label="Overall clinical summary"><span className="cr-summary-brief-icon"><HeartPulse size={23} aria-hidden="true"/></span><div><p><NarrativeText text={readableClosingSummary(overallSummary, report.productCatalog?.flatMap(product => product.benefits ?? []) ?? []).replace(/\s*\n\s*/g, " ")}/></p></div></section>}
    </ReportSheet>
  </article>;
}
