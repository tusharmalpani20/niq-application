import { z } from "zod";
import { membershipRoleSchema } from "./roles";
export * from "./roles";
export * from "./assessment-form";
export * from "./assessment-form-validation";
export * from "./assessment-answer-coverage";
export * from "./assessment-workflow";

export const DEFAULT_ORGANIZATION_BRANDING = {
  primaryColor: "#3BB9BD",
  secondaryColor: "#4F5052",
} as const;

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
  "SCORING_NOT_CONFIGURED",
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

export const overviewRiskSchema = z.object({
  highRiskPatients: z.number().int().nonnegative(),
  highRiskPatients30DaysAgo: z.number().int().nonnegative(),
  assessedPatients: z.number().int().nonnegative(),
  categories: z.object({ low: z.number().int().nonnegative(), moderate: z.number().int().nonnegative(), high: z.number().int().nonnegative() }),
  categories30DaysAgo: z.object({ low: z.number().int().nonnegative(), moderate: z.number().int().nonnegative(), high: z.number().int().nonnegative() }),
  highRiskAssessments: z.array(z.object({ patientId: idSchema, assessmentId: idSchema })),
});

export const overviewActivitySchema = z.object({
  items: z.array(z.object({
    id: idSchema,
    assessmentId: idSchema,
    action: z.enum(["ASSESSMENT_CREATED", "ASSESSMENT_SUBMITTED", "CLINICAL_REVIEW_COMPLETE"]),
    occurredAt: z.coerce.date(),
  })),
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
  role: membershipRoleSchema,
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

export const organizationStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]);
export const facilityStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const organizationSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
export const patientReferencePrefixSchema = z.string().trim().toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,11}$/, "Use 2–12 letters or numbers, starting with a letter");
export const patientReferenceSchema = z.string().trim().toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,11}-[1-9]\d{0,9}$/, "Use a patient prefix followed by a positive serial number");

export const organizationSchema = z.object({
  id: idSchema,
  legalName: z.string(),
  displayName: z.string(),
  slug: organizationSlugSchema,
  logoObjectKey: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  patientReferencePrefix: patientReferencePrefixSchema,
  status: organizationStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const organizationListResponseSchema = z.object({ items: z.array(organizationSchema) });

export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  slug: organizationSlugSchema,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_ORGANIZATION_BRANDING.primaryColor),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_ORGANIZATION_BRANDING.secondaryColor),
  patientReferencePrefix: patientReferencePrefixSchema.default("PAT"),
});

const optionalUserLimitSchema = z.number().int().min(1).nullable().default(null);
export const organizationLogoUploadSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentBase64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "Expected base64-encoded image data").max(2_796_204),
});

export const onboardOrganizationSchema = createOrganizationSchema.extend({
  userLimit: optionalUserLimitSchema,
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
  logo: organizationLogoUploadSchema.optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  logoObjectKey: z.string().trim().max(500).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  patientReferencePrefix: patientReferencePrefixSchema.optional(),
  status: organizationStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const updateFacilitySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  status: facilityStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const facilitySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string(),
  code: z.string(),
  timezone: z.string(),
  status: facilityStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const facilityListResponseSchema = z.object({ items: z.array(facilitySchema) });

const facilityTrendSchema = z.object({
  months: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), count: z.number().int().nonnegative() })).length(6),
  previous: z.object({ count: z.number().int().nonnegative(), through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable(),
});
export const facilityPerformanceSchema = z.object({ timezone: z.string(), assessments: facilityTrendSchema, faceScans: facilityTrendSchema });
export type FacilityPerformance = z.infer<typeof facilityPerformanceSchema>;

export const createInvitationSchema = z.object({
  email: z.email().max(320),
  role: membershipRoleSchema.default("OTHER_MEDICAL"),
  facilityIds: z.array(idSchema).max(100).default([]),
});

export const updateOrganizationUserSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  role: membershipRoleSchema,
  facilityIds: z.array(idSchema).max(100).refine(ids => new Set(ids).size === ids.length, "Facilities must be unique."),
}).strict();
export type UpdateOrganizationUser = z.infer<typeof updateOrganizationUserSchema>;

