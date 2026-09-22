import { apiErrorSchema, organizationUserSchema, updateOrganizationUserSchema, type UpdateOrganizationUser } from "@niq/application-contracts";
import { ApiRequestError } from "./api";

export async function updateOrganizationUser(organizationId: string, membershipId: string, input: UpdateOrganizationUser) {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(membershipId)}/profile`, {
    method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify(updateOrganizationUserSchema.parse(input)),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    if (error.success) throw new ApiRequestError(error.data);
    throw new Error("The user could not be updated.");
  }
  return organizationUserSchema.parse(body);
}
