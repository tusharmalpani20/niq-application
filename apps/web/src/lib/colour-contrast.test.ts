import { expect, test } from "bun:test";
import { contrastingForeground } from "./colour-contrast";

test("brand button text stays readable on light, dark and saturated colours", () => {
  expect(contrastingForeground("#ffffff")).toBe("#000000");
  expect(contrastingForeground("#ffff00")).toBe("#000000");
  expect(contrastingForeground("#000000")).toBe("#ffffff");
  expect(contrastingForeground("#6C17D3")).toBe("#ffffff");
  expect(contrastingForeground("invalid")).toBe("#ffffff");
});
