import type { FormAnswer } from "@niq/application-contracts";
import { assessmentNumericInput } from "./assessmentNumericInput";

export type HeightUnit = "cm" | "ft-in";
export type WeightUnit = "kg" | "lb";
export type MeasurementUnits = { height: HeightUnit; weight: WeightUnit };

export const metricUnits: MeasurementUnits = { height: "cm", weight: "kg" };
const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;
const roundTo = (value: number, places: number) => Number(value.toFixed(places));

export function heightFromFeetInches(feet: number, inches: number): number {
  return roundTo((feet * 12 + inches) * CM_PER_INCH, 2);
}

export function feetInchesAnswer(feetText: string, inchesText: string): FormAnswer {
  if (!feetText.trim() && !inchesText.trim()) return null;
  const feet = feetText.trim() ? assessmentNumericInput(feetText) : 0;
  const inches = inchesText.trim() ? assessmentNumericInput(inchesText) : 0;
  if (typeof feet !== "number" || typeof inches !== "number" || !Number.isInteger(feet) || feet < 0 || inches < 0 || inches >= 12) return `${feetText} ft ${inchesText} in`;
  return heightFromFeetInches(feet, inches);
}

export function heightAsFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = roundTo(cm / CM_PER_INCH, 2);
  const feet = Math.floor(totalInches / 12);
  return { feet, inches: roundTo(totalInches - feet * 12, 2) };
}

export function poundsToKg(pounds: number): number {
  // A third decimal of kg keeps a hundredth of a pound stable after saving and reopening.
  return roundTo(pounds * KG_PER_POUND, 3);
}

export function kgToPounds(kg: number): number {
  return roundTo(kg / KG_PER_POUND, 2);
}

function storageKey(organizationId: string, userId: string, assessmentId: string): string {
  return `niq:measurement-units:${organizationId}:${userId}:${assessmentId}`;
}

export function readMeasurementUnits(organizationId: string, userId: string, assessmentId: string): MeasurementUnits {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(organizationId, userId, assessmentId)) ?? "null");
    return { height: stored?.height === "ft-in" ? "ft-in" : "cm", weight: stored?.weight === "lb" ? "lb" : "kg" };
  } catch { return metricUnits; }
}

export function rememberMeasurementUnits(organizationId: string, userId: string, assessmentId: string, units: MeasurementUnits): void {
  try { window.localStorage.setItem(storageKey(organizationId, userId, assessmentId), JSON.stringify(units)); }
  catch { /* Storage may be unavailable; the current form still keeps the selection. */ }
}
