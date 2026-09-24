import { expect, test } from "bun:test";
import { monthlyTrend } from "./monthly-trend";

test("counts six local calendar months and compares matching partial months", () => {
  const now = new Date(2026, 8, 24, 12);
  const trend = monthlyTrend([
    new Date(2026, 2, 31, 12),
    new Date(2026, 3, 2, 12),
    new Date(2026, 7, 24, 11),
    new Date(2026, 7, 24, 13),
    new Date(2026, 8, 24, 11),
    new Date(2026, 8, 24, 13),
  ], now);
  expect(trend.months.map(item => item.count)).toEqual([1, 0, 0, 0, 2, 1]);
  expect(trend.previous?.count).toBe(1);
  expect(trend.previous?.through).toEqual(new Date(2026, 7, 24, 12));
});

test("omits a comparison when the previous month is too short", () => {
  expect(monthlyTrend([], new Date(2026, 2, 31, 12)).previous).toBeNull();
});

test("compares across a year boundary", () => {
  const trend = monthlyTrend([new Date(2025, 11, 5, 9)], new Date(2026, 0, 5, 12));
  expect(trend.previous).toEqual({ count: 1, through: new Date(2025, 11, 5, 12) });
});
