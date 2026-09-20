import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentFields, assessmentNumericInput } from "./AssessmentFields";
import type { FormAnswers, FormField } from "@niq/application-contracts";
const field: FormField = { id: "choices", label: "Symptoms", kind: "multi_select", owner: "scoring", required: false, source: "F104", options: [{ id: "nausea", label: "Nausea" }] };
function render(fields: FormField[], answers: FormAnswers = {}) {
  return renderToStaticMarkup(<AssessmentFields section={{ id: "test", title: "Test", fields }} answers={answers} onChange={() => {}} errors={{}} readOnly={false} />);
}
test("multi-selection uses selected chips without adding a generic None", () => {
  expect(render([field])).not.toContain(">None<");
  expect(render([field], { choices: [] })).toContain("No selections");
  expect(render([field], { choices: ["nausea"] })).toContain('aria-label="Remove Nausea"');
  expect(render([field])).not.toContain("Optional");
});
test("workbook None is shown only for supported empty selections", () => {
  expect(render([{ ...field, id: "co_morbidities" }], { co_morbidities: [] })).toContain(">None<");
});
test("short choices are radios and long choices use the shared combobox", () => {
  expect(render([{ ...field, kind: "select" }])).toContain('role="radiogroup"');
  expect(render([{ ...field, kind: "select", options: Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: `Choice ${i}` })) }])).toContain('role="combobox"');
});
test("inactive fields are hidden and calculated protein does not invent classifications", () => {
  expect(render([{ ...field, visibleWhen: [{ fieldId: "parent", equals: "yes" }] }])).not.toContain("Symptoms");
  expect(render([{ ...field, id: "protein_intake", kind: "calculated" }])).toContain("Calculated when scored");
});
test("number entry preserves invalid intermediate input and zero", () => {
  expect(assessmentNumericInput("")).toBeNull();
  expect(assessmentNumericInput("0")).toBe(0);
  expect(assessmentNumericInput("-")).toBe("-");
  expect(assessmentNumericInput("72.")).toBe("72.");
  expect(assessmentNumericInput("1e")).toBe("1e");
  expect(assessmentNumericInput("72.5")).toBe(72.5);
});
