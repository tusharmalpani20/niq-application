import { createHash } from "node:crypto";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { formatAssessmentReference, hasPermission, type AssessmentFormManifest, type FormAnswers } from "@niq/application-contracts";
import type { GeneratedReport, GeneratedReportSection, GeneratedNarrative } from "../../../../packages/contracts/src/generated-report";
import { assessmentScoreResultSchema, type AssessmentPatient } from "../../../../packages/contracts/src/assessment-workflow";
import { assessmentFaceScans, assessmentSubmissions, assessments, generatedReportArtifacts, generatedReports } from "../db/schema";
import { decryptPatientBytes, encryptPatientBytes, patientDataKey } from "../security/patient-data";
import { reviewState } from "./clinical-review-state";
import { ServiceError, type Principal, type RequestContext } from "./application";
import type { AssessmentWorkflowService, StoredWorkflow, WorkflowRow } from "./assessment-workflow";
import { requestScoringReportContent, ScoringReportContentError, type ReportFacts, type ScoringReportContent } from "./scoring-report-content";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
type ReportData = Omit<GeneratedReport, "id" | "revision" | "status" | "approvedAt" | "artifact">;
type ReportRow = typeof generatedReports.$inferSelect;
type ArtifactRow = typeof generatedReportArtifacts.$inferSelect;
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const value = (answer: FormAnswers[string] | undefined): string | undefined => typeof answer === "string" && answer ? answer : undefined;
const list = (answer: FormAnswers[string] | undefined): string[] => Array.isArray(answer) ? answer.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const positive = (answer: FormAnswers[string] | undefined): number | null => typeof answer === "number" && Number.isFinite(answer) && answer > 0 ? answer : null;
const fieldLabel = (manifest: AssessmentFormManifest, fieldId: string, optionId: string): string | undefined =>
  manifest.sections.flatMap(section => section.fields).find(field => field.id === fieldId)?.options?.find(option => option.id === optionId)?.label;
const dateOnly = (date: Date | string): string => new Date(date).toISOString().slice(0, 10);
const nonempty = (text: unknown): text is string => typeof text === "string" && text.trim().length > 0;

export function finishWeightHistory(priorMostRecentFirst: GeneratedReport["weightHistory"], current: GeneratedReport["weightHistory"][number] | null, previousKg: number | null): GeneratedReport["weightHistory"] {
  const points = [...priorMostRecentFirst];
  if (current) points.unshift(current);
  if (points.length < 2 && previousKg && previousKg < 600 && previousKg !== current?.kg)
    points.push({ date: null, kg: previousKg, label: "Previous weight (date not recorded)" });
  const unique = new Map(points.reverse().map(point => [point.date ?? "undated", point]));
  return [...unique.values()].slice(-6);
}

export function assertReportReadyForApproval(issues: string[], artifactRevision: number | null, reportRevision: number, narrative: GeneratedNarrative) {
  if (issues.length) throw new ServiceError("CONFLICT", "Resolve report-generation issues before approval.");
  if (Object.values(narrative).some(text => !text.trim())) throw new ServiceError("CONFLICT", "Complete every report text section before approval.");
  if (artifactRevision !== reportRevision) throw new ServiceError("CONFLICT", "Generate the final PDF for this report revision before approving.");
}

