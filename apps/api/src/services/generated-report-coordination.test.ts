import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { GeneratedReportService } from "./generated-report";

// Exercise the service reservation boundary without starting Scoring. This small
// database double applies the queried request/status filters to stored rows.
function reservation(status: string, sameKey = false, ageMs = 60_000, olderQueued = false) {
  const existing = { id: "previous-report", status, requestKey: sameKey ? "requested-key" : "automatic-key",
    sourceFingerprint: "fingerprint", updatedAt: new Date(Date.now() - ageMs), attemptCount: 1 };
  const stored = [existing, ...(olderQueued ? [{ ...existing, id: "older-orphan", status: "QUEUED", requestKey: "orphan-key" }] : [])];
  const writes: any[] = [];
  let claim: any;
  const query = () => {
    let params: unknown[] = [];
    const chain: any = {};
    for (const method of ["from", "orderBy", "limit", "for"]) chain[method] = () => chain;
    chain.where = (predicate: any) => { params = new PgDialect().sqlToQuery(predicate).params; return chain; };
    chain.then = (resolve: any, reject: any) => Promise.resolve(
      params.includes("requested-key") ? (sameKey ? [existing] : [])
        : ["QUEUED", "GENERATING"].some(state => params.includes(state))
          ? stored.filter(row => params.includes(row.status)).slice(0, 1) : stored.slice(0, 1),
    ).then(resolve, reject);
    return chain;
  };
  const tx = { select: query, update: () => ({ set: (values: unknown) => ({ where: async () => { writes.push({ id: existing.id, values }); } }) }),
    insert: () => ({ values: async (values: unknown) => { writes.push({ values }); } }) };
  const frozen = { binding: { checksum: "a".repeat(64) }, manifest: {}, answers: {} };
  const submission = { status: "SUCCEEDED", snapshot: frozen, result: { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true,
    score: null, classification: null, components: [], version: "v1", checksum: "a".repeat(64), resultReference: "result",
    calculatedAt: "2026-10-17T00:00:00.000Z", clinicalUsePermitted: true } };
  const submissionQuery: any = {};
  for (const method of ["from", "where"]) submissionQuery[method] = () => submissionQuery;
  submissionQuery.then = (resolve: any, reject: any) => Promise.resolve([submission]).then(resolve, reject);
  const assessment = { patientId: "patient" };
  const service = new GeneratedReportService({ config: { REPORT_GENERATION_TIMEOUT_MS: 1000 },
    unseal: (value: unknown) => value, authorize: async () => assessment,
    db: { select: () => submissionQuery, transaction: async (run: any) => { claim = await run(tx); throw new Error("Reservation inspected"); } },
  } as any);
  (service as any).clinical = async () => assessment;
  (service as any).source = () => ({ submissionId: "submission", confirmedToxicityIds: [] });
  (service as any).currentFingerprint = () => "fingerprint";
  return { service, writes, existing, get claim() { return claim; } };
}

describe("report generation reservation coordination", () => {
  test("a different request key cannot bypass a queued durable attempt after the local timeout", async () => {
    const run = reservation("QUEUED");
    await expect(run.service.generate({} as any, "org", "assessment", { requestKey: "requested-key" }, {} as any))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(run.writes).toEqual([]);
  });

  test("a different request key cannot bypass an active generation lease", async () => {
    const run = reservation("GENERATING", false, 100);
    await expect(run.service.generate({} as any, "org", "assessment", { requestKey: "requested-key" }, {} as any))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(run.writes).toEqual([]);
  });

  test("the queued request resumes the same report ID instead of reserving a successor", async () => {
    const run = reservation("QUEUED", true);
    await expect(run.service.generate({} as any, "org", "assessment", { requestKey: "requested-key" }, {} as any))
      .rejects.toThrow("Reservation inspected");
    expect(run.claim.reportId).toBe("previous-report");
    expect(run.writes).toHaveLength(1);
    expect(run.writes[0]).toMatchObject({ id: "previous-report", values: { status: "GENERATING" } });
  });

  test("a newer ready report supersedes historical orphaned queued attempts", async () => {
    const run = reservation("READY", false, 60_000, true);
    await expect(run.service.generate({} as any, "org", "assessment", { requestKey: "requested-key" }, {} as any))
      .rejects.toThrow("Reservation inspected");
    expect(run.claim.reportId).not.toBe("previous-report");
    expect(run.writes).toHaveLength(1);
  });

  test("terminal attempts permit an explicitly requested fresh generation", async () => {
    for (const status of ["FAILED", "READY"]) {
      const run = reservation(status);
      await expect(run.service.generate({} as any, "org", "assessment", { requestKey: "requested-key" }, {} as any))
        .rejects.toThrow("Reservation inspected");
      expect(run.claim.reportId).not.toBe("previous-report");
      expect(run.writes).toHaveLength(1);
    }
  });
});

test("reading an old queued manual request keeps its durable scoring attempt resumable", async () => {
  const service = new GeneratedReportService({ config: { REPORT_GENERATION_TIMEOUT_MS: 1000 },
    db: { update: () => { throw new Error("Unexpected expiry of queued Scoring job"); } } } as any);
  (service as any).clinical = async () => ({});
  (service as any).latest = async () => ({ status: "QUEUED", failureCode: null, requestKey: "manual:html-review",
    updatedAt: new Date(Date.now() - 60_000), content: null });
  expect(await service.read({} as any, "org", "assessment")).toEqual({ report: null, generation: { status: "QUEUED", failureCode: null } });
});
