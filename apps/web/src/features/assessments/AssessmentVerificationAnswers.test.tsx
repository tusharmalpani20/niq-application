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
