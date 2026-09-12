import { describe, expect, test } from "bun:test";
import { createAssessmentSchema, createOrganizationSchema, createPatientSchema, measurementProvenanceSchema } from "./index";

const organizationId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patientId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const questionnaireDefinitionId = "01ARZ3NDEKTSV4RRFFQ69G5FAX";

describe("application contracts", () => {
  test("rejects unsafe organization slugs", () => {
    expect(createOrganizationSchema.safeParse({ legalName: "Apollo Group", displayName: "Apollo", slug: "Apollo Group" }).success).toBe(false);
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
});
