import { z } from "zod";

// Entity identifiers are canonical ULIDs. Lowercase input is rejected rather
// than normalized so signatures, logs and database keys have one representation.
export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Expected an uppercase ULID");

export const errorCodeSchema = z.enum([
  "AUTH_NOT_CONFIGURED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "NOT_FOUND",
  "SCORING_UNAVAILABLE",
  "USER_LIMIT_REACHED",
  "VALIDATION_ERROR",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const signInRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
});

export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#175CD3"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0E9384"),
});

export const createFacilitySchema = z.object({
  organizationId: idSchema,
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(1).max(40),
  timezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
});

export const patientSexSchema = z.enum(["FEMALE", "MALE", "OTHER", "UNKNOWN"]);

export const createPatientSchema = z.object({
  organizationId: idSchema,
  homeFacilityId: idSchema.nullable().optional(),
  encryptedExternalReference: z.string().min(1),
  externalReferenceLookupHash: z.string().regex(/^[0-9a-f]{64}$/i),
  dateOfBirth: z.iso.date().nullable().optional(),
  sex: patientSexSchema.default("UNKNOWN"),
  encryptedProfile: z.string().min(1),
  encryptionKeyVersion: z.string().min(1).max(64),
}).strict();

export const assessmentStatusSchema = z.enum([
  "DRAFT",
  "READY_FOR_SCORING",
  "SCORING_PENDING",
  "SCORING_UNAVAILABLE",
  "SCORED",
  "UNDER_REVIEW",
  "COMPLETED",
  "VOIDED",
]);

export const measurementProvenanceSchema = z.enum([
  "AUTO_FACE_SCAN",
  "AUTOMATED_MANUAL_FALLBACK",
]);

export const createAssessmentSchema = z.object({
  organizationId: idSchema,
  patientId: idSchema,
  facilityId: idSchema.nullable().optional(),
  questionnaireDefinitionId: idSchema,
}).strict();

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "not_ready"]),
  service: z.literal("niq-application-api"),
  timestamp: z.iso.datetime(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type CreateAssessment = z.infer<typeof createAssessmentSchema>;
export type CreateFacility = z.infer<typeof createFacilitySchema>;
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type CreatePatient = z.infer<typeof createPatientSchema>;
export type MeasurementProvenance = z.infer<typeof measurementProvenanceSchema>;
export type SignInRequest = z.infer<typeof signInRequestSchema>;
