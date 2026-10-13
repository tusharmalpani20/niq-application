import { z } from "zod";
import type { AssessmentScoringTransport } from "./assessment-scoring";

const bounded = z.string().max(6000);
const guidanceText = z.string().max(12000);
const narrative = z.object({ text: bounded, evidenceIds: z.array(z.string().max(200)).max(100) });
const id = z.string().max(200);
const productPlan = z.object({ id, stage: id, nutritionalStatus: bounded, products: guidanceText, dose: guidanceText, duration: guidanceText,
  items: z.array(z.object({ productName: bounded, quantityPerDay: z.number().int().min(1).max(100).optional(), description: guidanceText.optional() })).max(20).optional() });
// Parse only selected guidance fields that the Application can display. Zod strips
// unexpected Scoring fields before this packet can enter a patient report snapshot.
const carePlan = z.object({
  nutritionalStatus: bounded.nullable(),
  statusModifiers: z.array(z.object({ id, classId: id, treatmentTypeId: id, nutritionalStatus: bounded, riskEmphasis: guidanceText, actions: guidanceText })).max(200),
  treatmentGuidance: z.array(z.object({ id, treatmentTypeId: id, nutritionalStatus: bounded, guidance: guidanceText })).max(100),
  coMorbidities: z.array(z.object({ id, conditionId: id, label: bounded, guidance: guidanceText })).max(100),
  products: z.object({
    status: z.enum(["none", "selected", "clinician_choice_required", "facts_required"]),
    plans: z.array(productPlan).max(30),
    choices: z.array(productPlan).max(30).optional(),
    notes: z.array(z.object({ id, kind: id, label: bounded, guidance: guidanceText })).max(100),
    reason: bounded.optional(),
  }),
});
const selectedGuidance = z.object({
  nutritionInterventions: z.array(z.object({ id: z.string(), label: z.string(), coreStrategy: bounded, clinicalActions: bounded })).max(30),
  toxicityInterventions: z.array(z.object({ id: z.string(), classId: z.string(), treatmentTypeId: z.string(), expectedToxicity: bounded, nutritionalInterventions: bounded,
    matchSource: z.enum(["assessment_answer","weight_change","clinician_confirmation","unknown"]).optional(),
    matchedAnswerLabels: z.array(bounded).max(50).optional(),
  })).max(100),
  possibleToxicities: z.array(z.object({ id: z.string(), classId: z.string(), treatmentTypeId: z.string(),
    // Historical responses may include the old topic label. It is never a
    // confirmed patient effect or a condition for selecting candidate advice.
    expectedToxicity: bounded.optional(), nutritionalInterventions: guidanceText,
    requiresDrugConfirmation: z.boolean().optional(),
  })).max(500).optional(),
  classGuidance: z.array(z.object({ id: z.string(), label: z.string(), guidance: bounded })).max(30).optional(),
  carePlan,
});
export const scoringReportContentSchema = z.object({
  runId: z.string().min(1), status: z.enum(["READY", "REVIEW_REQUIRED"]),
  assessmentReference: z.string(), resultReference: z.string(), ruleVersionId: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1), promptVersion: z.string().min(1), schemaVersion: z.number().int().positive(),
  classification: z.object({ id: z.string(), label: z.string() }),
  guidance: selectedGuidance,
  narrative: z.object({
    overview: narrative, keyFindings: narrative, actionSummary: narrative, monitoringSummary: narrative,
    nutritionAdvice: narrative.optional(), treatmentAdvice: narrative.optional(),
    conditionAdvice: narrative.optional(), effectsAdvice: narrative.optional(),
  }),
  issues: z.array(z.string().max(1000)).max(100),
  omittedNarrativeFields: z.array(z.enum([
    "overview", "keyFindings", "actionSummary", "monitoringSummary",
    "nutritionAdvice", "treatmentAdvice", "conditionAdvice", "effectsAdvice",
  ])).max(8).optional(),
}).superRefine((content, context) => {
  // In-flight v1 runs can finish after a deployment. Only the v2 response
  // requires the new reviewed passages.
  if (content.schemaVersion < 2) return;
  for (const field of ["nutritionAdvice", "treatmentAdvice", "conditionAdvice", "effectsAdvice"] as const)
    if (!content.narrative[field]) context.addIssue({ code: "custom", path: ["narrative", field], message: "Reviewed care-plan passage is required" });
});
export type ScoringReportContent = z.infer<typeof scoringReportContentSchema>;

