import { scoringServiceUrl } from "./scoring-service-url";
import { z } from "zod";
import type { AssessmentScoringTransport } from "./assessment-scoring";

const bounded = z.string().max(6000);
const guidanceText = z.string().max(12000);
const narrative = z.object({ text: bounded, evidenceIds: z.array(z.string().max(200)).max(100) });
const id = z.string().max(200);
const productPlan = z.object({ id, stage: id, nutritionalStatus: bounded, products: guidanceText, dose: guidanceText, duration: guidanceText,
  durationAmount: z.number().int().positive().optional(),
  items: z.array(z.object({ productName: bounded, quantityPerDay: z.number().int().min(1).max(100).optional(),
    unit: bounded.optional(), timesPerDay: z.number().int().positive().max(24).optional(), preparation: guidanceText.optional(),
    mealTiming: guidanceText.optional() })).max(20).optional() });
// Parse only selected guidance fields that the Application can display. Zod strips
// unexpected Scoring fields before this packet can enter a patient report snapshot.
const reportProductImage = z.string().max(Math.ceil(5 * 1024 * 1024 / 3) * 4 + 40)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
const carePlan = z.object({
  nutritionalStatus: bounded.nullable(),
  statusModifiers: z.array(z.object({ id, classId: id, treatmentTypeId: id, nutritionalStatus: bounded, riskEmphasis: guidanceText, actions: guidanceText })).max(200),
  treatmentGuidance: z.array(z.object({ id, treatmentTypeId: id, nutritionalStatus: bounded, guidance: guidanceText })).max(100),
  coMorbidities: z.array(z.object({ id, conditionId: id, label: bounded, guidance: guidanceText })).max(100),
  products: z.object({
    status: z.enum(["none", "selected", "clinician_choice_required", "facts_required"]),
    plans: z.array(productPlan).max(30),
    choices: z.array(productPlan).max(30).optional(),
    catalog: z.array(z.object({ id, name: bounded, description: guidanceText.nullable(), benefits: z.array(guidanceText).max(50).optional(), imageDataUrl: reportProductImage.nullable().optional(), aliases: z.array(bounded).max(30) })).max(100).optional(),
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
    expectedToxicity: bounded, summary: guidanceText, nutritionalInterventions: guidanceText,
    requiresDrugConfirmation: z.boolean().optional(),
  })).max(500).optional(),
  classGuidance: z.array(z.object({ id: z.string(), label: z.string(), guidance: bounded })).max(30).optional(),
  carePlan,
});
// Retain only display decisions. Internal source IDs and manager rationale stay
// in Scoring's restricted trace rather than entering a patient-facing snapshot.
const targetResolution = z.discriminatedUnion("decision", [
  z.object({ nutrient: z.enum(["energy", "protein"]), decision: z.literal("select_source"), targetText: z.string().trim().min(1).max(1000) }),
  z.object({ nutrient: z.enum(["energy", "protein"]), decision: z.literal("withhold_numeric"), targetText: z.null() }),
]);
export const scoringReportContentSchema = z.object({
  runId: z.string().min(1), status: z.enum(["READY", "REVIEW_REQUIRED"]),
  assessmentReference: z.string(), resultReference: z.string(), ruleVersionId: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1), promptVersion: z.string().min(1), schemaVersion: z.number().int().positive(),
  classification: z.object({ id: z.string(), label: z.string() }),
  targetResolutions: z.array(targetResolution).max(2).refine(rows => new Set(rows.map(row => row.nutrient)).size === rows.length,
    "Each nutrient has at most one reviewed resolution").optional(),
  guidance: selectedGuidance,
  narrative: z.object({
    overview: narrative, keyFindings: narrative, actionSummary: narrative, monitoringSummary: narrative,
    overallSummary: narrative.optional(),
    nutritionAdvice: narrative.optional(), treatmentAdvice: narrative.optional(),
    conditionAdvice: narrative.optional(), effectsAdvice: narrative.optional(),
    redFlagsAdvice: narrative.optional(), foodSafetyAdvice: narrative.optional(),
  }),
  issues: z.array(z.string().max(1000)).max(100),
  omittedNarrativeFields: z.array(z.enum([
    "overview", "keyFindings", "actionSummary", "monitoringSummary", "overallSummary",
    "nutritionAdvice", "treatmentAdvice", "conditionAdvice", "effectsAdvice",
    "redFlagsAdvice", "foodSafetyAdvice",
  ])).max(11).optional(),
}).superRefine((content, context) => {
  // In-flight v1 runs can finish after a deployment. Only the v2 response
  // requires the new reviewed passages.
  if (content.schemaVersion < 2) return;
  if (content.schemaVersion >= 3 && !content.narrative.overallSummary)
    context.addIssue({ code: "custom", path: ["narrative", "overallSummary"], message: "Reviewed overall summary is required" });
  if (content.schemaVersion >= 4) {
    for (const field of ["redFlagsAdvice", "foodSafetyAdvice"] as const)
      if (!content.narrative[field]) context.addIssue({ code: "custom", path: ["narrative", field], message: "Consolidated recommendation passage is required" });
  }
  for (const field of ["nutritionAdvice", "treatmentAdvice", "conditionAdvice", "effectsAdvice"] as const)
    if (!content.narrative[field]) context.addIssue({ code: "custom", path: ["narrative", field], message: "Reviewed care-plan passage is required" });
});
export type ScoringReportContent = z.infer<typeof scoringReportContentSchema>;

