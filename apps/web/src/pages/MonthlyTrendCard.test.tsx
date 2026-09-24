import { expect, test } from "bun:test";
import { CalendarDays } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { monthlyTrend } from "./monthly-trend";
import { MonthlyTrendCard } from "./MonthlyTrendCard";

test("monthly card shows a six-month trend and a matching-period change", () => {
  const trend = monthlyTrend([new Date(2026, 7, 20), new Date(2026, 8, 20), new Date(2026, 8, 21)], new Date(2026, 8, 24, 12));
  const html = renderToStaticMarkup(<MemoryRouter><MonthlyTrendCard label="Patients registered this month" to="/patients" icon={CalendarDays} trend={trend} /></MemoryRouter>);
  expect(html).toContain("Patients registered this month");
  expect(html).toContain("monthly totals for the last six months");
  expect(html).toContain("+1");
  expect(html).toContain("vs Aug 1–24");
});
