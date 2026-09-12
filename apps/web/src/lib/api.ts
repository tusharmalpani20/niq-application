import { apiErrorSchema, signInRequestSchema, type ApiError, type SignInRequest } from "@niq/application-contracts";

export class ApiRequestError extends Error {
  constructor(public readonly response: ApiError) {
    super(response.error.message);
  }
}

export async function signIn(input: SignInRequest): Promise<never> {
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

  throw new Error("Authentication response handling is not configured.");
}
