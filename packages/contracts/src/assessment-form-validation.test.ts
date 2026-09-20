import { saveAssessmentSchema } from "./assessment-workflow";
import { describe, expect, test } from "bun:test";
import type { AssessmentFormManifest } from "./assessment-form";
import { clearInactiveAssessmentAnswers, getAssessmentCompletion, validateAssessmentAnswers, getScoringAssessmentAnswers, getEffectiveAssessmentAnswers, calculateAssessmentBmi } from "./assessment-form-validation";
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
test("conditional details cease to block completion and scoring when their parent changes", () => {
  const answers = { age: 0, choice: [], parent: "yes", detail: "Relationship" };
  expect(getAssessmentCompletion(manifest, answers).percent).toBe(100);
  expect(getAssessmentCompletion(manifest, { ...answers, parent: null }).required).toBe(2);
  expect(getScoringAssessmentAnswers(manifest, { ...answers, parent: null })).toEqual({ choice: [] });
  expect(validateAssessmentAnswers(manifest, { ...answers, parent: "yes", detail: " " }, { requireComplete: true }).detail).toBe("Required");
});
test("date validation catches calendar rollover and accepts leap day", () => {
  const dates: AssessmentFormManifest = { version: "date-test", sections: [{ id: "dates", title: "Dates", fields: [{ id: "date", label: "Date", kind: "date", required: true, owner: "application", source: "H54" }] }] };
  expect(validateAssessmentAnswers(dates, { date: "2025-02-29" }).date).toBeDefined();
  expect(validateAssessmentAnswers(dates, { date: "2024-02-29" })).toEqual({});
  expect(validateAssessmentAnswers(dates, { date: "2026-02-31" }).date).toBeDefined();
});
test("derived values are never sent to scoring and supplied answers remain immutable", () => {
  const withDerived: AssessmentFormManifest = { ...manifest, sections: [{ ...manifest.sections[0]!, fields: [...manifest.sections[0]!.fields, { id: "protein_intake", label: "Protein", kind: "calculated", required: false, owner: "scoring", source: "F152" }] }] };
  const answers = Object.freeze({ age: 0, choice: [], protein_intake: "adequate" });
  expect(getScoringAssessmentAnswers(withDerived, answers)).toEqual({ choice: [] });
  expect(validateAssessmentAnswers(withDerived, answers).protein_intake).toBeDefined();
  expect(answers.protein_intake).toBe("adequate");
});

test("text answers share the save request limit before being counted complete", () => {
  const answers = { age: 0, choice: [], parent: "yes", detail: "x".repeat(2000) };
  expect(validateAssessmentAnswers(manifest, answers)).toEqual({});
  expect(saveAssessmentSchema.safeParse({ revision: 0, answers }).success).toBe(true);
  const tooLong = { ...answers, detail: "x".repeat(2001) };
  expect(validateAssessmentAnswers(manifest, tooLong).detail).toBeDefined();
  expect(getAssessmentCompletion(manifest, tooLong).percent).toBe(66);
  expect(saveAssessmentSchema.safeParse({ revision: 0, answers: tooLong }).success).toBe(false);
});

test("historical inactive unfinished numbers do not block effective validation", () => {
  const numericDetail: AssessmentFormManifest = { ...manifest, sections: [{ ...manifest.sections[0]!, fields: manifest.sections[0]!.fields.map(field => field.id === "detail" ? { ...field, kind: "number", min: 1, integer: true } : field) }] };
  const answers = { age: 0, choice: [], detail: "-" };
  expect(validateAssessmentAnswers(numericDetail, answers)).toEqual({});
  expect(validateAssessmentAnswers(numericDetail, answers, { requireComplete: true })).toEqual({});
  expect(getEffectiveAssessmentAnswers(numericDetail, answers).detail).toBeUndefined();
  expect(validateAssessmentAnswers(numericDetail, { ...answers, parent: "yes" }).detail).toBeDefined();
  expect(validateAssessmentAnswers(numericDetail, { ...answers, detail: "x".repeat(2001) }).detail).toBeDefined();
  expect(validateAssessmentAnswers(numericDetail, { ...answers, detail: "x".repeat(2001) }, { requireComplete: true }).detail).toBeDefined();
  expect(validateAssessmentAnswers(numericDetail, { ...answers, unknown: "data" }).unknown).toBeDefined();
});


test("clearing inactive draft answers is recursive, immutable and preserves unknown keys for validation", () => {
  const chained: AssessmentFormManifest = { ...manifest, sections: [{ ...manifest.sections[0]!, fields: [
    // Descendant intentionally precedes parent to exercise fixed-point cleanup.
    { id: "grandchild", label: "Grandchild", kind: "text", required: false, owner: "application", source: "test", visibleWhen: [{ fieldId: "detail", equals: "nested" }] },
    ...manifest.sections[0]!.fields,
  ] }] };
  const original = Object.freeze({ age: 0, choice: [], parent: null, detail: "nested", grandchild: "old", unknown: "reject me" });
  const cleared = clearInactiveAssessmentAnswers(chained, original);
  expect(cleared).toEqual({ age: 0, choice: [], parent: null, unknown: "reject me" });
  expect(original.detail).toBe("nested");
  expect(validateAssessmentAnswers(chained, cleared).unknown).toBe("Unknown field");
  expect(clearInactiveAssessmentAnswers(chained, { ...cleared, parent: "yes" }).detail).toBeUndefined();
  expect(clearInactiveAssessmentAnswers(chained, { ...original, parent: "yes" })).toEqual({ ...original, parent: "yes" });
});
