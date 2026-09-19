import { apiErrorSchema, facilitySchema, updateFacilitySchema, type UpdateFacility } from "@niq/application-contracts";
import { ApiRequestError } from "./api";

export async function updateFacility(organizationId: string, facilityId: string, input: UpdateFacility) {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/facilities/${encodeURIComponent(facilityId)}`, {
    method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify(updateFacilitySchema.parse(input)),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    if (error.success) throw new ApiRequestError(error.data);
    throw new Error("The facility could not be saved. Please try again.");
  }
  return facilitySchema.parse(body);
}
