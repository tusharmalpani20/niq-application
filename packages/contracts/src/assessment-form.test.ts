import { expect, test } from "bun:test";
import { buildAssessmentForm } from "./assessment-form";
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
  expect(fields.find(f => f.id === "cancer_type")!.options).toHaveLength(24);
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
