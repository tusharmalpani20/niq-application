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
  const change = difference === null ? null : difference === 0 ? "No change" : `${formatted(Math.abs(difference))} ${unit} ${difference > 0 ? "gain" : "loss"}`;
  const context = percent === null || difference === null
    ? currentValid ? "Enter weight from 1–2 months ago to see the change." : "Enter current weight in Personal details to see the change."
    : difference === 0 ? `0 ${unit} (0%)` : `${Math.abs(percent).toFixed(1)}% ${difference > 0 ? "increase" : "decrease"} from earlier weight`;
  return <section className="col-[1/-1] min-w-0" aria-label="Weight comparison">
    <h3 className="mb-4 text-base font-semibold">Weight comparison</h3>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-4">
      {children}
      <div className="space-y-2"><p className="flex min-h-9 items-center text-base font-medium">Current weight ({unit})</p><p className="flex min-h-12 items-center rounded-lg border border-border bg-muted/50 px-3 text-base">{currentValid ? `${formatted(current)} ${unit}` : "Not entered"}</p><p className="text-xs text-muted-foreground">From Personal details</p></div>
    </div>
    <div id="assessment-field-weight_loss" tabIndex={-1} className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4" aria-live="polite" aria-atomic="true">
      <p className="text-sm font-medium text-muted-foreground">Change over 1–2 months</p>
      {change && <p className="mt-1 text-2xl font-semibold leading-tight text-foreground">{change}</p>}
      <p className={`text-sm ${change ? "mt-1 text-muted-foreground" : "mt-2 font-medium text-foreground"}`}>{context}</p>
    </div>
  </section>;
}
