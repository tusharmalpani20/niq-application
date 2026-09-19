import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CapacityCard } from "./OverviewUsage";

function render(used: number, limit: number | null) {
  return renderToStaticMarkup(<MemoryRouter><CapacityCard title="Scores" used={used} limit={limit} detail="This month" to="/settings/scoring" /></MemoryRouter>);
}
test("capacity shows limits, zero capacity and over-limit values without invalid progress", () => {
  expect(render(8, 20)).toContain("12 remaining");
  expect(render(0, 0)).toContain('width:0%');
  const exceeded = render(25, 20);
  expect(exceeded).toContain('width:100%');
  expect(exceeded).toContain("0 remaining");
  expect(exceeded).toContain('aria-valuenow="25"');
  expect(exceeded).not.toContain("NaN");
});
test("unlimited capacity shows actual usage without a fake limit or progress bar", () => {
  const markup = render(12, null);
  expect(markup).toContain("Unlimited");
  expect(markup).not.toContain('role="meter"');
  expect(markup).not.toContain("remaining");
});
