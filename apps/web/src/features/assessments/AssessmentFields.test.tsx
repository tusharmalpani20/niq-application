import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentFields, assessmentNumericInput, assessmentFieldGroups, addAssessmentMultiChoice } from "./AssessmentFields";
import { MedicationSupplementIcon } from "./MedicationSupplementIcon";
import { HealthHistoryChoiceIcon } from "./HealthHistoryChoiceIcon";
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

test("previous weight follows the current weight unit without a second unit control", () => {
  const previous: FormField = { ...field, id: "previous_weight_kg", label: "Weight 1–2 months ago", kind: "number" };
  const html = renderToStaticMarkup(<AssessmentFields section={{ id: "dietary_details", title: "Dietary details", fields: [previous] }} answers={{ previous_weight_kg: 50 }} onChange={() => {}} errors={{}} readOnly={false} measurementUnits={{ height: "cm", weight: "lb" }} />);
  expect(html).toContain("Weight 1–2 months ago (lb)");
  expect(html).toContain('value="110.23"');
  expect(html).not.toContain('aria-label="Weight 1–2 months ago unit"');
});

test("dietary intake choices have matching icon tiles", () => {
  const options = ["normal", "more_than_usual", "reduced", "liquid", "little_solid", "tube_feeding"].map(id => ({ id: `dietary_intake_${id}`, label: id }));
  const html = render([{ ...field, id: "dietary_intake", label: "Dietary intake change", kind: "select", options }]);
  for (const option of options) expect(html).toContain(`data-dietary-intake-icon="${option.id}"`);
  expect(html).toContain("bg-primary/10 text-primary/70");
});

test("short multi-selects expose checkboxes and short Other lists expose radios", () => {
  const html = render([{ ...field, options: [{ id: "solid", label: "Solid" }, { id: "in_situ", label: "In Situ" }] }], { choices: ["solid"] });
  expect(html).toContain('type="checkbox"');
  expect(html).not.toContain('role="combobox"');
  expect(html).toContain("In Situ");
  const other = render([{ ...field, id: "metastasis_site", kind: "select", options: [{ id: "brain", label: "Brain" }, { id: "others", label: "Others" }] }]);
  expect(other).toContain('role="radiogroup"');
});

