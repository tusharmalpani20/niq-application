import type { AssessmentFormManifest, FormAnswers } from "./assessment-form";
import { assessmentFieldError, isAssessmentFieldApplicable } from "./assessment-form-validation";

export type AssessmentAnswerCoverage = {
  answered: number;
  total: number;
  percent: number | null;
  sections: Array<{ id: string; title: string; answered: number; total: number; percent: number | null }>;
};

/** Describes questionnaire coverage, independently of the required-field submission gate. */
export function getAssessmentAnswerCoverage(manifest: AssessmentFormManifest, answers: FormAnswers): AssessmentAnswerCoverage {
  const percentage = (answered: number, total: number) => total ? Math.floor(answered / total * 100) : null;
  const sections = manifest.sections.map(section => {
    const applicable = section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers));
    const answered = applicable.filter(field => {
      const value = answers[field.id];
      // An explicit empty multi-selection means None; an untouched optional field does not count.
      const explicit = value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
      return explicit && assessmentFieldError(field, value) === null;
    }).length;
    return { id: section.id, title: section.title, answered, total: applicable.length, percent: percentage(answered, applicable.length) };
  });
  const answered = sections.reduce((sum, section) => sum + section.answered, 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  return { answered, total, percent: percentage(answered, total), sections };
}
