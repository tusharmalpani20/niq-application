import { z } from "zod";
import type { AssessmentRiskColor } from "./assessment-workflow";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value);
export const generateReportInputSchema = z.object({
  requestKey: z.string().min(16).max(128),
  productStageChoice: z.enum(["surgical","treatment_stage"]).optional(),
  confirmedToxicityIds: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)).max(200).refine(ids => new Set(ids).size === ids.length, "Choose each effect once").optional(),
}).strict();
export const editGeneratedNarrativeSchema = z.object({
  revision: z.number().int().nonnegative(),
  narrative: z.object({
    overview: z.string().trim().max(1800).optional(),
    keyFindings: z.string().trim().max(1800).optional(),
    actionSummary: z.string().trim().max(1800).optional(),
    monitoringSummary: z.string().trim().max(1800).optional(),
    overallSummary: z.string().trim().max(1800).optional(),
    nutritionAdvice: z.string().trim().max(1800).optional(),
    treatmentAdvice: z.string().trim().max(1800).optional(),
    conditionAdvice: z.string().trim().max(1800).optional(),
    effectsAdvice: z.string().trim().max(1800).optional(),
    redFlagsAdvice: z.string().trim().max(6000).optional(),
    foodSafetyAdvice: z.string().trim().max(6000).optional(),
  }).strict(),
  issueResolution: z.object({explanation:z.string().trim().min(10).max(1000)}).strict().optional(),
}).strict().refine(value=>Object.keys(value.narrative).length>0 || Boolean(value.issueResolution),"Edit wording or resolve an issue");
export const approveGeneratedReportSchema = z.object({ revision: z.number().int().nonnegative(), reviewedSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export type ReportBrandingSource = { displayName: string; logoObjectKey: string | null; primaryColor: string; secondaryColor: string };

/** Canonical branding fields shared by the browser and the approval service. */
export function reportBrandingPayload(brand: ReportBrandingSource): string {
  return JSON.stringify([brand.displayName.trim(), brand.logoObjectKey, brand.primaryColor, brand.secondaryColor]);
}

export type GeneratedNarrative = {
  overview: string;
  keyFindings: string;
  actionSummary: string;
  monitoringSummary: string;
  /** Reviewed closing synthesis; older saved reports use a short fallback. */
  overallSummary?: string;
  // Older saved reports predate reviewed care-plan passages.
  nutritionAdvice?: string;
  treatmentAdvice?: string;
  conditionAdvice?: string;
  effectsAdvice?: string;
  /** Consolidated, evidence-backed urgent contact instructions. */
  redFlagsAdvice?: string;
  /** Food safety instructions belong in Recommendations. */
  foodSafetyAdvice?: string;
};
export type GeneratedReportSection = {
  id: string;
  kind: "nutrition" | "radiotherapy" | "product" | "comorbidity" | "toxicity" | "treatment";
  title: string;
  text: string;
  drugClass?: string;
  certainty?: "possible" | "confirmed";
  matchSource?: "assessment_answer" | "weight_change" | "clinician_confirmation" | "unknown";
  matchedAnswerLabels?: string[];
};
export type GeneratedReportProductPlan = {
  id: string;
  duration: string;
  durationAmount?: number;
  items: Array<{
    productName: string;
    quantityPerDay?: number;
    unit?: string;
    timesPerDay?: number;
    preparation?: string;
    mealTiming?: string;
  }>;
};
export type GeneratedReport = {
  id: string;
  revision: number;
  status: "DRAFT" | "READY" | "APPROVED" | "STALE";
  runId: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  approvedAt: string | null;
  patient: { displayName: string; reference: string; dateOfBirth: string; gender: string };
  assessment: { id: string; reference: string; facilityName?: string | null; completedAt: string; recordedAt?: string; submissionId: string; scoreRevision: number; ruleVersionId: string; checksum: string };
  /** Applicable, non-calculated questions in the submitted assessment. */
  assessmentAnswerCoverage?: { answered: number; total: number };
  classification: { id: string; label: string; score: number; color?: AssessmentRiskColor };
  /** Exact nutritional status from the frozen care-plan risk mapping. */
  nutritionalStatus?: string;
  metrics: Array<{ id: string; label: string; value: string; unit?: string; measuredAt?: string; source: "assessment" | "face_scan"; referenceRange?: string; outsideReferenceRange?: boolean }>;
  weightDisplayUnit?: "kg" | "lb";
  weightHistory: Array<{ date: string | null; kg: number; label?: string; assessmentId?: string }>;
  /** Display labels from the submitted assessment; absent on reports saved before this field existed. */
  clinicalFacts?: Array<{ label: string; value: string }>;
  /** Selected rule instructions, retained as data rather than parsed from report prose. */
  productPlans?: GeneratedReportProductPlan[];
  /** Verified product catalog descriptions, distinct from the case-specific schedule. */
  productCatalog?: Array<{ id: string; name: string; description: string; benefits?: string[]; aliases?: string[] }>;
  decision: { productStageChoice: "surgical" | "treatment_stage" | null; plannedTreatmentStartDate: string | null; confirmedToxicityIds?: string[] };
  narrative: GeneratedNarrative;
  narrativeEvidence?: Partial<Record<keyof GeneratedNarrative, string[]>>;
  omittedNarrativeFields?: Array<keyof GeneratedNarrative>;
  guidance: { sections: GeneratedReportSection[] };
  issues: string[];
  issueResolution: { originalIssues: string[]; explanation: string; clinicianName: string; resolvedAt: string } | null;
  artifact: { sha256: string; size: number; uploadedAt: string; brandingFingerprint: string | null } | null;
};
