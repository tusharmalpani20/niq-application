import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAssessmentForm, faceScanSessionSchema, type AssessmentWorkflow } from "@niq/application-contracts";
import { assessmentQuestionnaireFixture } from "./test-fixture";
import { AssessmentReview } from "./AssessmentReview";

test("review distinguishes questionnaire coverage from required readiness", () => {
  const record = { manifest: buildAssessmentForm(assessmentQuestionnaireFixture()), reports: [], attestations: [], status: "DRAFT" } as unknown as AssessmentWorkflow;
  const html = renderToStaticMarkup(<AssessmentReview record={record} answers={{ patient_name: "Patient", age: 25, gender: "FEMALE", contact: "1234567890", height_cm: 165, current_weight_kg: 60 }} scanStatus="Done" scanSession={null} organizationId="org" assessmentId="assessment" onSection={() => {}}/>);
  expect(html).toContain("Required answers are complete.");
  expect(html).toContain("0/6 answered");
  expect(html).not.toContain("No required questions");
  expect(html).toContain("Edit answers");
  expect(html).toMatch(/Face scan<\/span><span[^>]*>Done<\/span>/);
  expect(html).toContain("Loading saved scan results…");
  expect(html).toContain("Go to Face scan");
  expect(html).toContain("No attachments added.");
  expect(html).not.toContain("Review attachments");
  expect(html.indexOf("Face scan")).toBeGreaterThan(html.indexOf("Personal details"));
  expect(html.indexOf('>Attachments</span>')).toBeGreaterThan(html.indexOf('>Dietary details</span>'));
});

test("review includes saved face scan measurements inside its Face scan section", () => {
  const record = { manifest: buildAssessmentForm(assessmentQuestionnaireFixture()), reports: [], attestations: [], status: "DRAFT" } as unknown as AssessmentWorkflow;
  const scanSession = faceScanSessionSchema.parse({ id: "scan", state: "COMPLETED", context: { dob: "1990-01-01", gender: "female", heightCm: 165, weightKg: 60, posture: "resting", employeeId: "operator" }, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z", completedAt: "2026-09-22T00:00:00Z", failureCode: null, score: null, result: { schemaVersion: 1, providerScanId: "scan", wellnessScore: 85, healthRiskScore: 15, physiologicalScore: null, mentalWellbeingScore: null, vitals: { heartRate: 82, oxygenSaturation: 99, respiratoryRate: 16, systolic: 124, diastolic: 79 }, additionalMetrics: { sdnn: 45.78 } } });
  const html = renderToStaticMarkup(<AssessmentReview record={record} answers={{}} scanStatus="Done" scanSession={scanSession} organizationId="org" assessmentId="assessment" onSection={() => {}}/>);
  expect(html).toContain('aria-label="Face scan results"');
  expect(html).toContain("Blood pressure");
  expect(html).toContain("124/79");
  expect(html).toContain("SDNN");
  expect(html).not.toContain("Loading saved scan results…");
});

test("review shows saved report details and files inside attachments", () => {
  const record = { manifest: buildAssessmentForm(assessmentQuestionnaireFixture()), reports: [{
    id: "report-1", label: "Blood test", purpose: "Before treatment", datePrecision: "MONTH", year: 2026, month: 8, day: null,
    files: [{ id: "file-1", reportId: "report-1", originalFilename: "CBC.pdf", mediaType: "application/pdf", size: 1000, status: "READY", createdAt: "2026-08-01" }],
  }], attestations: [], revision: 1, status: "DRAFT" } as unknown as AssessmentWorkflow;
  const html = renderToStaticMarkup(<AssessmentReview record={record} answers={{}} scanStatus="Done" scanSession={null} organizationId="org" assessmentId="assessment" onSection={() => {}}/>);
  expect(html).toContain("Blood test");
  expect(html).toContain("Before treatment");
  expect(html).toContain("CBC.pdf");
  expect(html).toContain("Preview file");
  expect(html).not.toContain("Review attachments");
  expect(html).not.toContain("Add more files");
});
