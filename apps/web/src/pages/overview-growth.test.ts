import { expect, test } from "bun:test";
import { overviewGrowth } from "./overview-growth";

test("overview growth compares current total to 30 days ago without inventing a percentage from zero", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const old = new Date("2026-08-01T12:00:00Z");
  const recent = new Date("2026-09-20T12:00:00Z");
  expect(overviewGrowth([old, recent], now)).toEqual({ total: 2, added: 1, percent: 100 });
  expect(overviewGrowth([recent], now)).toEqual({ total: 1, added: 1, percent: null });
  expect(overviewGrowth([], now)).toEqual({ total: 0, added: 0, percent: null });
});