export type ReportFacts = {
  treatmentTypeIds: string[]; drugClassIds: string[]; confirmedToxicityIds: string[];
  assessmentAnswers?: {
    gastrointestinal_symptoms?: string[]; dietary_symptoms?: string[]; appetite_status?: string;
    previous_weight_kg?: number; current_weight_kg?: number;
  };
  coMorbidityIds?: string[]; cancerTypeId?: string; treatmentStatusId?: string;
  dietPreferenceId?: "vegetarian" | "non_vegetarian" | "eggetarian" | "jain";
  surgicalStatusId?: string; surgeryDate?: string; plannedSurgeryDate?: string;
  plannedTreatmentStartDate?: string; assessmentDate: string; productStageChoice?: "surgical" | "treatment_stage";
  reviewedScore: number; reviewedRiskCategoryId?: string;
  observations: Array<{ id: string; label: string; value: string; unit?: string; measuredAt?: string }>;
};

export class ScoringReportContentError extends Error {
  constructor(readonly kind: "blocked" | "unavailable" | "invalid", readonly code: string) {
    super(`NIQ Scoring report content ${kind}: ${code}`);
  }
}

export const scoringToxicityOptionsSchema = z.object({
  assessmentReference: z.string(), resultReference: z.string(), ruleVersionId: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  options: z.array(z.object({
    id: z.string().min(1).max(200), classId: z.string().min(1).max(200), classLabel: bounded.optional(),
    treatmentTypeId: z.string().min(1).max(200), treatmentTypeLabel: bounded.optional(), expectedToxicity: bounded,
  })).max(200),
});
export type ScoringToxicityOptions = z.infer<typeof scoringToxicityOptionsSchema>;

export async function requestScoringToxicityOptions(input: AssessmentScoringTransport & {
  assessmentReference: string; resultReference: string; treatmentTypeIds: string[]; drugClassIds: string[];
}): Promise<ScoringToxicityOptions> {
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(new URL("/v1/assessments/report-toxicity-options", input.baseUrl), {
      method: "POST", redirect: "error", headers: { authorization: `Bearer ${input.credential}`, "content-type": "application/json", "x-request-id": input.requestId },
      body: JSON.stringify({ assessmentReference: input.assessmentReference, resultReference: input.resultReference,
        treatmentTypeIds: input.treatmentTypeIds, drugClassIds: input.drugClassIds }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch { throw new ScoringReportContentError("unavailable", "TRANSPORT_FAILURE"); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new ScoringReportContentError("unavailable", "INVALID_RESPONSE"); }
  if (!response.ok) {
    const code = z.object({ error: z.string().max(100) }).safeParse(body);
    const errorCode = code.success ? code.data.error : "UPSTREAM_FAILURE";
    throw new ScoringReportContentError(response.status === 503 || response.status >= 500 || errorCode === "REQUEST_IN_PROGRESS" ? "unavailable" : "blocked", errorCode);
  }
  const parsed = scoringToxicityOptionsSchema.safeParse(body);
  if (!parsed.success || parsed.data.assessmentReference !== input.assessmentReference || parsed.data.resultReference !== input.resultReference)
    throw new ScoringReportContentError("invalid", "INVALID_RESPONSE");
  return parsed.data;
}

export async function requestScoringReportContent(input: AssessmentScoringTransport & {
  assessmentReference: string; resultReference: string; idempotencyKey: string; facts: ReportFacts;
}): Promise<ScoringReportContent> {
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(new URL("/v1/assessments/report-content", input.baseUrl), {
      method: "POST", redirect: "error", headers: { authorization: `Bearer ${input.credential}`, "content-type": "application/json", "x-request-id": input.requestId },
      body: JSON.stringify({ assessmentReference: input.assessmentReference, resultReference: input.resultReference, idempotencyKey: input.idempotencyKey, facts: input.facts }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch { throw new ScoringReportContentError("unavailable", "TRANSPORT_FAILURE"); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new ScoringReportContentError("unavailable", "INVALID_RESPONSE"); }
  if (!response.ok) {
    const code = z.object({ error: z.string().max(100) }).safeParse(body);
    const errorCode = code.success ? code.data.error : "UPSTREAM_FAILURE";
    throw new ScoringReportContentError(response.status === 503 || response.status >= 500 || errorCode === "REQUEST_IN_PROGRESS" ? "unavailable" : "blocked", errorCode);
  }
  const parsed = scoringReportContentSchema.safeParse(body);
  if (!parsed.success || parsed.data.assessmentReference !== input.assessmentReference || parsed.data.resultReference !== input.resultReference)
    throw new ScoringReportContentError("invalid", "INVALID_RESPONSE");
  return parsed.data;
}
