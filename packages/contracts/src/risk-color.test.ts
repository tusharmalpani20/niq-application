import { expect, test } from "bun:test";
import { riskColorHex } from "./risk-color";

test("risk category colors retain configured presets and custom colors", () => {
  expect(riskColorHex("green")).toBe("#159f70");
  expect(riskColorHex("amber")).toBe("#d97706");
  expect(riskColorHex("red")).toBe("#dc3d50");
  expect(riskColorHex("#A12b3C")).toBe("#A12b3C");
  expect(riskColorHex(undefined)).toBe("#64748b");
});
