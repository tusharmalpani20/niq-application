import { apiErrorSchema, signInRequestSchema, type ApiError, type SignInRequest } from "@niq/application-contracts";

export class ApiRequestError extends Error {
  constructor(public readonly response: ApiError) {
    super(response.error.message);
  }
}

export type SignInResult =
  | { nextStep: "MFA_REQUIRED"; challengeId: string }
  | { nextStep: "AUTHENTICATED" };

export async function signIn(input: SignInRequest): Promise<SignInResult> {
  const request = signInRequestSchema.parse(input);
  const response = await fetch("/api/v1/auth/sign-in", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json();

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiRequestError(parsed.data);
    throw new Error("The service returned an unexpected response.");
  }

  const result = body as Partial<SignInResult>;
  if (result.nextStep === "MFA_REQUIRED" && typeof result.challengeId === "string") return { nextStep: result.nextStep, challengeId: result.challengeId };
  if (result.nextStep === "AUTHENTICATED") return { nextStep: result.nextStep };
  throw new Error("The service returned an unexpected authentication response.");
}
