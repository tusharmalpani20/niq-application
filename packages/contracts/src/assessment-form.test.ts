import { expect, test } from "bun:test";
import { isAssessmentFieldApplicable, getEffectiveAssessmentAnswers, validateAssessmentAnswers } from "./assessment-form-validation";
import { buildAssessmentForm, upgradeDraftAssessmentForm } from "./assessment-form";
function fixture() {
  const field = (id: string, type: string) => ({ id, type, label: id, options: type === "calculated" || type === "derived" ? [] : [{ id: `${id}_yes`, label: "Yes" }], dependencies: [] as string[] });
  const q = { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", sections: [
    { id: "disease_status", title: "Disease", fields: [field("tumour_type", "multi_select"), field("stage", "select"), field("relapse_status", "select")] },
    { id: "treatment", title: "Treatment", fields: [field("treatment_status", "conditional"), field("cancer_surgical_status", "select"), field("current_cancer_treatment", "multi_select"), field("current_medications", "multi_select"), field("supplements_intake", "multi_select")] },
    { id: "health_history", title: "History", fields: [field("co_morbidities", "multi_select"), field("previous_surgeries", "count"), field("family_history_cancer", "yes_no")] },
    { id: "clinical_gut_health", title: "Gut", fields: [field("appetite_status", "select"), field("gastrointestinal_symptoms", "multi_select")] },
    { id: "dietary_details", title: "Dietary", fields: [field("weight_loss", "calculated"), field("dietary_symptoms", "multi_select"), field("functional_capacity", "select"), field("stress_level", "select"), field("protein_intake", "derived"), field("fluid_intake", "select")] },
  ], supportingInputs: ["palliative_status", "palliative_timing", "previous_surgery_count", "previous_weight_kg", "current_weight_kg", "dietary_intake"].map(id => ({ id, label: id, kind: id.includes("weight") || id.endsWith("count") ? "number" : "select", options: [{ id: "post_treatment", label: "Post treatment" }] })) };
  const all = q.sections.flatMap(s => s.fields);
  all.find(f => f.id === "stage")!.options = [{ id: "stage_metastatic", label: "Metastatic" }];
  all.find(f => f.id === "treatment_status")!.options = [{ id: "treatment_status_palliative_care", label: "Palliative" }];
  all.find(f => f.id === "cancer_surgical_status")!.options = ["done", "planned"].map(id => ({ id: `cancer_surgical_status_${id}`, label: id }));
  all.find(f => f.id === "treatment_status")!.dependencies = ["palliative_status", "palliative_timing"];
  all.find(f => f.id === "previous_surgeries")!.dependencies = ["previous_surgery_count"];
  all.find(f => f.id === "weight_loss")!.dependencies = ["previous_weight_kg", "current_weight_kg"];
  all.find(f => f.id === "protein_intake")!.dependencies = ["dietary_intake"];
  return q;
}
test("overlay preserves remote labels and IDs, counts current weight only once, and supplies exact cancer list", () => {
  const form = buildAssessmentForm(fixture());
  const fields = form.sections.flatMap(s => s.fields);
  expect(form.sections).toHaveLength(6);
  expect(form.sections[0]!.fields.map(f => f.id)).toEqual(["patient_name", "age", "gender", "contact", "height_cm", "current_weight_kg", "bmi"]);
  expect(form.sections[1]!.fields.map(f => f.id)).toEqual(["tumour_type", "cancer_type", "cancer_type_other", "stage", "metastasis_site", "metastasis_other", "relapse_status"]);
  expect(fields.filter(f => f.id === "current_weight_kg")).toHaveLength(1);
  const cancerOptions = fields.find(f => f.id === "cancer_type")!.options!;
  expect(cancerOptions).toHaveLength(37);
  expect(cancerOptions.find(option => option.id === "cancer_15")?.label).toBe("Kidney/Renal Cancer");
  expect(cancerOptions.filter(option => option.label === "Kidney/Renal Cancer")).toHaveLength(1);
  expect(cancerOptions.map(option => option.label)).toEqual(expect.arrayContaining([
    "Chronic Myeloid Leukemia (CML)", "Triple Negative Breast Cancer", "HER2-Positive Breast Cancer",
    "ER-Positive Breast Cancer", "Biliary Cancer", "Acute Lymphoblastic Leukemia (ALL)",
    "Small Cell Lung Cancer", "Gastrointestinal Stromal Tumour (GIST)", "Mesothelioma",
    "Non-Small Cell Lung Cancer", "Sarcoma", "Kaposi Sarcoma", "B-Cell Lymphomas",
  ]));
  expect(fields.find(f => f.id === "contact")).toMatchObject({ required: true, owner: "context", readOnly: true });
  expect(fields.find(f => f.id === "tumour_type")!.required).toBe(false);
  expect(fields.some(f => f.id === "haemoglobin")).toBe(false);
});
test("unknown versions, missing fields, conditional option changes and wrong dependencies fail closed", () => {
  expect(() => buildAssessmentForm({ ...fixture(), formatVersion: 1 })).toThrow();
  const missing = fixture(); missing.sections[0]!.fields.pop();
  expect(() => buildAssessmentForm(missing)).toThrow();
  const changed = fixture(); changed.sections[0]!.fields[1]!.options = [{ id: "new_option", label: "Other" }];
  expect(() => buildAssessmentForm(changed)).toThrow();
  const deps = fixture(); deps.sections[4]!.fields[0]!.dependencies = ["unknown"];
  expect(() => buildAssessmentForm(deps)).toThrow();
});

