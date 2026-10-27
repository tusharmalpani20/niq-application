import { apiErrorSchema, byocSetupStatusSchema, type ByocSetupRequest } from "@niq/application-contracts";

async function setupRequest(path: string, token: string, signal: AbortSignal, input?: ByocSetupRequest) {
  const response = await fetch(`/api/v1/setup/${path}`, {
    method: input ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal,
    headers: { "x-setup-token": token, ...(input ? { "Content-Type": "application/json" } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(error.success ? error.data.error.message : "Setup is unavailable. Contact your installation operator.");
  }
  return body;
}

export async function loadByocSetup(token: string, signal: AbortSignal) {
  return byocSetupStatusSchema.parse(await setupRequest("status", token, signal));
}

export async function completeByocSetup(token: string, signal: AbortSignal, input: ByocSetupRequest) {
  const result = await setupRequest("complete", token, signal, input) as { signInRequired?: unknown } | null;
  if (result?.signInRequired !== true) throw new Error("Unexpected setup response. Contact your installation operator before retrying.");
}
