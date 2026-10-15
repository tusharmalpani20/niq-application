import { createHash } from "node:crypto";
import { and, desc, eq, isNull, lt, ne, or, lte, like, sql } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { assessFaceScanRange, assessmentOptionDisplayLabel, formatAssessmentReference, getAssessmentAnswerCoverage, hasPermission, reportBrandingPayload, reportFaceScanAdditionalMetricGroups, type AssessmentFormManifest, type FaceScanSession, type FormAnswers } from "@niq/application-contracts";
import type { GeneratedReport, GeneratedReportSection, GeneratedNarrative } from "../../../../packages/contracts/src/generated-report";
import { assessmentScoreResultSchema, type AssessmentPatient } from "../../../../packages/contracts/src/assessment-workflow";
import { assessmentFaceScans, assessmentSubmissions, assessments, facilities, generatedReportArtifacts, generatedReports, organizationBrandAssets, organizations } from "../db/schema";
import { decryptPatientBytes, encryptPatientBytes, patientDataKey } from "../security/patient-data";
import { reviewState } from "./clinical-review-state";
import { ServiceError, type Principal, type RequestContext } from "./application";
import type { AssessmentWorkflowService, StoredWorkflow, WorkflowRow } from "./assessment-workflow";
import { requestScoringReportContent, requestScoringToxicityOptions, ScoringReportContentError, ScoringReportContentPending, type ReportFacts, type ScoringReportContent } from "./scoring-report-content";
import { renderGeneratedReportPdf } from "./report-pdf";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_AUTOMATIC_REPORT_ATTEMPTS = 5;
export const AUTOMATIC_REPORT_KEY_PREFIX = "auto-final-v1:";
export const REPORT_REVIEW_REQUIRED = "REVIEW_REQUIRED";
class AutomaticReportReviewRequired extends Error {
  constructor() { super("Generated content requires clinical review before a PDF can be issued."); }
}
export const automaticRetryDelay = (attempt: number) => Math.min(300_000, 30_000 * 2 ** Math.min(4, Math.max(0, attempt - 1)));
type ReportData = Omit<GeneratedReport, "id" | "revision" | "status" | "approvedAt" | "artifact">;
type ReportRow = typeof generatedReports.$inferSelect;
type ArtifactRow = typeof generatedReportArtifacts.$inferSelect;
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const value = (answer: FormAnswers[string] | undefined): string | undefined => typeof answer === "string" && answer ? answer : undefined;
const list = (answer: FormAnswers[string] | undefined): string[] => Array.isArray(answer) ? answer.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const positive = (answer: FormAnswers[string] | undefined): number | null => typeof answer === "number" && Number.isFinite(answer) && answer > 0 ? answer : null;
const fieldLabel = (manifest: AssessmentFormManifest, fieldId: string, optionId: string): string | undefined => {
  const label = manifest.sections.flatMap(section => section.fields).find(field => field.id === fieldId)?.options?.find(option => option.id === optionId)?.label;
  return label === undefined ? undefined : assessmentOptionDisplayLabel(optionId, label);
};
const dateOnly = (date: Date | string): string => new Date(date).toISOString().slice(0, 10);
const nonempty = (text: unknown): text is string => typeof text === "string" && text.trim().length > 0;

export function reportNeedsClinicalReview(status: ScoringReportContent["status"], issues: string[]): boolean {
  return status === REPORT_REVIEW_REQUIRED || issues.length > 0;
}

export function reportGenerationIssues(status: ScoringReportContent["status"], issues: string[]): string[] {
  return status === REPORT_REVIEW_REQUIRED && issues.length === 0
    ? ["Generated text needs clinical review before a PDF can be issued."] : issues;
}

export function automaticReportCanFinalize(status: string, failureCode: string | null, issues: string[]): boolean {
  return status === "DRAFT" && failureCode !== REPORT_REVIEW_REQUIRED && issues.length === 0;
}

export function publicReportGeneration(status: string, failureCode: string | null, issues: string[]): { status: "QUEUED" | "GENERATING" | "FAILED" | "READY"; failureCode: string | null } {
  if (failureCode === REPORT_REVIEW_REQUIRED) return { status: "FAILED", failureCode: REPORT_REVIEW_REQUIRED };
  if (status === "FAILED") return { status: "FAILED", failureCode };
  if (issues.length) return { status: "FAILED", failureCode: REPORT_REVIEW_REQUIRED };
  return { status: status === "READY" || status === "APPROVED" ? "READY" : status === "FAILED" ? "FAILED" : status === "QUEUED" ? "QUEUED" : "GENERATING", failureCode };
}

export function assertReportPdfDownloadable(issues: string[]) {
  if (issues.length) throw new ServiceError("NOT_FOUND", "A final report PDF is not available.");
}

export function assertReadyPdfRefresh(status: string, issues: string[]) {
  if (status !== "READY") throw new ServiceError("CONFLICT", "Only a ready report PDF can be refreshed.");
  if (issues.length) throw new ServiceError("CONFLICT", "Resolve report-generation issues before refreshing the PDF.");
}

export function cleanReportText(text: string): string {
  return text.replace(/;/g, ".").replace(/—/g, " - ")
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/[ \t]{2,}/g, " ").trim();
}

export function finishWeightHistory(priorMostRecentFirst: GeneratedReport["weightHistory"], current: GeneratedReport["weightHistory"][number] | null, previousKg: number | null, firstAssessment = priorMostRecentFirst.length === 0): GeneratedReport["weightHistory"] {
  // A recent recorded value that strongly conflicts with both the reported
  // previous weight and the current measurement should not drive a trend chart.
  const currentDay = current?.date ? Date.parse(current.date) : NaN;
  const reportedCloseToCurrent = Boolean(previousKg && current && Math.abs(current.kg - previousKg) / previousKg <= 0.1);
  const conflictingRecentRecord = reportedCloseToCurrent && priorMostRecentFirst.some(point => {
    const elapsedDays = point.date ? (currentDay - Date.parse(point.date)) / 86_400_000 : NaN;
    return Number.isFinite(elapsedDays) && elapsedDays >= 0 && elapsedDays <= 30
      && Math.abs(point.kg - previousKg!) / previousKg! > 0.15;
  });
  const points = conflictingRecentRecord ? [] : [...priorMostRecentFirst];
  if (current) points.unshift(current);
  if (firstAssessment && points.length < 2 && previousKg && previousKg < 600)
    points.push({ date: null, kg: previousKg, label: "Weight 1 Month Ago" });
  const unique = new Map(points.reverse().map(point => [point.assessmentId ?? point.date ?? "undated", point]));
  return [...unique.values()].slice(-6);
}

export function assertReportReadyForApproval(issues: string[], artifactRevision: number | null, reportRevision: number) {
  if (issues.length) throw new ServiceError("CONFLICT", "Resolve report-generation issues before approval.");
  if (artifactRevision !== reportRevision) throw new ServiceError("CONFLICT", "Generate the final PDF for this report revision before approving.");
}

export function assertReviewedArtifact(artifact: { sha256: string; brandingFingerprint: string | null } | undefined, reviewedSha256: string, currentBrandingFingerprint: string) {
  if (!artifact || artifact.sha256 !== reviewedSha256)
    throw new ServiceError("CONFLICT", "The PDF changed after review. Open and review the latest PDF before approval.");
  if (artifact.brandingFingerprint !== currentBrandingFingerprint)
    throw new ServiceError("CONFLICT", "The organisation theme changed. Prepare and review a new PDF before approval.");
}

export function reportBrandingFingerprint(brand: Parameters<typeof reportBrandingPayload>[0]): string {
  return createHash("sha256").update(reportBrandingPayload(brand)).digest("hex");
}

