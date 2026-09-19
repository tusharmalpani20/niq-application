import { describe, expect, test } from "bun:test";
import { requestScoringOrganizationInfo, ScoringOrganizationInfoRequestError } from "./scoring-organization-info";

const snapshot = {
  organization: { id: "01J00000000000000000000001", name: "Example Health Network", status: "ACTIVE" },
  deployment: { id: "01J00000000000000000000002", mode: "NIQ_HOSTED", environment: "production", status: "ACTIVE" },
  services: { scoring: { enabled: true }, faceScan: { enabled: false } },
  limits: { scoresPerMonth: 10_000, faceScansPerMonth: null },
  usage: { period: "2026-09", scores: 12, faceScans: 0 },
  updatedAt: "2026-09-14T10:00:00.000Z",
  unavailableFields: ["limits.users"],
};

type Fetcher = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;
const request = (fetcher: Fetcher) => requestScoringOrganizationInfo({
  baseUrl: "https://scoring.example.test",
  credential: "niq_dep_prefix.secret",
  requestId: "request-1",
  timeoutMs: 1_000,
  fetcher,
});

describe("NIQ Scoring organization information client", () => {
  test("uses only the service credential to resolve the deployment", async () => {
    let observedUrl = "";
    let observedAuthorization = "";
    const result = await request(async (input, init) => {
      observedUrl = String(input);
      observedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json(snapshot);
    });
    expect(observedUrl).toBe("https://scoring.example.test/v1/integrations/organization-info");
    expect(observedAuthorization).toBe("Bearer niq_dep_prefix.secret");
    expect(result.usage.scores).toBe(12);
    expect(JSON.stringify(result)).not.toContain("niq_dep_prefix.secret");
  });

  test.each([
    [401, "UNAUTHORIZED", "unauthorized"],
    [403, "CLIENT_DISABLED", "disabled"],
    [403, "DEPLOYMENT_DISABLED", "disabled"],
    [409, "CONFIGURATION_INCOMPLETE", "incomplete"],
  ] as const)("maps %i %s without exposing upstream details", async (status, code, reason) => {
    await expect(request(async () => Response.json({ error: code }, { status }))).rejects.toMatchObject({ reason });
  });

  test("accepts authoritative rule assignments without resolving them locally", async () => {
    const ruleVersion = { mode: "DEFAULT", version: "TEST-5" } as const;
    expect((await request(async () => Response.json({ ...snapshot, ruleVersion }))).ruleVersion).toEqual(ruleVersion);
    expect((await request(async () => Response.json(snapshot))).ruleVersion).toBeUndefined();
    await expect(request(async () => Response.json({ ...snapshot, ruleVersion: { mode: "LATEST", version: "TEST-5" } }))).rejects.toBeInstanceOf(ScoringOrganizationInfoRequestError);
  });

  test("rejects a successful response that does not match the allowlist", async () => {
    await expect(request(async () => Response.json({ ...snapshot, credential: "must-not-pass" }))).rejects.toBeInstanceOf(ScoringOrganizationInfoRequestError);
    await expect(request(async () => Response.json({ ...snapshot, limits: {} }))).rejects.toBeInstanceOf(ScoringOrganizationInfoRequestError);
  });
});
