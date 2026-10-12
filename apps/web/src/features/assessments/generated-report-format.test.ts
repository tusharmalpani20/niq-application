import { expect, test } from "bun:test";
import type { GeneratedReport } from "@niq/application-contracts";
import { cleanWeights, weightChange } from "./generated-report-format";

const report = { weightHistory: [] } as unknown as GeneratedReport;

test("uses an undated previously reported weight only when dated history has one point", () => {
  const onePrevious = { ...report, weightHistory: [
    { date: "2026-10-12", kg: 68.4 },
    { date: null, kg: 85, label: "Previous weight (date not recorded)" },
  ] };
  expect(cleanWeights(onePrevious)).toEqual([
    { date: null, kg: 85, label: "Previous weight (date not recorded)" },
    { date: "2026-10-12", kg: 68.4, label: undefined },
  ]);
  expect(weightChange(onePrevious)?.basis).toBe("previously reported weight");
  expect(weightChange(onePrevious)?.percentage).toBeCloseTo(-19.529, 2);

  const actualHistory = { ...onePrevious, weightHistory: [...onePrevious.weightHistory, { date: "2026-08-12", kg: 74 }] };
  expect(cleanWeights(actualHistory).map(item => item.date)).toEqual(["2026-08-12", "2026-10-12"]);
  expect(weightChange(actualHistory)?.basis).toBe("first recorded weight");
});

test("does not create a trend from a single or invalid measurement", () => {
  expect(weightChange({ ...report, weightHistory: [{ date: "2026-10-12", kg: 68.4 }] })).toBeNull();
  expect(cleanWeights({ ...report, weightHistory: [{ date: null, kg: 0 }, { date: "invalid", kg: 85 }] })).toEqual([]);
});