export type ReportFacts = {
  // Narrative context only: the original questionnaire answers remain unchanged.
  weightComparison?: {
    source: "assessment_history" | "reported_previous_weight";
    previousWeightKg: number; currentWeightKg: number; changePercent: number;
    previousDate?: string; currentDate: string; previousLabel?: string;
  };
  treatmentTypeIds: string[]; drugClassIds: string[]; confirmedToxicityIds: string[];
  assessmentAnswers?: {
    gastrointestinal_symptoms?: string[]; dietary_symptoms?: string[]; appetite_status?: string; functional_capacity?: string;
    previous_weight_kg?: number; current_weight_kg?: number;
  };
  coMorbidityIds?: string[]; cancerTypeId?: string; treatmentStatusId?: string;
  dietPreferenceId?: "vegetarian" | "non_vegetarian" | "eggetarian" | "jain";
  surgicalStatusId?: string; surgeryDate?: string; plannedSurgeryDate?: string;
  plannedTreatmentStartDate?: string; assessmentDate: string; productStageChoice?: "surgical" | "treatment_stage";
  reviewedScore: number; reviewedRiskCategoryId?: string;
  observations: Array<{ id: string; label: string; value: string; unit?: string; measuredAt?: string; measurementSource?: "historical"; sourceAssessmentReference?: string }>;
};

export class ScoringReportContentError extends Error {
  constructor(readonly kind: "blocked" | "unavailable" | "invalid", readonly code: string, readonly terminal = false) {
    super(`NIQ Scoring report content ${kind}: ${code}`);
  }
}

export class ScoringReportContentPending extends Error {
  constructor(readonly runId: string, readonly status: "QUEUED" | "PROCESSING") {
    super(`NIQ Scoring report content job ${status.toLowerCase()}`);
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
    response = await (input.fetcher ?? fetch)(scoringServiceUrl(input.baseUrl, "/v1/assessments/report-toxicity-options"), {
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
  const headers = { authorization: `Bearer ${input.credential}`, "content-type": "application/json", "x-request-id": input.requestId };
  const timeoutMs = Math.min(input.timeoutMs, 15_000);
  const request = async (path: string, init: RequestInit) => {
    let response: Response;
    try {
      response = await (input.fetcher ?? fetch)(scoringServiceUrl(input.baseUrl, path), {
        ...init, redirect: "error", headers, signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new ScoringReportContentError("unavailable", "TRANSPORT_FAILURE"); }
    let body: unknown;
    try { body = await response.json(); } catch { throw new ScoringReportContentError("unavailable", "INVALID_RESPONSE"); }
    if (!response.ok) {
      const parsed = z.object({ error: z.string().max(100) }).safeParse(body);
      const code = parsed.success ? parsed.data.error : "UPSTREAM_FAILURE";
      throw new ScoringReportContentError(response.status === 429 || response.status >= 500 || code === "REQUEST_IN_PROGRESS" ? "unavailable" : "blocked", code);
    }
    return { response, body };
  };

  // Re-submitting the same idempotency key recovers the durable Scoring job
  // after an Application restart, without holding an HTTP request open for generation.
  const submission = await request("/v1/assessments/report-content/jobs", {
    method: "POST",
    body: JSON.stringify({ assessmentReference: input.assessmentReference, resultReference: input.resultReference,
      idempotencyKey: input.idempotencyKey, facts: input.facts }),
  });
  const submitted = z.object({ runId: z.string().min(1), status: z.enum(["QUEUED", "PROCESSING", "READY", "REVIEW_REQUIRED", "FAILED"]) }).safeParse(submission.body);
  if (submission.response.status !== 202 || !submitted.success)
    throw new ScoringReportContentError("invalid", "INVALID_RESPONSE");

  const poll = await request(`/v1/assessments/report-content/jobs/${encodeURIComponent(submitted.data.runId)}`, { method: "GET" });
  const job = z.object({ runId: z.string().min(1), status: z.enum(["QUEUED", "PROCESSING", "READY", "REVIEW_REQUIRED", "FAILED"]),
    response: z.unknown().optional(), errorCode: z.string().max(100).nullable().optional() }).safeParse(poll.body);
  if (!job.success || job.data.runId !== submitted.data.runId)
    throw new ScoringReportContentError("invalid", "INVALID_RESPONSE");
  if (job.data.status === "QUEUED" || job.data.status === "PROCESSING")
    throw new ScoringReportContentPending(job.data.runId, job.data.status);
  if (job.data.status === "FAILED") {
    const code = job.data.errorCode ?? "REPORT_GENERATION_FAILED";
    const kind = code.startsWith("FALLBACK_") ? "invalid" : code === "MODEL_PAYMENT_REQUIRED" || code.startsWith("MODEL_REQUEST_REJECTED_") ||
      code === "MODEL_CONTENT_FILTER" || code === "MODEL_INVALID_PARAMETERS" || /^MODEL_HTTP_4(?!29)/.test(code) ? "blocked" : "unavailable";
    // A failed durable Scoring job has already exhausted its own recovery path.
    // Re-submitting its idempotency key would only read the same terminal result.
    throw new ScoringReportContentError(kind, code, true);
  }
  const parsed = scoringReportContentSchema.safeParse(job.data.response);
  if (!parsed.success || parsed.data.status !== job.data.status || parsed.data.assessmentReference !== input.assessmentReference ||
    parsed.data.resultReference !== input.resultReference)
    throw new ScoringReportContentError("invalid", "INVALID_RESPONSE");
  return parsed.data;
}
