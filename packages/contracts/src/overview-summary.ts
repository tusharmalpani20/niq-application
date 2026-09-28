import { z } from "zod";

const id = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const assessmentStatus = z.enum(["DRAFT", "READY_FOR_SCORING", "SCORING_PENDING", "SCORING_UNAVAILABLE", "SCORED", "UNDER_REVIEW", "COMPLETED", "VOIDED"]);

export const overviewAssessmentSchema = z.object({
  id,
  reference: z.string().regex(/^ASM-[0-9]{6,}$/),
  patient: z.object({ id, reference: z.string(), displayName: z.string() }),
  status: assessmentStatus,
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});

export const overviewPatientSchema = z.object({
  id,
  reference: z.string(),
  displayName: z.string(),
  homeFacility: z.object({ id, name: z.string() }).nullable(),
  createdAt: z.coerce.date(),
});

export const overviewSummarySchema = z.object({
  patientCount: z.number().int().nonnegative(),
  patientsAdded30Days: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  completedAdded30Days: z.number().int().nonnegative(),
  myAssessmentActions: z.number().int().nonnegative(),
  readyToSend: z.number().int().nonnegative(),
  correctionsToMake: z.number().int().nonnegative(),
  scoringIssues: z.number().int().nonnegative(),
  priority: z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(), items: z.array(overviewAssessmentSchema) }),
  recent: z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(), items: z.array(z.object({ patient: overviewPatientSchema, assessment: overviewAssessmentSchema.nullable() })) }),
});

export type OverviewSummary = z.infer<typeof overviewSummarySchema>;
