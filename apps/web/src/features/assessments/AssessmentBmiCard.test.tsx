import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentBmiCard, adultBmiCategory } from "./AssessmentBmiCard";

test("adult BMI bands use unrounded values at their boundaries", () => {
  expect(adultBmiCategory(18.49)).toBe("Underweight");
  expect(adultBmiCategory(18.5)).toBe("Healthy weight");
  expect(adultBmiCategory(24.99)).toBe("Healthy weight");
  expect(adultBmiCategory(25)).toBe("Overweight");
  expect(adultBmiCategory(30)).toBe("Obesity");
});

test("adult BMI card shows a visual reference without changing the calculated value", () => {
  const html = renderToStaticMarkup(<AssessmentBmiCard answers={{ age: 27, height_cm: 182.88, current_weight_kg: 90 }} />);
  expect(html).toContain("26.9");
  expect(html).toContain("Overweight");
  expect(html).toContain("Adult reference");
  expect(html).toContain("<svg");
});

test("missing measurements and patients under 20 receive no adult classification", () => {
  const missing = renderToStaticMarkup(<AssessmentBmiCard answers={{ age: 27, height_cm: 182.88 }} />);
  expect(missing).toContain("Enter height and current weight");
  const child = renderToStaticMarkup(<AssessmentBmiCard answers={{ age: 19, height_cm: 170, current_weight_kg: 65 }} />);
  expect(child).toContain("Adult BMI categories do not apply under age 20");
  expect(child).not.toContain("<svg");
  expect(child).not.toContain("Healthy weight");
});
