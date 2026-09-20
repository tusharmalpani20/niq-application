import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAssessmentForm, type AssessmentWorkflow } from "@niq/application-contracts";
import { assessmentQuestionnaireFixture } from "./test-fixture";
import { AssessmentReview } from "./AssessmentReview";

test("review distinguishes questionnaire coverage from required readiness", () => {
  const record = { manifest: buildAssessmentForm(assessmentQuestionnaireFixture()), reports: [], status: "DRAFT" } as unknown as AssessmentWorkflow;
  const html = renderToStaticMarkup(<AssessmentReview record={record} answers={{ patient_name: "Patient", age: 25, gender: "FEMALE", contact: "1234567890", height_cm: 165, current_weight_kg: 60 }} onSection={() => {}}/>);
  expect(html).toContain("Required answers are complete.");
  expect(html).toContain("0% answered");
  expect(html).not.toContain("No required questions");
  expect(html).toContain("Edit answers");
});
