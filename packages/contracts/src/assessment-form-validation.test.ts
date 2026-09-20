import { describe, expect, test } from "bun:test";
import type { AssessmentFormManifest } from "./assessment-form";
import { getAssessmentCompletion, validateAssessmentAnswers, getScoringAssessmentAnswers, calculateAssessmentBmi } from "./assessment-form-validation";
const manifest: AssessmentFormManifest = { version: "test", sections: [{ id: "one", title: "One", fields: [
  { id: "age", label: "Age", kind: "number", required: true, min: 0, owner: "context", source: "C3" },
  { id: "choice", label: "Choice", kind: "multi_select", required: true, options: [{ id: "yes", label: "Yes" }], owner: "scoring", source: "F11" },
  { id: "parent", label: "Parent", kind: "select", options: [{ id: "yes", label: "Yes" }], required: false, owner: "scoring", source: "F99" },
  { id: "detail", label: "Detail", kind: "text", required: true, owner: "application", source: "H99", visibleWhen: [{ fieldId: "parent", equals: "yes" }] },
] }, { id: "optional", title: "Optional", fields: [] }] };
describe("assessment completion", () => {
  test("missing, explicit zero, explicit empty selection and conditional denominator", () => {
    expect(getAssessmentCompletion(manifest, {}).percent).toBe(0);
    expect(getAssessmentCompletion(manifest, { age: 0, choice: [] }).percent).toBe(100);
    const changed = getAssessmentCompletion(manifest, { age: 0, choice: [], parent: "yes" });
    expect(changed.percent).toBe(66);
    expect(changed.sections[1]!.percent).toBeNull();
    expect(changed.sections[0]!.missingFieldIds).toEqual(["detail"]);
  });
  test("invalid answers do not count, zero denominator and duplicate IDs fail closed", () => {
    expect(getAssessmentCompletion(manifest, { age: Infinity, choice: ["unknown"] }).percent).toBe(0);
    expect(getAssessmentCompletion({ version: "x", sections: [] }, {}).configurationError).toBe(true);
    expect(getAssessmentCompletion({ ...manifest, sections: [...manifest.sections, manifest.sections[0]!] }, {}).configurationError).toBe(true);
  });
  test("drafts accept omissions, reject bad types, submission requires active fields", () => {
    expect(validateAssessmentAnswers(manifest, {})).toEqual({});
    expect(validateAssessmentAnswers(manifest, { choice: ["yes", "yes"] }).choice).toBeDefined();
    expect(validateAssessmentAnswers(manifest, {}, { requireComplete: true }).age).toBe("Required");
    expect(getScoringAssessmentAnswers(manifest, { age: 0, choice: [], detail: "hidden" })).toEqual({ choice: [] });
  });
  test("BMI is arithmetic only and rejects invalid measurements", () => {
    expect(calculateAssessmentBmi(200, 80)).toBe(20);
    expect(calculateAssessmentBmi(0, 80)).toBeNull();
  });
});
