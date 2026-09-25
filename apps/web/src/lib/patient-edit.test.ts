import { afterEach, expect, test } from "bun:test";
import { ApiRequestError } from "./api";
import { correctPatientDob, correctPatientMrn, updatePatient } from "./patient-edit";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const input = { name: "Updated Patient", homeFacilityId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", gender: "MALE" as const, phone: "9012345678", email: undefined };

test("patient edit sends a scoped patch without date of birth", async () => {
  let request: { url: string; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX", reference: "PAT-2", homeFacility: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "Central" }, dateOfBirth: "1999-03-20", gender: input.gender, displayName: input.name, medicalRecordNumber: "MRN-1", createdAt: "2026-09-01", updatedAt: "2026-09-22" });
  }) as typeof fetch;
  const patient = await updatePatient("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", input);
  expect(request?.url).toBe("/api/v1/organizations/01ARZ3NDEKTSV4RRFFQ69G5FAX/patients/PAT-2");
  expect(request?.options?.method).toBe("PATCH");
  expect(request?.options?.credentials).toBe("include");
  expect(JSON.parse(String(request?.options?.body))).toEqual({ name: input.name, homeFacilityId: input.homeFacilityId, gender: "MALE", phone: input.phone });
  expect(patient.displayName).toBe(input.name);
});

test("patient edit rejects date of birth changes before saving", async () => {
  let called = false;
  globalThis.fetch = (async () => { called = true; return Response.json({}); }) as typeof fetch;
  await expect(updatePatient("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", { ...input, dateOfBirth: "1999-02-31" } as typeof input)).rejects.toThrow();
  expect(called).toBe(false);
});

test("patient edit propagates server validation failure instead of treating the update as successful", async () => {
  globalThis.fetch = (async () => Response.json({ error: { code: "CONFLICT", requestId: "test", message: "Patient changes conflict with an existing record." } }, { status: 409 })) as typeof fetch;
  await expect(updatePatient("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", input)).rejects.toBeInstanceOf(ApiRequestError);
});

test("MRN correction uses the separate reasoned endpoint", async () => {
  let request: { url: string; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX", reference: "PAT-2", homeFacility: { id: input.homeFacilityId, name: "Central" }, dateOfBirth: "1999-03-20", gender: input.gender, displayName: input.name, medicalRecordNumber: "MRN-2", createdAt: "2026-09-01", updatedAt: "2026-09-22" });
  }) as typeof fetch;
  await correctPatientMrn("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", { medicalRecordNumber: "MRN-2", reason: "Registration typo" });
  expect(request?.url).toEndWith("/patients/PAT-2/correct-mrn");
  expect(request?.options?.method).toBe("POST");
  expect(JSON.parse(String(request?.options?.body))).toEqual({ medicalRecordNumber: "MRN-2", reason: "Registration typo" });
});

test("DOB correction uses the separate reasoned endpoint", async () => {
  let request: { url: string; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX", reference: "PAT-2", homeFacility: { id: input.homeFacilityId, name: "Central" }, dateOfBirth: "2000-03-20", gender: input.gender, displayName: input.name, medicalRecordNumber: "MRN-2", createdAt: "2026-09-01", updatedAt: "2026-09-22" });
  }) as typeof fetch;
  await correctPatientDob("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", { dateOfBirth: "2000-03-20", reason: "Registration typo" });
  expect(request?.url).toEndWith("/patients/PAT-2/correct-dob");
  expect(request?.options?.method).toBe("POST");
  expect(JSON.parse(String(request?.options?.body))).toEqual({ dateOfBirth: "2000-03-20", reason: "Registration typo" });
});
