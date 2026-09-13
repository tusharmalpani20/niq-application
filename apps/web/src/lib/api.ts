import {
  acceptInvitationSchema,
  apiErrorSchema,
  authenticationResponseSchema,
  invitationAcceptanceResponseSchema,
  resendMfaRequestSchema,
  resendMfaResponseSchema,
  signInRequestSchema,
  signInResponseSchema,
  verifyMfaRequestSchema,
  type AcceptInvitation,
  type ApiError,
  type AuthenticatedUser,
  type SignInRequest,
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
