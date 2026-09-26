import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FormAnswer } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assessmentNumericInput } from "./assessmentNumericInput";
import { feetInchesAnswer, heightAsFeetInches, heightFromFeetInches, kgToPounds, poundsToKg, type HeightUnit, type WeightUnit } from "./measurement-units";

type Props = {
  id: string; label: string; kind: "height" | "weight"; value: FormAnswer | undefined;
  unit: HeightUnit | WeightUnit; showQuickValues?: boolean;
  onChange: (value: FormAnswer) => void; disabled: boolean; invalid: boolean;
  describedBy?: string; required: boolean;
};

export function AssessmentMeasurementUnitControl({ label, kind, unit, onUnitChange, disabled }: {
  label: string; kind: Props["kind"]; unit: Props["unit"];
  onUnitChange: (unit: HeightUnit | WeightUnit) => void; disabled: boolean;
}) {
  const choices = kind === "height" ? (["cm", "ft-in"] as const) : (["kg", "lb"] as const);
  return <div role="group" aria-label={`${label} unit`} className="inline-flex rounded-lg border border-border p-0.5">
    {choices.map(choice => <Button key={choice} type="button" size="sm" variant={unit === choice ? "secondary" : "ghost"} className="h-8 px-2.5 text-sm" aria-pressed={unit === choice} isDisabled={disabled} onPress={() => onUnitChange(choice)}>{choice === "ft-in" ? "ft / in" : choice}</Button>)}
  </div>;
}

const heightCmQuickValues = [150, 160, 170, 180];
const heightFeetQuickValues = [[5, 0], [5, 3], [5, 6], [5, 9], [6, 0]] as const;
const weightKgQuickValues = [50, 60, 70, 80, 90];
const weightLbQuickValues = [110, 130, 150, 170, 190];
const blockMinusKey = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "-" || event.key === "Subtract") event.preventDefault();
};

function display(value: FormAnswer | undefined, kind: Props["kind"], unit: Props["unit"]): [string, string] {
  if (value === undefined || value === null) return ["", ""];
  if (typeof value !== "number") return [String(value), ""];
  if (kind === "height" && unit === "ft-in") {
    const { feet, inches } = heightAsFeetInches(value);
    return [String(feet), String(inches)];
  }
  if (kind === "weight" && unit === "lb") return [String(kgToPounds(value)), ""];
  return [String(value), ""];
}

export function AssessmentMeasurementInput({ id, label, kind, value, unit, showQuickValues = false, onChange, disabled, invalid, describedBy, required }: Props) {
  const [draft, setDraft] = useState(() => display(value, kind, unit));
  const lastEmitted = useRef<FormAnswer | undefined>(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDraft(display(value, kind, unit));
      lastEmitted.current = value;
    }
  }, [value, kind, unit]);
  const emit = (next: FormAnswer) => { lastEmitted.current = next; onChange(next); };
  const change = (part: 0 | 1, input: HTMLInputElement) => {
    const raw = input.value;
    // `min={0}` does not prevent typing a minus sign, so restore the last valid text.
    if (input.validity.badInput || raw.trim().startsWith("-") || Number(raw) < 0) {
      input.value = draft[part];
      return;
    }
    const next: [string, string] = [...draft];
    next[part] = raw;
    setDraft(next);
    if (kind === "height" && unit === "ft-in") {
      emit(feetInchesAnswer(next[0], next[1]));
      return;
    }
    const parsed = assessmentNumericInput(raw);
    emit(kind === "weight" && unit === "lb" && typeof parsed === "number" ? poundsToKg(parsed) : parsed);
  };
  const imperialHeight = kind === "height" && unit === "ft-in";
  const invalidInches = imperialHeight && Number(draft[1]) >= 12 && draft[1].trim() !== "";
  const empty = (value === undefined || value === null || value === "") && draft.every(part => !part.trim());
  const quickValues: { label: string; value: number; draft: [string, string] }[] = kind === "height"
    ? unit === "ft-in" ? heightFeetQuickValues.map(([feet, inches]) => ({ label: `${feet} ft ${inches} in`, value: heightFromFeetInches(feet, inches), draft: [String(feet), String(inches)] }))
      : heightCmQuickValues.map(cm => ({ label: `${cm} cm`, value: cm, draft: [String(cm), ""] }))
    : unit === "lb" ? weightLbQuickValues.map(lb => ({ label: `${lb} lb`, value: poundsToKg(lb), draft: [String(lb), ""] }))
      : weightKgQuickValues.map(kg => ({ label: `${kg} kg`, value: kg, draft: [String(kg), ""] }));
  return <div className="space-y-2">
    {imperialHeight ? <div className="grid grid-cols-2 gap-3">
      <div className="relative"><Input id={id} aria-label="Height feet" type="number" inputMode="numeric" min={0} step={1} className="min-h-12 bg-background pr-9 md:text-base" disabled={disabled} aria-required={required} aria-invalid={invalid || invalidInches} aria-describedby={describedBy} value={draft[0]} onKeyDown={blockMinusKey} onChange={event => change(0, event.currentTarget)} /><span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">ft</span></div>
      <div className="relative"><Input id={`${id}-inches`} aria-label="Height inches" type="number" inputMode="decimal" min={0} max={11.99} step="any" className="min-h-12 bg-background pr-9 md:text-base" disabled={disabled} aria-invalid={invalid || invalidInches} value={draft[1]} onKeyDown={blockMinusKey} onChange={event => change(1, event.currentTarget)} /><span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">in</span></div>
    </div> : <Input id={id} type="number" min={0} step="any" inputMode="decimal" className="min-h-12 bg-background md:text-base" disabled={disabled} aria-required={required} aria-invalid={invalid} aria-describedby={describedBy} value={draft[0]} onKeyDown={blockMinusKey} onChange={event => change(0, event.currentTarget)} />}
    {showQuickValues && !disabled && empty && <div className="flex flex-wrap gap-1.5" aria-label={`Suggested ${label.toLowerCase()} values`}>
      {quickValues.map(option => <Button key={option.label} type="button" size="xs" variant="outline" className="min-h-9 rounded-full text-sm" onPress={() => { setDraft(option.draft); emit(option.value); }}>{option.label}</Button>)}
    </div>}
    {invalidInches && <p role="alert" className="text-xs text-destructive">Inches must be less than 12.</p>}
  </div>;
}