export function assertGeneratedPdf(pdf: Buffer) {
  if (pdf.length > MAX_PDF_BYTES) throw new ServiceError("VALIDATION_ERROR", "The generated PDF is too large.");
  if (pdf.length < 20 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-" || !pdf.subarray(-1024).toString("latin1").includes("%%EOF"))
    throw new ServiceError("VALIDATION_ERROR", "Upload a valid generated PDF.");
}

export function prepareNarrativeEdit(data: ReportData, input: { narrative: Partial<GeneratedNarrative>; issueResolution?: { explanation: string } }, clinicianName: string, now: Date) {
  const narrative = Object.fromEntries(Object.entries({ ...data.narrative, ...input.narrative })
    .map(([field, text]) => [field, cleanReportText(text)])) as GeneratedNarrative;
  const narrativeEvidence = { ...data.narrativeEvidence };
  for (const field of Object.keys(input.narrative) as Array<keyof GeneratedNarrative>) delete narrativeEvidence[field];
  if (input.issueResolution && !data.issues.length) throw new ServiceError("VALIDATION_ERROR", "There are no generation issues to resolve.");
  const resolution = input.issueResolution
    ? { originalIssues: data.issues, explanation: input.issueResolution.explanation, clinicianName, resolvedAt: now.toISOString() }
    : data.issueResolution;
  const omittedNarrativeFields = data.omittedNarrativeFields?.filter(field => !narrative[field]);
  return { data: { ...data, narrative, narrativeEvidence, omittedNarrativeFields, ...(input.issueResolution ? { issues: [], issueResolution: resolution } : {}) }, resolvedIssueCount: input.issueResolution ? data.issues.length : 0 };
}

export function normalizeNarrative(content: ScoringReportContent["narrative"]): GeneratedNarrative {
  return Object.fromEntries(Object.entries(content).map(([field, entry]) => [field, cleanReportText(entry.text)])) as GeneratedNarrative;
}

export function normalizeGuidance(content: ScoringReportContent, manifest: AssessmentFormManifest): {sections:GeneratedReportSection[]; issues:string[]} {
  const sections: GeneratedReportSection[] = [];
  const issues:string[]=[];
  const add = (entry: GeneratedReportSection) => {
    const cleaned = {
      ...entry,
      title: cleanReportText(entry.title),
      text: cleanReportText(entry.text),
      ...(entry.drugClass ? { drugClass: cleanReportText(entry.drugClass) } : {}),
      ...(entry.matchedAnswerLabels ? { matchedAnswerLabels: entry.matchedAnswerLabels.map(cleanReportText) } : {}),
    };
    if (cleaned.text) sections.push(cleaned);
  };
  const classLabel = (id:string) => fieldLabel(manifest,"drug_classes",id) ?? "Selected drug class";
  const treatmentLabel = (id:string) => fieldLabel(manifest,"current_cancer_treatment",id) ?? "Treatment";
  for (const row of content.guidance.nutritionInterventions)
    add({ id: row.id, kind: "nutrition", title: row.label, text: [row.coreStrategy, row.clinicalActions].filter(nonempty).join("\n") });
  // Class membership alone does not establish a patient symptom.
  for (const row of content.guidance.toxicityInterventions) {
    const matchedLabels = [...new Set(row.matchedAnswerLabels ?? [])];
    add({ id: row.id, kind: "toxicity", title: matchedLabels.length ? matchedLabels.join(" / ") : row.expectedToxicity,
      text: row.nutritionalInterventions, drugClass: classLabel(row.classId),
      ...(row.matchSource ? {matchSource:row.matchSource} : {}),
      ...(matchedLabels.length ? {matchedAnswerLabels:matchedLabels} : {}),
      certainty: "confirmed" });
  }
  for (const row of content.guidance.possibleToxicities ?? []) {
    if (row.requiresDrugConfirmation) continue;
    if (!nonempty(cleanReportText(row.expectedToxicity))) {
      issues.push(`possibleToxicities:${row.id}:MISSING_LABEL`);
      continue;
    }
    if (!nonempty(row.summary)) {
      issues.push(`possibleToxicities:${row.id}:MISSING_SUMMARY`);
      continue;
    }
    add({ id: row.id, kind: "toxicity", title: row.expectedToxicity,
      text: row.summary, drugClass: classLabel(row.classId), certainty: "possible" });
  }
  for (const row of content.guidance.classGuidance ?? [])
    add({ id: row.id, kind: "treatment", title: row.label, text: row.guidance });
  const plan = content.guidance.carePlan;
  for (const row of plan.treatmentGuidance)
    add({ id: row.id, kind: "treatment", title: treatmentLabel(row.treatmentTypeId)+" guidance", text: row.guidance });
  for (const row of plan.statusModifiers)
    add({ id: row.id, kind: "treatment", title: "Treatment status guidance", text: [row.riskEmphasis, row.actions].filter(nonempty).join("\n") });
  for (const row of plan.coMorbidities)
    add({ id: row.id, kind: "comorbidity", title: row.label, text: row.guidance });
  const products = plan.products;
  if (products.status === "selected") {
    for (const row of products.plans) {
      // The structured items carry the product names and quantities. Showing the
      // legacy product summary as well would repeat every name in the report.
      const details = row.items?.map(item => item.quantityPerDay === undefined ? ""
        : item.productName === "Liss WH" && item.description === "leveled scoops in 150ml water"
          ? `${item.productName}: ${item.quantityPerDay} ${item.description}`
          : `${item.quantityPerDay} ${item.productName}${item.description ? ` (${item.description})` : ""}`);
      // Use the approved plan text when structured quantities are incomplete;
      // dropping the whole plan would omit a selected recommendation.
      const planText = details?.length && details.every(nonempty) ? details.join(" + ") : nonempty(row.dose) ? row.dose : row.products;
      if (!nonempty(planText)) {
        issues.push(`productPlans:${row.id}:MISSING_GUIDANCE`);
        continue;
      }
      add({ id: row.id, kind: "product", title: "Product plan", text: [planText, row.duration].filter(nonempty).join("\n") });
    }
    // Resolved exclusion rules affect selection, not patient-facing prose.
  }
  // An unresolved product plan contributes no recommendation. Missing facts
  // do not trigger a second exchange with the patient or block other content.
  return {sections,issues};
}

export function reportClinicalFacts(answers: FormAnswers, manifest: AssessmentFormManifest, assessmentDate?: string): NonNullable<GeneratedReport["clinicalFacts"]> {
  const facts: NonNullable<GeneratedReport["clinicalFacts"]> = [];
  const selected = (id: string) => {
    const answer = value(answers[id]);
    return answer ? fieldLabel(manifest, id, answer) : undefined;
  };
  const selectedList = (id: string) => list(answers[id]).map(option => fieldLabel(manifest, id, option)).filter(nonempty).join(", ");
  const add = (label: string, detail: string | undefined) => {
    if (detail?.trim()) facts.push({ label, value: cleanReportText(detail) });
  };
  add("Diagnosis", selected("cancer_type") === "Other" ? value(answers.cancer_type_other) : selected("cancer_type"));
  add("Disease stage", selected("stage"));
  add("Treatment status", selected("treatment_status"));
  const plannedStart = manifest.preConditioningStartPolicy === "relative_guidance" ? undefined : value(answers.planned_treatment_start_date);
  const treatmentIsPlanned = manifest.preConditioningStartPolicy === "relative_guidance"
    ? answers.treatment_status === "treatment_status_newly_diagnosed"
    : Boolean(plannedStart && assessmentDate && plannedStart > assessmentDate);
  add(treatmentIsPlanned ? "Planned treatment" : "Current treatment", selectedList("current_cancer_treatment"));
  if (plannedStart) {
    const date = new Date(`${plannedStart}T00:00:00Z`);
    if (!Number.isNaN(date.valueOf()))
      add("Treatment Start Date", date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }));
  }
  add("Drug class", selectedList("drug_classes"));
  add("Other conditions", selectedList("co_morbidities"));
  add("Diet Preference", selected("diet_preference"));
  add("Reported symptoms", selectedList("gastrointestinal_symptoms"));
  return facts;
}

export function reportProductPlans(content: ScoringReportContent): NonNullable<GeneratedReport["productPlans"]> {
  if (content.guidance.carePlan.products.status !== "selected") return [];
  return content.guidance.carePlan.products.plans
    .filter(plan => plan.items?.length)
    .map(plan => ({ id: plan.id, duration: cleanReportText(plan.duration),
      ...(plan.durationAmount ? { durationAmount: plan.durationAmount } : {}),
      items: plan.items!.map(item => ({ productName: cleanReportText(item.productName),
        ...(item.quantityPerDay ? { quantityPerDay: item.quantityPerDay } : {}),
        ...(item.description ? { description: cleanReportText(item.description) } : {}),
        ...(item.unit ? { unit: cleanReportText(item.unit) } : {}),
        ...(item.timesPerDay ? { timesPerDay: item.timesPerDay } : {}),
        ...(item.preparation ? { preparation: cleanReportText(item.preparation) } : {}),
        ...(item.mealTiming ? { mealTiming: cleanReportText(item.mealTiming) } : {}),
        ...(item.rationale ? { rationale: cleanReportText(item.rationale) } : {}),
      })) }));
}

export function reportProductCatalog(content: ScoringReportContent): NonNullable<GeneratedReport["productCatalog"]> {
  if (content.guidance.carePlan.products.status !== "selected") return [];
  return (content.guidance.carePlan.products.catalog ?? []).map(product => ({
    id: product.id, name: cleanReportText(product.name), description: cleanReportText(product.description ?? ""),
    aliases: product.aliases.map(cleanReportText),
    ...(product.benefits ? { benefits: product.benefits.map(cleanReportText).filter(nonempty) } : {}),
  })).filter(product => product.name && (product.description || product.benefits?.length));
}

export function reportToxicityAnswers(answers: FormAnswers): NonNullable<ReportFacts["assessmentAnswers"]> {
  const gastrointestinal = list(answers.gastrointestinal_symptoms);
  const dietary = list(answers.dietary_symptoms);
  const appetite = value(answers.appetite_status);
  const previous = positive(answers.previous_weight_kg);
  const current = positive(answers.current_weight_kg);
  return {
    ...(gastrointestinal.length ? { gastrointestinal_symptoms: gastrointestinal } : {}),
    ...(dietary.length ? { dietary_symptoms: dietary } : {}),
    ...(appetite ? { appetite_status: appetite } : {}),
    ...(previous !== null ? { previous_weight_kg: previous } : {}),
    ...(current !== null ? { current_weight_kg: current } : {}),
  };
}

