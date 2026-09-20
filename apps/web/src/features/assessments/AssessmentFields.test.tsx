import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentFields, assessmentNumericInput } from "./AssessmentFields";
import type { FormAnswers, FormField } from "@niq/application-contracts";
const field: FormField = { id: "choices", label: "Symptoms", kind: "multi_select", owner: "scoring", required: false, source: "F104", options: [{ id: "nausea", label: "Nausea" }] };
function render(fields: FormField[], answers: FormAnswers = {}) {
  return renderToStaticMarkup(<AssessmentFields section={{ id: "test", title: "Test", fields }} answers={answers} onChange={() => {}} errors={{}} readOnly={false} />);
}
test("untouched multi-selection differs from explicit none", () => {
  expect(render([field])).not.toContain('checked=""');
  expect(render([field], { choices: [] })).toContain('checked=""');
  expect(render([field], { choices: [] })).toContain("Clear answer");
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
