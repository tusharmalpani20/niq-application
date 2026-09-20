import { expect, test } from "bun:test";
import { contrastingForeground } from "./colour-contrast";

test("brand button text stays readable on light, dark and saturated colours", () => {
  expect(contrastingForeground("#ffffff")).toBe("#000000");
  expect(contrastingForeground("#ffff00")).toBe("#000000");
  expect(contrastingForeground("#000000")).toBe("#ffffff");
  expect(contrastingForeground("#6C17D3")).toBe("#ffffff");
  expect(contrastingForeground("invalid")).toBe("#ffffff");
});

import { accessibleBrandInk, colourContrastRatio } from "./colour-contrast";
test("brand ink meets normal-text contrast on light workspace surfaces without changing dark brands", () => {
  const surfaces = ["#f6f8fb", "#eef2f6", "#ffffff"];
  for (const brand of ["#0E9384", "#ffffdd", "#ffffff", "#6C17D3", "#123456", "invalid"]) {
    const ink = accessibleBrandInk(brand);
    for (const surface of surfaces) expect(colourContrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
  }
  expect(accessibleBrandInk("#123456")).toBe("#123456");
  expect(accessibleBrandInk("#ffffdd")).not.toBe("#ffffdd");
  expect(colourContrastRatio("#ffffff", "#000000")).toBe(21);
  expect(colourContrastRatio("invalid", "#000000")).toBe(0);
});

test("brand ink also contrasts with selected navigation's brand-tinted surfaces", () => {
  for (const brand of ["#0E9384", "#ffffdd", "#6C17D3", "#123456"]) {
    const ink = accessibleBrandInk(brand);
    for (const surface of ["#f6f8fb", "#eef2f6", "#ffffff"]) {
      const tinted = `#${[1, 3, 5].map(offset => Math.round(parseInt(surface.slice(offset, offset + 2), 16) * 0.9 + parseInt(brand.slice(offset, offset + 2), 16) * 0.1).toString(16).padStart(2, "0")).join("")}`;
      expect(colourContrastRatio(ink, tinted)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
