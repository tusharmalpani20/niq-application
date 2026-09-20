import { z } from "zod";
import { cancerTypeOptions } from "./assessment-form-options";

export const ASSESSMENT_FORM_VERSION = "niq-final-overlay-v1";
export type FormAnswer = string | number | string[] | null;
export type FormAnswers = Record<string, FormAnswer>;
export type FormField = {
  id: string; label: string; kind: "text" | "number" | "date" | "select" | "multi_select" | "calculated";
  required: boolean; owner: "application" | "scoring" | "supporting" | "context"; source: string;
  options?: Array<{ id: string; label: string }>; visibleWhen?: Array<{ fieldId: string; equals: string }>;
  min?: number; exclusiveMin?: boolean; integer?: boolean; readOnly?: boolean; unit?: string;
};
export type AssessmentFormManifest = { version: string; sections: Array<{ id: string; title: string; fields: FormField[] }> };
const option = z.object({ id: z.string().min(1), label: z.string().min(1) });
export const publicAssessmentQuestionnaireSchema = z.object({
  formatVersion: z.literal(2), profile: z.literal("NIQ_FINAL_ASSESSMENT"),
  sections: z.array(z.object({ id: z.string(), title: z.string(), fields: z.array(z.object({
    id: z.string(), label: z.string(), type: z.string(), unit: z.string().optional(),
    options: z.array(option), dependencies: z.array(z.string()),
  })) })),
  supportingInputs: z.array(z.object({ id: z.string(), label: z.string(), kind: z.string(), unit: z.string().optional(), options: z.array(option).optional() })),
});
const expected: Record<string, Record<string, [string, string]>> = {
  disease_status: { tumour_type: ["multi_select", "F11:F14"], stage: ["select", "F39:F41"], relapse_status: ["select", "F47:F49"] },
  treatment: { treatment_status: ["conditional", "F50:H53"], cancer_surgical_status: ["select", "F54:H57"], current_cancer_treatment: ["multi_select", "F58:F63"], current_medications: ["multi_select", "F66:F75"], supplements_intake: ["multi_select", "F76:F81"] },
  health_history: { co_morbidities: ["multi_select", "F89:F96"], previous_surgeries: ["count", "F97:H98"], family_history_cancer: ["yes_no", "F99:H100"] },
  clinical_gut_health: { appetite_status: ["select", "F101:F103"], gastrointestinal_symptoms: ["multi_select", "F104:F112"] },
  dietary_details: { weight_loss: ["calculated", "F120:H125"], dietary_symptoms: ["multi_select", "F132:F145"], functional_capacity: ["select", "F146:F148"], stress_level: ["select", "F149:F151"], protein_intake: ["derived", "F152:H153"], fluid_intake: ["select", "F154:F156"] },
};
const when = (fieldId: string, equals: string) => ({ fieldId, equals });
const app = (id: string, label: string, kind: FormField["kind"], source: string, extra: Partial<FormField> = {}): FormField => ({ id, label, kind, source, required: false, owner: "application", ...extra });
const choices = (values: string[]) => values.map(label => ({ id: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_"), label }));

/** Merge only the supported final profile with the application overlay. Never import scoring formulas or points. */
export function buildAssessmentForm(input: unknown): AssessmentFormManifest {
  const remote = publicAssessmentQuestionnaireSchema.parse(input);
  const seen = new Set<string>();
  const sections = remote.sections.map(section => {
    const spec = expected[section.id];
    if (!spec || seen.has(section.id)) throw new Error("Unsupported questionnaire section");
    seen.add(section.id);
    const fields = section.fields.map(field => {
      if (!spec[field.id] || spec[field.id]![0] !== field.type || seen.has(field.id)) throw new Error("Unsupported questionnaire field");
      seen.add(field.id);
      if (new Set(field.options.map(o => o.id)).size !== field.options.length) throw new Error("Duplicate option identifiers");
      const calculated = field.type === "calculated" || field.type === "derived";
      if (!calculated && !field.options.length) throw new Error("Questionnaire options missing");
      return { id: field.id, label: field.label, kind: calculated ? "calculated" : field.type === "multi_select" ? "multi_select" : "select", required: false, owner: "scoring", source: spec[field.id]![1], options: field.options, readOnly: calculated, unit: field.unit } as FormField;
    });
    if (fields.length !== Object.keys(spec).length) throw new Error("Questionnaire fields missing");
    return { id: section.id, title: section.title, fields };
  });
  if (sections.length !== 5) throw new Error("Questionnaire sections missing");
  const personal = { id: "personal_details", title: "Personal details", fields: [
    app("patient_name", "Patient name", "text", "B2:C2", { owner: "context", required: true, readOnly: true }),
    app("age", "Age", "number", "B3:C3", { owner: "context", required: true, readOnly: true, min: 0 }),
    app("gender", "Gender", "text", "B4:F6", { owner: "context", required: true, readOnly: true }),
    app("contact", "Contact number", "text", "B7:C7", { required: true }),
    app("height_cm", "Height", "number", "B8:C8", { required: true, min: 0, exclusiveMin: true, unit: "cm" }),
    app("bmi", "BMI", "calculated", "B10;H2", { readOnly: true }),
  ] };
  sections.unshift(personal);
  const section = (id: string) => sections.find(s => s.id === id)!;
  const add = (id: string, ...fields: FormField[]) => section(id).fields.push(...fields);
  add("disease_status",
    app("cancer_type", "Type of cancer", "select", "F15:F38", { options: cancerTypeOptions }),
    app("cancer_type_other", "Specify cancer type", "text", "H15", { required: true, visibleWhen: [when("cancer_type", "cancer_other")] }),
    app("metastasis_site", "Metastasis site", "select", "F42:H46", { options: choices(["Brain", "Liver", "Lung", "Bone", "Others"]), visibleWhen: [when("stage", "stage_metastatic")] }),
    app("metastasis_other", "Specify metastasis site", "text", "H42", { required: true, visibleWhen: [when("stage", "stage_metastatic"), when("metastasis_site", "others")] }));
  add("treatment",
    app("surgery_date", "Surgery date", "date", "H54", { required: true, visibleWhen: [when("cancer_surgical_status", "cancer_surgical_status_done")] }),
    app("planned_surgery_date", "Planned surgery date", "date", "H54", { required: true, visibleWhen: [when("cancer_surgical_status", "cancer_surgical_status_planned")] }),
    app("treatment_cycle_number", "Cycle number", "text", "B64:F64"), app("treatment_cycle_frequency", "Cycle frequency", "text", "F65"));
  add("health_history", app("family_relationship", "Family relationship", "text", "H99", { required: true, visibleWhen: [when("family_history_cancer", "family_history_cancer_yes")] }));
  add("clinical_gut_health", app("bowel_pattern", "Bowel pattern", "select", "F113:F116", { options: choices(["Normal", "Constipation", "Diarrhoea", "Alternating"]) }), app("stool_frequency", "Stool frequency", "select", "F117:F119", { options: [{ id: "daily", label: "Daily" }, { id: "below_3_week", label: "< 3 times/week" }, { id: "above_3_week", label: "> 3 times/week" }] }));
  const support: Record<string, { section: string; kind: string; source: string; extra?: Partial<FormField> }> = {
    current_weight_kg: { section: "personal_details", kind: "number", source: "B9:C9", extra: { required: true, min: 0, exclusiveMin: true } },
    previous_weight_kg: { section: "dietary_details", kind: "number", source: "F120", extra: { min: 0, exclusiveMin: true } },
    dietary_intake: { section: "dietary_details", kind: "select", source: "F126:F131" },
    previous_surgery_count: { section: "health_history", kind: "number", source: "H97", extra: { required: true, min: 1, integer: true, visibleWhen: [when("previous_surgeries", "previous_surgeries_yes")] } },
    palliative_status: { section: "treatment", kind: "select", source: "F53", extra: { required: true, visibleWhen: [when("treatment_status", "treatment_status_palliative_care")] } },
    palliative_timing: { section: "treatment", kind: "select", source: "F53", extra: { required: true, visibleWhen: [when("treatment_status", "treatment_status_palliative_care"), when("palliative_status", "post_treatment")] } },
  };
  for (const input of remote.supportingInputs) {
    const spec = support[input.id];
    if (!spec || seen.has(input.id) || input.kind !== spec.kind) throw new Error("Unsupported supporting input");
    seen.add(input.id);
    if (input.kind === "select" && (!input.options?.length || new Set(input.options.map(o => o.id)).size !== input.options.length)) throw new Error("Supporting options missing or duplicated");
    add(spec.section, app(input.id, input.label, input.kind as FormField["kind"], spec.source, { owner: "supporting", options: input.options, unit: input.unit, ...spec.extra }));
  }
  if (remote.supportingInputs.length !== 6) throw new Error("Supporting inputs missing");
  // Conditions depend on stable IDs, so an incompatible configured option cannot silently hide required detail.
  for (const field of sections.flatMap(s => s.fields)) for (const condition of field.visibleWhen ?? []) {
    const parent = sections.flatMap(s => s.fields).find(f => f.id === condition.fieldId);
    if (!parent?.options?.some(o => o.id === condition.equals)) throw new Error("Unsupported conditional option");
  }
  return { version: ASSESSMENT_FORM_VERSION, sections };
}
