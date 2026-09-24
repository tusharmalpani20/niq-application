import { expect, test } from "bun:test";
import { reportInputSchema } from "./assessment-workflow";

const input = { revision: 0, label: "", purpose: "", datePrecision: "DAY" as const, year: null, month: null, day: null };

test("a report needs a nonblank name while other creation details can be omitted", () => {
  expect(reportInputSchema.safeParse(input).success).toBe(false);
  expect(reportInputSchema.safeParse({ ...input, label: "  " }).success).toBe(false);
  const valid = reportInputSchema.parse({ ...input, label: "  Blood test results  " });
  expect(valid.label).toBe("Blood test results");
  expect(valid.purpose).toBe("");
  expect(valid.year).toBeNull();
});
