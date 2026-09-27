import { describe, expect, test } from "bun:test";
import type { AssessmentSummary } from "@niq/application-contracts";
import { latestAssessmentDates, patientAgeLabel, sortPatientRows } from "./patient-display";

describe("patient display", () => {
  const now = new Date(2026, 8, 19);
  test("uses days and months for infants, years after birthdays", () => {
    expect(patientAgeLabel("2026-09-01", now)).toBe("18 days");
    expect(patientAgeLabel("2026-08-19", now)).toBe("1 month");
    expect(patientAgeLabel("2025-09-20", now)).toBe("11 months");
    expect(patientAgeLabel("2025-09-19", now)).toBe("1 year");
    expect(patientAgeLabel(null, now)).toBe("Age unavailable");
    expect(patientAgeLabel("2026-09-20", now)).toBe("Age unavailable");
  });
  test("finds latest assessment per patient regardless of response order", () => {
    const records = [
      { patient: { id: "a" }, createdAt: new Date("2026-09-19") },
      { patient: { id: "b" }, createdAt: new Date("2026-09-10") },
      { patient: { id: "a" }, createdAt: new Date("2026-09-01") },
    ] as AssessmentSummary[];
    const dates = latestAssessmentDates(records);
    expect(dates.get("a")?.toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(dates.get("b")?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(dates.has("c")).toBe(false);
  });
  test("sorts registration dates and assessment dates before pagination", () => {
    const rows = [
      { reference: "PAT-1", createdAt: new Date("2026-09-01"), lastAssessment: new Date("2026-09-20") },
      { reference: "PAT-2", createdAt: new Date("2026-09-10"), lastAssessment: null },
      { reference: "PAT-3", createdAt: new Date("2026-09-05"), lastAssessment: new Date("2026-09-15") },
    ];
    expect(sortPatientRows(rows, "registered-newest").map(row => row.reference)).toEqual(["PAT-2", "PAT-3", "PAT-1"]);
    expect(sortPatientRows(rows, "registered-oldest").map(row => row.reference)).toEqual(["PAT-1", "PAT-3", "PAT-2"]);
    expect(sortPatientRows(rows, "assessment-newest").map(row => row.reference)).toEqual(["PAT-1", "PAT-3", "PAT-2"]);
    expect(sortPatientRows(rows, "assessment-oldest").map(row => row.reference)).toEqual(["PAT-3", "PAT-1", "PAT-2"]);
    expect(rows.map(row => row.reference)).toEqual(["PAT-1", "PAT-2", "PAT-3"]);
  });
});