export function assertGeneratedPdf(pdf: Buffer) {
  if (pdf.length > MAX_PDF_BYTES) throw new ServiceError("VALIDATION_ERROR", "The generated PDF is too large.");
  if (pdf.length < 20 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-" || !pdf.subarray(-1024).toString("latin1").includes("%%EOF"))
    throw new ServiceError("VALIDATION_ERROR", "Upload a valid generated PDF.");
}

export function prepareNarrativeEdit(data: ReportData, input: { narrative: Partial<GeneratedNarrative>; issueResolution?: { explanation: string } }, clinicianName: string, now: Date) {
  const narrative = { ...data.narrative, ...input.narrative };
  if (input.issueResolution && !data.issues.length) throw new ServiceError("VALIDATION_ERROR", "There are no generation issues to resolve.");
  if (input.issueResolution && Object.values(narrative).some(text => !text.trim())) throw new ServiceError("VALIDATION_ERROR", "Complete every report text section before resolving generation issues.");
  const resolution = input.issueResolution
    ? { originalIssues: data.issues, explanation: input.issueResolution.explanation, clinicianName, resolvedAt: now.toISOString() }
    : data.issueResolution;
  return { data: { ...data, narrative, ...(input.issueResolution ? { issues: [], issueResolution: resolution } : {}) }, resolvedIssueCount: input.issueResolution ? data.issues.length : 0 };
}

export function normalizeGuidance(content: ScoringReportContent, manifest: AssessmentFormManifest): {sections:GeneratedReportSection[]; issues:string[]} {
  const sections: GeneratedReportSection[] = [];
  const issues:string[]=[];
  const add = (entry: GeneratedReportSection) => { if (entry.text.trim()) sections.push(entry); };
  const classLabel = (id:string) => fieldLabel(manifest,"drug_classes",id) ?? "Selected drug class";
  const treatmentLabel = (id:string) => fieldLabel(manifest,"current_cancer_treatment",id) ?? "Treatment";
  for (const row of content.guidance.nutritionInterventions)
    add({ id: row.id, kind: "nutrition", title: row.label, text: [row.coreStrategy, row.clinicalActions].filter(nonempty).join("\n") });
  // Matching a class is never evidence that an individual patient has this toxicity.
  for (const row of content.guidance.possibleToxicities ?? [])
    add({ id: row.id, kind: "toxicity", title: "Possible treatment effect: " + row.expectedToxicity,
      text: "If this effect occurs:\n" + row.nutritionalInterventions, drugClass: classLabel(row.classId), certainty: "possible" });
  for (const row of content.guidance.toxicityInterventions)
    add({ id: row.id, kind: "toxicity", title: row.expectedToxicity, text: row.nutritionalInterventions, drugClass: classLabel(row.classId), certainty: "confirmed" });
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
  for (const row of products.plans)
    add({ id: row.id, kind: "product", title: "Product plan", text: [row.products, row.dose, row.duration].filter(nonempty).join("\n") });
  for (const row of products.notes) add({id:row.id,kind:"product",title:row.label,text:row.guidance});
  if(products.status==="clinician_choice_required") {
    const names=(products.choices??[]).map(row=>row.stage).join(" or ");
    issues.push("Choose the appropriate product stage"+(names?" ("+names+")":"")+" and regenerate, or document why no plan should be selected.");
  }
  if(products.status==="facts_required") issues.push("Confirm the facts needed for the product plan and regenerate, or document why the plan is omitted."+(products.reason?" "+products.reason:""));
  return {sections,issues};
}

function reportObservations(answers: FormAnswers, manifest: AssessmentFormManifest, completedAt: Date, scan: unknown) {
  const metrics: GeneratedReport["metrics"] = [];
  const add = (id: string, label: string, raw: number | string | null | undefined, unit?: string, source: "assessment" | "face_scan" = "assessment", measuredAt?: string) => {
    if (raw === null || raw === undefined || raw === "") return;
    metrics.push({ id, label, value: String(raw), ...(unit ? {unit} : {}), ...(measuredAt ? {measuredAt} : {}), source });
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
  const session = scan as { completedAt?: string | null; result?: {
    wellnessScore?: number | null; healthRiskScore?: number | null;
    vitals?: { heartRate?: number | null; oxygenSaturation?: number | null; respiratoryRate?: number | null; systolic?: number | null; diastolic?: number | null };
  }; score?: { stressIndex?: number | null; stressBand?: string | null } } | null;
  const measuredAt = session?.completedAt ?? undefined;
  const face = (id: string, label: string, raw: number | string | null | undefined, unit?: string) => add(id,label,raw,unit,"face_scan",measuredAt);
  face("wellness_score","Wellness score",session?.result?.wellnessScore,"/100");
  face("health_risk_score","Health risk score",session?.result?.healthRiskScore,"/100");
  face("heart_rate","Heart rate",session?.result?.vitals?.heartRate,"bpm");
  face("oxygen_saturation","Oxygen saturation",session?.result?.vitals?.oxygenSaturation,"%");
  face("respiratory_rate","Breathing rate",session?.result?.vitals?.respiratoryRate,"/min");
  face("systolic","Systolic blood pressure",session?.result?.vitals?.systolic,"mmHg");
  face("diastolic","Diastolic blood pressure",session?.result?.vitals?.diastolic,"mmHg");
  face("stress_index","Stress index",session?.score?.stressIndex);
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
    const final = review.finalSnapshot as { submissionId?: string | null; scoreRevision?: number; score?: { overall?: { reviewedPoints?: number | null }; risk?: { status?: string; resultReference?: string | null; classification?: { id?: string; label?: string } | null } } } | undefined;
    if (row.status !== "COMPLETED" || !row.currentSubmissionId || !row.completedAt || !final || final.submissionId !== row.currentSubmissionId
      || !Number.isInteger(final.scoreRevision) || final.scoreRevision! < 0
      || !Number.isFinite(final.score?.overall?.reviewedPoints) || (final.score?.overall?.reviewedPoints ?? -1) < 0
      || !["ORIGINAL","CONFIRMED"].includes(final.score?.risk?.status ?? "") || !final.score?.risk?.classification?.id || !final.score?.risk?.resultReference)
      throw new ServiceError("CONFLICT","Complete the clinical review and confirm its risk classification before generating a report.");
    return { submissionId: row.currentSubmissionId, scoreRevision: final.scoreRevision!, reviewedScore: final.score!.overall!.reviewedPoints!, risk: final.score!.risk!.classification!, resultReference:final.score!.risk!.resultReference!, completedAt: row.completedAt };
  }
  private currentFingerprint(row: WorkflowRow, checksum: string, decision?:GeneratedReport["decision"]): string | null {
    try {
      const source = this.source(row);
      return sha({ submissionId:source.submissionId,scoreRevision:source.scoreRevision,completedAt:source.completedAt.toISOString(),reviewedScore:source.reviewedScore,riskId:source.risk.id,resultReference:source.resultReference,checksum,decision:decision??{productStageChoice:null,plannedTreatmentStartDate:null} });
    } catch { return null; }
  }
  private async latest(org: string, id: string): Promise<ReportRow | undefined> {
    const [row] = await this.service.db.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),ne(generatedReports.status,"FAILED"))).orderBy(desc(generatedReports.createdAt),desc(generatedReports.id)).limit(1);
    return row;
  }
  private async artifact(org: string, reportId: string): Promise<ArtifactRow | undefined> {
    const [row] = await this.service.db.select().from(generatedReportArtifacts).where(and(eq(generatedReportArtifacts.organizationId,org),eq(generatedReportArtifacts.reportId,reportId)));
    return row;
  }
  private async dto(row: ReportRow, assessment: WorkflowRow): Promise<GeneratedReport> {
    if (!row.content) throw new ServiceError("CONFLICT","The report is still generating.");
    const data = this.service.unseal<ReportData>(row.content);
    const artifact = await this.artifact(row.organizationId,row.id);
    const stale = row.status === "STALE" || this.currentFingerprint(assessment,data.assessment.checksum,data.decision) !== row.sourceFingerprint;
    return { ...data,id:row.id,revision:row.revision,status:stale?"STALE":row.status as GeneratedReport["status"],approvedAt:row.approvedAt?.toISOString() ?? null,
      artifact:artifact && artifact.revision === row.revision ? {sha256:artifact.sha256,size:artifact.size,uploadedAt:artifact.uploadedAt.toISOString()}:null };
  }
  async read(actor: Principal, org: string, id: string): Promise<{report: GeneratedReport | null}> {
    const assessment=await this.clinical(actor,org,id);
    const row=await this.latest(org,id);
    return {report:row?.content ? await this.dto(row,assessment):null};
  }
  private async weightHistory(actor:Principal, org:string, row:WorkflowRow, currentKg:number|null, previousKg:number|null):Promise<GeneratedReport["weightHistory"]> {
    const prior=await this.service.db.select({id:assessments.id,completedAt:assessments.completedAt,currentSubmissionId:assessments.currentSubmissionId})
      .from(assessments).where(and(eq(assessments.organizationId,org),eq(assessments.patientId,row.patientId),eq(assessments.status,"COMPLETED"),
        lt(assessments.completedAt,row.completedAt!),ne(assessments.id,row.id))).orderBy(desc(assessments.completedAt)).limit(8);
    const points: GeneratedReport["weightHistory"]=[];
    for (const candidate of prior) {
      if (!candidate.currentSubmissionId || !candidate.completedAt) continue;
      // Prior reports may belong to another facility; use the ordinary assessment visibility check.
      try { await this.service.authorize(actor,org,candidate.id); } catch { continue; }
      const [submission]=await this.service.db.select({snapshot:assessmentSubmissions.snapshot,status:assessmentSubmissions.status})
        .from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,org),eq(assessmentSubmissions.assessmentId,candidate.id),eq(assessmentSubmissions.id,candidate.currentSubmissionId)));
      if (submission?.status!=="SUCCEEDED") continue;
      const kg=positive(this.service.unseal<StoredWorkflow>(submission.snapshot).answers.current_weight_kg);
      if (kg && kg < 600) points.push({date:dateOnly(candidate.completedAt),kg});
      if (points.length>=5) break;
    }
    return finishWeightHistory(points,currentKg && currentKg<600?{date:dateOnly(row.completedAt!),kg:currentKg}:null,previousKg);
  }
  async generate(actor:Principal,org:string,id:string,input:{requestKey:string;productStageChoice?:"surgical"|"treatment_stage";plannedTreatmentStartDate?:string},context:RequestContext):Promise<{report:GeneratedReport}> {
    const assessment=await this.clinical(actor,org,id,"reports.manage");
    const source=this.source(assessment);
    const [submission]=await this.service.db.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,org),eq(assessmentSubmissions.assessmentId,id),eq(assessmentSubmissions.id,source.submissionId)));
    if(submission?.status!=="SUCCEEDED" || !submission.result)throw new ServiceError("CONFLICT","The final scored submission is unavailable.");
    const frozen=this.service.unseal<StoredWorkflow>(submission.snapshot);
    const result=assessmentScoreResultSchema.parse(this.service.unseal(submission.result));
    if(result.checksum!==frozen.binding.checksum || result.resultReference.length===0)throw new ServiceError("CONFLICT","The submitted score does not match its rule version.");
    const decision={productStageChoice:input.productStageChoice??null,plannedTreatmentStartDate:input.plannedTreatmentStartDate??null};
    const fingerprint=this.currentFingerprint(assessment,frozen.binding.checksum,decision)!;
    // Lock the assessment while reserving the local request key. This serializes
    // concurrent clicks, review changes and retry claims without a network call in the transaction.
    const claim=await this.service.db.transaction(async tx=>{
      const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
      if(this.currentFingerprint(currentAssessment,frozen.binding.checksum,decision)!==fingerprint)
        throw new ServiceError("CONFLICT","The clinical review changed. Regenerate from the completed review.");
      const [existing]=await tx.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),eq(generatedReports.requestKey,input.requestKey))).for("update");
      if(existing) {
        if(existing.sourceFingerprint!==fingerprint)throw new ServiceError("CONFLICT","This request key belongs to a different reviewed assessment.");
        if(existing.content && ["DRAFT","APPROVED","STALE"].includes(existing.status))return {reportId:existing.id,replay:existing};
        if(existing.status==="GENERATING" && Date.now()-existing.updatedAt.getTime()<this.service.config.REPORT_GENERATION_TIMEOUT_MS+10_000)
          throw new ServiceError("CONFLICT","Report generation is already in progress.");
      }
      const [recent]=await tx.select({id:generatedReports.id,updatedAt:generatedReports.updatedAt}).from(generatedReports)
        .where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),eq(generatedReports.status,"GENERATING")))
        .orderBy(desc(generatedReports.updatedAt)).limit(1);
      if(recent && recent.id!==existing?.id && Date.now()-recent.updatedAt.getTime()<this.service.config.REPORT_GENERATION_TIMEOUT_MS+10_000)
        throw new ServiceError("CONFLICT","Another report generation is already in progress.");
      const reportId=existing?.id??createEntityId();
      if(existing)await tx.update(generatedReports).set({status:"GENERATING",failureCode:null,updatedAt:new Date()}).where(eq(generatedReports.id,reportId));
      else await tx.insert(generatedReports).values({id:reportId,organizationId:org,assessmentId:id,patientId:assessment.patientId,submissionId:source.submissionId,requestKey:input.requestKey,sourceFingerprint:fingerprint,status:"GENERATING"});
      return {reportId,replay:null};
    });
    if(claim.replay)return {report:await this.dto(claim.replay,assessment)};
    const reportId=claim.reportId;
    try {
      const [scan]=await this.service.db.select({projection:assessmentFaceScans.projection}).from(assessmentFaceScans)
        .where(and(eq(assessmentFaceScans.organizationId,org),eq(assessmentFaceScans.assessmentId,id),eq(assessmentFaceScans.isCurrent,true),eq(assessmentFaceScans.state,"COMPLETED"))).limit(1);
      const session=scan?.projection ? this.service.unseal(scan.projection) : null;
      const metrics=reportObservations(frozen.answers,frozen.manifest,assessment.completedAt!,session);
      const weightHistory=await this.weightHistory(actor,org,assessment,positive(frozen.answers.current_weight_kg),positive(frozen.answers.previous_weight_kg));
      const facts:ReportFacts={
        reviewedScore:source.reviewedScore,reviewedRiskCategoryId:source.risk.id,
        treatmentTypeIds:list(frozen.answers.current_cancer_treatment),drugClassIds:list(frozen.answers.drug_classes),
        confirmedToxicityIds:[],coMorbidityIds:list(frozen.answers.co_morbidities),
        ...(value(frozen.answers.cancer_type)?{cancerTypeId:value(frozen.answers.cancer_type)}:{}),
        ...(["vegetarian","non_vegetarian","eggetarian","jain"].includes(value(frozen.answers.diet_preference)??"")?{dietPreferenceId:value(frozen.answers.diet_preference) as ReportFacts["dietPreferenceId"]}:{}),
        ...(value(frozen.answers.treatment_status)?{treatmentStatusId:value(frozen.answers.treatment_status)}:{}),
        ...(value(frozen.answers.cancer_surgical_status)?{surgicalStatusId:value(frozen.answers.cancer_surgical_status)}:{}),
        ...(value(frozen.answers.surgery_date)?{surgeryDate:value(frozen.answers.surgery_date)}:{}),
        ...(value(frozen.answers.planned_surgery_date)?{plannedSurgeryDate:value(frozen.answers.planned_surgery_date)}:{}),
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
      const data:ReportData={
        runId:generated.runId,model:generated.model,promptVersion:generated.promptVersion,generatedAt:new Date().toISOString(),
        patient:{displayName:patient.displayName,reference:patient.reference,dateOfBirth:patient.dateOfBirth,gender:patient.gender},
        assessment:{id,reference:formatAssessmentReference(assessment.serialNumber),completedAt:assessment.completedAt!.toISOString(),
          submissionId:source.submissionId,scoreRevision:source.scoreRevision,ruleVersionId:generated.ruleVersionId,checksum:generated.checksum},
        classification:{id:source.risk.id!,label:source.risk.label ?? generated.classification.label,score:source.reviewedScore},
        metrics,weightHistory,decision,
        narrative:Object.fromEntries(Object.entries(generated.narrative).map(([key,entry])=>[key,entry.text])) as GeneratedNarrative,
        guidance:{sections:normalized.sections},
        issues:[...generated.issues,...normalized.issues],issueResolution:null,
      };
      const [saved]=await this.service.db.transaction(async tx=>{
        const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
        if(this.currentFingerprint(currentAssessment,generated.checksum,decision)!==fingerprint)
          throw new ServiceError("CONFLICT","The clinical review changed during report generation. Regenerate from the completed review.");
        return tx.update(generatedReports).set({status:"DRAFT",runId:generated.runId,content:this.service.seal(data),updatedAt:new Date()})
          .where(and(eq(generatedReports.id,reportId),eq(generatedReports.organizationId,org),eq(generatedReports.status,"GENERATING"))).returning();
      });
      if(!saved)throw new ServiceError("CONFLICT","Report generation changed while waiting for NIQ Scoring.");
      await this.service.db.update(generatedReports).set({status:"STALE",updatedAt:new Date()}).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),ne(generatedReports.id,reportId),eq(generatedReports.status,"DRAFT")));
      await this.service.audit(this.service.db,actor,context,id,"GENERATED_REPORT_CREATED",{reportId,runId:generated.runId,submissionId:source.submissionId,scoreRevision:source.scoreRevision,ruleChecksum:generated.checksum});
      return {report:await this.dto(saved,assessment)};
    } catch(error) {
      await this.service.db.update(generatedReports).set({status:"FAILED",failureCode:error instanceof ScoringReportContentError?error.code:"GENERATION_FAILED",updatedAt:new Date()})
        .where(and(eq(generatedReports.id,reportId),eq(generatedReports.status,"GENERATING")));
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
  async uploadPdf(actor:Principal,org:string,id:string,revision:number,body:ReadableStream<Uint8Array>,context:RequestContext) {
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
      const [fresh]=await tx.select().from(generatedReports).where(and(eq(generatedReports.organizationId,org),eq(generatedReports.id,row.id))).for("update");
      if(!fresh || fresh.status!=="DRAFT" || fresh.revision!==revision)throw new ServiceError("CONFLICT","The report changed while its PDF was being uploaded.");
      await tx.insert(generatedReportArtifacts).values({reportId:row.id,organizationId:org,assessmentId:id,revision,sha256:hash,size:pdf.length,encryptedPdf:encryptPatientBytes(pdf,key)})
        .onConflictDoUpdate({target:generatedReportArtifacts.reportId,set:{revision,sha256:hash,size:pdf.length,encryptedPdf:encryptPatientBytes(pdf,key),uploadedAt:new Date()}});
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_PDF_UPLOADED",{reportId:row.id,revision,sha256:hash,size:pdf.length});
    });
    const [fresh]=await this.service.db.select().from(generatedReports).where(eq(generatedReports.id,row.id));
    return {report:await this.dto(fresh!,assessment)};
  }
  async approve(actor:Principal,org:string,id:string,revision:number,context:RequestContext) {
    if(!hasPermission(actor.role,"reviews.complete"))throw new ServiceError("FORBIDDEN","A clinician must approve the final report.");
    const {assessment,row}=await this.editable(actor,org,id,revision);
    const data=this.service.unseal<ReportData>(row.content);
    if(data.issues.length || Object.values(data.narrative).some(text=>!text.trim()))assertReportReadyForApproval(data.issues,null,revision,data.narrative);
    const [saved]=await this.service.db.transaction(async tx=>{
      const currentAssessment=await this.service.authorize(actor,org,id,tx,true);
      if(this.currentFingerprint(currentAssessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)throw new ServiceError("CONFLICT","The clinical review changed. Regenerate the report.");
      const [artifact]=await tx.select().from(generatedReportArtifacts).where(and(eq(generatedReportArtifacts.organizationId,org),eq(generatedReportArtifacts.reportId,row.id)));
      assertReportReadyForApproval(data.issues,artifact?.revision??null,revision,data.narrative);
      const [updated]=await tx.update(generatedReports).set({status:"APPROVED",approvedByMembershipId:actor.membershipId,approvedAt:new Date(),updatedAt:new Date()})
        .where(and(eq(generatedReports.id,row.id),eq(generatedReports.organizationId,org),eq(generatedReports.status,"DRAFT"),eq(generatedReports.revision,revision))).returning();
      if(!updated)throw new ServiceError("CONFLICT","The report changed before approval.");
      await this.service.audit(tx,actor,context,id,"GENERATED_REPORT_APPROVED",{reportId:row.id,revision,sha256:artifact!.sha256,
        submissionId:data.assessment.submissionId,scoreRevision:data.assessment.scoreRevision,ruleChecksum:data.assessment.checksum,runId:data.runId,model:data.model,promptVersion:data.promptVersion});
      return [updated];
    });
    return {report:await this.dto(saved!,assessment)};
  }
  async downloadPdf(actor:Principal,org:string,id:string) {
    const assessment=await this.clinical(actor,org,id);
    // A later draft does not withdraw the last approved report from clinical use.
    const [row]=await this.service.db.select().from(generatedReports)
      .where(and(eq(generatedReports.organizationId,org),eq(generatedReports.assessmentId,id),eq(generatedReports.status,"APPROVED")))
      .orderBy(desc(generatedReports.approvedAt),desc(generatedReports.id)).limit(1);
    if(!row?.content)
      throw new ServiceError("NOT_FOUND","An approved current PDF is not available.");
    const data=this.service.unseal<ReportData>(row.content);
    if(this.currentFingerprint(assessment,data.assessment.checksum,data.decision)!==row.sourceFingerprint)
      throw new ServiceError("NOT_FOUND","An approved current PDF is not available.");
    const artifact=await this.artifact(org,row.id);
    if(!artifact || artifact.revision!==row.revision)throw new ServiceError("NOT_FOUND","The approved PDF is unavailable.");
    const pdf=decryptPatientBytes(artifact.encryptedPdf,patientDataKey(this.service.config.PATIENT_DATA_ENCRYPTION_KEY,this.service.config.SESSION_SECRET));
    if(createHash("sha256").update(pdf).digest("hex")!==artifact.sha256)throw new ServiceError("CONFLICT","The approved PDF failed its integrity check.");
    return {pdf,sha256:artifact.sha256};
  }
}
