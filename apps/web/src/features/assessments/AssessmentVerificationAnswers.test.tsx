import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormField } from "@niq/application-contracts";
import { AssessmentVerificationAnswers } from "./AssessmentVerificationAnswers";

const previousWeight: FormField = {
  id: "previous_weight_kg", label: "Weight 1–2 months ago", kind: "number", required: false,
  owner: "supporting", source: "F120", unit: "kg",
};

test("dietary verification describes the actual weight direction", () => {
  const render = (previous: number, current: number) => renderToStaticMarkup(
    <AssessmentVerificationAnswers sectionId="dietary_details" fields={[previousWeight]} answers={{ previous_weight_kg: previous, current_weight_kg: current }} />,
  );
  expect(render(90, 89)).toContain("1 kg loss (1.1%)");
  expect(render(89, 90)).toContain("1 kg gain (1.1%)");
  expect(render(90, 90)).toContain("No weight change");
});

test("dietary verification does not infer a change without both weights", () => {
  const html = renderToStaticMarkup(<AssessmentVerificationAnswers sectionId="dietary_details" fields={[previousWeight]} answers={{ current_weight_kg: 90 }} />);
  expect(html).toContain("Add both weights to see the change");
  expect(html).not.toContain("kg loss");
});

test("dietary verification distinguishes one-month and six-month changes", () => {
  const sixMonthWeight: FormField = { ...previousWeight, id: "weight_six_months_kg", label: "Weight 6 months ago", owner: "application" };
  const html = renderToStaticMarkup(
    <AssessmentVerificationAnswers sectionId="dietary_details" fields={[previousWeight, sixMonthWeight]}
      answers={{ previous_weight_kg: 59, weight_six_months_kg: 65.5, current_weight_kg: 60 }} />,
  );
  expect(html).toContain("1 kg gain (1.7%)");
  expect(html).toContain("Change over 1 month");
  expect(html).toContain("Change over 6 months");
  expect(html).toContain("5.5 kg loss (8.4%)");
});

test("dietary verification uses the assessment date and selected weight unit throughout", () => {
  const sixMonthWeight: FormField = { ...previousWeight, id: "weight_six_months_kg", label: "Weight 6 months ago", owner: "application" };
  const html = renderToStaticMarkup(
    <AssessmentVerificationAnswers sectionId="dietary_details" fields={[previousWeight, sixMonthWeight]} weightUnit="lb"
      assessmentDate={new Date(2026, 10, 15, 12).toISOString()}
      answers={{ previous_weight_kg: 60, weight_six_months_kg: 65.5, current_weight_kg: 70 }} />,
  );
  expect(html).toContain("22.05 lb gain (16.7%)");
  expect(html).toContain("9.92 lb gain (6.9%)");
  expect(html).toContain("Current weight (15 Nov 2026): 154.32 lb");
  expect(html).not.toContain(" kg");
});

test("personal details verification shows the calculated BMI card", () => {
  const fields = [
    { id: "height_cm", label: "Height", kind: "number", owner: "application", unit: "cm" },
    { id: "current_weight_kg", label: "Current weight", kind: "number", owner: "application", unit: "kg" },
    { id: "bmi", label: "BMI", kind: "calculated", owner: "application" },
  ] as FormField[];
  const html = renderToStaticMarkup(<AssessmentVerificationAnswers sectionId="personal_details" fields={fields} answers={{ age: 50, height_cm: 183, current_weight_kg: 70 }} />);
  expect(html).toContain("Body mass index");
  expect(html).toContain("20.9");
  expect(html).toContain("Healthy weight");
  expect(html).toContain('viewBox="0 0 240 122"');
  expect(html).not.toContain('id="assessment-field-bmi"');
});
