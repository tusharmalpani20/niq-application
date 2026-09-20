import { expect, test } from "bun:test";
import { getAssessmentAnswerCoverage } from "./assessment-answer-coverage";
import { getAssessmentCompletion } from "./assessment-form-validation";
import type { AssessmentFormManifest, FormField } from "./assessment-form";

const field = (id: string, extra: Partial<FormField> = {}): FormField => ({
  id, label: id, kind: "text", required: false, owner: "application", source: "test", ...extra,
});
const manifest: AssessmentFormManifest = {
  version: "test",
  sections: [
    { id: "personal", title: "Personal details", fields: [field("name", { required: true, owner: "context", readOnly: true })] },
    { id: "history", title: "History", fields: [
      field("notes"),
      field("symptoms", { kind: "multi_select", options: [{ id: "pain", label: "Pain" }] }),
      field("surgery", { kind: "select", options: [{ id: "done", label: "Done" }, { id: "no", label: "No" }] }),
      field("date", { kind: "date", required: true, visibleWhen: [{ fieldId: "surgery", equals: "done" }] }),
      field("calculation", { kind: "calculated", readOnly: true }),
    ] },
  ],
};

test("coverage includes optional questions while required completion remains a separate gate", () => {
  const answers = { name: "Patient" };
  expect(getAssessmentCompletion(manifest, answers).percent).toBe(100);
  expect(getAssessmentAnswerCoverage(manifest, answers)).toEqual({
    answered: 1, total: 4, percent: 25,
    sections: [
      { id: "personal", title: "Personal details", answered: 1, total: 1, percent: 100 },
      { id: "history", title: "History", answered: 0, total: 3, percent: 0 },
    ],
  });
});

test("only valid explicit answers count, including explicit None and numeric zero", () => {
  expect(getAssessmentAnswerCoverage(manifest, { name: "Patient", notes: "  ", symptoms: [], surgery: "wrong" }).answered).toBe(2);
  expect(getAssessmentAnswerCoverage(manifest, { name: "Patient", notes: null, symptoms: null }).answered).toBe(1);
  expect(getAssessmentAnswerCoverage(manifest, { name: "Patient", symptoms: ["invalid"] }).answered).toBe(1);
  const numeric = { version: "test", sections: [{ id: "number", title: "Number", fields: [field("age", { kind: "number", min: 0 })] }] };
  expect(getAssessmentAnswerCoverage(numeric, { age: 0 }).percent).toBe(100);
});

test("conditional questions enter and leave coverage without counting dormant answers", () => {
  const answers = { name: "Patient", notes: "Details", symptoms: [], surgery: "done", date: "2026-02-30" };
  expect(getAssessmentAnswerCoverage(manifest, answers)).toMatchObject({ answered: 4, total: 5, percent: 80 });
  expect(getAssessmentAnswerCoverage(manifest, { ...answers, date: "2026-02-28" }).percent).toBe(100);
  expect(getAssessmentAnswerCoverage(manifest, { ...answers, surgery: "no" })).toMatchObject({ answered: 4, total: 4, percent: 100 });
});

test("empty or calculated-only sections have no misleading completion percentage", () => {
  const empty = { version: "test", sections: [{ id: "derived", title: "Derived", fields: [field("bmi", { kind: "calculated" })] }] };
  expect(getAssessmentAnswerCoverage(empty, { bmi: 22 })).toEqual({
    answered: 0, total: 0, percent: null,
    sections: [{ id: "derived", title: "Derived", answered: 0, total: 0, percent: null }],
  });
});
