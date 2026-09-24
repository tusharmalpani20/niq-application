import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentFields, assessmentNumericInput, assessmentFieldGroups, addAssessmentMultiChoice } from "./AssessmentFields";
import type { FormAnswers, FormField } from "@niq/application-contracts";
const field: FormField = { id: "choices", label: "Symptoms", kind: "multi_select", owner: "scoring", required: false, source: "F104", options: [{ id: "nausea", label: "Nausea" }, ...Array.from({ length: 6 }, (_, i) => ({ id: `item${i}`, label: `Item ${i}` }))] };
function render(fields: FormField[], answers: FormAnswers = {}) {
  return renderToStaticMarkup(<AssessmentFields section={{ id: "test", title: "Test", fields }} answers={answers} onChange={() => {}} errors={{}} readOnly={false} />);
}
test("multi-selection uses selected chips without adding a generic None", () => {
  expect(render([field])).not.toContain(">None<");
  expect(render([field], { choices: [] })).toContain("No selections");
  expect(render([field], { choices: ["nausea"] })).toContain('aria-label="Remove Nausea"');
  expect(render([field])).not.toContain("Optional");
});
test("No problem while eating can be selected alongside other symptoms", () => {
  expect(addAssessmentMultiChoice(["dietary_symptoms_nausea"], "dietary_symptoms_no_problem")).toEqual(["dietary_symptoms_nausea", "dietary_symptoms_no_problem"]);
  expect(addAssessmentMultiChoice(["dietary_symptoms_no_problem"], "dietary_symptoms_nausea")).toEqual(["dietary_symptoms_no_problem", "dietary_symptoms_nausea"]);
  expect(addAssessmentMultiChoice(["nausea"], "vomiting")).toEqual(["nausea", "vomiting"]);
});
test("a saved mixed symptom answer stays editable without a local error", () => {
  const symptoms = { ...field, id: "dietary_symptoms", options: [
    { id: "dietary_symptoms_no_problem", label: "No problem while eating" },
    { id: "dietary_symptoms_nausea", label: "Nausea" },
  ] };
  expect(render([symptoms], { dietary_symptoms: ["dietary_symptoms_no_problem", "dietary_symptoms_nausea"] })).not.toContain("No problem while eating cannot be selected with other symptoms");
});
test("workbook None is shown only for supported empty selections", () => {
  expect(render([{ ...field, id: "co_morbidities" }], { co_morbidities: [] })).toContain(">None<");
});
test("short choices are radios and long choices use the shared combobox", () => {
  expect(render([{ ...field, kind: "select", options: [{ id: "yes", label: "Yes" }] }])).toContain('role="radiogroup"');
  expect(render([{ ...field, kind: "select", options: Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: `Choice ${i}` })) }])).toContain('role="combobox"');
});
test("inactive fields are hidden and calculated protein does not invent classifications", () => {
  expect(render([{ ...field, visibleWhen: [{ fieldId: "parent", equals: "yes" }] }])).not.toContain("Symptoms");
  expect(render([{ ...field, id: "protein_intake", kind: "calculated" }])).toContain("Derived from dietary intake when you submit for scoring");
});
test("number entry preserves invalid intermediate input and zero", () => {
  expect(assessmentNumericInput("")).toBeNull();
  expect(assessmentNumericInput("0")).toBe(0);
  expect(assessmentNumericInput("-")).toBe("-");
  expect(assessmentNumericInput("72.")).toBe("72.");
  expect(assessmentNumericInput("1e")).toBe("1e");
  expect(assessmentNumericInput("72.5")).toBe(72.5);
});

test("conditional details remain in the parent question group", () => {
  const parent = { ...field, id: "stage", kind: "select" as const };
  const site = { ...field, id: "site", visibleWhen: [{ fieldId: "stage", equals: "metastatic" }] };
  const detail = { ...field, id: "detail", visibleWhen: [{ fieldId: "stage", equals: "metastatic" }, { fieldId: "site", equals: "other" }] };
  expect(assessmentFieldGroups([parent, site, detail], { stage: "metastatic", site: "other" }).map(group => group.map(item => item.id))).toEqual([["stage", "site", "detail"]]);
});
test("None is removable and weight uses a bounded numeric input", () => {
  expect(render([{ ...field, id: "co_morbidities" }], { co_morbidities: [] })).toContain('aria-label="Remove None from Symptoms"');
  const html = render([{ ...field, id: "previous_weight_kg", kind: "number", min: 0, exclusiveMin: true }]);
  expect(html).toContain('type="number"');
  expect(html).toContain('min="0"');
  expect(html).toContain('step="any"');
});

test("short multi-selects expose checkboxes and short Other lists expose radios", () => {
  const html = render([{ ...field, options: [{ id: "solid", label: "Solid" }, { id: "in_situ", label: "In Situ" }] }], { choices: ["solid"] });
  expect(html).toContain('type="checkbox"');
  expect(html).not.toContain('role="combobox"');
  expect(html).toContain("In Situ");
  const other = render([{ ...field, id: "metastasis_site", kind: "select", options: [{ id: "brain", label: "Brain" }, { id: "others", label: "Others" }] }]);
  expect(other).toContain('role="radiogroup"');
});


test("all editable answered field kinds offer clearing, including zero and explicit None", () => {
  for (const [kind, value] of [["multi_select", ["nausea"]], ["select", "nausea"], ["number", 0], ["text", "Details"], ["date", "2026-09-22"]] as const) {
    expect(render([{ ...field, kind, options: [{ id: "nausea", label: "Nausea" }] }], { choices: Array.isArray(value) ? [...value] : value })).toContain('aria-label="Clear Symptoms"');
  }
  expect(render([{ ...field, id: "co_morbidities" }], { co_morbidities: [] })).toContain('aria-label="Clear Symptoms"');
  for (const value of [undefined, null, ""]) expect(render([field], { choices: value })).not.toContain('aria-label="Clear Symptoms"');
  expect(render([{ ...field, kind: "number", readOnly: true }], { choices: 1 })).not.toContain('aria-label="Clear Symptoms"');
});