test("the revised 18-question payload omits dietary stress and adds app-owned diet preference", () => {
  const revised = fixture();
  revised.sections.find(section => section.id === "dietary_details")!.fields = revised.sections.find(section => section.id === "dietary_details")!.fields.filter(field => field.id !== "stress_level");
  const form = buildAssessmentForm(revised);
  const dietary = form.sections.find(section => section.id === "dietary_details")!.fields;
  expect(dietary.some(field => field.id === "stress_level")).toBe(false);
  expect(dietary.find(field => field.id === "diet_preference")).toMatchObject({ owner: "application", kind: "select", required: false });
  expect(dietary.find(field => field.id === "diet_preference")?.options?.map(option => option.label)).toEqual(["Vegetarian", "Non-Vegetarian", "Eggetarian", "Jain"]);
});

test("published drug class configuration becomes an optional, versioned app field", () => {
  const questionnaire = {
    ...fixture(),
    drugClassConfig: {
      classes: [{ id: "platinum_agents", label: "Platinum agents" }],
      suggestions: [{ cancerTypeId: "cancer_2", treatmentTypeId: "current_cancer_treatment_yes", classId: "platinum_agents" }],
    },
  };
  const form = buildAssessmentForm(questionnaire);
  const drugClasses = form.sections.find(section => section.id === "treatment")!.fields.find(field => field.id === "drug_classes");
  expect(drugClasses).toMatchObject({ owner: "application", kind: "multi_select", required: false, options: questionnaire.drugClassConfig.classes });
  expect(form.drugClassSuggestions).toEqual(questionnaire.drugClassConfig.suggestions);
  expect(() => buildAssessmentForm({ ...questionnaire, drugClassConfig: { ...questionnaire.drugClassConfig, suggestions: [{ ...questionnaire.drugClassConfig.suggestions[0]!, classId: "unknown" }] } })).toThrow("Invalid drug class configuration");
});

test("every workbook conditional detail is required only while its parent path is active", () => {
  const form = buildAssessmentForm(fixture());
  const fields = form.sections.flatMap(section => section.fields);
  const cases = [
    ["cancer_type_other", { cancer_type: "cancer_other" }, "Other cancer"],
    ["metastasis_site", { stage: "stage_metastatic" }, "brain"],
    ["metastasis_other", { stage: "stage_metastatic", metastasis_site: "others" }, "Other site"],
    ["surgery_date", { cancer_surgical_status: "cancer_surgical_status_done" }, "2026-01-01"],
    ["planned_surgery_date", { cancer_surgical_status: "cancer_surgical_status_planned" }, "2026-10-01"],
    ["previous_surgery_count", { previous_surgeries: "previous_surgeries_yes" }, 1],
    ["family_relationship", { family_history_cancer: "family_history_cancer_yes" }, "Parent"],
    ["palliative_status", { treatment_status: "treatment_status_palliative_care" }, "post_treatment"],
    ["palliative_timing", { treatment_status: "treatment_status_palliative_care", palliative_status: "post_treatment" }, "post_treatment"],
  ] as const;
  for (const [id, parents, value] of cases) {
    const field = fields.find(field => field.id === id)!;
    expect(isAssessmentFieldApplicable(field, {})).toBe(false);
    expect(isAssessmentFieldApplicable(field, parents)).toBe(true);
    expect(validateAssessmentAnswers(form, parents, { requireComplete: true })[id]).toBe("Required");
    expect(validateAssessmentAnswers(form, { ...parents, [id]: value }, { requireComplete: true })[id]).toBeUndefined();
    expect(getEffectiveAssessmentAnswers(form, { [id]: value })[id]).toBeUndefined();
  }
  const timing = fields.find(field => field.id === "palliative_timing")!;
  expect(isAssessmentFieldApplicable(timing, { palliative_status: "post_treatment" })).toBe(false);
  const site = fields.find(field => field.id === "metastasis_other")!;
  expect(isAssessmentFieldApplicable(site, { metastasis_site: "others" })).toBe(false);
});

test("existing drafts gain the conditional metastasis requirement without changing the stored manifest", () => {
  const current = buildAssessmentForm(fixture());
  const legacy = {
    ...current,
    version: "niq-final-overlay-v1",
    sections: current.sections.map(section => ({
      ...section,
      fields: section.fields.map(field => field.id === "metastasis_site" ? { ...field, required: false } : field),
    })),
  };
  const upgraded = upgradeDraftAssessmentForm(legacy);
  expect(validateAssessmentAnswers(legacy, { stage: "stage_metastatic" }, { requireComplete: true }).metastasis_site).toBeUndefined();
  expect(validateAssessmentAnswers(upgraded, { stage: "stage_metastatic" }, { requireComplete: true }).metastasis_site).toBe("Required");
  expect(validateAssessmentAnswers(upgraded, { stage: "stage_metastatic" }).metastasis_site).toBeUndefined();
  expect(validateAssessmentAnswers(upgraded, { stage: null }, { requireComplete: true }).metastasis_site).toBeUndefined();
  expect(upgraded.version).toBe(current.version);
  expect(upgradeDraftAssessmentForm(upgraded)).toBe(upgraded);
  expect(legacy.sections.flatMap(section => section.fields).find(field => field.id === "metastasis_site")?.required).toBe(false);
});
