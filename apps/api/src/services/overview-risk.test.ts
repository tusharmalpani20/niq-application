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
  expect(countOverviewRisk(rows, value => value as any, new Date("2026-09-30"))).toEqual({
    highRiskPatients: 1,
    assessedPatients: 3,
    highRiskPatients30DaysAgo: 0,
    categories: { low: 1, moderate: 1, high: 1 },
    categories30DaysAgo: { low: 0, moderate: 0, high: 0 },
    highRiskAssessments: [{ patientId: "two", assessmentId: "03" }],
    nutrition: { protein: { assessed: 0, inadequate: 0 }, eatingBarrier: { assessed: 0, top: null } },
  });
});

test("uses each accessible patient's latest completed assessment at the 30-day cutoff", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const rows = [
    row("01", "improved", "2026-08-30T12:00:00.000Z", "CONFIRMED", { id: "high", label: "High Risk" }),
    row("02", "improved", "2026-08-31T12:00:00.000Z", "CONFIRMED", { id: "low", label: "Low Risk" }),
    row("03", "improved", "2026-09-15T12:00:00.000Z", "CONFIRMED", { id: "moderate", label: "Moderate Risk" }),
    row("04", "worsened", "2026-08-31T12:00:00.000Z", "CONFIRMED", { id: "low", label: "Low Risk" }),
    row("05", "worsened", "2026-09-15T12:00:00.000Z", "CONFIRMED", { id: "high", label: "High Risk" }),
    row("06", "new", "2026-09-01T12:00:00.001Z", "CONFIRMED", { id: "high", label: "High Risk" }),
    row("07", "missing", "2026-08-31T12:00:00.000Z", "UNAVAILABLE", null),
    row("08", "missing", "2026-09-15T12:00:00.000Z", "CONFIRMED", { id: "high", label: "High Risk" }),
    row("09", "tie", "2026-08-31T12:00:00.000Z", "CONFIRMED", { id: "low", label: "Low Risk" }),
    row("10", "tie", "2026-08-31T12:00:00.000Z", "CONFIRMED", { id: "high_risk", label: "High Risk" }),
  ];
  expect(countOverviewRisk(rows, value => value as any, now)).toEqual({
    highRiskPatients: 4,
    assessedPatients: 5,
    highRiskPatients30DaysAgo: 1,
    categories: { low: 0, moderate: 1, high: 4 },
    categories30DaysAgo: { low: 2, moderate: 0, high: 1 },
    highRiskAssessments: [{ patientId: "worsened", assessmentId: "05" }, { patientId: "new", assessmentId: "06" }, { patientId: "missing", assessmentId: "08" }, { patientId: "tie", assessmentId: "10" }],
    nutrition: { protein: { assessed: 0, inadequate: 0 }, eatingBarrier: { assessed: 0, top: null } },
  });
});

test("counts protein and reported eating barriers once per patient's latest final assessment", () => {
  const options = [
    { id: "dietary_symptoms_no_problem", label: "No problem while eating" },
    { id: "dietary_symptoms_no_appetite", label: "No appetite" },
    { id: "dietary_symptoms_nausea", label: "Nausea" },
  ];
  const withNutrition = (assessment: ReturnType<typeof row>, proteinAdequacy: "adequate" | "inadequate" | null, symptoms: string[] | null) => ({
    ...assessment,
    submissionResult: { derived: { proteinAdequacy } },
    submissionSnapshot: { answers: { dietary_symptoms: symptoms }, manifest: { sections: [{ fields: [{ id: "dietary_symptoms", options }] }] } },
  });
  const rows = [
    withNutrition(row("01", "one", "2026-09-01", "ORIGINAL", { id: "high", label: "High Risk" }), "inadequate", ["dietary_symptoms_nausea"]),
    withNutrition(row("02", "one", "2026-09-05", "CONFIRMED", { id: "moderate", label: "Moderate Risk" }), "adequate", ["dietary_symptoms_no_appetite", "dietary_symptoms_no_appetite", "dietary_symptoms_nausea"]),
    withNutrition(row("03", "two", "2026-09-06", "ORIGINAL", { id: "high", label: "High Risk" }), "inadequate", ["dietary_symptoms_no_problem", "dietary_symptoms_no_appetite"]),
    withNutrition(row("04", "three", "2026-09-07", "ORIGINAL", { id: "low", label: "Low Risk" }), "inadequate", ["dietary_symptoms_nausea"]),
    withNutrition(row("05", "four", "2026-09-08", "UNAVAILABLE", null), "inadequate", ["dietary_symptoms_no_appetite"]),
  ];
  expect(countOverviewRisk(rows, value => value as any, new Date("2026-09-30")).nutrition).toEqual({
    protein: { assessed: 3, inadequate: 2 },
    eatingBarrier: { assessed: 2, top: { id: "dietary_symptoms_no_appetite", label: "No appetite", count: 2 } },
  });
});
