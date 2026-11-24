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
  expect(render(null, 70)).toContain("Enter weight from 1 month ago to see the change.");
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
test("six-month change uses its own baseline when one-month weight is missing", () => {
  const html = renderToStaticMarkup(
    <AssessmentWeightComparison answers={{ weight_six_months_kg: 65.5, current_weight_kg: 60 }} showSixMonthChange>
      <input aria-label="Weight 6 months ago" />
    </AssessmentWeightComparison>,
  );
  expect(html).toContain("Enter weight from 1 month ago to see the change.");
  expect(html).toContain("Change over 6 months");
  expect(html).toContain("5.5 kg loss");
  expect(html).toContain("8.4% decrease from earlier weight");
  expect(html).not.toContain("Weight trend");
  expect(render(65.5, 60)).not.toContain("Change over 6 months");
});
test("weight trend shows all three valid measurements in chronological order", () => {
  const assessmentDate = new Date(2026, 10, 15, 12).toISOString();
  const renderTrend = (sixMonthsAgo: number | null, oneMonthAgo: number | null, current: number | null) => renderToStaticMarkup(
    <AssessmentWeightComparison answers={{ weight_six_months_kg: sixMonthsAgo, previous_weight_kg: oneMonthAgo, current_weight_kg: current }} showSixMonthChange unit="lb" assessmentDate={assessmentDate}>
      <input aria-label="Weight 6 months ago" />
    </AssessmentWeightComparison>,
  );
  const html = renderTrend(75, 68, 70);
  expect(html).toContain('aria-label="Weight trend. 6 months ago: 165.35 lb, 1 month ago: 149.91 lb, Current weight (15 Nov 2026): 154.32 lb"');
  expect(html).toContain(">15 Nov 2026</text>");
  expect(html).not.toContain(">Today</text>");
  expect(renderTrend(75, 68, null)).not.toContain("Weight trend");
  expect(renderTrend(75, null, 70)).not.toContain("Weight trend");
  expect(renderTrend(0, 68, 70)).not.toContain("Weight trend");
});
