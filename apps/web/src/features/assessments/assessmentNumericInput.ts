import type { FormAnswer } from "@niq/application-contracts";

/** Invalid and intermediate number text stays in draft state; empty input never becomes zero. */
export function assessmentNumericInput(raw: string): FormAnswer {
  if (!raw.trim()) return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return raw;
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}
