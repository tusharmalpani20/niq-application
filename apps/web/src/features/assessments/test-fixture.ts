// Synthetic projection for tests only. Never use as a production questionnaire fallback.
export function assessmentQuestionnaireFixture() {
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
