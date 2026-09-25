import type { ReactNode } from "react";
import { calculateAssessmentWeightChange, type FormAnswers } from "@niq/application-contracts";
import { kgToPounds, type WeightUnit } from "./measurement-units";

/** Compare measurements without implying that weight gain or loss is clinically good/bad. */
export function AssessmentWeightComparison({ answers, children, unit = "kg" }: { answers: FormAnswers; children: ReactNode; unit?: WeightUnit }) {
  const previous = answers.previous_weight_kg;
  const current = answers.current_weight_kg;
  const currentValid = typeof current === "number" && Number.isFinite(current) && current > 0;
  const percent = typeof previous === "number" && currentValid ? calculateAssessmentWeightChange(previous, current) : null;
  const difference = percent !== null && typeof previous === "number" && currentValid ? current - previous : null;
  const formatted = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(unit === "lb" ? kgToPounds(value) : value);
  return <section className="col-[1/-1] min-w-0" aria-label="Weight comparison">
    <h3 className="mb-4 text-sm font-semibold">Weight comparison</h3>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-4">
      {children}
      <div className="space-y-2"><p className="flex min-h-8 items-center text-sm font-medium">Current weight ({unit})</p><p className="flex min-h-11 items-center rounded-lg border border-border bg-muted/50 px-3 text-sm">{currentValid ? `${formatted(current)} ${unit}` : "Not entered"}</p><p className="text-xs text-muted-foreground">From Personal details</p></div>
    </div>
    <div id="assessment-field-weight_loss" tabIndex={-1} className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-live="polite" aria-atomic="true">
      <p className="text-sm text-muted-foreground">Change over 1–2 months</p>
      <p className="text-sm font-semibold">{percent === null || difference === null ? currentValid ? "Enter previous weight to compare" : "Enter current weight in Personal details" : difference === 0 ? `No change · 0 ${unit} (0%)` : `${formatted(Math.abs(difference))} ${unit} ${difference > 0 ? "gain" : "loss"} (${Math.abs(percent).toFixed(1)}%)`}</p>
    </div>
  </section>;
}
