import { expect, test } from "bun:test";
import { assertHistoricalScanSource, verifyHistoricalScanResponse } from "./assessment-face-scan-reuse";
import { faceScanSessionSchema, reuseFaceScanSchema } from "../../../../packages/contracts/src/face-scan";

const source = faceScanSessionSchema.parse({
 id: "source-local", state: "COMPLETED", createdAt: "2026-10-21T10:00:00.000Z", updatedAt: "2026-10-21T10:01:00.000Z", completedAt: "2026-10-21T10:01:00.000Z", failureCode: null,
 context: { dob: "1970-01-01", gender: "female", heightCm: 170, weightKg: 60, posture: "resting", employeeId: "staff" },
 result: { schemaVersion: 1, providerScanId: "provider-original", providerCompletedAt: "2026-10-21T10:01:00.000Z", wellnessScore: 70, healthRiskScore: null, vitals: { heartRate: 70, oxygenSaturation: 98, respiratoryRate: 15, systolic: 120, diastolic: 80 }, physiologicalScore: null, mentalWellbeingScore: null },
 score: { status: "SCORED", points: 1, ruleVersionId: "old-rule" },
});
const expected = { organizationId: "org", assessmentId: "new-assessment", sourceAssessmentId: "old-assessment", sourceRemoteId: "remote-original", source, ruleVersionId: "new-rule" };
const response = () => ({ session: { ...source, id: "reuse-id", assessmentReference: expected.assessmentId, organizationReference: expected.organizationId,
 createdAt: "2026-10-23T10:00:00.000Z", updatedAt: "2026-10-23T10:00:00.000Z", score: { status: "SCORED", points: 3, ruleVersionId: expected.ruleVersionId },
 historicalSource: { sessionId: expected.sourceRemoteId, assessmentReference: expected.sourceAssessmentId, capturedAt: source.completedAt! } }, providerConfigured: true });

test("historical measurements require the same patient and an original approved completed capture", () => {
 const target = { id: "target", patientId: "same-patient" };
 const assessment = { id: "source", patientId: "same-patient", status: "COMPLETED" } as const;
 expect(() => assertHistoricalScanSource(target, assessment, source)).not.toThrow();
 expect(() => assertHistoricalScanSource(target, { ...assessment, patientId: "other-patient" }, source)).toThrow("same patient");
 expect(() => assertHistoricalScanSource(target, { ...assessment, id: target.id }, source)).toThrow("same patient");
 for (const session of [{ ...source, completedAt: null }, { ...source, result: null }, { ...source, historicalSource: { sessionId: "prior", assessmentReference: "prior", capturedAt: source.completedAt! } }])
  expect(() => assertHistoricalScanSource(target, assessment, session)).toThrow("original completed");
 expect(() => assertHistoricalScanSource(target, { ...assessment, status: "DRAFT" }, source)).toThrow("approved assessment");
});

test("reuse accepts a newly mapped score while retaining original measurements and capture date", () => {
 const remote = verifyHistoricalScanResponse(response(), expected);
 expect(remote.completedAt).toBe(source.completedAt);
 expect(remote.score?.points).toBe(3);
 expect(remote.result).toEqual(source.result);
 expect(remote.context).toEqual(source.context);
 expect(remote.createdAt).not.toBe(source.createdAt);
});

test("reuse rejects altered evidence, old rule scores, wrong source or destination", () => {
 const changes = [
  { organizationReference: "different-org" }, { assessmentReference: "different-assessment" },
  { score: source.score }, { historicalSource: undefined },
  { completedAt: "2026-10-23T10:00:00.000Z" },
  { historicalSource: { ...response().session.historicalSource, sessionId: "different-source" } },
  { historicalSource: { ...response().session.historicalSource, assessmentReference: "different-source-assessment" } },
  { historicalSource: { ...response().session.historicalSource, capturedAt: "2026-10-23T10:00:00.000Z" } },
  { context: { ...source.context, weightKg: 65 } },
  { result: { ...source.result!, wellnessScore: 90 } },
 ];
 for (const change of changes) expect(() => verifyHistoricalScanResponse({ ...response(), session: { ...response().session, ...change } }, expected)).toThrow();
});

test("reuse request cannot submit caller-provided points or measurements", () => {
 const value = { revision: 0, requestKey: "historical-reuse-test-key", sourceAssessmentId: "01M5E9AFG41RHAHWWX2NVMY2BC", sourceSessionId: "01M5E9AX5D5JD3CVHTKA6DPT32" };
 expect(reuseFaceScanSchema.safeParse(value).success).toBe(true);
 expect(reuseFaceScanSchema.safeParse({ ...value, points: 0 }).success).toBe(false);
 expect(reuseFaceScanSchema.safeParse({ ...value, completedAt: new Date().toISOString() }).success).toBe(false);
});
