/** Explicit synthetic-only acceptance drill. stdin: {url, outputDirectory}.
 * Requires an empty, migrated fixture_app DB on loopback. Never reads runtime env.
 * Kills real Bun worker processes at durable queue, Scoring wait and PDF-save boundaries.
 * Scoring responses are frozen local data. Production orchestration and PDF rendering run unchanged.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadApplicationConfig } from "../../packages/config/src";
import { createEntityId } from "../../packages/domain/src";
import { AssessmentWorkflowService } from "../../apps/api/src/services/assessment-workflow";
import { PostgresApplicationService } from "../../apps/api/src/services/postgres-application";
import { GeneratedReportService, AUTOMATIC_REPORT_KEY_PREFIX } from "../../apps/api/src/services/generated-report";
import { reportSourceFingerprint } from "../../apps/api/src/services/report-source-fingerprint";
import * as tables from "../../apps/api/src/db/schema";
import { renderGeneratedReportPdf } from "../../apps/api/src/services/report-pdf";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const postgres = require("postgres").default;
const { drizzle } = require("drizzle-orm/postgres-js");
const { eq } = require("drizzle-orm");
const input = JSON.parse(await Bun.stdin.text());
const address = new URL(input.url);
assert.equal(address.hostname, "127.0.0.1");
assert.equal(address.pathname, "/fixture_app");
assert(Number(address.port) >= 1024 && Number(address.port) !== 5432, "An explicit nonstandard isolated database port is required");
assert(resolve(input.outputDirectory).startsWith("/tmp/niq-"));
const client = postgres(input.url, { max: 4, prepare: false, onnotice: () => {} });
const db = drizzle(client);
const checksum = "a".repeat(64), rule = "synthetic-rule";
const never = () => new Promise<never>(() => { setInterval(() => {}, 1000); });
const packet = {
  runId: "synthetic-run", status: "READY", assessmentReference: "synthetic-assessment", resultReference: "synthetic-score",
  ruleVersionId: rule, checksum, model: "synthetic-frozen-response", promptVersion: "acceptance-only", schemaVersion: 4,
  classification: { id: "moderate", label: "Moderate risk" }, issues: [],
  narrative: Object.fromEntries(["overview", "keyFindings", "actionSummary", "monitoringSummary", "overallSummary", "nutritionAdvice", "treatmentAdvice", "conditionAdvice", "effectsAdvice", "redFlagsAdvice", "foodSafetyAdvice"].map(field =>
    [field, { text: field === "overview" ? "Synthetic nutritional assessment for process recovery verification." : "", evidenceIds: ["fact:niq_risk"] }])),
  guidance: { nutritionInterventions: [], toxicityInterventions: [], possibleToxicities: [], classGuidance: [],
    carePlan: { nutritionalStatus: "well_nourished", statusModifiers: [], treatmentGuidance: [], coMorbidities: [], products: { status: "none", plans: [], notes: [] } } },
};
function makeService(metadata: any, pause = "") {
  const config = loadApplicationConfig({ DATABASE_URL: input.url, SESSION_SECRET: metadata.secret,
    PATIENT_DATA_ENCRYPTION_KEY: metadata.key, REPORT_UPLOAD_ROOT: join(input.outputDirectory, "uploads") });
  // Shorter elapsed lease simulation is applied by the parent only after the killed process exits.
  const service = new AssessmentWorkflowService({ db, config,
    applicationService: new PostgresApplicationService(db, config, { deliver: async () => { throw new Error("No delivery in acceptance drill"); } }),
    fetcher: async () => { throw new Error("External network access forbidden in acceptance drill"); } });
  service.transport = async () => ({ baseUrl: "http://synthetic.invalid", credential: "synthetic", requestId: "synthetic", timeoutMs: 1000,
    fetcher: async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(new URL(String(url)).hostname, "synthetic.invalid");
      if (init?.method === "POST") {
        const request = JSON.parse(String(init.body));
        await client`insert into qa_stub_jobs (id,calls) values (${request.idempotencyKey},1) on conflict(id) do update set calls=qa_stub_jobs.calls+1`;
        if (pause === "generating") {
          await writeFile(join(input.outputDirectory, "worker-phase"), "generating");
          await never();
        }
        return Response.json({ runId: packet.runId, status: "QUEUED" }, { status: 202 });
      }
      return Response.json({ runId: packet.runId, status: "READY", response: packet });
    }, identity: {} as any });
  return { service, reports: new GeneratedReportService(service) };
}
async function spawn(action: string, extra: object = {}) {
  const child = Bun.spawn([processExecutable(), import.meta.path], { stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  child.stdin.write(JSON.stringify({ ...input, action, ...extra })); child.stdin.end();
  return child;
}
const processExecutable = () => Bun.which("bun")!;
async function complete(process: Awaited<ReturnType<typeof spawn>>) {
  const [stdout, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  assert.equal(exit, 0, `${stdout}\n${stderr}`);
}
async function until(check: () => Promise<boolean>, label: string) {
  const end = Date.now() + 40_000;
  while (Date.now() < end) { if (await check()) return; await Bun.sleep(100); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function layoutFixtures(short: any) {
  await writeFile(join(input.outputDirectory, "short.pdf"), await renderGeneratedReportPdf(short, { name: "Synthetic clinic", primaryColor: "#138f94" }));
  const long = { ...short, guidance: { sections: Array.from({ length: 18 }, (_, index) => ({ id: `section-${index}`, kind: "toxicity" as const,
    title: `Synthetic guidance ${index + 1}`, drugClass: "Synthetic class", text: `Synthetic layout fixture ${index + 1}. ${"Complete nutritional advice retained for pagination verification. ".repeat(12)}`, certainty: "possible" as const })) } };
  await writeFile(join(input.outputDirectory, "long.pdf"), await renderGeneratedReportPdf(long, { name: "Synthetic clinic", primaryColor: "#138f94" }));
}
try {
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
  if (input.action === "worker") {
    const { reports } = makeService(input.metadata, input.pause);
    if (input.pause === "queued") {
      await writeFile(join(input.outputDirectory, "worker-phase"), "queued"); await never();
    }
    await reports.processDue();
  } else if (input.action === "layout") {
    const [row] = await db.select().from(tables.generatedReports).where(eq(tables.generatedReports.requestKey, `${AUTOMATIC_REPORT_KEY_PREFIX}saving`));
    assert(row?.content, "Run the synthetic restart drill first");
    const { decryptPatientData } = await import("../../apps/api/src/security/patient-data");
    const short = JSON.parse(decryptPatientData(Buffer.from((row.content as any).encrypted, "base64"), Buffer.alloc(32, 7)));
    await layoutFixtures(short);
  } else {
    const [existing] = await client`select count(*)::int as total from patients`;
    assert.equal(existing.total, 0, "Only an empty fixture DB may be seeded");
    const seeded = Bun.spawn([processExecutable(), resolve(import.meta.dir, "../backups/actual_schema_fixture.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    seeded.stdin.write(JSON.stringify({ action: "seed", url: input.url, uploads: join(input.outputDirectory, "uploads") })); seeded.stdin.end();
    const stdout = await new Response(seeded.stdout).text(), stderr = await new Response(seeded.stderr).text();
    assert.equal(await seeded.exited, 0, stderr);
    const metadata = JSON.parse(stdout), { service, reports } = makeService(metadata);
    const [assessment] = await db.select().from(tables.assessments).where(eq(tables.assessments.id, metadata.assessment));
    const review: any = service.unseal(assessment.clinicalReview);
    review.history = [{ action: "COMPLETE", actor: { membershipId: metadata.allowed.membershipId, displayName: "Synthetic doctor", role: "DOCTOR" } }];
    await db.update(tables.assessments).set({ clinicalReview: service.seal(review) }).where(eq(tables.assessments.id, metadata.assessment));
    const frozen = { binding: { checksum, ruleVersionId: rule, assessmentReference: packet.assessmentReference },
      connection: {}, manifest: { sections: [] }, answers: { current_weight_kg: 60, height_cm: 170 },
      patient: { id: metadata.patient, reference: "PAT-SYNTHETIC", displayName: "Synthetic patient", gender: "FEMALE", dateOfBirth: "1980-01-01" } };
    const result = { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score: 21,
      classification: { id: "moderate", label: "Moderate risk", interpretation: "Synthetic" },
      components: [{ id: "synthetic", sectionId: "synthetic", label: "Synthetic", points: 21, status: "answered" }],
      version: "synthetic", checksum, resultReference: packet.resultReference, calculatedAt: new Date().toISOString(), clinicalUsePermitted: true };
    await db.update(tables.assessmentSubmissions).set({ snapshot: service.seal(frozen), result: service.seal(result) }).where(eq(tables.assessmentSubmissions.id, metadata.submission));
    await client`create table qa_stub_jobs (id text primary key, calls int not null)`;
    const original = await reports.downloadPdf(metadata.allowed, metadata.org, metadata.assessment);
    const results: object[] = [];
    for (const pause of ["queued", "generating", "saving"]) {
      const report = createEntityId(), requestKey = `${AUTOMATIC_REPORT_KEY_PREFIX}${pause}`;
      await db.insert(tables.generatedReports).values({ id: report, organizationId: metadata.org, assessmentId: metadata.assessment,
        patientId: metadata.patient, submissionId: metadata.submission, requestKey, status: "QUEUED",
        sourceFingerprint: reportSourceFingerprint(assessment, review, checksum,
          { productStageChoice: null, plannedTreatmentStartDate: null, confirmedToxicityIds: [] })! });
      await writeFile(join(input.outputDirectory, "worker-phase"), "");
      if (pause === "saving") {
        await client.unsafe("create function qa_pause_pdf_save() returns trigger language plpgsql as $$ begin perform pg_sleep(60); return NEW; end $$");
        await client.unsafe("create trigger qa_pause_pdf_save after insert on generated_report_artifacts for each row execute function qa_pause_pdf_save()");
      }
      const child = await spawn("worker", { metadata, pause });
      try {
        if (pause === "saving") await until(async () => {
          const rows = await client`select 1 from pg_stat_activity where datname=current_database() and wait_event='PgSleep' and pid<>pg_backend_pid()`;
          return rows.length > 0;
        }, "PDF artifact save transaction");
        else await until(async () => (await readFile(join(input.outputDirectory, "worker-phase"), "utf8")) === pause, pause);
        child.kill("SIGKILL");
        const killedExit = await child.exited;
        assert(killedExit === 137 || child.signalCode === "SIGKILL", "The worker must actually die by SIGKILL");
      } finally {
        // A failed phase assertion must never strand a paused synthetic worker.
        if (child.exitCode === null) child.kill("SIGKILL");
        await child.exited;
      }
      // A disconnected backend can finish its sleeping statement before noticing the client died.
      // Terminate only this fixture's sleeping transaction to make rollback immediate.
      if (pause === "saving") {
        await client`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and wait_event='PgSleep' and pid<>pg_backend_pid()`;
        await client.unsafe("drop trigger qa_pause_pdf_save on generated_report_artifacts");
        await client.unsafe("drop function qa_pause_pdf_save()");
        const [partial] = await client`select count(*)::int as n from generated_report_artifacts where report_id=${report}`;
        assert.equal(partial.n, 0, "Killed PDF-save transaction must not publish a partial artifact");
      }
      const issued = await reports.downloadPdf(metadata.allowed, metadata.org, metadata.assessment);
      assert.equal(issued.sha256, original.sha256, "Previously issued PDF remains downloadable during recovery");
      // Advance only durable lease timestamps instead of making the drill wait for the production lease duration.
      await client`update generated_reports set updated_at=now()-interval '2 hours',next_attempt_at=now()-interval '2 hours' where id=${report}`;
      await complete(await spawn("worker", { metadata }));
      const [current] = await db.select().from(tables.generatedReports).where(eq(tables.generatedReports.id, report));
      assert.equal(current.status, "READY", `Restart did not finalize ${pause}: ${current.failureCode}`);
      const replay = await reports.generate(metadata.allowed, metadata.org, metadata.assessment, { requestKey }, { requestId: "synthetic-replay" }, true);
      assert.equal(replay.report.id, report);
      const download = await reports.downloadPdf(metadata.allowed, metadata.org, metadata.assessment);
      assert(Buffer.from(download.pdf).subarray(0, 5).equals(Buffer.from("%PDF-")));
      assert(download.pdf.length > 1000);
      const [count] = await client`select count(*)::int as n from generated_reports where request_key=${requestKey}`;
      const [artifacts] = await client`select count(*)::int as n from generated_report_artifacts where report_id=${report}`;
      const [artifact] = await client`select sha256 from generated_report_artifacts where report_id=${report}`;
      const [jobs] = await client`select count(*)::int as n,max(calls)::int as submissions from qa_stub_jobs where id=${report}`;
      assert.equal(count.n, 1); assert.equal(artifacts.n, 1); assert.equal(jobs.n, 1);
      assert.equal(jobs.submissions, pause === "generating" ? 2 : 1, "Completed-request replay must not contact Scoring again");
      assert.equal(artifact.sha256, download.sha256, "Download must select this recovered report's exact artifact");
      await writeFile(join(input.outputDirectory, `${pause}-recovered.pdf`), download.pdf);
      results.push({ stage: pause, actualProcessKilled: true, status: current.status, reportRows: count.n, artifactRows: artifacts.n,
        stubJobs: jobs.n, idempotentStubSubmissions: jobs.submissions, replayReportUnchanged: true, bytes: download.pdf.length });
      // Withdraw this synthetic newer final only so the next case can verify the original issued artifact independently.
      await db.update(tables.generatedReports).set({ status: "STALE" }).where(eq(tables.generatedReports.id, report));
    }
    const short = (await reports.generate(metadata.allowed, metadata.org, metadata.assessment,
      { requestKey: `${AUTOMATIC_REPORT_KEY_PREFIX}saving` }, { requestId: "synthetic-layout" }, true)).report;
    await layoutFixtures(short);
    await writeFile(join(input.outputDirectory, "results.json"), JSON.stringify({ results, providerCalls: 0, leaseExpirySimulated: true }, null, 2));
    console.log(JSON.stringify({ results, providerCalls: 0, leaseExpirySimulated: true, outputDirectory: input.outputDirectory }));
  }
} finally { await client.end(); }
