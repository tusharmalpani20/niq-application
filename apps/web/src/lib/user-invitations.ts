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

async function organizationRequest(organizationId: string, path: string, method = "GET", input?: unknown) {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/${path}`, {
    method, credentials: "include", ...(input === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    if (error.success) throw new ApiRequestError(error.data);
    throw new Error("The request could not be completed.");
  }
  return body;
}

export async function getInvitationAccess(organizationId: string): Promise<{ allFacilities: boolean }> {
  const body = await organizationRequest(organizationId, "invitation-access");
  if (typeof body?.allFacilities !== "boolean") throw new Error("Invitation access could not be loaded.");
  return body;
}

export async function manageUserInvitation(organizationId: string, invitationId: string, action: "revoke" | "regenerate"): Promise<{ activationToken?: string }> {
  const body = await organizationRequest(organizationId, `invitations/${encodeURIComponent(invitationId)}/${action}`, "POST");
  if (body.activationToken !== undefined && typeof body.activationToken !== "string") throw new Error("The service returned an invalid invitation link.");
  return body;
}

export async function setOrganizationUserActive(organizationId: string, membershipId: string, active: boolean) {
  return organizationRequest(organizationId, `users/${encodeURIComponent(membershipId)}`, "PATCH", { active });
}
