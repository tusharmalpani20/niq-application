import { z } from "zod";
import { ASSESSMENT_ANSWER_TEXT_LIMIT, type AssessmentFormManifest, type FormAnswers } from "./assessment-form";
import type { getAssessmentCompletion } from "./assessment-form-validation";

const entity = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const initializeAssessmentSchema = z.object({ patientId: entity, requestKey: z.string().min(16).max(128) }).strict();
export const saveAssessmentSchema = z.object({ revision: z.number().int().nonnegative(), answers: z.record(z.string().max(100), z.union([z.string().max(ASSESSMENT_ANSWER_TEXT_LIMIT), z.number().finite(), z.array(z.string().max(100)).max(100), z.null()])) }).strict();
export const assessmentRevisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
export const reportInputSchema = z.object({
  revision: z.number().int().nonnegative(), label: z.string().trim().max(120), purpose: z.string().trim().max(300),
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
export type AssessmentInitialization = { id: string; status: string; assessmentId: string | null; failureCode: string | null };
export type AssessmentWorkflow = {
  id: string; organizationId: string; patientId: string; facilityId: string | null; status: string; revision: number;
  patient: AssessmentPatient; answers: FormAnswers; manifest: AssessmentFormManifest;
  progress: ReturnType<typeof getAssessmentCompletion>; reports: AssessmentReport[]; reportLimits?: AssessmentReportLimits;
  binding: { version: string; checksum: string }; result: unknown | null;
  submission: { id: string; status: string; failureCode: string | null; nextRetryAt?: string | null } | null;
  heightSource: { assessmentId: string; recordedAt: string } | null;
  createdAt: string; updatedAt: string;
};

/** Read-only projection of the validated NIQ Scoring result for clinical workspace display. */
export const assessmentScoreResultSchema = z.object({
  formatVersion: z.literal(2), profile: z.literal("NIQ_FINAL_ASSESSMENT"), complete: z.literal(true),
  score: z.number().finite().nonnegative(),
  classification: z.object({ id: z.string(), label: z.string(), interpretation: z.string() }),
  components: z.array(z.object({ id: z.string(), sectionId: z.string(), label: z.string(), points: z.number().finite().nonnegative().nullable(), status: z.enum(["answered", "unanswered", "pending"]), reason: z.string().optional() })),
  version: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/), resultReference: z.string(), calculatedAt: z.iso.datetime(), clinicalUsePermitted: z.boolean(),
});
export type AssessmentScoreResult = z.infer<typeof assessmentScoreResultSchema>;
