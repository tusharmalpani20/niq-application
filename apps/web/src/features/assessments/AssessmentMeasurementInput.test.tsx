import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentMeasurementInput, AssessmentMeasurementUnitControl } from "./AssessmentMeasurementInput";
import { feetInchesAnswer, heightAsFeetInches, heightFromFeetInches, kgToPounds, metricUnits, poundsToKg, readMeasurementUnits, rememberMeasurementUnits } from "./measurement-units";

test("imperial measurements convert to canonical cm and kg without display drift", () => {
  expect(heightFromFeetInches(5, 9)).toBe(175.26);
  expect(heightAsFeetInches(175.26)).toEqual({ feet: 5, inches: 9 });
  expect(poundsToKg(150)).toBe(68.039);
  expect(kgToPounds(68.039)).toBe(150);
  expect(kgToPounds(poundsToKg(110))).toBe(110);
  expect(heightAsFeetInches(heightFromFeetInches(6, 2.75))).toEqual({ feet: 6, inches: 2.75 });
  expect(kgToPounds(poundsToKg(150.05))).toBe(150.05);
  expect(feetInchesAnswer("5", "9")).toBe(175.26);
  expect(feetInchesAnswer("5", "12")).toBe("5 ft 12 in");
  expect(feetInchesAnswer("", "")).toBeNull();
});

test("display unit choice is remembered per user and assessment in this browser", () => {
  const dom = new JSDOM("<!doctype html>", { url: "http://localhost/" });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  try {
    expect(readMeasurementUnits("org", "doctor", "assessment")).toEqual(metricUnits);
    rememberMeasurementUnits("org", "doctor", "assessment", { height: "ft-in", weight: "lb" });
    expect(readMeasurementUnits("org", "doctor", "assessment")).toEqual({ height: "ft-in", weight: "lb" });
    expect(readMeasurementUnits("org", "another-user", "assessment")).toEqual(metricUnits);
    expect(readMeasurementUnits("org", "doctor", "another-assessment")).toEqual(metricUnits);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else delete (globalThis as { window?: Window }).window;
    dom.window.close();
  }
});

test("height and weight controls expose both unit systems", () => {
  const height = renderToStaticMarkup(<AssessmentMeasurementInput id="height" label="Height" kind="height" value={175.26} unit="ft-in" onChange={() => {}} disabled={false} invalid={false} required />);
  const weight = renderToStaticMarkup(<AssessmentMeasurementInput id="weight" label="Current weight" kind="weight" value={68.039} unit="lb" onChange={() => {}} disabled={false} invalid={false} required />);
  const units = renderToStaticMarkup(<AssessmentMeasurementUnitControl label="Current weight" kind="weight" unit="lb" onUnitChange={() => {}} disabled={false} />);
  expect(height).toContain('aria-label="Height feet"');
  expect(height).toContain('value="9"');
  expect(weight).toContain('value="150"');
  expect(units).toContain('aria-label="Current weight unit"');
});

test("quick values are shown only for an empty editable measurement", () => {
  const render = (value: number | null, disabled = false) => renderToStaticMarkup(<AssessmentMeasurementInput id="height" label="Height" kind="height" value={value} unit="cm" showQuickValues onChange={() => {}} disabled={disabled} invalid={false} required />);
  expect(render(null)).toContain("160 cm");
  expect(render(170)).not.toContain("160 cm");
  expect(render(null, true)).not.toContain("160 cm");
  const imperial = renderToStaticMarkup(<AssessmentMeasurementInput id="height" label="Height" kind="height" value={null} unit="ft-in" showQuickValues onChange={() => {}} disabled={false} invalid={false} required />);
  expect(imperial).toContain("5 ft 6 in");
});