export const updateUserStatusSchema = z.object({
  active: z.boolean(),
});

export const organizationUserSchema = z.object({
  membershipId: idSchema,
  userId: idSchema,
  email: z.email(),
  displayName: z.string().min(1).max(120),
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  role: membershipRoleSchema,
  active: z.boolean(),
  facilities: z.array(z.object({ id: idSchema, name: z.string() })).optional(),
  createdAt: z.coerce.date(),
});

export const organizationUsersResponseSchema = z.object({ items: z.array(organizationUserSchema) });

export const createPlatformAdministratorInvitationSchema = z.object({
  email: z.email().max(320),
}).strict();

export const platformAdministratorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("USER"),
    userId: idSchema,
    membershipId: idSchema,
    email: z.email(),
    displayName: z.string().min(1).max(120),
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]),
    active: z.boolean(),
    createdAt: z.coerce.date(),
  }),
  z.object({
    kind: z.literal("INVITATION"),
    invitationId: idSchema,
    email: z.email(),
    status: z.literal("PENDING"),
    expiresAt: z.coerce.date(),
    createdAt: z.coerce.date(),
  }),
]);

export const platformAdministratorsResponseSchema = z.object({ items: z.array(platformAdministratorSchema) });
export const platformAdministratorInvitationResponseSchema = z.object({
  invitation: z.object({ invitationId: idSchema, email: z.email(), expiresAt: z.coerce.date() }),
  activationToken: z.string().optional(),
});

// NIQ Scoring owns this snapshot. Application validates it at both API
// boundaries and never persists it in the Application database.
export const scoringOrganizationInfoSchema = z.object({
  ruleVersion: z.object({ mode: z.enum(["DEFAULT", "SPECIFIC"]), version: z.string().nullable() }).strict().nullable().optional(),
  organization: z.object({ id: idSchema, name: z.string(), status: z.enum(["ACTIVE", "DISABLED"]) }).strict(),
  deployment: z.object({
    id: idSchema,
    mode: z.enum(["NIQ_HOSTED", "CLIENT_CLOUD", "ON_PREMISES"]),
    environment: z.string(),
    status: z.enum(["ACTIVE", "DISABLED"]),
  }).strict(),
  services: z.object({
    scoring: z.object({ enabled: z.boolean() }).strict(),
    faceScan: z.object({ enabled: z.boolean() }).strict(),
  }).strict(),
  limits: z.object({
    scoresPerMonth: z.number().int().nonnegative().nullable(),
    faceScansPerMonth: z.number().int().nonnegative().nullable(),
  }).strict(),
  usage: z.object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    scores: z.number().int().nonnegative(),
    faceScans: z.number().int().nonnegative(),
  }).strict(),
  updatedAt: z.iso.datetime().nullable(),
  unavailableFields: z.tuple([z.literal("limits.users")]),
}).strict();

export const bootstrapAdminSchema = createOrganizationSchema.extend({
  adminEmail: z.email().max(320),
  adminDisplayName: z.string().trim().min(2).max(120),
  adminPassword: z.string().min(8).max(256),
  userLimit: z.number().int().min(1).nullable().default(null),
});

export const patientGenderSchema = z.enum(["FEMALE", "MALE", "OTHER", "UNKNOWN"]);

export const patientPhoneSchema = z.string().trim().max(40).regex(/^\d*$/, "Mobile number must contain digits only.");

export const registerPatientSchema = z.object({
  medicalRecordNumber: z.string().trim().min(1).max(120),
  homeFacilityId: idSchema,
  dateOfBirth: z.iso.date().refine(
    value => value <= new Date().toISOString().slice(0, 10),
    "Date of birth cannot be in the future.",
  ),
  gender: patientGenderSchema,
  name: z.string().trim().min(1).max(200),
  phone: patientPhoneSchema.min(1, "Mobile number is required."),
  email: z.email().max(320).optional(),
}).strict();

