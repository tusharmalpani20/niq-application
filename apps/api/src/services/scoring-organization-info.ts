import { scoringOrganizationInfoSchema, type ScoringOrganizationInfo } from "@niq/application-contracts";

type RequestFailure = "unauthorized" | "disabled" | "incomplete" | "unavailable" | "invalid-response";
type Fetcher = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export class ScoringOrganizationInfoRequestError extends Error {
  constructor(readonly reason: RequestFailure) {
    super(`NIQ Scoring organization information request failed: ${reason}`);
  }
}

export async function requestScoringOrganizationInfo(input: {
  baseUrl: string;
  credential: string;
  requestId: string;
  timeoutMs: number;
  fetcher?: Fetcher;
}): Promise<ScoringOrganizationInfo> {
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(new URL("/v1/integrations/organization-info", input.baseUrl), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.credential}`,
        "x-request-id": input.requestId,
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    throw new ScoringOrganizationInfoRequestError("unavailable");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const code = typeof body?.error === "string" ? body.error : "";
    if (response.status === 401 && code === "UNAUTHORIZED") throw new ScoringOrganizationInfoRequestError("unauthorized");
    if (response.status === 403 && (code === "CLIENT_DISABLED" || code === "DEPLOYMENT_DISABLED")) throw new ScoringOrganizationInfoRequestError("disabled");
    if (response.status === 409 && code === "CONFIGURATION_INCOMPLETE") throw new ScoringOrganizationInfoRequestError("incomplete");
    throw new ScoringOrganizationInfoRequestError("unavailable");
  }

  const parsed = scoringOrganizationInfoSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ScoringOrganizationInfoRequestError("invalid-response");
  return parsed.data;
}
