import { expect, test } from "bun:test";
import { countOverviewRisk } from "./overview-risk";

const row = (id: string, patientId: string, date: string, status: string, classification: { id: string; label: string } | null) => ({
  id, patientId, completedAt: new Date(date), clinicalReview: { finalSnapshot: { score: { risk: { status, classification } } } },
});

test("counts one confirmed high risk category per patient from the latest completed assessment", () => {
  const rows = [
    row("01", "one", "2026-09-01", "ORIGINAL", { id: "high", label: "High Risk" }),
    row("02", "one", "2026-09-02", "CONFIRMED", { id: "low", label: "Low Risk" }),
    row("03", "two", "2026-09-03", "ORIGINAL", { id: "high_risk", label: "High Risk" }),
    row("04", "three", "2026-09-04", "ORIGINAL", { id: "high", label: "High Risk" }),
    row("05", "three", "2026-09-05", "UNAVAILABLE", null),
    row("06", "four", "2026-09-06", "ORIGINAL", null),
    row("07", "five", "2026-09-07", "CONFIRMED", { id: "moderate", label: "Moderate Risk" }),
  ];
  expect(countOverviewRisk(rows, value => value as any)).toEqual({ highRiskPatients: 1, assessedPatients: 3 });
});
