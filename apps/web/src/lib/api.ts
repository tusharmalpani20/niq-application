import {
  acceptInvitationSchema,
  assessmentListResponseSchema,
  activateScoringResponseSchema,
  activateScoringSchema,
  apiErrorSchema,
  authenticationResponseSchema,
  invitationAcceptanceResponseSchema,
  facilityListResponseSchema,
  facilitySchema,
  createPlatformAdministratorInvitationSchema,
  createFacilitySchema,
  organizationListResponseSchema,
  organizationDetailsResponseSchema,
  organizationSchema,
  scoringOrganizationInfoSchema,
  organizationUsersResponseSchema,
  updateOrganizationSchema,
  platformAdministratorInvitationResponseSchema,
  platformAdministratorSchema,
  platformAdministratorsResponseSchema,
  onboardOrganizationResponseSchema,
  onboardOrganizationSchema,
  patientListResponseSchema,
  patientSchema,
  registerPatientSchema,
  resendMfaRequestSchema,
  resendMfaResponseSchema,
  signInRequestSchema,
  signInResponseSchema,
  verifyMfaRequestSchema,
  type AcceptInvitation,
  type ActivateScoring,
  type AssessmentSummary,
  type ApiError,
  type AuthenticatedUser,
  type CreatePlatformAdministratorInvitation,
  type CreateFacility,
  type Facility,
  type Organization,
  type OrganizationDetails,
  type OrganizationUser,
  type PlatformAdministrator,
  type ScoringOrganizationInfo,
  type OnboardOrganization,
  type OnboardOrganizationResponse,
  type Patient,
  type RegisterPatient,
  type SignInRequest,
  type UpdateOrganization,
  type VerifyMfaRequest,
} from "@niq/application-contracts";

export class ApiRequestError extends Error {
  constructor(public readonly response: ApiError) {
    super(response.error.message);
  }
}

export type SignInResult =
  | { nextStep: "MFA_REQUIRED"; challengeToken: string; expiresAt: string; resendAvailableAt: string; attemptsRemaining: number; resendsRemaining: number }
  | { nextStep: "AUTHENTICATED"; user: AuthenticatedUser };

async function responseBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiRequestError(parsed.data);
    throw new Error("The service returned an unexpected response.");
  }
  return body;
}

export async function signIn(input: SignInRequest): Promise<SignInResult> {
  const request = signInRequestSchema.parse(input);
  const response = await fetch("/api/v1/auth/sign-in", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const result = signInResponseSchema.parse(await responseBody(response));
  if ("mfaRequired" in result) return {
    nextStep: "MFA_REQUIRED",
    challengeToken: result.challengeToken,
    expiresAt: result.expiresAt,
    resendAvailableAt: result.resendAvailableAt,
    attemptsRemaining: result.attemptsRemaining,
    resendsRemaining: result.resendsRemaining,
  };
  return { nextStep: "AUTHENTICATED", user: result.user };
}

export async function verifyMfa(input: VerifyMfaRequest): Promise<AuthenticatedUser> {
  const response = await fetch("/api/v1/auth/mfa/verify", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(verifyMfaRequestSchema.parse(input)),
  });
  return authenticationResponseSchema.parse(await responseBody(response)).user;
}

export async function resendMfa(challengeToken: string) {
  const response = await fetch("/api/v1/auth/mfa/resend", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(resendMfaRequestSchema.parse({ challengeToken })),
  });
  return resendMfaResponseSchema.parse(await responseBody(response));
}

export async function acceptInvitation(input: AcceptInvitation): Promise<void> {
  const response = await fetch("/api/v1/auth/invitations/accept", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(acceptInvitationSchema.parse(input)),
  });
  invitationAcceptanceResponseSchema.parse(await responseBody(response));
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const response = await fetch("/api/v1/auth/me", { credentials: "include" });
  return authenticationResponseSchema.parse(await responseBody(response)).user;
}

export async function signOut(): Promise<void> {
  const response = await fetch("/api/v1/auth/sign-out", { method: "POST", credentials: "include" });
  if (!response.ok && response.status !== 401) await responseBody(response);
}

export async function listOrganizations(): Promise<Organization[]> {
  const response = await fetch("/api/v1/organizations", { credentials: "include" });
  return organizationListResponseSchema.parse(await responseBody(response)).items;
}