export const updatePatientSchema = registerPatientSchema.omit({ medicalRecordNumber: true, dateOfBirth: true }).extend({
  email: z.union([z.email().max(320), z.literal("")]).nullish().transform(value => value || undefined),
});
export type UpdatePatient = z.infer<typeof updatePatientSchema>;

export const correctPatientMrnSchema = z.object({
  medicalRecordNumber: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(3).max(500),
}).strict();
export type CorrectPatientMrn = z.infer<typeof correctPatientMrnSchema>;

export const correctPatientDobSchema = z.object({
  dateOfBirth: registerPatientSchema.shape.dateOfBirth,
  reason: z.string().trim().min(3).max(500),
}).strict();
export type CorrectPatientDob = z.infer<typeof correctPatientDobSchema>;

export const patientSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  reference: z.string(),
  homeFacility: facilitySchema.pick({ id: true, name: true }).nullable(),
  dateOfBirth: z.iso.date().nullable(),
  gender: patientGenderSchema,
  displayName: z.string(),
  medicalRecordNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.email().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const patientListResponseSchema = z.object({ items: z.array(patientSchema) });
export const createPatientSchema = z.object({
  organizationId: idSchema,
  homeFacilityId: idSchema.nullable().optional(),
  encryptedExternalReference: z.string().min(1),
  externalReferenceLookupHash: z.string().regex(/^[0-9a-f]{64}$/i),
  dateOfBirth: z.iso.date().nullable().optional(),
  gender: patientGenderSchema.default("UNKNOWN"),
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

export const assessmentSummarySchema = z.object({
  id: idSchema,
  reference: z.string().regex(/^ASM-[0-9]{6,}$/),
  serialNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  organizationId: idSchema,
  patient: patientSchema.pick({ id: true, reference: true, displayName: true }),
  facility: facilitySchema.pick({ id: true, name: true }).nullable(),
  status: assessmentStatusSchema,
  myAction: z.enum(["EDIT_DRAFT", "CORRECT_DRAFT", "SEND_FOR_REVIEW"]).nullable(),
  isPriority: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().nullable(),
});

export const assessmentListResponseSchema = z.object({ items: z.array(assessmentSummarySchema) });

export const measurementProvenanceSchema = z.enum([
  "AUTO_FACE_SCAN",
  "AUTOMATED_MANUAL_FALLBACK",
  "MANUAL",
  "REUSED_PREVIOUS",
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
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type CreateAssessment = z.infer<typeof createAssessmentSchema>;
export type CreateFacility = z.infer<typeof createFacilitySchema>;
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type CreatePatient = z.infer<typeof createPatientSchema>;
export type Facility = z.infer<typeof facilitySchema>;
export type MeasurementProvenance = z.infer<typeof measurementProvenanceSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type RegisterPatient = z.infer<typeof registerPatientSchema>;
export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AcceptInvitation = z.infer<typeof acceptInvitationSchema>;
export type BootstrapAdmin = z.infer<typeof bootstrapAdminSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type OnboardOrganization = z.infer<typeof onboardOrganizationSchema>;
export type OnboardOrganizationResponse = z.infer<typeof onboardOrganizationResponseSchema>;
export type OrganizationDetails = z.infer<typeof organizationDetailsResponseSchema>;
export type OrganizationUser = z.infer<typeof organizationUserSchema>;
export type CreatePlatformAdministratorInvitation = z.infer<typeof createPlatformAdministratorInvitationSchema>;
export type PlatformAdministrator = z.infer<typeof platformAdministratorSchema>;
export type ScoringOrganizationInfo = z.infer<typeof scoringOrganizationInfoSchema>;
export type ActivateScoring = z.infer<typeof activateScoringSchema>;
export type ScoringConnection = z.infer<typeof scoringConnectionSchema>;
export type CreateInvitation = z.infer<typeof createInvitationSchema>;
export type UpdateFacility = z.infer<typeof updateFacilitySchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type VerifyMfaRequest = z.infer<typeof verifyMfaRequestSchema>;
export type ResendMfaRequest = z.infer<typeof resendMfaRequestSchema>;

export * from "./face-scan";

export * from "./assessment-score-reviews";

export * from "./clinical-review";
