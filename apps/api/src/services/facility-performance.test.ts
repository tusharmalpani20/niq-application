import { expect, test } from "bun:test";
import { facilityTrend } from "./facility-performance";

test("buckets completions by facility timezone and compares equal elapsed periods", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const trend = facilityTrend([
    new Date("2026-08-01T12:00:00Z"),
    new Date("2026-08-24T11:59:59Z"),
    new Date("2026-08-24T12:00:00Z"),
    new Date("2026-08-24T13:00:00Z"),
    new Date("2026-08-31T19:00:00Z"), // September 1 in Kolkata.
    new Date("2026-09-24T11:00:00Z"),
    new Date("2026-09-24T13:00:00Z"), // Future completion is excluded.
  ], now, "Asia/Kolkata");
  expect(trend.months.map(item => item.count)).toEqual([0, 0, 0, 0, 4, 2]);
  expect(trend.previous).toEqual({ count: 3, through: "2026-08-24" });
});

test("omits a comparison when the prior month has no matching day", () => {
  const trend = facilityTrend([new Date("2026-03-31T10:00:00Z")], new Date("2026-03-31T12:00:00Z"), "UTC");
  expect(trend.months.at(-1)).toEqual({ month: "2026-03", count: 1 });
  expect(trend.previous).toBeNull();
});
