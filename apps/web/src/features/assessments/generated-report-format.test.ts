import { expect, test } from "bun:test";
import type { GeneratedReport } from "@niq/application-contracts";
import { cleanWeights, productBenefits, weightChange } from "./generated-report-format";

const report = { weightHistory: [] } as unknown as GeneratedReport;

test("uses an undated previously reported weight only when dated history has one point", () => {
  const onePrevious = { ...report, weightHistory: [
    { date: "2026-10-12", kg: 68.4 },
    { date: null, kg: 85, label: "Previous weight (date not recorded)" },
  ] };
  expect(cleanWeights(onePrevious)).toEqual([
    { date: null, kg: 85, label: "Weight 1 Month Ago" },
    { date: "2026-10-12", kg: 68.4, label: undefined },
  ]);
  expect(weightChange(onePrevious)?.basis).toBe("previously reported weight");
  expect(weightChange(onePrevious)?.percentage).toBeCloseTo(-19.529, 2);

  const actualHistory = { ...onePrevious, weightHistory: [...onePrevious.weightHistory, { date: "2026-08-12", kg: 74 }] };
  expect(cleanWeights(actualHistory).map(item => item.date)).toEqual(["2026-08-12", "2026-10-12"]);
  expect(weightChange(actualHistory)?.basis).toBe("previous recorded weight");
});

test("does not create a trend from a single or invalid measurement", () => {
  expect(weightChange({ ...report, weightHistory: [{ date: "2026-10-12", kg: 68.4 }] })).toBeNull();
  expect(cleanWeights({ ...report, weightHistory: [{ date: null, kg: 0 }, { date: "invalid", kg: 85 }] })).toEqual([]);
});


test("weight change compares the latest two recordings and retains separate assessments on one date", () => {
  const history = { ...report, weightHistory: [
    { assessmentId: "first", date: "2026-10-01", kg: 80 },
    { assessmentId: "previous", date: "2026-10-12", kg: 62 },
    { assessmentId: "current", date: "2026-10-12", kg: 63 },
  ] };
  expect(cleanWeights(history)).toHaveLength(3);
  expect(weightChange(history)?.percentage).toBeCloseTo(100 / 62, 5);
  expect(weightChange(history)?.first.assessmentId).toBe("previous");
});

test("product benefits come from Product Master rather than a plan's obsolete reason", () => {
  const withProducts = { ...report, productCatalog: [{ id: "invigour", name: "Es Invigour", aliases: ["Invigour"],
    description: "Catalog description", benefits: ["Supports intake", "Supports muscle maintenance"] }],
    productPlans: [{ id: "plan", duration: "30 days", items: [{ productName: "Invigour", rationale: "Obsolete reason" }] }] };
  expect(productBenefits(withProducts, "Invigour")).toEqual(["Supports intake", "Supports muscle maintenance"]);
  expect(productBenefits({ ...withProducts, productCatalog: [] }, "Invigour")).toEqual([]);
});
