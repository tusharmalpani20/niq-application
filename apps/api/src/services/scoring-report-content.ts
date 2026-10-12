import { z } from "zod";
import type { AssessmentScoringTransport } from "./assessment-scoring";

const bounded = z.string().max(6000);
const guidanceText = z.string().max(12000);
const narrative = z.object({ text: bounded, evidenceIds: z.array(z.string().max(200)).max(100) });
const id = z.string().max(200);
const productPlan = z.object({ id, stage: id, nutritionalStatus: bounded, products: guidanceText, dose: guidanceText, duration: guidanceText });
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
  toxicityInterventions: z.array(z.object({ id: z.string(), classId: z.string(), treatmentTypeId: z.string(), expectedToxicity: bounded, nutritionalInterventions: bounded })).max(100),
  possibleToxicities: z.array(z.object({ id: z.string(), classId: z.string(), treatmentTypeId: z.string(), expectedToxicity: bounded, nutritionalInterventions: guidanceText })).max(100).optional(),
  classGuidance: z.array(z.object({ id: z.string(), label: z.string(), guidance: bounded })).max(30).optional(),
  carePlan,
});
export const scoringReportContentSchema = z.object({
  runId: z.string().min(1), status: z.enum(["READY", "REVIEW_REQUIRED"]),
  assessmentReference: z.string(), resultReference: z.string(), ruleVersionId: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1), promptVersion: z.string().min(1), schemaVersion: z.number().int().positive(),
  classification: z.object({ id: z.string(), label: z.string() }),
  guidance: selectedGuidance,
  narrative: z.object({ overview: narrative, keyFindings: narrative, actionSummary: narrative, monitoringSummary: narrative }),
  issues: z.array(z.string().max(1000)).max(100),
});
export type ScoringReportContent = z.infer<typeof scoringReportContentSchema>;

export type ReportFacts = {
  treatmentTypeIds: string[]; drugClassIds: string[]; confirmedToxicityIds: string[];
  coMorbidityIds?: string[]; cancerTypeId?: string; treatmentStatusId?: string;
  dietPreferenceId?: "vegetarian" | "non_vegetarian" | "eggetarian" | "jain";
  surgicalStatusId?: string; surgeryDate?: string; plannedSurgeryDate?: string;
  plannedTreatmentStartDate?: string; productStageChoice?: "surgical" | "treatment_stage";
  reviewedScore: number; reviewedRiskCategoryId?: string;
  observations: Array<{ id: string; label: string; value: string; unit?: string; measuredAt?: string }>;
};

export class ScoringReportContentError extends Error {
  constructor(readonly kind: "blocked" | "unavailable" | "invalid", readonly code: string) {
    super(`NIQ Scoring report content ${kind}: ${code}`);
  }
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
    throw new ScoringReportContentError(response.status === 503 || response.status >= 500 ? "unavailable" : "blocked", code.success ? code.data.error : "UPSTREAM_FAILURE");
  }
  const parsed = scoringReportContentSchema.safeParse(body);
  if (!parsed.success || parsed.data.assessmentReference !== input.assessmentReference || parsed.data.resultReference !== input.resultReference)
    throw new ScoringReportContentError("invalid", "INVALID_RESPONSE");
  return parsed.data;
}
