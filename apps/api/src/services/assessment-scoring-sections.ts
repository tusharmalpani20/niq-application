import type { AssessmentScoringCalculation, AssessmentScoringStart } from "./assessment-scoring";

export type AssessmentSectionScore = {
  sectionId: string;
  status: "scored" | "partial" | "unanswered" | "unresolved" | "not_scored";
  /** Null means no authoritative answered subtotal, not zero points. */
  points: number | null;
  answered: number;
  unanswered: number;
  unresolved: number;
};

/** Use only a response validated against its pinned questionnaire by the HTTP adapter.
 * Optional unanswered components do not imply remote work is still processing.
 */
export function summarizeAssessmentSectionScores(
  questionnaire: AssessmentScoringStart["questionnaire"],
  calculation: AssessmentScoringCalculation,
  applicationSectionIds: readonly string[] = questionnaire.sections.map(section => section.id),
): AssessmentSectionScore[] {
  return applicationSectionIds.map(sectionId => {
    const section = questionnaire.sections.find(item => item.id === sectionId);
    if (!section) return { sectionId, status: "not_scored", points: null, answered: 0, unanswered: 0, unresolved: 0 };
    const components = calculation.result.components.filter(component => component.sectionId === sectionId);
    if (components.length !== section.fields.length || new Set(components.map(c => c.id)).size !== section.fields.length || components.some(c => !section.fields.some(f => f.id === c.id)))
      throw new Error("Section score components do not match the pinned questionnaire");
    const answered = components.filter(c => c.status === "answered").length;
    const unanswered = components.filter(c => c.status === "unanswered").length;
    const unresolved = components.filter(c => c.status === "pending").length;
    const points = answered > 0 ? components.reduce((sum, c) => sum + (c.points ?? 0), 0) : null;
    return { sectionId, status: answered === components.length ? "scored" : answered > 0 ? "partial" : unresolved > 0 ? "unresolved" : "unanswered", points, answered, unanswered, unresolved };
  });
}
