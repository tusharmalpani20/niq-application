import { expect, test } from "bun:test";
import { isAdultForAssessmentHeight, selectAssessmentHeight, type AssessmentHeightCandidate } from "./assessment-form-height";
test("height prefill uses stable birth-year boundary, not birthday", () => {
  expect(isAdultForAssessmentHeight(2008, 2026)).toBe(true);
  expect(isAdultForAssessmentHeight(2009, 2026)).toBe(false);
  expect(isAdultForAssessmentHeight(2009, 2027)).toBe(true);
  expect(isAdultForAssessmentHeight(null, 2026)).toBe(false);
  expect(isAdultForAssessmentHeight(2027, 2026)).toBe(false);
  expect(isAdultForAssessmentHeight(2000.5, 2026)).toBe(false);
});
test("select newest eligible past height without mutating history", () => {
  const base: AssessmentHeightCandidate = { assessmentId: "a", measurementId: "1", capturedAt: "2026-01-01T00:00:00Z", heightCm: 160, status: "SCORED" };
  const candidates = [base, { ...base, measurementId: "2", heightCm: 170 }, { ...base, capturedAt: "2026-02-01T00:00:00Z", status: "DRAFT" }, { ...base, capturedAt: "2028-01-01T00:00:00Z" }, { ...base, heightCm: Infinity }];
  const input = { birthYear: 2008, referenceYear: 2026, assessmentStartedAt: "2026-09-20T00:00:00Z", candidates };
  expect(selectAssessmentHeight(input)?.heightCm).toBe(170);
  expect(candidates[0]).toBe(base);
  expect(selectAssessmentHeight({ ...input, birthYear: 2009 })).toBeNull();
  expect(selectAssessmentHeight({ ...input, assessmentId: "a" })).toBeNull();
  expect(selectAssessmentHeight({ ...input, candidates: [] })).toBeNull();
});
