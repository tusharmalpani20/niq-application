/** Synthetic backup acceptance helper. Never imports runtime configuration. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
// Resolve dependencies from the API package that owns them, without adding a new workspace package.
const apiRequire = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const postgres = apiRequire("postgres").default;
const { drizzle } = apiRequire("drizzle-orm/postgres-js");
const { migrate } = apiRequire("drizzle-orm/postgres-js/migrator");
const { eq } = apiRequire("drizzle-orm");
import { loadApplicationConfig } from "../../packages/config/src";
import { createEntityId } from "../../packages/domain/src";
import * as tables from "../../apps/api/src/db/schema";
import { encryptPatientBytes, encryptPatientData, patientDataKey } from "../../apps/api/src/security/patient-data";
import { PostgresApplicationService } from "../../apps/api/src/services/postgres-application";
import { AssessmentWorkflowService } from "../../apps/api/src/services/assessment-workflow";
import { GeneratedReportService } from "../../apps/api/src/services/generated-report";
import { reportSourceFingerprint } from "../../apps/api/src/services/report-source-fingerprint";
import { emptyClinicalReview } from "../../apps/api/src/services/clinical-review-state";
import type { Principal } from "../../apps/api/src/services/application";

const input = JSON.parse(await Bun.stdin.text());
const parsed = new URL(input.url);
assert.equal(parsed.hostname, "127.0.0.1");
assert.match(parsed.pathname, /^\/(fixture_app|fixture_scoring|niq_restore_test_[a-f0-9]{32})$/);
const client = postgres(input.url, { max: 4, prepare: false, onnotice: () => {} });
const db = drizzle(client);
const root = resolve(import.meta.dir, "../..");
const key = Buffer.alloc(32, 7);
const secret = "synthetic-restore-drill-secret-with-no-runtime-access";
const pdf = Buffer.from("%PDF-1.7\nSynthetic saved report\n%%EOF");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const config = loadApplicationConfig({ DATABASE_URL: input.url, SESSION_SECRET: input.session ?? secret,
  PATIENT_DATA_ENCRYPTION_KEY: input.key ?? key.toString("base64"), REPORT_UPLOAD_ROOT: input.uploads });
const service = new AssessmentWorkflowService({ db, config,
  applicationService: new PostgresApplicationService(db, config, { deliver: async () => { throw new Error("No delivery in fixture"); } }),
  fetcher: async () => { throw new Error("No network or model requests in fixture"); } });
const reports = new GeneratedReportService(service);

async function denied(operation: () => Promise<unknown>, codes: string[]) {
  try { await operation(); } catch (error) {
    assert(codes.includes((error as {code: string}).code)); return;
  }
  throw new Error("Restored access boundary allowed unauthorized download");
}

try {
  if (input.action === "migrate") {
    assert(["application", "scoring"].includes(input.kind));
    const repository = input.kind === "application" ? root : resolve(root, "../niq-scoring");
    await migrate(db, { migrationsFolder: join(repository, "apps/api/drizzle") });
    const [applied] = await client`select count(*)::int as total from drizzle.__drizzle_migrations`;
    console.log(JSON.stringify({ migrated: input.kind, migrations: applied.total }));
  } else if (input.action === "seed") {
    const org = createEntityId(), otherOrg = createEntityId(), facility = createEntityId(), hidden = createEntityId();
    const patient = createEntityId(), assessment = createEntityId(), submission = createEntityId(), report = createEntityId();
    const questionnaire = createEntityId(), uploadReport = createEntityId(), uploadFile = createEntityId();
    const actor = (organizationId: string): Principal => ({ organizationId, userId: createEntityId(), membershipId: createEntityId(),
      email: `${createEntityId()}@synthetic.invalid`, displayName: "Synthetic doctor", role: "DOCTOR", platformRole: "USER" });
    const allowed = actor(org), wrongFacility = actor(org), wrongTenant = actor(otherOrg);
    await db.insert(tables.organizations).values([org, otherOrg].map(id => ({ id, slug: id.toLowerCase(), legalName: "Synthetic only", displayName: "Synthetic only" })));
    for (const person of [allowed, wrongFacility, wrongTenant]) {
      await db.insert(tables.users).values({ id: person.userId, email: person.email, displayName: person.displayName, status: "ACTIVE" });
      await db.insert(tables.organizationMemberships).values({ id: person.membershipId!, organizationId: person.organizationId!, userId: person.userId, role: "DOCTOR" });
    }
    await db.insert(tables.facilities).values([{ id: facility, organizationId: org, name: "Allowed", code: "A" }, { id: hidden, organizationId: org, name: "Other", code: "B" }]);
    await db.insert(tables.facilityMemberships).values([{ id: createEntityId(), organizationId: org, organizationMembershipId: allowed.membershipId!, facilityId: facility },
      { id: createEntityId(), organizationId: org, organizationMembershipId: wrongFacility.membershipId!, facilityId: hidden }]);
    await db.insert(tables.patients).values({ id: patient, organizationId: org, homeFacilityId: facility, serialNumber: 1,
      encryptedExternalReference: encryptPatientData("SYNTHETIC-MRN", key), externalReferenceLookupHash: "synthetic-only",
      encryptedProfile: encryptPatientData(JSON.stringify({ name: "Synthetic patient", phone: "1234567890" }), key), encryptionKeyVersion: "v1" });
    await db.insert(tables.questionnaireDefinitions).values({ id: questionnaire, scopeKey: "GLOBAL", key: "fixture", version: "1", schema: {}, checksum: "a".repeat(64) });
    const completedAt = new Date("2026-10-01T00:00:00.000Z");
    const review = { ...emptyClinicalReview(), finalSnapshot: { submissionId: submission, scoreRevision: 0,
      score: { overall: { reviewedPoints: 21 }, risk: { status: "CONFIRMED", resultReference: "synthetic-score", classification: { id: "moderate" } } } } };
    await db.insert(tables.assessments).values({ id: assessment, organizationId: org, patientId: patient, facilityId: facility,
      questionnaireDefinitionId: questionnaire, questionnaireScopeKey: "GLOBAL", createdByMembershipId: allowed.membershipId!,
      serialNumber: 1, status: "COMPLETED", completedAt, clinicalReview: service.seal(review), workflow: service.seal({ synthetic: true }) });
    await db.insert(tables.assessmentSubmissions).values({ id: submission, organizationId: org, assessmentId: assessment,
      revision: 0, snapshot: service.seal({ synthetic: true }), idempotencyKey: "synthetic-submission", status: "SUCCEEDED" });
    const [row] = await db.update(tables.assessments).set({ currentSubmissionId: submission }).where(eq(tables.assessments.id, assessment)).returning();
    const checksum = "a".repeat(64);
    await db.insert(tables.generatedReports).values({ id: report, organizationId: org, assessmentId: assessment, patientId: patient, submissionId: submission,
      requestKey: "synthetic-saved-report", sourceFingerprint: reportSourceFingerprint(row!, review, checksum)!, status: "READY",
      content: service.seal({ issues: [], assessment: { checksum } }) });
    await db.insert(tables.generatedReportArtifacts).values({ reportId: report, organizationId: org, assessmentId: assessment, revision: 0,
      encryptedPdf: encryptPatientBytes(pdf, key), size: pdf.length, sha256: digest(pdf) });
    const scope = { organizationId: org, patientId: patient, assessmentId: assessment };
    const upload = await service.storage!.stage(scope, uploadFile, (async function* () { yield pdf; })(), { expectedMediaType: "application/pdf" });
    await service.storage!.promote(upload);
    await db.insert(tables.assessmentReports).values({ id: uploadReport, organizationId: org, assessmentId: assessment, label: "Synthetic upload", purpose: "BASELINE", datePrecision: "DAY", creatorId: allowed.membershipId! });
    await db.insert(tables.assessmentFiles).values({ id: uploadFile, organizationId: org, assessmentId: assessment, patientId: patient, reportId: uploadReport,
      uploadKey: "synthetic-upload", originalFilename: "synthetic.pdf", mediaType: "application/pdf", size: pdf.length, status: "READY",
      objectKey: upload.objectKey, sha256: digest(pdf), uploaderId: allowed.membershipId! });
    console.log(JSON.stringify({ org, otherOrg, patient, assessment, submission, report, uploadReport, uploadFile, allowed, wrongFacility, wrongTenant, key: key.toString("base64"), secret }));
  } else if (input.action === "verify") {
    const m = input.metadata;
    const [relationship] = await client`select p.id as patient,a.id as assessment,s.id as submission,r.id as report,f.report_id as artifact
      from patients p join assessments a on a.patient_id=p.id and a.organization_id=p.organization_id
      join assessment_submissions s on s.id=a.current_submission_id and s.assessment_id=a.id
      join generated_reports r on r.assessment_id=a.id and r.patient_id=p.id and r.submission_id=s.id
      join generated_report_artifacts f on f.report_id=r.id and f.assessment_id=a.id and f.organization_id=p.organization_id`;
    assert.deepEqual(relationship, { patient: m.patient, assessment: m.assessment, submission: m.submission, report: m.report, artifact: m.report });
    const authorized = await reports.downloadPdf(m.allowed, m.org, m.assessment);
    assert.deepEqual(authorized.pdf, pdf);
    assert.equal(authorized.sha256, digest(pdf));
    // A restored artifact remains protected by the normal download integrity check.
    await db.update(tables.generatedReportArtifacts).set({ sha256: "0".repeat(64) }).where(eq(tables.generatedReportArtifacts.reportId, m.report));
    try { await denied(() => reports.downloadPdf(m.allowed, m.org, m.assessment), ["CONFLICT"]); }
    finally { await db.update(tables.generatedReportArtifacts).set({ sha256: digest(pdf) }).where(eq(tables.generatedReportArtifacts.reportId, m.report)); }
    const patient = await service.applicationService.getPatient(m.allowed, m.org, m.patient) as { displayName: string };
    assert.equal(patient.displayName, "Synthetic patient");
    const uploaded = await service.reports.download(m.allowed, m.org, m.assessment, m.uploadReport, m.uploadFile);
    assert.deepEqual(Buffer.from(await new Response(uploaded.stream).arrayBuffer()), pdf);
    await denied(() => reports.downloadPdf(m.wrongTenant, m.org, m.assessment), ["FORBIDDEN"]);
    await denied(() => reports.downloadPdf(m.wrongTenant, m.otherOrg, m.assessment), ["NOT_FOUND"]);
    await denied(() => reports.downloadPdf(m.wrongFacility, m.org, m.assessment), ["NOT_FOUND"]);
    await denied(() => service.reports.download(m.wrongFacility, m.org, m.assessment, m.uploadReport, m.uploadFile), ["NOT_FOUND"]);
    assert.equal(patientDataKey(config.PATIENT_DATA_ENCRYPTION_KEY, config.SESSION_SECRET).toString("base64"), m.key);
    console.log(JSON.stringify({ verified: "patient-assessment-submission-PDF and upload, decryption, tenant/facility authorization" }));
  } else throw new Error("Unknown synthetic fixture operation");
} finally { await client.end(); }
