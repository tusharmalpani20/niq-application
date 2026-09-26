import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faceScanConsentSummarySchema } from "../../../../packages/contracts/src/face-scan-consent";
import { faceScanConsents } from "../db/schema";
import { LocalReportStorage } from "../storage/local-report-storage";
import { FaceScanConsentService } from "./face-scan-consent";

const actor = { membershipId: "operator", organizationId: "organization", role: "DOCTOR", platformRole: "USER" } as any;
const base = { id: "consent", organizationId: "organization", assessmentId: "assessment", patientId: "patient", actorId: "operator", cycle: 2,
  method: "LINK", provenance: "SIMULATED", status: "REQUESTED", isCurrent: true, requestedAt: new Date(Date.now() - 2_500),
  respondedAt: null, createdAt: new Date(), updatedAt: new Date(), fileName: null, mediaType: null, size: null };

test("an elapsed demo request becomes an explicitly simulated response and stays available on reload", async () => {
  let row = { ...base };
  let writes = 0;
  const db = {
    select: () => ({ from: () => ({ where: async () => [row] }) }),
    update: () => ({ set: (change: any) => ({ where: () => ({ returning: async () => { writes++; row = { ...row, ...change }; return [row]; } }) }) }),
  };
  const workflow = { db, config: { NODE_ENV: "development" }, authorize: async () => ({ cycle: 2 }), audit: async () => {} } as any;
  const service = new FaceScanConsentService(workflow);
  const first = await service.read(actor, "organization", "assessment", { requestId: "test" });
  expect(first.current?.status).toBe("APPROVED");
  expect(first.current?.provenance).toBe("SIMULATED");
  expect(first.current?.respondedAt).toBeTruthy();
  expect(faceScanConsentSummarySchema.safeParse(first).success).toBe(true);
  expect((await service.read(actor, "organization", "assessment")).current?.id).toBe("consent");
  expect(writes).toBe(1);
});

test("a demo request never becomes approved in production", async () => {
  const db = { select: () => ({ from: () => ({ where: async () => [base] }) }) };
  const service = new FaceScanConsentService({ db, config: { NODE_ENV: "production" }, authorize: async () => ({ cycle: 2 }) } as any);
  const state = await service.read(actor, "organization", "assessment");
  expect(state.current?.status).toBe("REQUESTED");
  expect(state.demoEnabled).toBe(false);
});

test("signed consent upload persists evidence and serves the saved bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "niq-consent-test-"));
  try {
    const body = new TextEncoder().encode("%PDF-1.7\nSigned consent evidence\n%%EOF\n");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const storage = new LocalReportStorage({ root, maxFileBytes: 1024 });
    const rows: any[] = [];
    const db: any = {
      transaction: async (run: (tx: any) => Promise<unknown>) => run(db),
      select: () => ({ from: (table: unknown) => ({ where: async () => table === faceScanConsents ? rows : [] }) }),
      update: () => ({ set: (change: object) => ({ where: async () => {
        for (const row of rows) Object.assign(row, change);
        return rows;
      } }) }),
      insert: () => ({ values: async (value: object) => { rows.push({ ...value, createdAt: new Date(), updatedAt: new Date(), isCurrent: true }); } }),
    };
    const workflow = {
      db, storage, config: { NODE_ENV: "development", REPORT_MAX_FILE_BYTES: 1024 },
      clinicalActor: () => {}, authorize: async () => ({ patientId: "patient", cycle: 3, revision: 4, status: "DRAFT" }),
      editable: () => {}, audit: async () => {},
    } as any;
    const service = new FaceScanConsentService(workflow);
    const result = await service.upload(actor, "organization", "assessment", {
      revision: 4, uploadKey: "consent-upload-key-123", filename: "signed-consent.pdf", mediaType: "application/pdf",
      size: body.byteLength, sha256, body: new Blob([body]).stream(),
    }, { requestId: "upload-test" });
    expect(result.current).toMatchObject({ method: "UPLOAD", provenance: "SIGNED_UPLOAD", status: "APPROVED",
      fileName: "signed-consent.pdf", mediaType: "application/pdf", size: body.byteLength });
    expect(result.current?.respondedAt).toBeTruthy();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sha256, actorId: "operator", patientId: "patient", cycle: 3, uploadKey: "consent-upload-key-123" });
    const file = await service.download(actor, "organization", "assessment", result.current!.id);
    expect(new Uint8Array(await new Response(file.stream).arrayBuffer())).toEqual(body);
    expect(file.filename).toBe("signed-consent.pdf");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
