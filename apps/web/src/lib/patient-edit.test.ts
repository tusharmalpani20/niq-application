import { afterEach, expect, test } from "bun:test";
import { ApiRequestError } from "./api";
import { updatePatient } from "./patient-edit";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const input = { name: "Updated Patient", medicalRecordNumber: "MRN-1", homeFacilityId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", dateOfBirth: "1999-03-20", gender: "MALE" as const, phone: undefined, email: undefined };

test("patient edit sends a scoped patch, preserving an ISO birth date and omitted cleared contacts", async () => {
  let request: { url: string; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX", reference: "PAT-2", homeFacility: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "Central" }, dateOfBirth: input.dateOfBirth, gender: input.gender, displayName: input.name, medicalRecordNumber: input.medicalRecordNumber, createdAt: "2026-09-01", updatedAt: "2026-09-22" });
  }) as typeof fetch;
  const patient = await updatePatient("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", input);
  expect(request?.url).toBe("/api/v1/organizations/01ARZ3NDEKTSV4RRFFQ69G5FAX/patients/PAT-2");
  expect(request?.options?.method).toBe("PATCH");
  expect(request?.options?.credentials).toBe("include");
  expect(JSON.parse(String(request?.options?.body))).toEqual({ name: input.name, medicalRecordNumber: input.medicalRecordNumber, homeFacilityId: input.homeFacilityId, dateOfBirth: "1999-03-20", gender: "MALE" });
  expect(patient.displayName).toBe(input.name);
});

test("patient edit rejects malformed birth dates before saving", async () => {
  let called = false;
  globalThis.fetch = (async () => { called = true; return Response.json({}); }) as typeof fetch;
  await expect(updatePatient("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", { ...input, dateOfBirth: "1999-02-31" })).rejects.toThrow();
  expect(called).toBe(false);
});

test("patient edit propagates server validation failure instead of treating the update as successful", async () => {
  globalThis.fetch = (async () => Response.json({ error: { code: "CONFLICT", requestId: "test", message: "This medical record number is already in use." } }, { status: 409 })) as typeof fetch;
  await expect(updatePatient("01ARZ3NDEKTSV4RRFFQ69G5FAX", "PAT-2", input)).rejects.toBeInstanceOf(ApiRequestError);
});
