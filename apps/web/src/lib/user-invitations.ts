import { apiErrorSchema, createInvitationSchema, type CreateInvitation } from "@niq/application-contracts";
import { ApiRequestError } from "./api";

export async function inviteOrganizationUser(organizationId: string, input: CreateInvitation) {
  const response = await fetch(`/api/v1/organizations/${organizationId}/invitations`, {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify(createInvitationSchema.parse(input)),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    if (error.success) throw new ApiRequestError(error.data);
    throw new Error("The invitation could not be created.");
  }
  if (!body || typeof body !== "object") throw new Error("The service returned an unexpected response.");
  if ("activationToken" in body) {
    if (typeof body.activationToken !== "string") throw new Error("The service returned an invalid invitation token.");
    return { activationToken: body.activationToken };
  }
  return { activationToken: undefined };
}
