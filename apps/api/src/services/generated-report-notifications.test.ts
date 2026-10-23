import { expect, test } from "bun:test";
import { generatedReportArtifacts, organizations } from "../db/schema";
import { workspaceEvents } from "../db/notification-schema";
import { GeneratedReportService, reportBrandingFingerprint } from "./generated-report";

test("approving a saved PDF publishes its assessment change inside the approval transaction", async () => {
  const brand = { displayName: "Clinic", logoObjectKey: null, primaryColor: "#123456", secondaryColor: "#654321" };
  const artifact = { revision: 2, sha256: "a".repeat(64), brandingFingerprint: reportBrandingFingerprint(brand) };
  const content = { issues: [], assessment: { checksum: "checksum", submissionId: "submission", scoreRevision: 1 } };
  const row = { id: "report", revision: 2, content, sourceFingerprint: "fingerprint" };
  const changed: unknown[] = [], calls: string[] = [];
  let insideTransaction = false;
  const tx: any = {
    select: () => {
      let table: unknown;
      const query: any = { from: (value: unknown) => { table = value; return query; }, where: () => query,
        for: () => query, then: (resolve: (value: unknown) => unknown) => resolve(table === organizations ? [brand] : table === generatedReportArtifacts ? [artifact] : []) };
      return query;
    },
    update: () => ({ set: () => ({ where: () => ({ returning: async () => { calls.push("approved"); return [{ ...row, status: "APPROVED" }]; } }) }) }),
    insert: (table: unknown) => ({ values: (value: unknown) => {
      expect(insideTransaction).toBe(true);
      if (table === workspaceEvents) { changed.push(value); calls.push("event"); }
      return { onConflictDoUpdate: () => ({ returning: async () => [{ sequence: 1 }] }) };
    } }),
    execute: async () => { calls.push("notify"); },
  };
  const service = new GeneratedReportService({ db: { transaction: async (run: (tx: unknown) => Promise<unknown>) => {
    insideTransaction = true;
    try { return await run(tx); } finally { insideTransaction = false; calls.push("commit"); }
  } }, unseal: (value: unknown) => value, authorize: async () => ({}), audit: async () => {} } as any);
  (service as any).editable = async () => ({ assessment: {}, row });
  (service as any).currentFingerprint = () => "fingerprint";
  (service as any).dto = async (value: unknown) => value;
  await service.approve({ role: "DOCTOR", membershipId: "doctor" } as any, "org", "assessment", 2, artifact.sha256, {} as any);
  expect(changed).toEqual([{ organizationId: "org", sequence: 1, scope: "assessment", assessmentId: "assessment" }]);
  expect(calls).toEqual(["approved", "event", "notify", "commit"]);
});
