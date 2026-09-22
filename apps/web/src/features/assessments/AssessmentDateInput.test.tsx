import { expect, test } from "bun:test";
import { displayAssessmentDate, storeAssessmentDate } from "./AssessmentDateInput";

test("day-first dates round trip to ISO without swapping day and month", () => {
  expect(displayAssessmentDate("2026-09-05")).toBe("05/09/2026");
  expect(storeAssessmentDate("05/09/2026")).toBe("2026-09-05");
  expect(storeAssessmentDate("29/02/2028")).toBe("2028-02-29");
});
test("clearing and partial edits are retained without inventing a date", () => {
  expect(storeAssessmentDate("")).toBeNull();
  expect(storeAssessmentDate("05/09/20")).toBe("05/09/20");
  expect(displayAssessmentDate("05/09/20")).toBe("05/09/20");
  expect(storeAssessmentDate("31/02/2026")).toBe("2026-02-31"); // Calendar validity remains the shared validator's responsibility.
});
