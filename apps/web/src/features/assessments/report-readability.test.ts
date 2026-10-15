import { expect, test } from "bun:test";
import { readableClosingSummary } from "./report-readability";

test("fallback closing summary uses direct wording and omits only repeated catalog benefits", () => {
  const text = "Your reviewed nutrition risk is Moderate Risk.\nYour nutritional status is Moderately nourished.\nThe main nutrition priority is Early, preventive nutrition intervention to avoid progression to severe malnutrition.\nYour selected nutrition support is Es-Invigour.\n• Supports energy and protein intake.\n• Contact your team if eating becomes difficult.\nCheck your blood pressure at home.";
  const summary = readableClosingSummary(text, ["Supports energy and protein intake."]);
  expect(summary).toContain("Your NIQ assessment indicates moderate nutritional risk.");
  expect(summary).toContain('Your nutritional status is recorded as "Moderately nourished".');
  expect(summary).toContain("Early nutrition support is recommended to help avoid progression to severe malnutrition.");
  expect(summary).not.toContain("Supports energy and protein intake.");
  expect(summary).toContain("Contact your team if eating becomes difficult.");
  expect(summary).toContain("Check your blood pressure at home.");
});

test("authored closing prose is preserved", () => {
  const authored = "Your nutrition plan supports intake and strength. Follow up with your care team.";
  expect(readableClosingSummary(authored, [])).toBe(authored);
});
