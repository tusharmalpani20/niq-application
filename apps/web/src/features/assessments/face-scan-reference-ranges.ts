import type { FaceScanSession } from "@niq/application-contracts";

type Range = { min?: number; max?: number; minInclusive?: boolean; maxInclusive?: boolean; suffix?: string };
type Reference = Range | { byGender: Record<"male" | "female", Range> } | { resting: Range };

// CarePlix DigitalHealthReport.pdf, pages 2–4. These are report reference ranges,
// not diagnostic or urgency thresholds. Change values here for every scan view.
export const faceScanReferenceRanges = {
  heartRate: { min: 60, max: 100, suffix: " bpm" },
  respiratoryRate: { min: 12, max: 20, suffix: " /min" },
  oxygenSaturation: { min: 95, max: 100, suffix: "%" },
  bloodPressure: {
    systolic: { min: 90, max: 120 },
    diastolic: { min: 60, max: 80, suffix: " mmHg" },
  },
  sdnn: { min: 60, max: 100, suffix: " ms" },
  rmssd: { min: 20, max: 89, suffix: " ms" },
  pnn50: { min: 3, minInclusive: false, suffix: "%" },
  cardiacOutput: { min: 4, max: 8, suffix: " L/min" },
  meanArterialPressure: { min: 70, max: 100, suffix: " mmHg" },
  heartUtilisation: { resting: { max: 50, maxInclusive: false, suffix: "% at rest" } },
  vo2max: { byGender: {
    male: { min: 42.5, suffix: " mL/kg/min (male)" },
    female: { min: 33, suffix: " mL/kg/min (female)" },
  } },
  bmi: { min: 18.5, max: 24.9, suffix: " kg/m²" },
  hba1c: { max: 5.7, maxInclusive: false, suffix: "%" },
  stressIndex: { max: 1.5, maxInclusive: false },
  bodyWaterPercent: { min: 40, max: 60, suffix: "%" },
} satisfies Record<string, Reference | { systolic: Range; diastolic: Range }>;

type RangeKey = keyof typeof faceScanReferenceRanges;
export type FaceScanRangeAssessment = { outside: boolean; reference: string };

function numeric(value: number | string | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function outside(value: number, range: Range): boolean {
  return (range.min !== undefined && (value < range.min || (value === range.min && range.minInclusive === false)))
    || (range.max !== undefined && (value > range.max || (value === range.max && range.maxInclusive === false)));
}

function rangeLabel(range: Range): string {
  const bounds = range.min !== undefined && range.max !== undefined
    ? `${range.min}–${range.max}`
    : range.min !== undefined
      ? `${range.minInclusive === false ? ">" : "≥"}${range.min}`
      : `${range.maxInclusive === false ? "<" : "≤"}${range.max}`;
  return bounds + (range.suffix ?? "");
}

export function assessFaceScanRange(
  key: string,
  value: number | string | null,
  context: FaceScanSession["context"],
): FaceScanRangeAssessment | null {
  if (!(key in faceScanReferenceRanges)) return null;
  const reference = faceScanReferenceRanges[key as RangeKey];
  if (key === "bloodPressure") {
    if (typeof value !== "string") return null;
    const parts = value.match(/^([0-9]+(?:\.[0-9]+)?)\/([0-9]+(?:\.[0-9]+)?)$/);
    if (!parts) return null;
    const pressure = faceScanReferenceRanges.bloodPressure;
    return {
      outside: outside(Number(parts[1]), pressure.systolic) || outside(Number(parts[2]), pressure.diastolic),
      reference: `${rangeLabel(pressure.systolic)}/${rangeLabel(pressure.diastolic)}`,
    };
  }
  const measured = numeric(value);
  if (measured === null) return null;
  let range: Range;
  if ("byGender" in reference) range = reference.byGender[context.gender];
  else if ("resting" in reference) {
    if (context.posture !== "resting") return null;
    range = reference.resting;
  } else if ("systolic" in reference) return null;
  else range = reference;
  return { outside: outside(measured, range), reference: rangeLabel(range) };
}
