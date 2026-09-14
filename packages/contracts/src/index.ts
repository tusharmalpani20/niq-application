import { z } from "zod";

// Entity identifiers are canonical ULIDs. Lowercase input is rejected rather
// than normalized so signatures, logs and database keys have one representation.
export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Expected an uppercase ULID");

export const errorCodeSchema = z.enum([
  "ACCOUNT_LOCKED",
  "AUTH_NOT_CONFIGURED",
  "AUTHENTICATION_REQUIRED",
  "CONFLICT",
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "INVALID_OR_EXPIRED_TOKEN",
  "MFA_REQUIRED",
  "RATE_LIMITED",
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
  password: z.string().min(8).max(256),
});

export const verifyMfaRequestSchema = z.object({
  challengeToken: z.string().min(32).max(512),
  otp: z.string().regex(/^\d{6}$/),
});

export const resendMfaRequestSchema = z.object({
  challengeToken: z.string().min(32).max(512),
});

export const mfaChallengeSchema = z.object({
  challengeToken: z.string().min(32).max(512),
  expiresAt: z.iso.datetime(),
  resendAvailableAt: z.iso.datetime(),
  attemptsRemaining: z.number().int().nonnegative(),
  resendsRemaining: z.number().int().nonnegative(),
});

export const authenticatedUserSchema = z.object({
  userId: idSchema,
  organizationId: idSchema,
  membershipId: idSchema,
  email: z.email(),
  displayName: z.string().min(1).max(120),
  role: z.enum(["ORGANIZATION_ADMIN", "MEDICAL", "SUPPORT"]),
  platformRole: z.enum(["USER", "NIQ_ADMIN"]),
});

export const signInResponseSchema = z.union([
  mfaChallengeSchema.extend({
    mfaRequired: z.literal(true),
  }),
  z.object({ user: authenticatedUserSchema }),
]);

export const resendMfaResponseSchema = mfaChallengeSchema;

export const authenticationResponseSchema = z.object({ user: authenticatedUserSchema });

export const invitationAcceptanceResponseSchema = authenticationResponseSchema.extend({
  signInRequired: z.literal(true),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(512),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(256),
});

export const membershipRoleSchema = z.enum(["ORGANIZATION_ADMIN", "MEDICAL", "SUPPORT"]);
export const organizationStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]);
export const facilityStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const deploymentModeSchema = z.enum(["NIQ_HOSTED", "CLIENT_CLOUD", "ON_PREM"]);

export const organizationSchema = z.object({
  id: idSchema,
  legalName: z.string(),
  displayName: z.string(),
  slug: z.string(),
  logoObjectKey: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  deploymentMode: deploymentModeSchema,
  scoringEnabled: z.boolean(),
  faceScanEnabled: z.boolean(),
  status: organizationStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const organizationListResponseSchema = z.object({ items: z.array(organizationSchema) });

export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#175CD3"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0E9384"),
});

const optionalMonthlyLimitSchema = z.number().int().min(1).nullable().default(null);
export const organizationLogoUploadSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentBase64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "Expected base64-encoded image data").max(2_796_204),
});

export const onboardOrganizationSchema = createOrganizationSchema.extend({
  deploymentMode: deploymentModeSchema.default("NIQ_HOSTED"),
  scoringEnabled: z.boolean().default(true),
  faceScanEnabled: z.boolean().default(true),
  userLimit: optionalMonthlyLimitSchema,
  scoringMonthlyLimit: optionalMonthlyLimitSchema,
  faceScanMonthlyLimit: optionalMonthlyLimitSchema,
  firstAdminEmail: z.email().max(320),
  logo: organizationLogoUploadSchema.nullable().default(null),
});

export const onboardOrganizationResponseSchema = z.object({
  organization: organizationSchema,
  invitation: z.object({
    id: idSchema,
    email: z.email(),
    expiresAt: z.coerce.date(),
  }),
  activationToken: z.string().optional(),
});

export const activateScoringSchema = z.object({ activationToken: z.string().min(48).max(256) });
export const scoringConnectionSchema = z.object({
  deploymentId: idSchema,
  scoringOrganizationId: idSchema,
  keyVersion: z.string(),
  activatedAt: z.coerce.date(),
});
export const activateScoringResponseSchema = z.object({ connection: scoringConnectionSchema });

export const organizationDetailsResponseSchema = z.object({
  organization: organizationSchema,
  entitlement: z.object({
    userLimit: z.number().int().nullable(),
    scoringMonthlyLimit: z.number().int().nullable(),
    faceScanMonthlyLimit: z.number().int().nullable(),
    effectiveFrom: z.coerce.date(),
  }).nullable(),
  invitations: z.array(z.object({
    id: idSchema,
    email: z.email(),
    role: membershipRoleSchema,
    status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]),
    expiresAt: z.coerce.date(),
  })),
  scoringConnection: scoringConnectionSchema.nullable(),
});

export const createFacilitySchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(1).max(40),
  timezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
});

export const updateOrganizationSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  logoObjectKey: z.string().trim().max(500).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: organizationStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const updateFacilitySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  status: facilityStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createInvitationSchema = z.object({
  email: z.email().max(320),
  role: membershipRoleSchema.default("MEDICAL"),
  facilityIds: z.array(idSchema).max(100).default([]),
});

export const updateUserStatusSchema = z.object({
  active: z.boolean(),
});

export const bootstrapAdminSchema = createOrganizationSchema.extend({
  adminEmail: z.email().max(320),
  adminDisplayName: z.string().trim().min(2).max(120),
  adminPassword: z.string().min(8).max(256),
  userLimit: z.number().int().min(1).nullable().default(null),
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
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AcceptInvitation = z.infer<typeof acceptInvitationSchema>;
export type BootstrapAdmin = z.infer<typeof bootstrapAdminSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type OnboardOrganization = z.infer<typeof onboardOrganizationSchema>;
export type OnboardOrganizationResponse = z.infer<typeof onboardOrganizationResponseSchema>;
export type OrganizationDetails = z.infer<typeof organizationDetailsResponseSchema>;
export type ActivateScoring = z.infer<typeof activateScoringSchema>;
export type ScoringConnection = z.infer<typeof scoringConnectionSchema>;
export type CreateInvitation = z.infer<typeof createInvitationSchema>;
export type UpdateFacility = z.infer<typeof updateFacilitySchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type VerifyMfaRequest = z.infer<typeof verifyMfaRequestSchema>;
export type ResendMfaRequest = z.infer<typeof resendMfaRequestSchema>;
