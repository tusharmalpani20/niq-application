import { z } from "zod";
import { ASSESSMENT_ANSWER_TEXT_LIMIT, type AssessmentFormManifest, type FormAnswers } from "./assessment-form";
import type { getAssessmentCompletion } from "./assessment-form-validation";

export function formatAssessmentReference(serialNumber: number): string {
  if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) throw new RangeError("Assessment serial must be a positive safe integer");
  return `ASM-${String(serialNumber).padStart(6, "0")}`;
}

const entity = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const initializeAssessmentSchema = z.object({ patientId: entity, requestKey: z.string().min(16).max(128) }).strict();
export const assessmentAnswerSchema = z.union([z.string().max(ASSESSMENT_ANSWER_TEXT_LIMIT), z.number().finite(), z.array(z.string().max(100)).max(100), z.null()]);
export const saveAssessmentSchema = z.object({ revision: z.number().int().nonnegative(), answers: z.record(z.string().max(100), assessmentAnswerSchema) }).strict();
export const assessmentRevisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
/** Exact wording acknowledged for statementVersion 1; retain when adding a new version. */
export const ASSESSMENT_ATTESTATION_STATEMENT_V1 = "I have reviewed the information in every section and confirm it is accurate to the best of my knowledge.";
/** Exact wording acknowledged for statementVersion 2. */
export const ASSESSMENT_ATTESTATION_STATEMENT_V2 = "I have reviewed every section and confirm the information is accurate.";
export const assessmentSubmitSchema = z.object({
  revision: z.number().int().nonnegative(),
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  attestation: z.object({
    statementVersion: z.union([z.literal(1), z.literal(2)]),
    reviewedSectionIds: z.array(z.string().min(1).max(100)).min(1).max(30),
    confirmed: z.literal(true),
  }).strict(),
}).strict();
export type AssessmentSubmitInput = z.infer<typeof assessmentSubmitSchema>;
export type AssessmentSubmissionAttestation = {
  submissionId: string; cycle: number; revision: number; confirmedAt: string;
  actorMembershipId: string; actorDisplayName: string; statementVersion: 1 | 2;
  reviewedSectionIds: string[];
};
export const reportInputSchema = z.object({
  revision: z.number().int().nonnegative(), label: z.string().trim().min(1, "Enter a report name.").max(120), purpose: z.string().trim().max(300),
  datePrecision: z.enum(["DAY", "MONTH"]), year: z.number().int().min(1900).max(9999).nullable(),
  month: z.number().int().min(1).max(12).nullable(), day: z.number().int().min(1).max(31).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.datePrecision === "MONTH" && value.day !== null) ctx.addIssue({ code: "custom", path: ["day"], message: "Month precision must not contain a day" });
  if (value.day && value.month && value.year && new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCMonth() !== value.month - 1) ctx.addIssue({ code: "custom", path: ["day"], message: "Invalid calendar date" });
});
export const REPORT_LIMITS = { fileBytes: 10 * 1024 * 1024, filesPerReport: 10, reportsPerAssessment: 20, assessmentBytes: 100 * 1024 * 1024 } as const;
export type AssessmentReportLimits = { fileBytes: number; filesPerReport: number; reportsPerAssessment: number; assessmentBytes: number };
export type AssessmentPatient = { id: string; reference: string; displayName: string; dateOfBirth: string; gender: string; phone?: string; homeFacility: { id: string; name: string } | null };
export type AssessmentReportFile = { id: string; reportId: string; originalFilename: string; mediaType: string; size: number; status: string; createdAt: string };
export type AssessmentReport = { id: string; label: string; purpose: string; datePrecision: "DAY" | "MONTH"; year: number | null; month: number | null; day: number | null; files: AssessmentReportFile[] };
export type ReportSubmissionIssue = "name" | "date" | "file";
export function getReportSubmissionIssues(report: Pick<AssessmentReport, "label" | "year" | "month" | "day"> & { datePrecision: string; files: Array<Pick<AssessmentReportFile, "status">> }): ReportSubmissionIssue[] {
  const issues: ReportSubmissionIssue[] = [];
  if (!report.label.trim()) issues.push("name");
  if (!report.year || !report.month || (report.datePrecision === "DAY" && !report.day)) issues.push("date");
  if (!report.files.some(file => file.status === "READY")) issues.push("file");
  return issues;
}
export type AssessmentInitialization = { id: string; status: string; assessmentId: string | null; assessmentReference?: string | null; failureCode: string | null };
export type AssessmentWorkflow = {
  id: string; reference: string; serialNumber: number; organizationId: string; patientId: string; facilityId: string | null; status: string; revision: number; canEditDraft?: boolean; isPriority: boolean;
  patient: AssessmentPatient; answers: FormAnswers; manifest: AssessmentFormManifest;
  progress: ReturnType<typeof getAssessmentCompletion>; reports: AssessmentReport[]; reportLimits?: AssessmentReportLimits;
  binding: { version: string; checksum: string }; result: unknown | null;
  submission: { id: string; status: string; failureCode: string | null; nextRetryAt?: string | null; issues?: Array<{ fieldId: string; message: string }> } | null;
  reviewToken: string;
  attestations: AssessmentSubmissionAttestation[];
  heightSource: { assessmentId: string; recordedAt: string } | null;
  createdAt: string; updatedAt: string;
};

