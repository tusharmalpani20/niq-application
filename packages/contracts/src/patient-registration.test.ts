import { describe, expect, test } from "bun:test";
import { registerPatientSchema } from "./index";

describe("patient registration birth date", () => {
  const patient = {
    medicalRecordNumber: "MRN-1",
    homeFacilityId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    gender: "FEMALE",
    name: "Test patient",
  };

  test("accepts today and past dates", () => {
    expect(registerPatientSchema.safeParse({ ...patient, dateOfBirth: new Date().toISOString().slice(0, 10) }).success).toBe(true);
    expect(registerPatientSchema.safeParse({ ...patient, dateOfBirth: "2000-02-29" }).success).toBe(true);
  });

  test("rejects future dates on the date of birth field", () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const result = registerPatientSchema.safeParse({ ...patient, dateOfBirth: tomorrow.toISOString().slice(0, 10) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["dateOfBirth"]);
      expect(result.error.issues[0]?.message).toBe("Date of birth cannot be in the future.");
    }
  });

  test("still rejects invalid calendar dates", () => {
    expect(registerPatientSchema.safeParse({ ...patient, dateOfBirth: "2025-02-29" }).success).toBe(false);
  });
});