test("tumour choices have distinct decorative icons without changing their labels", () => {
  const options = [
    { id: "tumour_type_solid", label: "Solid Tumour" },
    { id: "tumour_type_haematological", label: "Haematological" },
    { id: "tumour_type_metastatic_secondary", label: "Metastatic / Secondary" },
    { id: "tumour_type_in_situ", label: "In Situ" },
  ];
  const html = render([{ ...field, id: "tumour_type", label: "Type of tumour", options }]);
  for (const option of options) {
    expect(html).toContain(`data-tumour-icon="${option.id}"`);
    expect(html).toContain(option.label);
  }
  expect((html.match(/data-tumour-icon=/g) ?? []).length).toBe(4);
  expect((html.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  expect(render([{ ...field, options }])).not.toContain("data-tumour-icon");
  const selected = render([{ ...field, id: "tumour_type", label: "Type of tumour", options }], { tumour_type: ["tumour_type_solid"] });
  expect(selected).toContain("bg-primary text-primary-foreground shadow-sm");
  expect(selected).toContain("data-selected");
  expect(selected).not.toContain("lucide-check");
  expect(html).not.toContain("bg-primary text-primary-foreground shadow-sm");
});

test("disease status choices keep their labels alongside decorative icons", () => {
  const stage: FormField = { ...field, id: "stage", label: "Stage", kind: "select", options: [
    { id: "stage_localized", label: "Localized (stage 1–2)" },
    { id: "stage_locally_advanced", label: "Locally Advanced (stage 3)" },
    { id: "stage_metastatic", label: "Metastatic (Stage 4)" },
  ] };
  const site: FormField = { ...field, id: "metastasis_site", label: "Metastasis site", kind: "select", visibleWhen: [{ fieldId: "stage", equals: "stage_metastatic" }], options: [
    { id: "brain", label: "Brain" }, { id: "liver", label: "Liver" }, { id: "lung", label: "Lung" }, { id: "bone", label: "Bone" }, { id: "others", label: "Others" },
  ] };
  const relapse: FormField = { ...field, id: "relapse_status", label: "Relapse status", kind: "select", options: [
    { id: "relapse_status_first_diagnosis", label: "First Diagnosis" },
    { id: "relapse_status_relapsed", label: "Relapsed" },
    { id: "relapse_status_refractory", label: "Refractory" },
  ] };
  const initial = render([stage, site, relapse]);
  for (const option of [...stage.options!, ...relapse.options!]) {
    expect(initial).toContain(`data-disease-choice-icon="${option.id}"`);
    expect(initial).toContain(option.label);
  }
  expect(initial).not.toContain('data-disease-choice-icon="brain"');
  const metastatic = render([stage, site, relapse], { stage: "stage_metastatic", metastasis_site: "lung" });
  const sharedSiteIcons: Record<string, string> = { brain: "cancer_9", liver: "cancer_5", lung: "cancer_2", bone: "cancer_17", others: "cancer_other" };
  for (const option of site.options!) {
    expect(metastatic).toContain(`data-cancer-icon="${sharedSiteIcons[option.id]}"`);
    expect(metastatic).toContain(option.label);
  }
  expect(metastatic).toContain("bg-primary text-primary-foreground shadow-sm");
});

test("treatment choices use icon tiles, including conditional palliative choices", () => {
  const status: FormField = { ...field, id: "treatment_status", label: "Treatment status", kind: "select", options: [
    { id: "treatment_status_newly_diagnosed", label: "Newly Diagnosed" },
    { id: "treatment_status_under_treatment", label: "Under Treatment" },
    { id: "treatment_status_post_treatment", label: "Post-Treatment" },
    { id: "treatment_status_palliative_care", label: "Palliative Care" },
  ] };
  const path: FormField = { ...field, id: "palliative_status", label: "Palliative treatment path", kind: "select", visibleWhen: [{ fieldId: "treatment_status", equals: "treatment_status_palliative_care" }], options: [
    { id: "with_cancer", label: "With Cancer any stage" }, { id: "post_treatment", label: "Post treatment" },
  ] };
  const timing: FormField = { ...field, id: "palliative_timing", label: "Palliative post-treatment timing", kind: "select", visibleWhen: [{ fieldId: "treatment_status", equals: "treatment_status_palliative_care" }, { fieldId: "palliative_status", equals: "post_treatment" }], options: [
    { id: "within_6_months", label: "Within 6 months" }, { id: "within_12_months", label: "Within 12 months" }, { id: "post_12_months", label: "Post 12 months" },
  ] };
  const surgery: FormField = { ...field, id: "cancer_surgical_status", label: "Cancer surgical status", kind: "select", options: [
    { id: "cancer_surgical_status_done", label: "Surgery Done" }, { id: "cancer_surgical_status_planned", label: "Planned" },
    { id: "cancer_surgical_status_not_required", label: "Not Required" }, { id: "cancer_surgical_status_not_fit", label: "Not Fit for Surgery" },
  ] };
  const initial = render([status, path, timing, surgery]);
  for (const option of [...status.options!, ...surgery.options!]) expect(initial).toContain(`data-treatment-choice-icon="${option.id}"`);
  expect(initial).not.toContain('data-treatment-choice-icon="with_cancer"');
  const palliative = render([status, path, timing, surgery], { treatment_status: "treatment_status_palliative_care", palliative_status: "post_treatment" });
  for (const option of [...path.options!, ...timing.options!]) expect(palliative).toContain(`data-treatment-choice-icon="${option.id}"`);
  expect(palliative).toContain("bg-primary text-primary-foreground shadow-sm");
});

test("medication and supplement options have icons and selected chips retain them", () => {
  const medicationIds = ["blood_thinners", "anti_hypertensives", "anti_diabetics", "thyroid", "cholesterols", "steroids", "anti_histamines", "pain_medications", "antibiotics", "antacid"].map(id => `current_medications_${id}`);
  const supplementIds = ["protein", "iron", "calcium", "folic_acid", "multivitamins", "omega_3"].map(id => `supplements_intake_${id}`);
  for (const id of [...medicationIds, ...supplementIds, "__none__"]) {
    expect(renderToStaticMarkup(<MedicationSupplementIcon type={id} />)).toContain(`data-intake-choice-icon="${id}"`);
  }
  const medications: FormField = { ...field, id: "current_medications", options: medicationIds.map(id => ({ id, label: id })) };
  const supplements: FormField = { ...field, id: "supplements_intake", options: supplementIds.map(id => ({ id, label: id })) };
  expect(render([medications], { current_medications: [medicationIds[0]!] })).toContain(`data-intake-choice-icon="${medicationIds[0]}"`);
  expect(render([supplements], { supplements_intake: [supplementIds[0]!] })).toContain(`data-intake-choice-icon="${supplementIds[0]}"`);
  expect(render([supplements], { supplements_intake: [] })).toContain('data-intake-choice-icon="__none__"');
});

test("health history choices have icons in the long list and Yes/No tiles", () => {
  const conditions = ["diabetes", "hypertension", "thyroid_disorder", "kidney_disease", "liver_disease", "cardiac_disease", "high_cholesterol", "psychological_disorders"].map(id => `co_morbidities_${id}`);
  for (const id of [...conditions, "__none__", "previous_surgeries_yes", "previous_surgeries_no", "family_history_cancer_yes", "family_history_cancer_no"]) {
    expect(renderToStaticMarkup(<HealthHistoryChoiceIcon type={id} />)).toContain(`data-health-history-icon="${id}"`);
  }
  const coMorbidities: FormField = { ...field, id: "co_morbidities", options: conditions.map(id => ({ id, label: id })) };
  expect(render([coMorbidities], { co_morbidities: [conditions[0]!] })).toContain(`data-health-history-icon="${conditions[0]}"`);
  expect(render([coMorbidities], { co_morbidities: [] })).toContain('data-health-history-icon="__none__"');
  const surgeries: FormField = { ...field, id: "previous_surgeries", kind: "select", options: [{ id: "previous_surgeries_yes", label: "Yes" }, { id: "previous_surgeries_no", label: "No" }] };
  const family: FormField = { ...field, id: "family_history_cancer", kind: "select", options: [{ id: "family_history_cancer_yes", label: "Yes" }, { id: "family_history_cancer_no", label: "No" }] };
  const html = render([surgeries, family], { previous_surgeries: "previous_surgeries_yes" });
  for (const id of ["previous_surgeries_yes", "previous_surgeries_no", "family_history_cancer_yes", "family_history_cancer_no"]) expect(html).toContain(`data-health-history-icon="${id}"`);
  expect(html).toContain("bg-primary text-primary-foreground shadow-sm");
});


test("all editable answered field kinds offer clearing, including zero and explicit None", () => {
  for (const [kind, value] of [["multi_select", ["nausea"]], ["select", "nausea"], ["number", 0], ["text", "Details"], ["date", "2026-09-22"]] as const) {
    expect(render([{ ...field, kind, options: [{ id: "nausea", label: "Nausea" }] }], { choices: Array.isArray(value) ? [...value] : value })).toContain('aria-label="Clear Symptoms"');
  }
  expect(render([{ ...field, id: "co_morbidities" }], { co_morbidities: [] })).toContain('aria-label="Clear Symptoms"');
  for (const value of [undefined, null, ""]) expect(render([field], { choices: value })).not.toContain('aria-label="Clear Symptoms"');
  expect(render([{ ...field, kind: "number", readOnly: true }], { choices: 1 })).not.toContain('aria-label="Clear Symptoms"');
});
