import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentWeightComparison } from "./AssessmentWeightComparison";
function render(previous: number | null, current: number | null) {
  return renderToStaticMarkup(<AssessmentWeightComparison answers={{ previous_weight_kg: previous, current_weight_kg: current }}><input aria-label="Previous weight" /></AssessmentWeightComparison>);
}
test("weight comparison explains gain, loss and unchanged measurements", () => {
  expect(render(66, 70)).toContain("4 kg gain");
  expect(render(66, 70)).toContain("6.1% increase from earlier weight");
  expect(render(70, 66)).toContain("4 kg loss");
  expect(render(70, 66)).toContain("5.7% decrease from earlier weight");
  expect(render(66, 66)).toContain("No change");
  expect(render(66, 66)).toContain("0 kg (0%)");
});
test("missing or invalid measurements are not presented as zero change", () => {
  expect(render(null, 70)).toContain("Enter weight from 1–2 months ago to see the change.");
  expect(render(66, null)).toContain("Enter current weight in Personal details to see the change.");
  expect(render(0, 70)).not.toContain("kg gain");
});
test("weight comparison follows the selected display unit", () => {
  const html = renderToStaticMarkup(<AssessmentWeightComparison answers={{ previous_weight_kg: 66, current_weight_kg: 70 }} unit="lb"><input aria-label="Previous weight" /></AssessmentWeightComparison>);
  expect(html).toContain("Current weight (lb)");
  expect(html).toContain("154.32 lb");
  expect(html).toContain("8.82 lb gain");
  expect(html).toContain("6.1% increase from earlier weight");
});