export function reportObservations(answers: FormAnswers, manifest: AssessmentFormManifest, completedAt: Date, scan: unknown) {
  const metrics: GeneratedReport["metrics"] = [];
  const add = (id: string, label: string, raw: number | string | null | undefined, unit?: string, source: "assessment" | "face_scan" = "assessment", measuredAt?: string, range?: { outside: boolean; reference: string } | null) => {
    if (raw === null || raw === undefined || raw === "") return;
    metrics.push({ id, label, value: String(raw), ...(unit ? {unit} : {}), ...(measuredAt ? {measuredAt} : {}), source,
      ...(range ? { referenceRange: range.reference, outsideReferenceRange: range.outside } : {}) });
  };
  const weight = positive(answers.current_weight_kg);
  const height = positive(answers.height_cm);
  add("current_weight_kg", "Current weight", weight, "kg", "assessment", completedAt.toISOString());
  add("height_cm", "Height", height, "cm", "assessment", completedAt.toISOString());
  if (weight && height) add("bmi", "BMI", Math.round(weight / (height / 100) ** 2 * 10) / 10);
  const previous = positive(answers.previous_weight_kg);
  if (weight && previous && previous > weight) add("weight_loss_percent", "Reported weight loss", Math.round((previous - weight) / previous * 1000) / 10, "%");
  for (const id of ["appetite_status", "fluid_intake", "functional_capacity", "protein_intake"] as const) {
    const selected = value(answers[id]);
    if (selected) add(id, manifest.sections.flatMap(s => s.fields).find(f => f.id === id)?.label ?? id, fieldLabel(manifest,id,selected) ?? selected);
  }
  for (const symptom of list(answers.dietary_symptoms).slice(0, 10))
    add(symptom, "Reported dietary symptom", fieldLabel(manifest,"dietary_symptoms",symptom) ?? symptom);
  const session = scan as FaceScanSession | null;
  const measuredAt = session?.completedAt ?? undefined;
  const face = (id: string, label: string, raw: number | string | null | undefined, unit?: string, rangeKey?: string, rangeValue: number | string | null | undefined = raw) =>
    add(id,label,raw,unit,"face_scan",measuredAt,
      rangeKey && session?.context && rangeValue !== undefined ? assessFaceScanRange(rangeKey,rangeValue,session.context) : null);
  if (session?.score?.status === "SCORED") face("vital_iq_points","Vital IQ points",session.score.points);
  face("wellness_score","Wellness score",session?.result?.wellnessScore,"/100");
  face("health_risk_score","Health risk score",session?.result?.healthRiskScore,"/100");
  face("physiological_score","Physiological health score",session?.result?.physiologicalScore,"/100");
  face("mental_wellbeing_score","Mental wellbeing score",session?.result?.mentalWellbeingScore,"/100");
  face("heart_rate","Heart rate",session?.result?.vitals?.heartRate,"bpm","heartRate");
  face("oxygen_saturation","Oxygen saturation",session?.result?.vitals?.oxygenSaturation,"%","oxygenSaturation");
  face("respiratory_rate","Breathing rate",session?.result?.vitals?.respiratoryRate,"/min","respiratoryRate");
  const systolic = session?.result?.vitals?.systolic;
  const diastolic = session?.result?.vitals?.diastolic;
  const pressureValue = systolic !== null && systolic !== undefined && diastolic !== null && diastolic !== undefined ? `${systolic}/${diastolic}` : null;
  face("systolic","Systolic blood pressure",systolic,"mmHg","bloodPressure",pressureValue);
  face("diastolic","Diastolic blood pressure",diastolic,"mmHg","bloodPressure",pressureValue);
  const details = session?.result?.additionalMetrics;
  for (const group of reportFaceScanAdditionalMetricGroups) for (const metric of group.metrics)
    face(metric.id, metric.label, metric.key === "stressIndex" ? session?.score?.stressIndex ?? details?.stressIndex : details?.[metric.key], metric.unit, metric.key);
  face("stress_band","Stress band",session?.score?.stressBand);
  return metrics;
}

export class GeneratedReportService {
  constructor(private service: AssessmentWorkflowService) {}

