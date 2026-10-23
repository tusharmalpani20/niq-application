import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { encryptPatientData, patientDataKey } from "../security/patient-data";
import { emptyClinicalReview } from "./clinical-review-state";
import { loadReportPdfAvailability } from "./report-pdf-availability";
import { reportSourceFingerprint } from "./report-source-fingerprint";

describe.skipIf(!process.env.ASSESSMENT_TEST_DATABASE_URL)("saved report PDF availability", () => {
  const client = postgres(process.env.ASSESSMENT_TEST_DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(client), key = patientDataKey(undefined, "availability-test-secret-32-characters");
  const seal = (value: unknown) => ({ encrypted: encryptPatientData(JSON.stringify(value), key).toString("base64") });
  const completedAt = new Date("2026-10-23T00:00:00Z");
  const review = { ...emptyClinicalReview(), finalSnapshot: { submissionId: "submission", scoreRevision: 1,
    score: { overall: { reviewedPoints: 24 }, risk: { status: "CONFIRMED", resultReference: "result", classification: { id: "moderate" } } } } };
  const fingerprint = reportSourceFingerprint({ status: "COMPLETED", currentSubmissionId: "submission", completedAt }, review, "checksum")!;
  beforeAll(async () => {
    await client`create temporary table assessments (id text, organization_id text, status text, current_submission_id text, completed_at timestamptz, clinical_review jsonb)`;
    await client`create temporary table generated_reports (id text, organization_id text, assessment_id text, status text, revision int, content jsonb, source_fingerprint text, created_at timestamptz default now())`;
    await client`create temporary table generated_report_artifacts (report_id text, organization_id text, assessment_id text, revision int, size int, encrypted_pdf bytea)`;
    for (const id of ["ready", "approved", "pending", "failed", "stale", "missing", "revision", "changed", "issues", "later-retry", "older-only", "cross-org", "empty", "unreadable", "no-content"]) {
      await client`insert into assessments values (${id}, 'org', 'COMPLETED', 'submission', ${completedAt.toISOString()}, ${JSON.stringify(seal(review))}::jsonb)`;
      const status = id === "pending" ? "GENERATING" : id === "failed" ? "FAILED" : id === "stale" ? "STALE" : id === "approved" ? "APPROVED" : "READY";
      await client`insert into generated_reports (id, organization_id, assessment_id, status, revision, content, source_fingerprint) values (${id}, 'org', ${id}, ${status}, 2, ${JSON.stringify(seal({ assessment: { checksum: "checksum" }, issues: id === "issues" ? ["Clinical review needed"] : [] }))}::jsonb, ${fingerprint})`;
      if (id !== "missing") await client`insert into generated_report_artifacts values (${id}, ${id === "cross-org" ? "other" : "org"}, ${id}, ${id === "revision" ? 1 : 2}, 100, ${Buffer.from("saved encrypted bytes")})`;
    }
    await client`update generated_report_artifacts set encrypted_pdf = ${Buffer.alloc(0)} where report_id = 'empty'`;
    await client`update generated_reports set content = '{"encrypted":"unreadable"}'::jsonb where id = 'unreadable'`;
    await client`update generated_reports set content = null where id = 'no-content'`;
    await client`update assessments set current_submission_id = 'changed-submission' where id = 'changed'`;
    await client`insert into generated_reports (id, organization_id, assessment_id, status, revision, created_at) values ('retry', 'org', 'later-retry', 'GENERATING', 1, now() + interval '1 second')`;
    // The latest final report wins: an older artifact cannot enable a newer final with no PDF.
    await client`insert into generated_reports (id, organization_id, assessment_id, status, revision, content, source_fingerprint, created_at) values ('new-final', 'org', 'older-only', 'READY', 1, ${JSON.stringify(seal({ assessment: { checksum: "checksum" }, issues: [] }))}::jsonb, ${fingerprint}, now() + interval '1 second')`;
  });
  afterAll(async () => { await client.end(); });
  test("enables only a current final report with a matching saved artifact", async () => {
    const ids = ["ready", "approved", "pending", "failed", "stale", "missing", "revision", "changed", "issues", "later-retry", "older-only", "cross-org", "empty", "unreadable", "no-content", "absent"];
    const actual = await loadReportPdfAvailability(db, "org", ids, key);
    expect(ids.filter(id => actual.get(id))).toEqual(["ready", "approved", "later-retry"]);
  });
  test("empty batches and other organisations fail closed", async () => {
    expect((await loadReportPdfAvailability(db, "org", [], key)).size).toBe(0);
    expect((await loadReportPdfAvailability(db, "other", ["ready"], key)).get("ready")).toBe(false);
  });
});
