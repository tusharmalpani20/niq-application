import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentWeightComparison } from "./AssessmentWeightComparison";
function render(previous: number | null, current: number | null) {
  return renderToStaticMarkup(<AssessmentWeightComparison answers={{ previous_weight_kg: previous, current_weight_kg: current }}><input aria-label="Previous weight" /></AssessmentWeightComparison>);
}
test("weight comparison explains gain, loss and unchanged measurements", () => {
  expect(render(66, 70)).toContain("4 kg gain (6.1%)");
  expect(render(70, 66)).toContain("4 kg loss (5.7%)");
  expect(render(66, 66)).toContain("No change · 0 kg (0%)");
});
test("missing or invalid measurements are not presented as zero change", () => {
  expect(render(null, 70)).toContain("Enter previous weight to compare");
  expect(render(66, null)).toContain("Enter current weight in Personal details");
  expect(render(0, 70)).not.toContain("gain (");
});
