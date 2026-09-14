import { describe, expect, test } from "bun:test";
import { decryptPatientData, encryptPatientData, patientDataKey } from "./patient-data";

describe("patient data encryption", () => {
  test("encrypts and decrypts patient data with authenticated encryption", () => {
    const key = patientDataKey(Buffer.alloc(32, 7).toString("base64"), "unused-session-secret");
    const encrypted = encryptPatientData("MRN-1001", key);
    expect(Buffer.from(encrypted).includes(Buffer.from("MRN-1001"))).toBe(false);
    expect(decryptPatientData(encrypted, key)).toBe("MRN-1001");
  });

  test("derives a stable development key without using the raw session secret", () => {
    const first = patientDataKey(undefined, "a-development-session-secret-long-enough");
    const second = patientDataKey(undefined, "a-development-session-secret-long-enough");
    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
  });
});
