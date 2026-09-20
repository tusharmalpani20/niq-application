import { expect, test } from "bun:test";
import { formatAssessmentReference } from "./assessment-workflow";

test("assessment references pad small serials without truncating larger ones", () => {
  expect(formatAssessmentReference(1)).toBe("ASM-000001");
  expect(formatAssessmentReference(123)).toBe("ASM-000123");
  expect(formatAssessmentReference(1000000)).toBe("ASM-1000000");
  for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => formatAssessmentReference(invalid)).toThrow(RangeError);
  }
});
