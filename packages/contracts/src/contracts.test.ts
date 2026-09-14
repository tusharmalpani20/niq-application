import { describe, expect, test } from "bun:test";
import { acceptInvitationSchema, createAssessmentSchema, createOrganizationSchema, createPatientSchema, createPlatformAdministratorInvitationSchema, DEFAULT_ORGANIZATION_BRANDING, errorCodeSchema, measurementProvenanceSchema, onboardOrganizationSchema, signInRequestSchema, signInResponseSchema, updateOrganizationSchema } from "./index";

const organizationId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patientId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const questionnaireDefinitionId = "01ARZ3NDEKTSV4RRFFQ69G5FAX";

describe("application contracts", () => {
  test("defaults organization branding to teal primary and blue secondary", () => {
    expect(DEFAULT_ORGANIZATION_BRANDING).toEqual({ primaryColor: "#0E9384", secondaryColor: "#175CD3" });
  });

  test("rejects unsafe organization slugs", () => {
    expect(createOrganizationSchema.safeParse({ legalName: "Example Health Group", displayName: "Example Health", slug: "Example Health Group" }).success).toBe(false);
  });

  test("normalizes and validates patient reference prefixes", () => {
    const parsed = createOrganizationSchema.parse({ legalName: "Example Health Group", displayName: "Example Health", slug: "example-health", patientReferencePrefix: "ehn" });
    expect(parsed.patientReferencePrefix).toBe("EHN");
    expect(updateOrganizationSchema.safeParse({ patientReferencePrefix: "1EH" }).success).toBe(false);
    expect(updateOrganizationSchema.safeParse({ patientReferencePrefix: "E" }).success).toBe(false);
  });

  test("limits provenance to system-derived values", () => {
    expect(measurementProvenanceSchema.safeParse("AUTO_FACE_SCAN").success).toBe(true);
    expect(measurementProvenanceSchema.safeParse("USER_SELECTED").success).toBe(false);
  });

  test("requires encrypted patient references and a keyed lookup hash", () => {
    const patient = {
      organizationId,
      externalReference: "MRN-1234",
      encryptedProfile: "encrypted-envelope",
      encryptionKeyVersion: "key-v1",
    };
    expect(createPatientSchema.safeParse(patient).success).toBe(false);
  });

  test("uses gender in the patient contract", () => {
    const patient = {
      organizationId,
      encryptedExternalReference: "encrypted-reference",
      externalReferenceLookupHash: "a".repeat(64),
      encryptedProfile: "encrypted-envelope",
      encryptionKeyVersion: "key-v1",
    };
    expect(createPatientSchema.safeParse({ ...patient, gender: "FEMALE" }).success).toBe(true);
    expect(createPatientSchema.safeParse({ ...patient, sex: "FEMALE" }).success).toBe(false);
  });

  test("references one questionnaire definition instead of accepting a second version", () => {
    const assessment = {
      organizationId,
      patientId,
      questionnaireDefinitionId,
      questionnaireVersion: "1.0.0",
    };
    expect(createAssessmentSchema.safeParse(assessment).success).toBe(false);
  });

  test("accepts only canonical uppercase ULIDs for entity references", () => {
    const assessment = { organizationId, patientId, questionnaireDefinitionId };
    expect(createAssessmentSchema.safeParse(assessment).success).toBe(true);
    expect(createAssessmentSchema.safeParse({ ...assessment, patientId: patientId.toLowerCase() }).success).toBe(false);
    expect(createAssessmentSchema.safeParse({ ...assessment, patientId: "c19124fc-dbbb-4b20-a32d-c856be748b9c" }).success).toBe(false);
  });

  test("requires strong invitation activation passwords", () => {
    expect(acceptInvitationSchema.safeParse({ token: "t".repeat(32), displayName: "Test User", password: "short7!" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "t".repeat(32), displayName: "Test User", password: "eight8!!" }).success).toBe(true);
  });

  test("keeps platform administrator invitations email-only", () => {
    expect(createPlatformAdministratorInvitationSchema.safeParse({ email: "admin@niq.test" }).success).toBe(true);
    expect(createPlatformAdministratorInvitationSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(createPlatformAdministratorInvitationSchema.safeParse({ email: "admin@niq.test", platformRole: "NIQ_ADMIN" }).success).toBe(false);
  });

  test("defines an explicit error code for missing NIQ Scoring configuration", () => {
    expect(errorCodeSchema.parse("SCORING_NOT_CONFIGURED")).toBe("SCORING_NOT_CONFIGURED");
  });

  test("requires at least eight password characters when signing in", () => {
    expect(signInRequestSchema.safeParse({ email: "user@example.com", password: "short7!" }).success).toBe(false);
    expect(signInRequestSchema.safeParse({ email: "user@example.com", password: "eight8!!" }).success).toBe(true);
  });

  test("requires server-issued MFA expiry and retry limits", () => {
    expect(signInResponseSchema.safeParse({
      mfaRequired: true,
      challengeToken: "t".repeat(43),
      expiresAt: "2026-09-13T12:00:00.000Z",
      resendAvailableAt: "2026-09-13T11:50:30.000Z",
      attemptsRemaining: 5,
      resendsRemaining: 3,
    }).success).toBe(true);
  });

  test("keeps only the Application-owned user limit during organization onboarding", () => {
    const result = onboardOrganizationSchema.parse({
      legalName: "Example Health Network Private Limited",
      displayName: "Example Health Network",
      slug: "example-health",
      firstAdminEmail: "admin@example-health.test",
    });
    expect(result.userLimit).toBeNull();
    expect("deploymentMode" in result).toBe(false);
    expect("scoringMonthlyLimit" in result).toBe(false);
    expect("faceScanMonthlyLimit" in result).toBe(false);
    expect(result.logo).toBeNull();
    expect(result.patientReferencePrefix).toBe("PAT");
  });

  test("accepts only positive whole-number user limits", () => {
    const organization = {
      legalName: "Example Health Network Private Limited",
      displayName: "Example Health Network",
      slug: "example-health",
      firstAdminEmail: "admin@example-health.test",
    };
    expect(onboardOrganizationSchema.safeParse({ ...organization, userLimit: 25 }).success).toBe(true);
    expect(onboardOrganizationSchema.safeParse({ ...organization, userLimit: 2.5 }).success).toBe(false);
    expect(onboardOrganizationSchema.safeParse({ ...organization, userLimit: -1 }).success).toBe(false);
  });

  test("allows an organization to be suspended and re-enabled", () => {
    expect(updateOrganizationSchema.safeParse({ status: "SUSPENDED" }).success).toBe(true);
    expect(updateOrganizationSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(updateOrganizationSchema.safeParse({ status: "INACTIVE" }).success).toBe(false);
  });

  test("accepts only supported organization logo formats", () => {
    const base = { legalName: "Example Health Network", displayName: "Example Health", slug: "example-health", firstAdminEmail: "admin@example-health.test" };
    expect(onboardOrganizationSchema.safeParse({ ...base, logo: { mimeType: "image/png", contentBase64: "iVBORw0KGgo=" } }).success).toBe(true);
    expect(onboardOrganizationSchema.safeParse({ ...base, logo: { mimeType: "image/svg+xml", contentBase64: "PHN2Zz4=" } }).success).toBe(false);
  });
});
