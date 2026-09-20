import { expect, test } from "bun:test";
import type { AssessmentScoringCalculation, AssessmentScoringStart } from "./assessment-scoring";
import { summarizeAssessmentSectionScores } from "./assessment-scoring-sections";

// The helper consumes validated responses; these fixtures isolate only its inputs.
const questionnaire = { sections: [{ id: "diet", fields: [{ id: "a" }, { id: "b" }] }] } as AssessmentScoringStart["questionnaire"];
function calculation(status: "answered" | "unanswered" | "pending", secondStatus: "answered" | "unanswered" | "pending") {
  return { result: { components: [status, secondStatus].map((s, i) => ({ id: i === 0 ? "a" : "b", sectionId: "diet", status: s, points: s === "answered" ? 0 : null })) } } as AssessmentScoringCalculation;
}
test("section scores preserve zero, partial, unanswered, unresolved and no-scoring states", () => {
  expect(summarizeAssessmentSectionScores(questionnaire, calculation("answered", "answered"))[0]).toMatchObject({ status: "scored", points: 0 });
  expect(summarizeAssessmentSectionScores(questionnaire, calculation("answered", "unanswered"))[0]).toMatchObject({ status: "partial", points: 0, unanswered: 1 });
  expect(summarizeAssessmentSectionScores(questionnaire, calculation("unanswered", "unanswered"))[0]).toMatchObject({ status: "unanswered", points: null });
  expect(summarizeAssessmentSectionScores(questionnaire, calculation("pending", "unanswered"))[0]).toMatchObject({ status: "unresolved", points: null, unresolved: 1 });
  expect(summarizeAssessmentSectionScores(questionnaire, calculation("answered", "answered"), ["reports"])[0]).toMatchObject({ status: "not_scored", points: null });
});
test("missing scoring components are never labelled not scored", () => {
  const incomplete = calculation("answered", "answered");
  incomplete.result.components.pop();
  expect(() => summarizeAssessmentSectionScores(questionnaire, incomplete)).toThrow("do not match");
});
