import { apiErrorSchema, correctPatientDobSchema, correctPatientMrnSchema, patientSchema, updatePatientSchema, type CorrectPatientDob, type CorrectPatientMrn, type Patient, type UpdatePatient } from "@niq/application-contracts";
import { ApiRequestError } from "./api";

export async function updatePatient(organizationId: string, patientLocator: string, input: UpdatePatient): Promise<Patient> {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/patients/${encodeURIComponent(patientLocator)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(updatePatientSchema.parse(input)),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiRequestError(parsed.data);
    throw new Error("The service returned an unexpected response.");
  }
  return patientSchema.parse(body);
}

export async function correctPatientMrn(organizationId: string, patientLocator: string, input: CorrectPatientMrn): Promise<Patient> {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/patients/${encodeURIComponent(patientLocator)}/correct-mrn`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(correctPatientMrnSchema.parse(input)),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiRequestError(parsed.data);
    throw new Error("The service returned an unexpected response.");
  }
  return patientSchema.parse(body);
}

export async function correctPatientDob(organizationId: string, patientLocator: string, input: CorrectPatientDob): Promise<Patient> {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/patients/${encodeURIComponent(patientLocator)}/correct-dob`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(correctPatientDobSchema.parse(input)),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiRequestError(parsed.data);
    throw new Error("The service returned an unexpected response.");
  }
  return patientSchema.parse(body);
}
