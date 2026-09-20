import type { AssessmentFormManifest, FormAnswers, FormField } from "./assessment-form";

export function isAssessmentFieldApplicable(field: FormField, answers: FormAnswers): boolean {
  return (field.visibleWhen ?? []).every(test => answers[test.fieldId] === test.equals);
}
const unanswered = (value: unknown) => value === undefined || value === null || value === "" || (typeof value === "string" && !value.trim());
export function assessmentFieldError(field: FormField, value: unknown): string | null {
  if (unanswered(value)) return field.required ? "Required" : null;
  if (field.kind === "calculated") return "Calculated values cannot be supplied";
  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a valid number";
    if (field.integer && !Number.isSafeInteger(value)) return "Enter a whole number";
    if (field.min !== undefined && (field.exclusiveMin ? value <= field.min : value < field.min)) return "Enter a valid positive value";
    return null;
  }
  if (field.kind === "multi_select") {
    if (!Array.isArray(value) || value.length > 200 || new Set(value).size !== value.length || !value.every(v => typeof v === "string" && field.options?.some(o => o.id === v))) return "Choose valid options";
    return null;
  }
  if (typeof value !== "string" || value.length > 4000) return "Enter valid text";
  if (field.kind === "select" && !field.options?.some(o => o.id === value)) return "Choose a valid option";
  if (field.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date";
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Enter a valid date";
  }
  return null;
}
export type AssessmentCompletion = {
  answered: number; required: number; percent: number | null; configurationError: boolean;
  sections: Array<{ id: string; answered: number; required: number; percent: number | null; missingFieldIds: string[] }>;
};
export function getAssessmentCompletion(manifest: AssessmentFormManifest, answers: FormAnswers): AssessmentCompletion {
  const ids = manifest.sections.flatMap(section => section.fields.map(field => field.id));
  const duplicated = new Set(ids).size !== ids.length;
  const sections = manifest.sections.map(section => {
    const required = section.fields.filter(field => field.required && field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers));
    const missingFieldIds = required.filter(field => assessmentFieldError(field, answers[field.id]) !== null).map(field => field.id);
    const answered = required.length - missingFieldIds.length;
    return { id: section.id, answered, required: required.length, percent: required.length ? Math.floor(answered / required.length * 100) : null, missingFieldIds };
  });
  const required = sections.reduce((sum, section) => sum + section.required, 0);
  const answered = sections.reduce((sum, section) => sum + section.answered, 0);
  const configurationError = duplicated || required === 0;
  return { answered, required, percent: configurationError ? null : Math.floor(answered / required * 100), configurationError, sections };
}
/** Missing draft values are accepted; known but inactive answers remain dormant for reversible editing. */
export function validateAssessmentAnswers(manifest: AssessmentFormManifest, answers: FormAnswers, options: { requireComplete?: boolean } = {}): Record<string, string> {
  const fields = manifest.sections.flatMap(section => section.fields);
  const errors: Record<string, string> = {};
  for (const id of Object.keys(answers)) {
    const field = fields.find(field => field.id === id);
    if (!field) { errors[id] = "Unknown field"; continue; }
    // Even inactive draft data must have the correct primitive type and allowed option identifiers.
    if (!unanswered(answers[id])) {
      const error = assessmentFieldError(field, answers[id]);
      if (error) errors[id] = error;
    }
  }
  if (options.requireComplete) for (const field of fields) {
    if (!isAssessmentFieldApplicable(field, answers) || field.kind === "calculated") { delete errors[field.id]; continue; }
    const error = assessmentFieldError(field, answers[field.id]);
    if (error) errors[field.id] = error;
  }
  if (getAssessmentCompletion(manifest, answers).configurationError) errors._form = "Questionnaire configuration is invalid";
  return errors;
}
export function getEffectiveAssessmentAnswers(manifest: AssessmentFormManifest, answers: FormAnswers): FormAnswers {
  return Object.fromEntries(manifest.sections.flatMap(section => section.fields).filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers) && !unanswered(answers[field.id])).map(field => [field.id, answers[field.id]! ]));
}
export function getScoringAssessmentAnswers(manifest: AssessmentFormManifest, answers: FormAnswers): FormAnswers {
  const effective = getEffectiveAssessmentAnswers(manifest, answers);
  return Object.fromEntries(manifest.sections.flatMap(section => section.fields).filter(field => (field.owner === "scoring" || field.owner === "supporting") && effective[field.id] !== undefined).map(field => [field.id, effective[field.id]!]));
}
export function calculateAssessmentBmi(heightCm: number, weightKg: number): number | null {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0) return null;
  const result = weightKg / ((heightCm / 100) ** 2);
  return Number.isFinite(result) ? result : null;
}
export function calculateAssessmentWeightChange(previousKg: number, currentKg: number): number | null {
  if (!Number.isFinite(previousKg) || !Number.isFinite(currentKg) || previousKg <= 0 || currentKg <= 0) return null;
  const result = (previousKg - currentKg) / previousKg * 100;
  return Number.isFinite(result) ? result : null;
}
