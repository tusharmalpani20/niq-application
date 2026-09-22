import { apiErrorSchema, patientSchema, updatePatientSchema, type Patient, type UpdatePatient } from "@niq/application-contracts";
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