/** Read-only projection of the validated NIQ Scoring result for clinical workspace display. */
export const assessmentRiskColorSchema = z.union([
  z.enum(["green", "amber", "red", "neutral", "blue", "purple"]),
  z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color"),
]);
export const assessmentRiskCategorySchema = z.object({
  id: z.string(), label: z.string(), color: assessmentRiskColorSchema.optional(),
  min: z.number().finite().nonnegative().nullable(), max: z.number().finite().nonnegative().nullable(),
  minInclusive: z.boolean(), maxInclusive: z.boolean(),
}).strict();
export const assessmentClassificationSchema = z.object({
  id: z.string(), label: z.string(), interpretation: z.string(),
  // Older saved results predate category colors.
  color: assessmentRiskColorSchema.optional(),
});
export const assessmentScoreResultSchema = z.object({
  formatVersion: z.literal(2), profile: z.literal("NIQ_FINAL_ASSESSMENT"), complete: z.literal(true),
  score: z.number().finite().nonnegative().nullable(),
  questionnaireScore: z.number().finite().nonnegative().nullable().optional(),
  faceScan: z.object({ sessionId: z.string(), points: z.number().finite().nonnegative() }).nullable().optional(),
  classification: assessmentClassificationSchema.nullable(),
  /** Snapshot of the scoring version's categories; older saved results may not have one. */
  riskCategories: z.array(assessmentRiskCategorySchema).optional(),
  derived: z.object({ weightLossPercent: z.number().finite().nullable(), proteinAdequacy: z.enum(["adequate", "inadequate"]).nullable() }).optional(),
  components: z.array(z.object({ id: z.string(), sectionId: z.string(), label: z.string(), points: z.number().finite().nonnegative().nullable(), status: z.enum(["answered", "unanswered", "pending"]), reason: z.string().optional() })),
  version: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/), resultReference: z.string(), calculatedAt: z.iso.datetime(), clinicalUsePermitted: z.boolean(),
}).superRefine((result, ctx) => {
  const answered = result.components.some(component => component.status === "answered");
  if (result.score === null && (result.classification !== null || answered || result.faceScan || result.components.some(component => component.status === "pending")))
    ctx.addIssue({ code: "custom", message: "An unscored result must have only unanswered components" });
  if (result.score !== null && (result.classification === null || !answered && !result.faceScan))
    ctx.addIssue({ code: "custom", message: "A scored result needs questionnaire or face scan points and a classification" });
});
export type AssessmentScoreResult = z.infer<typeof assessmentScoreResultSchema>;
