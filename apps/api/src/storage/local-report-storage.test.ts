import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm, readdir, symlink, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { LocalReportStorage } from "./local-report-storage";
const scope = { organizationId: "org-1", patientId: "patient-1", assessmentId: "assessment-1" };
let root: string;
let storage: LocalReportStorage;
const pdf = new TextEncoder().encode("%PDF-1.7\nexample");
async function* bytes(data = pdf) { yield data.subarray(0, 2); yield data.subarray(2); }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "niq-reports-")); storage = new LocalReportStorage({ root, maxFileBytes: 100 }); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
test("stages hashed bounded bytes then atomically publishes and opens", async () => {
  const staged = await storage.stage(scope, "file-1", bytes());
  expect(staged.size).toBe(pdf.length);
  expect(staged.sha256).toBe(createHash("sha256").update(pdf).digest("hex"));
  await expect(storage.open(scope, staged.objectKey)).rejects.toThrow();
  await storage.promote(staged);
  const result = await storage.open(scope, staged.objectKey);
  expect(await new Response(result.stream).text()).toBe(new TextDecoder().decode(pdf));
  await storage.remove(scope, staged.objectKey);
  await storage.remove(scope, staged.objectKey);
});
test("does not overwrite a previously published file", async () => {
  const first = await storage.stage(scope, "same", bytes()); await storage.promote(first);
  const second = await storage.stage(scope, "same", bytes());
  await expect(storage.promote(second)).rejects.toThrow(); await storage.discard(second);
  expect((await storage.open(scope, first.objectKey)).size).toBe(pdf.length);
});
test("cleans staging on oversize, interrupted stream, invalid signature, type mismatch, cancellation", async () => {
  const cases = [
    () => storage.stage(scope, "large", bytes(new Uint8Array(101))),
    () => storage.stage(scope, "broken", (async function* () { yield pdf; throw new Error("interrupted"); })()),
    () => storage.stage(scope, "html", bytes(new TextEncoder().encode("<html>not a PDF</html>"))),
    () => storage.stage(scope, "wrong", bytes(), { expectedMediaType: "image/png" }),
    () => storage.stage(scope, "cancel", bytes(), { signal: AbortSignal.abort() }),
  ];
  for (const run of cases) { await expect(run()).rejects.toThrow(); }
  expect(await readdir(join(root, "org-1/patient-1/assessment-1/.staging"))).toEqual([]);
});
test("validates all scope and key segments, including cross-patient reads/removals", async () => {
  await expect(storage.stage({ ...scope, patientId: "../other" }, "file", bytes())).rejects.toThrow();
  await expect(storage.stage(scope, "../../escape", bytes())).rejects.toThrow();
  await expect(storage.open(scope, "org-1/patient-2/assessment-1/file.pdf")).rejects.toThrow();
  await expect(storage.remove(scope, "org-1/patient-1/assessment-1/../file.pdf")).rejects.toThrow();
});
test("rejects directory and final-file symlinks", async () => {
  const outside = join(root, "outside"); await mkdir(outside);
  await symlink(outside, join(root, "org-1"));
  await expect(storage.stage(scope, "file", bytes())).rejects.toThrow();
  await rm(join(root, "org-1"));
  const staged = await storage.stage(scope, "file", bytes());
  await writeFile(join(outside, "secret"), pdf);
  await symlink(join(outside, "secret"), join(root, staged.objectKey));
  await expect(storage.open(scope, staged.objectKey)).rejects.toThrow();
  await expect(storage.remove(scope, staged.objectKey)).rejects.toThrow();
});
test("cleanup respects reference/lease guard, age and limit and fails closed on DB failure", async () => {
  const ready = await storage.stage(scope, "ready", bytes()); await storage.promote(ready);
  const active = await storage.stage(scope, "active", bytes());
  const orphan = await storage.stage(scope, "orphan", bytes()); await storage.promote(orphan);
  const protectedKeys = new Set([ready.objectKey, active.stagingKey]);
  const removed = await storage.cleanup(scope, { olderThan: new Date(Date.now() + 1000), limit: 10, isProtected: async key => protectedKeys.has(key) });
  expect(removed).toEqual([orphan.objectKey]);
  await expect(storage.cleanup(scope, { olderThan: new Date(Date.now() + 1000), limit: 10, isProtected: async () => { throw new Error("DB unavailable"); } })).rejects.toThrow();
  expect((await storage.open(scope, ready.objectKey)).size).toBe(pdf.length);
});
test("recognizes PNG and JPEG signatures", async () => {
  const png = await storage.stage(scope, "png", bytes(new Uint8Array([137,80,78,71,13,10,26,10])));
  const jpg = await storage.stage(scope, "jpg", bytes(new Uint8Array([255,216,255,224])));
  expect(png.mediaType).toBe("image/png"); expect(jpg.extension).toBe("jpg");
});
test("cancels a stalled upload without waiting for the source", async () => {
  const controller = new AbortController();
  const stalled = { [Symbol.asyncIterator]() { return { next: () => new Promise<IteratorResult<Uint8Array>>(() => {}) }; } };
  const pending = storage.stage(scope, "stalled", stalled, { signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await expect(pending).rejects.toThrow();
  expect(await readdir(join(root, "org-1/patient-1/assessment-1/.staging"))).toEqual([]);
});
