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

test("nutrition targets include complete units and do not limit a section to three highlights", async () => {
  const {readableReportEmphasis} = await import("./report-readability");
  const text = "Aim for 30–35 kcal/kg/day and 1.2–1.5 g protein/kg/day. Ensure **at least 75% of your nutrition needs** are met through your prescribed plan. **Include protein foods** at regular meals alongside suitable foods you tolerate. **Contact your care team** if intake falls, and explain any symptoms so support can be adjusted.";
  const marked = readableReportEmphasis(text);
  expect(marked).toContain("**30–35 kcal/kg/day**");
  expect(marked).toContain("**1.2–1.5 g protein/kg/day**");
  expect([...marked.matchAll(/\*\*[^*]+\*\*/g)].length).toBeGreaterThan(3);
  expect(marked.replaceAll("**", "")).toBe(text.replaceAll("**", ""));
});


test("a short targets sentence keeps both complete measurements emphasized", async () => {
  const {readableReportEmphasis} = await import("./report-readability");
  const text="Aim for 30–35 kcal/kg/day and 1.2–1.5 g protein/kg/day.";
  expect(readableReportEmphasis(text)).toBe("Aim for **30–35 kcal/kg/day** and **1.2–1.5 g protein/kg/day**.");
});