export async function listPlatformAdministrators(): Promise<PlatformAdministrator[]> {
  const response = await fetch("/api/v1/platform/administrators", { credentials: "include" });
  return platformAdministratorsResponseSchema.parse(await responseBody(response)).items;
}

export async function invitePlatformAdministrator(input: CreatePlatformAdministratorInvitation) {
  const response = await fetch("/api/v1/platform/administrators/invitations", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(createPlatformAdministratorInvitationSchema.parse(input)),
  });
  return platformAdministratorInvitationResponseSchema.parse(await responseBody(response));
}

export async function setPlatformAdministratorActive(membershipId: string, active: boolean): Promise<PlatformAdministrator> {
  const response = await fetch(`/api/v1/platform/administrators/${membershipId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ active }),
  });
  return platformAdministratorSchema.parse(await responseBody(response));
}

export async function onboardOrganization(input: OnboardOrganization): Promise<OnboardOrganizationResponse> {
  const response = await fetch("/api/v1/organizations/onboard", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(onboardOrganizationSchema.parse(input)),
  });
  return onboardOrganizationResponseSchema.parse(await responseBody(response));
}

export async function getOrganization(organizationId: string): Promise<OrganizationDetails> {
  const response = await fetch(`/api/v1/organizations/${organizationId}`, { credentials: "include" });
  return organizationDetailsResponseSchema.parse(await responseBody(response));
}

export async function getOrganizationBySlug(organizationSlug: string): Promise<OrganizationDetails> {
  const response = await fetch(`/api/v1/organizations/by-slug/${encodeURIComponent(organizationSlug)}`, { credentials: "include" });
  return organizationDetailsResponseSchema.parse(await responseBody(response));
}

export async function listOrganizationUsers(organizationId: string): Promise<OrganizationUser[]> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/users`, { credentials: "include" });
  return organizationUsersResponseSchema.parse(await responseBody(response)).items;
}

export async function setOrganizationStatus(organizationId: string, status: "ACTIVE" | "SUSPENDED"): Promise<Organization> {
  return updateOrganization(organizationId, { status });
}

export async function updateOrganization(organizationId: string, input: UpdateOrganization): Promise<Organization> {
  const response = await fetch(`/api/v1/organizations/${organizationId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(updateOrganizationSchema.parse(input)),
  });
  return organizationSchema.parse(await responseBody(response));
}

export async function getScoringOrganizationInfo(organizationId: string): Promise<ScoringOrganizationInfo> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/scoring/organization-info`, { credentials: "include" });
  return scoringOrganizationInfoSchema.parse(await responseBody(response));
}

export async function activateScoring(organizationId: string, input: ActivateScoring) {
  const response = await fetch(`/api/v1/organizations/${organizationId}/scoring/activate`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(activateScoringSchema.parse(input)),
  });
  return activateScoringResponseSchema.parse(await responseBody(response)).connection;
}

export async function disconnectScoring(organizationId: string): Promise<void> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/scoring/connection`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) await responseBody(response);
}

export async function listFacilities(organizationId: string): Promise<Facility[]> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/facilities`, { credentials: "include" });
  return facilityListResponseSchema.parse(await responseBody(response)).items;
}

export async function createFacility(organizationId: string, input: CreateFacility): Promise<Facility> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/facilities`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(createFacilitySchema.parse(input)),
  });
  return facilitySchema.parse(await responseBody(response));
}

export async function listPatients(organizationId: string): Promise<Patient[]> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/patients`, { credentials: "include" });
  return patientListResponseSchema.parse(await responseBody(response)).items;
}

export async function listAssessments(organizationId: string): Promise<AssessmentSummary[]> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/assessments`, { credentials: "include" });
  return assessmentListResponseSchema.parse(await responseBody(response)).items;
}

export async function getPatient(organizationId: string, patientLocator: string): Promise<Patient> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/patients/${encodeURIComponent(patientLocator)}`, { credentials: "include" });
  return patientSchema.parse(await responseBody(response));
}

export async function registerPatient(organizationId: string, input: RegisterPatient): Promise<Patient> {
  const response = await fetch(`/api/v1/organizations/${organizationId}/patients`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registerPatientSchema.parse(input)),
  });
  return patientSchema.parse(await responseBody(response));
}
