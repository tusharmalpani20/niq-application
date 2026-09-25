import { useEffect, useRef, useState } from "react";
import type { FormAnswer } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assessmentNumericInput } from "./assessmentNumericInput";
import { feetInchesAnswer, heightAsFeetInches, kgToPounds, poundsToKg, type HeightUnit, type WeightUnit } from "./measurement-units";

type Props = {
  id: string; label: string; kind: "height" | "weight"; value: FormAnswer | undefined;
  unit: HeightUnit | WeightUnit; onUnitChange: (unit: HeightUnit | WeightUnit) => void;
  onChange: (value: FormAnswer) => void; disabled: boolean; invalid: boolean;
  describedBy?: string; required: boolean;
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

export function AssessmentMeasurementInput({ id, label, kind, value, unit, onUnitChange, onChange, disabled, invalid, describedBy, required }: Props) {
  const [draft, setDraft] = useState(() => display(value, kind, unit));
  const lastEmitted = useRef<FormAnswer | undefined>(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDraft(display(value, kind, unit));
      lastEmitted.current = value;
    }
  }, [value, kind, unit]);
  const emit = (next: FormAnswer) => { lastEmitted.current = next; onChange(next); };
  const change = (part: 0 | 1, raw: string) => {
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
  const unitChoices = kind === "height" ? (["cm", "ft-in"] as const) : (["kg", "lb"] as const);
  return <div className="space-y-2">
    <div className="flex justify-end">
      <div role="group" aria-label={`${label} unit`} className="inline-flex rounded-lg border border-border p-0.5">
        {unitChoices.map(choice => <Button key={choice} type="button" size="sm" variant={unit === choice ? "secondary" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={unit === choice} isDisabled={typeof value === "string"} onPress={() => onUnitChange(choice)}>{choice === "ft-in" ? "ft / in" : choice}</Button>)}
      </div>
    </div>
    {imperialHeight ? <div className="grid grid-cols-2 gap-3">
      <div><label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">Feet</label><Input id={id} aria-label="Height feet" type="number" inputMode="numeric" min={0} step={1} className="min-h-11 bg-background" disabled={disabled} aria-required={required} aria-invalid={invalid || invalidInches} aria-describedby={describedBy} value={draft[0]} onChange={event => change(0, event.target.value)} /></div>
      <div><label htmlFor={`${id}-inches`} className="mb-1 block text-xs text-muted-foreground">Inches</label><Input id={`${id}-inches`} type="number" inputMode="decimal" min={0} max={11.99} step="any" className="min-h-11 bg-background" disabled={disabled} aria-invalid={invalid || invalidInches} value={draft[1]} onChange={event => change(1, event.target.value)} /></div>
    </div> : <Input id={id} type="number" min={0} step="any" inputMode="decimal" className="min-h-11 bg-background" disabled={disabled} aria-required={required} aria-invalid={invalid} aria-describedby={describedBy} value={draft[0]} onChange={event => change(0, event.target.value)} />}
    {invalidInches && <p role="alert" className="text-xs text-destructive">Inches must be less than 12.</p>}
  </div>;
}