  private async clinical(actor: Principal, org: string, id: string, permission: "assessments.read" | "reports.manage" = "assessments.read") {
    this.service.clinicalActor(actor, org, permission);
    return this.service.authorize(actor, org, id);
  }
  private source(row: WorkflowRow) {
    const review = reviewState(this.service,row);
    const final = review.finalSnapshot as { submissionId?: string | null; scoreRevision?: number; confirmedToxicityIds?: string[]; score?: { overall?: { reviewedPoints?: number | null }; risk?: { status?: string; resultReference?: string | null; classification?: { id?: string; label?: string; color?: GeneratedReport["classification"]["color"] } | null } } } | undefined;
    if (row.status !== "COMPLETED" || !row.currentSubmissionId || !row.completedAt || !final || final.submissionId !== row.currentSubmissionId
      || !Number.isInteger(final.scoreRevision) || final.scoreRevision! < 0
      || !Number.isFinite(final.score?.overall?.reviewedPoints) || (final.score?.overall?.reviewedPoints ?? -1) < 0
      || !["ORIGINAL","CONFIRMED"].includes(final.score?.risk?.status ?? "") || !final.score?.risk?.classification?.id || !final.score?.risk?.resultReference)
      throw new ServiceError("CONFLICT","Complete the clinical review and confirm its risk classification before generating a report.");
    return { submissionId: row.currentSubmissionId, scoreRevision: final.scoreRevision!, reviewedScore: final.score!.overall!.reviewedPoints!, risk: final.score!.risk!.classification!, resultReference:final.score!.risk!.resultReference!, completedAt: row.completedAt,
      confirmedToxicityIds: Array.isArray(final.confirmedToxicityIds) ? final.confirmedToxicityIds : [] };
  }
  private currentFingerprint(row: WorkflowRow, checksum: string, decision?:GeneratedReport["decision"]): string | null {
    try {
      const source = this.source(row);
      return sha({ submissionId:source.submissionId,scoreRevision:source.scoreRevision,completedAt:source.completedAt.toISOString(),reviewedScore:source.reviewedScore,riskId:source.risk.id,resultReference:source.resultReference,checksum,decision:decision??{productStageChoice:null,plannedTreatmentStartDate:null} });
    } catch { return null; }
  }
  private async latest(org: string, id: string): Promise<ReportRow | undefined> {
    const [row] = await this.service.db.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id))).orderBy(desc(generatedReports.createdAt),desc(generatedReports.id)).limit(1);
    return row;
  }
  private async artifact(org: string, reportId: string): Promise<ArtifactRow | undefined> {
    const [row] = await this.service.db.select().from(generatedReportArtifacts).where(and(eq(generatedReportArtifacts.organizationId,org),eq(generatedReportArtifacts.reportId,reportId)));
    return row;
  }
  private async assessmentFacilityName(assessment:WorkflowRow):Promise<string|null> {
    if (!assessment.facilityId) return null;
    const [facility]=await this.service.db.select({name:facilities.name}).from(facilities).where(and(
      eq(facilities.organizationId,assessment.organizationId),eq(facilities.id,assessment.facilityId)));
    return facility?.name ?? null;
  }
  private async dto(row: ReportRow, assessment: WorkflowRow): Promise<GeneratedReport> {
    if (!row.content) throw new ServiceError("CONFLICT","The report is still generating.");
    const data = this.service.unseal<ReportData>(row.content);
    const artifact = await this.artifact(row.organizationId,row.id);
    const stale = row.status === "STALE" || this.currentFingerprint(assessment,data.assessment.checksum,data.decision) !== row.sourceFingerprint;
    return { ...data,assessment:{...data.assessment,facilityName:await this.assessmentFacilityName(assessment)},id:row.id,revision:row.revision,status:stale?"STALE":row.status as GeneratedReport["status"],approvedAt:row.approvedAt?.toISOString() ?? null,
      artifact:artifact && artifact.revision === row.revision ? {sha256:artifact.sha256,size:artifact.size,uploadedAt:artifact.uploadedAt.toISOString(),brandingFingerprint:artifact.brandingFingerprint}:null };
  }
  async read(actor: Principal, org: string, id: string): Promise<{report: GeneratedReport | null; generation: {status:"QUEUED"|"GENERATING"|"FAILED"|"READY";failureCode:string|null}|null}> {
    const assessment=await this.clinical(actor,org,id);
    let row=await this.latest(org,id);
    if(!row) return {report:null,generation:null};
    // A legacy or locally started attempt is still a real generation attempt.
    // Hiding it makes an assessment with a pending/failed report say Not started.
    const legacyExpired = !row.requestKey.startsWith(AUTOMATIC_REPORT_KEY_PREFIX)
      && ["QUEUED", "GENERATING"].includes(row.status)
      && Date.now() - row.updatedAt.getTime() > this.service.config.REPORT_GENERATION_TIMEOUT_MS + 30_000;
    if (legacyExpired) {
      // Old manual attempts have no automatic worker. Fence expiry against a
      // concurrent result save, then let the existing Regenerate action recover.
      const [expired] = await this.service.db.update(generatedReports).set({status:"FAILED",
        failureCode:"GENERATION_INTERRUPTED",leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
        .where(and(eq(generatedReports.id,row.id),eq(generatedReports.organizationId,org),
          eq(generatedReports.status,row.status),eq(generatedReports.updatedAt,row.updatedAt))).returning();
      row = expired ?? await this.latest(org,id);
      if (!row) return {report:null,generation:null};
    }
    let issues=row.content ? this.service.unseal<ReportData>(row.content).issues : [];
    if(issues.length && ["READY","APPROVED"].includes(row.status)) {
      // Quarantine a legacy artifact with unresolved issues and schedule a new
      // checked generation. Its old PDF must not be treated as approved text.
      const [quarantined]=await this.service.db.update(generatedReports).set({status:"DRAFT",failureCode:REPORT_REVIEW_REQUIRED,
        leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
        .where(and(eq(generatedReports.id,row.id),eq(generatedReports.status,row.status),eq(generatedReports.revision,row.revision),eq(generatedReports.updatedAt,row.updatedAt))).returning();
      row=quarantined??await this.latest(org,id);
      if(!row)return {report:null,generation:null};
      issues=row.content ? this.service.unseal<ReportData>(row.content).issues : [];
    }
    // Report-content review is a worker state, not a request for human action.
    // Keep clients polling while the successor is being reserved.
    const awaitingRecovery=row.failureCode===REPORT_REVIEW_REQUIRED && ["DRAFT","FAILED"].includes(row.status);
    const generation=awaitingRecovery ? {status:"QUEUED" as const,failureCode:null} : publicReportGeneration(row.status,row.failureCode,issues);
    const report=row.content && generation.status==="READY" ? await this.chartView(await this.dto(row,assessment),actor,assessment):null;
    return {report:report?.status==="APPROVED"?{...report,status:"READY"}:report,
      generation};
  }
  async regenerate(actor: Principal, org: string, id: string, context: RequestContext) {
    const assessment = await this.clinical(actor, org, id, "reports.manage");
    const source = this.source(assessment);
    const reportId = createEntityId();
    await this.service.db.transaction(async tx => {
      const current = await this.service.authorize(actor, org, id, tx, true);
      const currentSource = this.source(current);
      if (currentSource.submissionId !== source.submissionId || currentSource.scoreRevision !== source.scoreRevision)
        throw new ServiceError("CONFLICT", "The approved assessment changed. Reload before regenerating the report.");
      const [latest] = await tx.select().from(generatedReports)
        .where(and(eq(generatedReports.organizationId, org), eq(generatedReports.assessmentId, id)))
        .orderBy(desc(generatedReports.createdAt), desc(generatedReports.id)).limit(1).for("update");
      if (!latest || !(latest.status === "FAILED" || latest.status === "DRAFT" && latest.failureCode === REPORT_REVIEW_REQUIRED))
        throw new ServiceError("CONFLICT", "Regenerate is available after an automatic report attempt fails.");
      await tx.insert(generatedReports).values({id:reportId, organizationId:org, assessmentId:id, patientId:current.patientId,
        submissionId:currentSource.submissionId, requestKey:`${AUTOMATIC_REPORT_KEY_PREFIX}${currentSource.submissionId}:retry:${reportId}`,
        sourceFingerprint:"", status:"QUEUED", attemptCount:0});
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_REGENERATE_REQUESTED",{reportId,previousReportId:latest.id,
        submissionId:currentSource.submissionId,scoreRevision:currentSource.scoreRevision});
    });
    return this.read(actor,org,id);
  }
  async toxicityOptions(actor: Principal, org: string, id: string, context: RequestContext) {
    if (!hasPermission(actor.role,"reviews.complete")) throw new ServiceError("FORBIDDEN","A clinician must confirm treatment effects.");
    const assessment = await this.clinical(actor,org,id,"reports.manage");
    const source = this.source(assessment);
    const [submission] = await this.service.db.select().from(assessmentSubmissions).where(and(
      eq(assessmentSubmissions.organizationId,org),eq(assessmentSubmissions.assessmentId,id),eq(assessmentSubmissions.id,source.submissionId)));
    if (submission?.status !== "SUCCEEDED" || !submission.result) throw new ServiceError("CONFLICT","The final scored submission is unavailable.");
    const frozen = this.service.unseal<StoredWorkflow>(submission.snapshot);
    const result = assessmentScoreResultSchema.parse(this.service.unseal(submission.result));
    if (result.checksum !== frozen.binding.checksum || result.resultReference.length === 0)
      throw new ServiceError("CONFLICT","The submitted score does not match its rule version.");
    try {
      const transport = await this.service.transport(org,context,frozen.connection);
      const options = await requestScoringToxicityOptions({ ...transport,
        assessmentReference:frozen.binding.assessmentReference,resultReference:source.resultReference,
        treatmentTypeIds:list(frozen.answers.current_cancer_treatment),drugClassIds:list(frozen.answers.drug_classes) });
      if (options.checksum !== frozen.binding.checksum || options.ruleVersionId !== frozen.binding.ruleVersionId)
        throw new ScoringReportContentError("invalid","RULE_VERSION_MISMATCH");
      return { options:options.options };
    } catch (error) {
      if (error instanceof ScoringReportContentError) throw new ServiceError(error.kind === "blocked" ? "CONFLICT" : "SCORING_UNAVAILABLE",
        error.kind === "blocked" ? "NIQ Scoring could not list treatment effects for this assessment." : "Treatment effects are unavailable. Try again.");
      throw error;
    }
  }
  private async weightHistory(actor:Principal, org:string, row:WorkflowRow, currentKg:number|null, previousKg:number|null, recordedAt:Date):Promise<GeneratedReport["weightHistory"]> {
    const points: GeneratedReport["weightHistory"]=[];
    let hasPriorApproved=false;
    // Clinical approval determines eligibility; the saved submission determines chronology.
    for (let offset=0; points.length<5; offset+=20) {
      const prior=await this.service.db.select({id:assessments.id,snapshot:assessmentSubmissions.snapshot,recordedAt:assessmentSubmissions.createdAt})
        .from(assessments).innerJoin(assessmentSubmissions,and(eq(assessmentSubmissions.organizationId,assessments.organizationId),
          eq(assessmentSubmissions.assessmentId,assessments.id),eq(assessmentSubmissions.id,assessments.currentSubmissionId)))
        .where(and(eq(assessments.organizationId,org),eq(assessments.patientId,row.patientId),eq(assessments.status,"COMPLETED"),
          eq(assessmentSubmissions.status,"SUCCEEDED"),lt(assessmentSubmissions.createdAt,recordedAt),ne(assessments.id,row.id)))
        .orderBy(desc(assessmentSubmissions.createdAt),desc(assessments.id)).limit(20).offset(offset);
      for (const candidate of prior) {
        // Enforce facility visibility and a valid final clinical decision before reading evidence.
        try { this.source(await this.service.authorize(actor,org,candidate.id)); } catch { continue; }
        hasPriorApproved=true;
        const kg=positive(this.service.unseal<StoredWorkflow>(candidate.snapshot).answers.current_weight_kg);
        if (kg && kg<600) points.push({assessmentId:candidate.id,date:dateOnly(candidate.recordedAt),kg});
        if (points.length>=5) break;
      }
      if (prior.length<20) break;
    }
    return finishWeightHistory(points,currentKg && currentKg<600?{assessmentId:row.id,date:dateOnly(recordedAt),kg:currentKg}:null,previousKg,!hasPriorApproved);
  }
  private async chartView(report:GeneratedReport,actor:Principal,assessment:WorkflowRow):Promise<GeneratedReport> {
    if (report.status==="STALE" || report.assessment.submissionId!==assessment.currentSubmissionId) return report;
    const [submission]=await this.service.db.select().from(assessmentSubmissions).where(and(
      eq(assessmentSubmissions.organizationId,assessment.organizationId),eq(assessmentSubmissions.assessmentId,assessment.id),
      eq(assessmentSubmissions.id,report.assessment.submissionId),eq(assessmentSubmissions.status,"SUCCEEDED")));
    if (!submission) return report;
    const frozen=this.service.unseal<StoredWorkflow>(submission.snapshot);
    // Project current chart metadata for HTML without rewriting the issued report or PDF.
    return {...report,assessment:{...report.assessment,recordedAt:submission.createdAt.toISOString()},
      ...(frozen.measurementUnits ? {weightDisplayUnit:frozen.measurementUnits.weight} : {}),
      weightHistory:await this.weightHistory(actor,assessment.organizationId,assessment,positive(frozen.answers.current_weight_kg),positive(frozen.answers.previous_weight_kg),submission.createdAt)};
  }
  async generate(actor:Principal,org:string,id:string,input:{requestKey:string;productStageChoice?:"surgical"|"treatment_stage";confirmedToxicityIds?:string[]},context:RequestContext, internal=false):Promise<{report:GeneratedReport}> {
    if (!internal && input.confirmedToxicityIds?.length && !hasPermission(actor.role,"reviews.complete"))
      throw new ServiceError("FORBIDDEN","A clinician must confirm treatment effects.");
    const assessment=internal
      ? (await this.service.db.select().from(assessments).where(and(eq(assessments.organizationId,org),eq(assessments.id,id))).limit(1))[0]
      : await this.clinical(actor,org,id,"reports.manage");
    if(!assessment) throw new ServiceError("NOT_FOUND","Assessment not found.");
    const source=this.source(assessment);
    if (input.confirmedToxicityIds && JSON.stringify([...input.confirmedToxicityIds].sort())!==JSON.stringify([...source.confirmedToxicityIds].sort()))
      throw new ServiceError("CONFLICT","Confirmed treatment effects changed after clinical approval.");
    const [submission]=await this.service.db.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,org),eq(assessmentSubmissions.assessmentId,id),eq(assessmentSubmissions.id,source.submissionId)));
    if(submission?.status!=="SUCCEEDED" || !submission.result)throw new ServiceError("CONFLICT","The final scored submission is unavailable.");
    const frozen=this.service.unseal<StoredWorkflow>(submission.snapshot);
    const result=assessmentScoreResultSchema.parse(this.service.unseal(submission.result));
    if(result.checksum!==frozen.binding.checksum || result.resultReference.length===0)throw new ServiceError("CONFLICT","The submitted score does not match its rule version.");
    const decision={productStageChoice:input.productStageChoice??null,plannedTreatmentStartDate:frozen.manifest.preConditioningStartPolicy === "relative_guidance" ? null : value(frozen.answers.planned_treatment_start_date)??null,
      confirmedToxicityIds:[...source.confirmedToxicityIds].sort()};
    const fingerprint=this.currentFingerprint(assessment,frozen.binding.checksum,decision)!;
    // Lock the assessment while reserving the local request key. This serializes
    // concurrent clicks, review changes and retry claims without a network call in the transaction.
    const claim=await this.service.db.transaction(async tx=>{
      const currentAssessment=internal
        ? (await tx.select().from(assessments).where(and(eq(assessments.organizationId,org),eq(assessments.id,id))).for("update"))[0]
        : await this.service.authorize(actor,org,id,tx,true);
      if(!currentAssessment) throw new ServiceError("NOT_FOUND","Assessment not found.");
      if(this.currentFingerprint(currentAssessment,frozen.binding.checksum,decision)!==fingerprint)
        throw new ServiceError("CONFLICT","The clinical review changed. Regenerate from the completed review.");
      const [existing]=await tx.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),eq(generatedReports.requestKey,input.requestKey))).for("update");
      if(existing) {
        if(existing.sourceFingerprint && existing.sourceFingerprint!==fingerprint)throw new ServiceError("CONFLICT","This request key belongs to a different reviewed assessment.");
        if(existing.content && ["DRAFT","READY","APPROVED","STALE"].includes(existing.status))return {reportId:existing.id,replay:existing};
        if(existing.status==="GENERATING" && Date.now()-existing.updatedAt.getTime()<this.service.config.REPORT_GENERATION_TIMEOUT_MS+10_000)
          throw new ServiceError("CONFLICT","Report generation is already in progress.");
      }
      const [recent]=await tx.select({id:generatedReports.id,updatedAt:generatedReports.updatedAt}).from(generatedReports)
        .where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),eq(generatedReports.status,"GENERATING")))
        .orderBy(desc(generatedReports.updatedAt)).limit(1);
      if(recent && recent.id!==existing?.id && Date.now()-recent.updatedAt.getTime()<this.service.config.REPORT_GENERATION_TIMEOUT_MS+10_000)
        throw new ServiceError("CONFLICT","Another report generation is already in progress.");
      const reportId=existing?.id??createEntityId();
      const leaseToken=createEntityId();
      if(existing)await tx.update(generatedReports).set({status:"GENERATING",sourceFingerprint:fingerprint,failureCode:null,nextAttemptAt:null,leaseToken,attemptCount:sql`${generatedReports.attemptCount}+1`,updatedAt:new Date()}).where(eq(generatedReports.id,reportId));
      else await tx.insert(generatedReports).values({id:reportId,organizationId:org,assessmentId:id,patientId:assessment.patientId,submissionId:source.submissionId,requestKey:input.requestKey,sourceFingerprint:fingerprint,status:"GENERATING",attemptCount:1,leaseToken});
      return {reportId,replay:null,leaseToken,attemptCount:(existing?.attemptCount??0)+1};
    });
    if(claim.replay)return {report:await this.dto(claim.replay,assessment)};
    const reportId=claim.reportId;
    try {
      const [scan]=await this.service.db.select({projection:assessmentFaceScans.projection}).from(assessmentFaceScans)
        .where(and(eq(assessmentFaceScans.organizationId,org),eq(assessmentFaceScans.assessmentId,id),eq(assessmentFaceScans.isCurrent,true),eq(assessmentFaceScans.state,"COMPLETED"))).limit(1);
      const session=scan?.projection ? this.service.unseal(scan.projection) : null;
      const metrics=reportObservations(frozen.answers,frozen.manifest,assessment.completedAt!,session);
      const weightHistory=await this.weightHistory(actor,org,assessment,positive(frozen.answers.current_weight_kg),positive(frozen.answers.previous_weight_kg),submission.createdAt);
      const facts:ReportFacts={
        reviewedScore:source.reviewedScore,reviewedRiskCategoryId:source.risk.id,
        treatmentTypeIds:list(frozen.answers.current_cancer_treatment),drugClassIds:list(frozen.answers.drug_classes),
        confirmedToxicityIds:decision.confirmedToxicityIds,assessmentAnswers:reportToxicityAnswers(frozen.answers),
        coMorbidityIds:list(frozen.answers.co_morbidities),
        ...(value(frozen.answers.cancer_type)?{cancerTypeId:value(frozen.answers.cancer_type)}:{}),
        ...(["vegetarian","non_vegetarian","eggetarian","jain"].includes(value(frozen.answers.diet_preference)??"")?{dietPreferenceId:value(frozen.answers.diet_preference) as ReportFacts["dietPreferenceId"]}:{}),
        ...(value(frozen.answers.treatment_status)?{treatmentStatusId:value(frozen.answers.treatment_status)}:{}),
        ...(value(frozen.answers.cancer_surgical_status)?{surgicalStatusId:value(frozen.answers.cancer_surgical_status)}:{}),
        ...(value(frozen.answers.surgery_date)?{surgeryDate:value(frozen.answers.surgery_date)}:{}),
        ...(value(frozen.answers.planned_surgery_date)?{plannedSurgeryDate:value(frozen.answers.planned_surgery_date)}:{}),
        assessmentDate:dateOnly(assessment.completedAt!),
        ...(decision.productStageChoice?{productStageChoice:decision.productStageChoice}:{}),
        ...(decision.plannedTreatmentStartDate?{plannedTreatmentStartDate:decision.plannedTreatmentStartDate}:{}),
        // Only allowlisted measurements cross the Scoring boundary; names and free text stay local.
        observations:metrics.filter(metric=>new Set([
          "current_weight_kg","height_cm","bmi","weight_loss_percent","wellness_score","health_risk_score",
          "heart_rate","oxygen_saturation","respiratory_rate","systolic","diastolic","stress_index"
        ]).has(metric.id)).slice(0,30).map(({id,label,value,unit,measuredAt})=>({id,label,value,...(unit?{unit}:{}),...(measuredAt?{measuredAt:dateOnly(measuredAt)}:{})})),
      };
      const transport=await this.service.transport(org,context,frozen.connection);
      const generated=await requestScoringReportContent({...transport,timeoutMs:this.service.config.REPORT_GENERATION_TIMEOUT_MS,
        assessmentReference:frozen.binding.assessmentReference,resultReference:source.resultReference,idempotencyKey:reportId,facts});
      if(generated.checksum!==frozen.binding.checksum || generated.ruleVersionId!==frozen.binding.ruleVersionId)
        throw new ScoringReportContentError("invalid","RULE_VERSION_MISMATCH");
      const patient=frozen.patient as AssessmentPatient;
      const normalized=normalizeGuidance(generated,frozen.manifest);
      const { answered, total } = getAssessmentAnswerCoverage(frozen.manifest, frozen.answers);
      const data:ReportData={
        runId:generated.runId,model:generated.model,promptVersion:generated.promptVersion,generatedAt:new Date().toISOString(),
        patient:{displayName:patient.displayName,reference:patient.reference,dateOfBirth:patient.dateOfBirth,gender:patient.gender},
        assessment:{id,reference:formatAssessmentReference(assessment.serialNumber),facilityName:await this.assessmentFacilityName(assessment),completedAt:assessment.completedAt!.toISOString(),recordedAt:submission.createdAt.toISOString(),
          submissionId:source.submissionId,scoreRevision:source.scoreRevision,ruleVersionId:generated.ruleVersionId,checksum:generated.checksum},
        assessmentAnswerCoverage:{answered,total},
        classification:{id:source.risk.id!,label:source.risk.label ?? generated.classification.label,score:source.reviewedScore,
          ...(source.risk.color ? {color:source.risk.color} : {})},
        ...(generated.guidance.carePlan.nutritionalStatus ? { nutritionalStatus:
          ({ well_nourished: "Well nourished", moderately_nourished: "Moderately nourished", severely_malnourished: "Severely malnourished" } as Record<string, string>)[generated.guidance.carePlan.nutritionalStatus]
            ?? generated.guidance.carePlan.nutritionalStatus } : {}),
        ...(frozen.measurementUnits ? {weightDisplayUnit:frozen.measurementUnits.weight} : {}),
        metrics,weightHistory,decision,
        clinicalFacts:reportClinicalFacts(frozen.answers,frozen.manifest,dateOnly(assessment.completedAt!)),
        productPlans:reportProductPlans(generated),
        productCatalog:reportProductCatalog(generated),
        narrative:normalizeNarrative(generated.narrative),
        narrativeEvidence:Object.fromEntries(Object.entries(generated.narrative).map(([field, entry]) => [field, entry.evidenceIds])),
        omittedNarrativeFields:generated.omittedNarrativeFields ?? [],
        guidance:{sections:normalized.sections},
        issues:reportGenerationIssues(generated.status,[...generated.issues,...normalized.issues]),issueResolution:null,
      };
      const reviewRequired=reportNeedsClinicalReview(generated.status,data.issues);
      const [saved]=await this.service.db.transaction(async tx=>{
        const currentAssessment=internal
          ? (await tx.select().from(assessments).where(and(eq(assessments.organizationId,org),eq(assessments.id,id))).for("update"))[0]
          : await this.service.authorize(actor,org,id,tx,true);
        if(!currentAssessment) throw new ServiceError("NOT_FOUND","Assessment not found.");
        if(this.currentFingerprint(currentAssessment,generated.checksum,decision)!==fingerprint)
          throw new ServiceError("CONFLICT","The clinical review changed during report generation. Regenerate from the completed review.");
        return tx.update(generatedReports).set({status:"DRAFT",runId:generated.runId,content:this.service.seal(data),
          failureCode:reviewRequired?REPORT_REVIEW_REQUIRED:null,leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
          .where(and(eq(generatedReports.id,reportId),eq(generatedReports.organizationId,org),eq(generatedReports.status,"GENERATING"),eq(generatedReports.leaseToken,claim.leaseToken!))).returning();
      });
      if(!saved)throw new ServiceError("CONFLICT","Report generation changed while waiting for NIQ Scoring.");
      await this.service.db.update(generatedReports).set({status:"STALE",updatedAt:new Date()}).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),ne(generatedReports.id,reportId),eq(generatedReports.status,"DRAFT")));
      await this.service.audit(this.service.db,actor,context,id,"GENERATED_REPORT_CREATED",{reportId,runId:generated.runId,submissionId:source.submissionId,scoreRevision:source.scoreRevision,ruleChecksum:generated.checksum});
      return {report:await this.dto(saved,assessment)};
    } catch(error) {
      if (error instanceof ScoringReportContentPending) {
        // The Scoring job remains durable under reportId. Checking it again must
        // not spend an Application retry or start a second model run.
        await this.service.db.update(generatedReports).set({status:"QUEUED",failureCode:null,leaseToken:null,
          attemptCount:sql`${generatedReports.attemptCount}-1`,nextAttemptAt:new Date(Date.now()+5_000),updatedAt:new Date()})
          .where(and(eq(generatedReports.id,reportId),eq(generatedReports.status,"GENERATING"),eq(generatedReports.leaseToken,claim.leaseToken!)));
        throw error;
      }
      const retryable=internal && claim.attemptCount!<MAX_AUTOMATIC_REPORT_ATTEMPTS && (error instanceof ScoringReportContentError
        ? error.kind==="unavailable" && !error.terminal : !(error instanceof ServiceError && error.code==="CONFLICT"));
      await this.service.db.update(generatedReports).set({status:retryable?"QUEUED":"FAILED",failureCode:error instanceof ScoringReportContentError?error.code:"GENERATION_FAILED",leaseToken:null,
        nextAttemptAt:retryable ? new Date(Date.now()+automaticRetryDelay(claim.attemptCount!)) : null,updatedAt:new Date()})
        .where(and(eq(generatedReports.id,reportId),eq(generatedReports.status,"GENERATING"),eq(generatedReports.leaseToken,claim.leaseToken!)));
      if(error instanceof ScoringReportContentError)throw new ServiceError(error.kind==="blocked"?"CONFLICT":"SCORING_UNAVAILABLE",
        error.kind==="blocked"?"NIQ Scoring could not generate content for this assessment.":"Report content is unavailable. Try again.");
      throw error;
    }
  }
  private async editable(actor:Principal,org:string,id:string,revision:number) {
    const assessment=await this.clinical(actor,org,id,"reports.manage");
    const row=await this.latest(org,id);
    if(!row?.content)throw new ServiceError("NOT_FOUND","Generated report not found.");
    const data=this.service.unseal<ReportData>(row.content);
    if(row.status!=="DRAFT" || row.revision!==revision || this.currentFingerprint(assessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)
      throw new ServiceError("CONFLICT","The report or clinical review changed. Reload before editing.");
    return {assessment,row};
  }
  async edit(actor:Principal,org:string,id:string,input:{revision:number;narrative:Partial<GeneratedNarrative>;issueResolution?:{explanation:string}},context:RequestContext) {
    const {assessment,row}=await this.editable(actor,org,id,input.revision);
    const data=this.service.unseal<ReportData>(row.content);
    const prepared=prepareNarrativeEdit(data,input,actor.displayName,new Date());
    const [saved]=await this.service.db.transaction(async tx=>{
      const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
      if(this.currentFingerprint(currentAssessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)throw new ServiceError("CONFLICT","The clinical review changed. Regenerate the report.");
      const [updated]=await tx.update(generatedReports).set({revision:row.revision+1,content:this.service.seal(prepared.data),updatedAt:new Date()})
        .where(and(eq(generatedReports.id,row.id),eq(generatedReports.organizationId,org),eq(generatedReports.status,"DRAFT"),eq(generatedReports.revision,input.revision))).returning();
      if(!updated)throw new ServiceError("CONFLICT","Another clinician edited this report. Reload it.");
      await tx.delete(generatedReportArtifacts).where(and(eq(generatedReportArtifacts.organizationId,org),eq(generatedReportArtifacts.reportId,row.id)));
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_NARRATIVE_EDITED",{reportId:row.id,revision:updated.revision,fields:Object.keys(input.narrative),resolvedIssueCount:prepared.resolvedIssueCount});
      return [updated];
    });
    return {report:await this.dto(saved!,assessment)};
  }
  async uploadPdf(actor:Principal,org:string,id:string,revision:number,brandingFingerprint:string,body:ReadableStream<Uint8Array>,context:RequestContext) {
    const {assessment,row}=await this.editable(actor,org,id,revision);
    const reader=body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {
      while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>MAX_PDF_BYTES)throw new ServiceError("VALIDATION_ERROR","The generated PDF is too large.");chunks.push(next.value);}
    } finally {reader.releaseLock();}
    const pdf=Buffer.concat(chunks);
    assertGeneratedPdf(pdf);
    const hash=createHash("sha256").update(pdf).digest("hex");
    const key=patientDataKey(this.service.config.PATIENT_DATA_ENCRYPTION_KEY,this.service.config.SESSION_SECRET);
    await this.service.db.transaction(async tx=>{
      const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
      const data=this.service.unseal<ReportData>(row.content);
      if(this.currentFingerprint(currentAssessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)throw new ServiceError("CONFLICT","The clinical review changed. Regenerate the report.");
      const [brand]=await tx.select({displayName:organizations.displayName,logoObjectKey:organizations.logoObjectKey,
        primaryColor:organizations.primaryColor,secondaryColor:organizations.secondaryColor}).from(organizations).where(eq(organizations.id,org)).for("update");
      if(!brand || reportBrandingFingerprint(brand)!==brandingFingerprint)
        throw new ServiceError("CONFLICT","The organisation theme changed. Prepare the PDF with the current theme.");
      const [fresh]=await tx.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.id,row.id))).for("update");
      if(!fresh || fresh.status!=="DRAFT" || fresh.revision!==revision)throw new ServiceError("CONFLICT","The report changed while its PDF was being uploaded.");
      await tx.insert(generatedReportArtifacts).values({reportId:row.id,organizationId:org,assessmentId:id,revision,sha256:hash,size:pdf.length,brandingFingerprint,encryptedPdf:encryptPatientBytes(pdf,key)})
        .onConflictDoUpdate({target:generatedReportArtifacts.reportId,set:{revision,sha256:hash,size:pdf.length,brandingFingerprint,encryptedPdf:encryptPatientBytes(pdf,key),uploadedAt:new Date()}});
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_PDF_UPLOADED",{reportId:row.id,revision,sha256:hash,size:pdf.length});
    });
    const [fresh]=await this.service.db.select().from(generatedReports).where(eq(generatedReports.id,row.id));
    return {report:await this.dto(fresh!,assessment)};
  }
  async approve(actor:Principal,org:string,id:string,revision:number,reviewedSha256:string,context:RequestContext) {
    if(!hasPermission(actor.role,"reviews.complete"))throw new ServiceError("FORBIDDEN","A clinician must approve the final report.");
    const {assessment,row}=await this.editable(actor,org,id,revision);
    const data=this.service.unseal<ReportData>(row.content);
    if(data.issues.length)assertReportReadyForApproval(data.issues,null,revision);
    const [saved]=await this.service.db.transaction(async tx=>{
      const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
      if(this.currentFingerprint(currentAssessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)throw new ServiceError("CONFLICT","The clinical review changed. Regenerate the report.");
      const [brand]=await tx.select({displayName:organizations.displayName,logoObjectKey:organizations.logoObjectKey,
        primaryColor:organizations.primaryColor,secondaryColor:organizations.secondaryColor}).from(organizations).where(eq(organizations.id,org)).for("update");
      if(!brand)throw new ServiceError("NOT_FOUND","Organisation not found.");
      const [artifact]=await tx.select().from(generatedReportArtifacts).where(and(eq(generatedReportArtifacts.organizationId,org),eq(generatedReportArtifacts.reportId,row.id)));
      assertReportReadyForApproval(data.issues,artifact?.revision??null,revision);
      assertReviewedArtifact(artifact,reviewedSha256,reportBrandingFingerprint(brand));
      const [updated]=await tx.update(generatedReports).set({status:"APPROVED",failureCode:null,approvedByMembershipId:actor.membershipId,approvedAt:new Date(),updatedAt:new Date()})
        .where(and(eq(generatedReports.id,row.id),eq(generatedReports.organizationId,org),eq(generatedReports.status,"DRAFT"),eq(generatedReports.revision,revision))).returning();
      if(!updated)throw new ServiceError("CONFLICT","The report changed before approval.");
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_APPROVED",{reportId:row.id,revision,sha256:artifact!.sha256,
        submissionId:data.assessment.submissionId,scoreRevision:data.assessment.scoreRevision,ruleChecksum:data.assessment.checksum,runId:data.runId,model:data.model,promptVersion:data.promptVersion});
      return [updated];
    });
    return {report:await this.dto(saved!,assessment)};
  }
  private async automaticActor(assessment:WorkflowRow):Promise<Principal> {
    const review=reviewState(this.service,assessment);
    const completion=[...review.history].reverse().find(event=>event.action==="COMPLETE");
    if(!completion) throw new ServiceError("CONFLICT","Final clinical approval is missing.");
    return {organizationId:assessment.organizationId,membershipId:completion.actor.membershipId,
      displayName:completion.actor.displayName,role:completion.actor.role,userId:"",email:"",platformRole:"USER"};
  }
  private async finalizeAutomatic(row:ReportRow, actor:Principal, context:RequestContext) {
    const leaseToken=createEntityId();
    const leaseUntil=new Date(Date.now()+Math.max(this.service.config.REPORT_GENERATION_TIMEOUT_MS,120_000));
    const claimed=await this.service.db.transaction(async tx=>{
      const [current]=await tx.select().from(generatedReports).where(eq(generatedReports.id,row.id)).for("update");
      if(!current || current.status!=="DRAFT" || current.nextAttemptAt && current.nextAttemptAt>new Date())return null;
      const issues=current.content ? this.service.unseal<ReportData>(current.content).issues : [];
      if(!automaticReportCanFinalize(current.status,current.failureCode,issues)) {
        if(current.failureCode!==REPORT_REVIEW_REQUIRED)
          await tx.update(generatedReports).set({failureCode:REPORT_REVIEW_REQUIRED,nextAttemptAt:null,leaseToken:null,updatedAt:new Date()})
            .where(eq(generatedReports.id,row.id));
        return null;
      }
      const [updated]=await tx.update(generatedReports).set({leaseToken,nextAttemptAt:leaseUntil,attemptCount:sql`${generatedReports.attemptCount}+1`,updatedAt:new Date()})
        .where(eq(generatedReports.id,row.id)).returning();
      return updated;
    });
    if(!claimed?.content)return;
    try {
      const [assessment]=await this.service.db.select().from(assessments).where(and(eq(assessments.organizationId,row.organizationId),eq(assessments.id,row.assessmentId)));
      if(!assessment)throw new ServiceError("NOT_FOUND","Assessment not found.");
      const report=await this.dto(claimed,assessment);
      if(report.status==="STALE")throw new ServiceError("CONFLICT","The approved assessment changed.");
      if(!automaticReportCanFinalize(claimed.status,claimed.failureCode,report.issues))
        throw new AutomaticReportReviewRequired();
      const [brand]=await this.service.db.select({displayName:organizations.displayName,logoObjectKey:organizations.logoObjectKey,
        primaryColor:organizations.primaryColor,secondaryColor:organizations.secondaryColor}).from(organizations).where(eq(organizations.id,row.organizationId));
      if(!brand)throw new ServiceError("NOT_FOUND","Organisation not found.");
      const brandFingerprint=reportBrandingFingerprint(brand);
      const [asset]=brand.logoObjectKey ? await this.service.db.select({content:organizationBrandAssets.content,mimeType:organizationBrandAssets.mimeType})
        .from(organizationBrandAssets).where(and(eq(organizationBrandAssets.organizationId,row.organizationId),eq(organizationBrandAssets.id,brand.logoObjectKey.replace(/^database:/,"")))) : [];
      const bytes=await renderGeneratedReportPdf(report,{name:brand.displayName,primaryColor:brand.primaryColor,secondaryColor:brand.secondaryColor,
        logo:asset?{data:new Uint8Array(asset.content),mimeType:asset.mimeType}:null});
      const pdf=Buffer.from(bytes);
      assertGeneratedPdf(pdf);
      const hash=createHash("sha256").update(pdf).digest("hex");
      const key=patientDataKey(this.service.config.PATIENT_DATA_ENCRYPTION_KEY,this.service.config.SESSION_SECRET);
      await this.service.db.transaction(async tx=>{
        const [currentAssessment]=await tx.select().from(assessments).where(and(eq(assessments.organizationId,row.organizationId),eq(assessments.id,row.assessmentId))).for("update");
        if(!currentAssessment || this.currentFingerprint(currentAssessment,report.assessment.checksum,report.decision)!==row.sourceFingerprint)
          throw new ServiceError("CONFLICT","The approved assessment changed during report generation.");
        const [currentBrand]=await tx.select({displayName:organizations.displayName,logoObjectKey:organizations.logoObjectKey,
          primaryColor:organizations.primaryColor,secondaryColor:organizations.secondaryColor}).from(organizations).where(eq(organizations.id,row.organizationId)).for("update");
        if(!currentBrand || reportBrandingFingerprint(currentBrand)!==brandFingerprint)
          throw new ServiceError("CONFLICT","The organisation theme changed during report generation.");
        const [current]=await tx.select().from(generatedReports).where(eq(generatedReports.id,row.id)).for("update");
        if(!current || current.status!=="DRAFT" || current.leaseToken!==leaseToken || current.revision!==claimed.revision)
          throw new ServiceError("CONFLICT","The report changed during PDF generation.");
        if(current.failureCode===REPORT_REVIEW_REQUIRED || !current.content || this.service.unseal<ReportData>(current.content).issues.length)
          throw new AutomaticReportReviewRequired();
        await tx.insert(generatedReportArtifacts).values({reportId:row.id,organizationId:row.organizationId,assessmentId:row.assessmentId,
          revision:current.revision,sha256:hash,size:pdf.length,brandingFingerprint:brandFingerprint,encryptedPdf:encryptPatientBytes(pdf,key)})
          .onConflictDoUpdate({target:generatedReportArtifacts.reportId,set:{revision:current.revision,sha256:hash,size:pdf.length,
            brandingFingerprint:brandFingerprint,encryptedPdf:encryptPatientBytes(pdf,key),uploadedAt:new Date()}});
        await tx.update(generatedReports).set({status:"READY",leaseToken:null,nextAttemptAt:null,failureCode:null,updatedAt:new Date()})
          .where(eq(generatedReports.id,row.id));
        await this.service.audit(tx,actor,context,row.assessmentId,"GENERATED_REPORT_READY",{reportId:row.id,revision:current.revision,
          sha256:hash,runId:report.runId,ruleChecksum:report.assessment.checksum,model:report.model,promptVersion:report.promptVersion});
      });
    } catch(error) {
      const reviewRequired=error instanceof AutomaticReportReviewRequired;
      const retryable=!reviewRequired && claimed.attemptCount<5 && !(error instanceof ServiceError && error.code==="NOT_FOUND");
      await this.service.db.update(generatedReports).set({status:retryable||reviewRequired?"DRAFT":"FAILED",failureCode:reviewRequired?REPORT_REVIEW_REQUIRED:"PDF_RENDER_FAILED",leaseToken:null,
        nextAttemptAt:retryable?new Date(Date.now()+automaticRetryDelay(claimed.attemptCount)):null,updatedAt:new Date()})
        .where(and(eq(generatedReports.id,row.id),eq(generatedReports.status,"DRAFT"),eq(generatedReports.leaseToken,leaseToken)));
      throw error;
    }
  }
  private async recoverReviewRequired(row:ReportRow, actor:Principal, context:RequestContext) {
    // A Scoring run is terminal once it returns REVIEW_REQUIRED. Start a new
    // report row (and therefore a new Scoring idempotency key) while retaining
    // the cumulative automatic generation budget from the reviewed attempt.
    await this.service.db.transaction(async tx=>{
      const [assessment]=await tx.select().from(assessments)
        .where(and(eq(assessments.organizationId,row.organizationId),eq(assessments.id,row.assessmentId))).for("update");
      if(!assessment) throw new ServiceError("NOT_FOUND","Assessment not found.");
      const [latest]=await tx.select().from(generatedReports)
        .where(and(eq(generatedReports.organizationId,row.organizationId),eq(generatedReports.assessmentId,row.assessmentId)))
        .orderBy(desc(generatedReports.createdAt),desc(generatedReports.id)).limit(1).for("update");
      if(!latest || latest.id!==row.id || !["DRAFT","FAILED"].includes(latest.status) || latest.failureCode!==REPORT_REVIEW_REQUIRED) return;
      if(latest.attemptCount>=MAX_AUTOMATIC_REPORT_ATTEMPTS) {
        await tx.update(generatedReports).set({status:"FAILED",failureCode:"AUTOMATIC_REVIEW_RECOVERY_EXHAUSTED",
          leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
          .where(and(eq(generatedReports.id,latest.id),eq(generatedReports.status,latest.status),eq(generatedReports.failureCode,REPORT_REVIEW_REQUIRED)));
        return;
      }
      // Validate that the approved frozen source is still available and valid
      // before reserving a successor. generate() repeats this before Scoring.
      const source=this.source(assessment);
      const previousData=latest.content ? this.service.unseal<ReportData>(latest.content) : null;
      if(previousData && latest.sourceFingerprint && this.currentFingerprint(assessment,previousData.assessment.checksum,previousData.decision)!==latest.sourceFingerprint) {
        await tx.update(generatedReports).set({status:"FAILED",failureCode:"APPROVAL_SOURCE_INVALID",leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
          .where(and(eq(generatedReports.id,latest.id),eq(generatedReports.status,latest.status)));
        return;
      }
      const requestKey=`${AUTOMATIC_REPORT_KEY_PREFIX}${source.submissionId}:recovery:${latest.id}`;
      const [existing]=await tx.select({id:generatedReports.id}).from(generatedReports)
        .where(and(eq(generatedReports.organizationId,row.organizationId),eq(generatedReports.assessmentId,row.assessmentId),eq(generatedReports.requestKey,requestKey))).limit(1);
      if(existing) return;
      await tx.insert(generatedReports).values({id:createEntityId(),organizationId:row.organizationId,assessmentId:row.assessmentId,
        patientId:assessment.patientId,submissionId:source.submissionId,requestKey,sourceFingerprint:"",status:"QUEUED",
        attemptCount:latest.attemptCount,createdAt:new Date(Math.max(Date.now(),latest.createdAt.getTime()+1))});
      await this.service.audit(tx,actor,context,row.assessmentId,"GENERATED_REPORT_RECOVERY_REQUESTED",{
        previousReportId:latest.id,submissionId:source.submissionId,attemptCount:latest.attemptCount});
    });
  }
  async processDue(limit=3) {
    const now=new Date();
    const expired=new Date(Date.now()-this.service.config.REPORT_GENERATION_TIMEOUT_MS-30_000);
    const latestReview = sql`not exists (select 1 from generated_reports newer where newer.organization_id = ${generatedReports.organizationId}
      and newer.assessment_id = ${generatedReports.assessmentId}
      and (newer.created_at > ${generatedReports.createdAt} or (newer.created_at = ${generatedReports.createdAt} and newer.id > ${generatedReports.id})))`;
    const reviewRecoveryDue=and(or(eq(generatedReports.status,"DRAFT"),eq(generatedReports.status,"FAILED")),
      eq(generatedReports.failureCode,REPORT_REVIEW_REQUIRED),latestReview,
      or(isNull(generatedReports.nextAttemptAt),lte(generatedReports.nextAttemptAt,now)));
    const rows=await this.service.db.select().from(generatedReports).where(and(or(
      like(generatedReports.requestKey,`${AUTOMATIC_REPORT_KEY_PREFIX}%`),reviewRecoveryDue),or(
      and(eq(generatedReports.status,"QUEUED"),or(isNull(generatedReports.nextAttemptAt),lte(generatedReports.nextAttemptAt,now))),
      and(eq(generatedReports.status,"GENERATING"),lte(generatedReports.updatedAt,expired)),
      and(eq(generatedReports.status,"DRAFT"),or(isNull(generatedReports.failureCode),ne(generatedReports.failureCode,REPORT_REVIEW_REQUIRED)),
        or(isNull(generatedReports.nextAttemptAt),lte(generatedReports.nextAttemptAt,now))),
      and(eq(generatedReports.status,"FAILED"),ne(generatedReports.failureCode,REPORT_REVIEW_REQUIRED),lte(generatedReports.nextAttemptAt,now)),
      reviewRecoveryDue,
    ))).orderBy(generatedReports.createdAt).limit(limit);
    await Promise.allSettled(rows.map(async row=>{
      const context={requestId:createEntityId()};
      try {
        if ((row.status==="QUEUED" || row.status==="GENERATING") && row.attemptCount>=MAX_AUTOMATIC_REPORT_ATTEMPTS) {
          await this.service.db.update(generatedReports).set({status:"FAILED",failureCode:"AUTOMATIC_RETRIES_EXHAUSTED",
            leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
            .where(and(eq(generatedReports.id,row.id),eq(generatedReports.status,row.status),eq(generatedReports.attemptCount,row.attemptCount)));
          return;
        }
        const [assessment]=await this.service.db.select().from(assessments).where(and(eq(assessments.organizationId,row.organizationId),eq(assessments.id,row.assessmentId)));
        if(!assessment)throw new ServiceError("NOT_FOUND","Assessment not found.");
        const actor=await this.automaticActor(assessment);
        if((row.status==="DRAFT" || row.status==="FAILED") && row.failureCode===REPORT_REVIEW_REQUIRED)
          return await this.recoverReviewRequired(row,actor,context);
        if(row.status==="DRAFT")return await this.finalizeAutomatic(row,actor,context);
        const recoveryPredecessorId=row.requestKey.match(/:recovery:([A-Za-z0-9]+)$/)?.[1];
        const [predecessor]=recoveryPredecessorId ? await this.service.db.select().from(generatedReports)
          .where(and(eq(generatedReports.organizationId,row.organizationId),eq(generatedReports.assessmentId,row.assessmentId),eq(generatedReports.id,recoveryPredecessorId))).limit(1) : [];
        const predecessorDecision=predecessor?.content ? this.service.unseal<ReportData>(predecessor.content).decision : undefined;
        const {report}=await this.generate(actor,row.organizationId,row.assessmentId,{requestKey:row.requestKey,
          ...(predecessorDecision?.productStageChoice ? {productStageChoice:predecessorDecision.productStageChoice} : {})},context,true);
        if(report.status==="DRAFT") {
          const [current]=await this.service.db.select().from(generatedReports).where(eq(generatedReports.id,report.id));
          if(current && automaticReportCanFinalize(current.status,current.failureCode,report.issues))
            await this.finalizeAutomatic(current,actor,context);
        }
      } catch(error) {
        // Source failures before a claim cannot be retried by generate. This
        // also covers an expired generation lease after its source changed.
        const invalidSource=error instanceof ServiceError && (error.code==="NOT_FOUND" ||
          error.code==="CONFLICT" && !error.message.includes("in progress"));
        if((row.status==="QUEUED" || row.status==="GENERATING" || row.failureCode===REPORT_REVIEW_REQUIRED) && invalidSource)
          await this.service.db.update(generatedReports).set({status:"FAILED",failureCode:"APPROVAL_SOURCE_INVALID",leaseToken:null,nextAttemptAt:null,updatedAt:new Date()})
            .where(and(eq(generatedReports.id,row.id),eq(generatedReports.status,row.status),eq(generatedReports.attemptCount,row.attemptCount)));
        if(row.failureCode===REPORT_REVIEW_REQUIRED && !invalidSource) {
          const attempts=row.attemptCount+1;
          await this.service.db.update(generatedReports).set({attemptCount:attempts,
            status:attempts>=MAX_AUTOMATIC_REPORT_ATTEMPTS?"FAILED":row.status,
            failureCode:attempts>=MAX_AUTOMATIC_REPORT_ATTEMPTS?"AUTOMATIC_REVIEW_RECOVERY_FAILED":REPORT_REVIEW_REQUIRED,
            leaseToken:null,nextAttemptAt:attempts>=MAX_AUTOMATIC_REPORT_ATTEMPTS?null:new Date(Date.now()+automaticRetryDelay(attempts)),updatedAt:new Date()})
            .where(and(eq(generatedReports.id,row.id),eq(generatedReports.status,row.status),eq(generatedReports.failureCode,REPORT_REVIEW_REQUIRED),eq(generatedReports.attemptCount,row.attemptCount)));
        }
        console.warn("Automatic report generation delayed",{reportId:row.id,error:error instanceof Error?error.message:String(error)});
      }
    }));
  }
  async refreshReadyPdf(actor:Principal,org:string,id:string,context:RequestContext) {
    const assessment=await this.clinical(actor,org,id,"reports.manage");
    const [row]=await this.service.db.select().from(generatedReports)
      .where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),or(eq(generatedReports.status,"READY"),eq(generatedReports.status,"APPROVED"))))
      .orderBy(desc(generatedReports.createdAt),desc(generatedReports.id)).limit(1);
    if(!row?.content)throw new ServiceError("NOT_FOUND","A final report PDF is not available.");
    const data=this.service.unseal<ReportData>(row.content);
    assertReadyPdfRefresh(row.status,data.issues);
    if(this.currentFingerprint(assessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)
      throw new ServiceError("CONFLICT","The clinical review changed. Regenerate the report.");
    const report=await this.dto(row,assessment);
    if(report.status!=="READY")throw new ServiceError("CONFLICT","The report is stale. Regenerate it before refreshing the PDF.");
    const [brand]=await this.service.db.select({displayName:organizations.displayName,logoObjectKey:organizations.logoObjectKey,
      primaryColor:organizations.primaryColor,secondaryColor:organizations.secondaryColor}).from(organizations).where(eq(organizations.id,org));
    if(!brand)throw new ServiceError("NOT_FOUND","Organisation not found.");
    const brandingFingerprint=reportBrandingFingerprint(brand);
    const [asset]=brand.logoObjectKey ? await this.service.db.select({content:organizationBrandAssets.content,mimeType:organizationBrandAssets.mimeType})
      .from(organizationBrandAssets).where(and(eq(organizationBrandAssets.organizationId,org),eq(organizationBrandAssets.id,brand.logoObjectKey.replace(/^database:/,"")))) : [];
    const pdf=Buffer.from(await renderGeneratedReportPdf(report,{name:brand.displayName,primaryColor:brand.primaryColor,secondaryColor:brand.secondaryColor,
      logo:asset?{data:new Uint8Array(asset.content),mimeType:asset.mimeType}:null}));
    assertGeneratedPdf(pdf);
    const hash=createHash("sha256").update(pdf).digest("hex");
    const key=patientDataKey(this.service.config.PATIENT_DATA_ENCRYPTION_KEY,this.service.config.SESSION_SECRET);
    const saved=await this.service.db.transaction(async tx=>{
      const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
      if(this.currentFingerprint(currentAssessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)
        throw new ServiceError("CONFLICT","The clinical review changed during PDF refresh.");
      const [currentBrand]=await tx.select({displayName:organizations.displayName,logoObjectKey:organizations.logoObjectKey,
        primaryColor:organizations.primaryColor,secondaryColor:organizations.secondaryColor}).from(organizations).where(eq(organizations.id,org)).for("update");
      if(!currentBrand || reportBrandingFingerprint(currentBrand)!==brandingFingerprint)
        throw new ServiceError("CONFLICT","The organisation theme changed during PDF refresh.");
      const [current]=await tx.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.id,row.id))).for("update");
      if(!current?.content || current.status!=="READY" || current.revision!==row.revision || sha(current.content)!==sha(row.content))
        throw new ServiceError("CONFLICT","The report changed during PDF refresh. Reload it before trying again.");
      const [previous]=await tx.select({sha256:generatedReportArtifacts.sha256}).from(generatedReportArtifacts)
        .where(and(eq(generatedReportArtifacts.organizationId,org),eq(generatedReportArtifacts.reportId,row.id))).for("update");
      await tx.insert(generatedReportArtifacts).values({reportId:row.id,organizationId:org,assessmentId:id,
        revision:row.revision,sha256:hash,size:pdf.length,brandingFingerprint,encryptedPdf:encryptPatientBytes(pdf,key)})
        .onConflictDoUpdate({target:generatedReportArtifacts.reportId,set:{revision:row.revision,sha256:hash,size:pdf.length,
          brandingFingerprint,encryptedPdf:encryptPatientBytes(pdf,key),uploadedAt:new Date()}});
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_PDF_REFRESHED",{reportId:row.id,revision:row.revision,
        previousSha256:previous?.sha256??null,sha256:hash,size:pdf.length});
      return current;
    });
    return {report:await this.dto(saved,assessment)};
  }
  async downloadPdf(actor:Principal,org:string,id:string) {
    const assessment=await this.clinical(actor,org,id);
    // A later attempt does not withdraw the last completed PDF from clinical use.
    const [row]=await this.service.db.select().from(generatedReports)
      .where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),or(eq(generatedReports.status,"READY"),eq(generatedReports.status,"APPROVED"))))
      .orderBy(desc(generatedReports.createdAt),desc(generatedReports.id)).limit(1);
    if(!row?.content)
      throw new ServiceError("NOT_FOUND","A final report PDF is not available.");
    const data=this.service.unseal<ReportData>(row.content);
    assertReportPdfDownloadable(data.issues);
    if(this.currentFingerprint(assessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)
      throw new ServiceError("NOT_FOUND","A final report PDF is not available.");
    const artifact=await this.artifact(org,row.id);
    if(!artifact || artifact.revision!==row.revision)throw new ServiceError("NOT_FOUND","The final PDF is unavailable.");
    const pdf=decryptPatientBytes(artifact.encryptedPdf,patientDataKey(this.service.config.PATIENT_DATA_ENCRYPTION_KEY,this.service.config.SESSION_SECRET));
    if(createHash("sha256").update(pdf).digest("hex")!==artifact.sha256)throw new ServiceError("CONFLICT","The final PDF failed its integrity check.");
    return {pdf,sha256:artifact.sha256};
  }
}
