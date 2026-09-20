import { ASSESSMENT_ANSWER_TEXT_LIMIT, calculateAssessmentBmi, calculateAssessmentWeightChange, isAssessmentFieldApplicable, type AssessmentFormManifest, type FormAnswer, type FormAnswers, type FormField } from "@niq/application-contracts";
import { Button } from "../../components/ui/button";

export type AssessmentFieldsProps = {
  section: AssessmentFormManifest["sections"][number]; answers: FormAnswers;
  onChange: (id: string, value: FormAnswer) => void; errors: Record<string, string>; readOnly: boolean;
};
const control = "min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-invalid:border-destructive";
/** Invalid and intermediate number text stays in draft state; empty input never becomes zero. */
export function assessmentNumericInput(raw: string): FormAnswer {
  if (!raw.trim()) return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return raw;
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}
function calculated(field: FormField, answers: FormAnswers): string {
  if (field.id === "protein_intake") return "Calculated when scored";
  const height = answers.height_cm; const current = answers.current_weight_kg; const previous = answers.previous_weight_kg;
  if (field.id === "bmi") {
    const bmi = typeof height === "number" && typeof current === "number" ? calculateAssessmentBmi(height, current) : null;
    return bmi === null ? "Enter height and weight" : bmi.toFixed(1);
  }
  if (field.id === "weight_loss") {
    const loss = typeof previous === "number" && typeof current === "number" ? calculateAssessmentWeightChange(previous, current) : null;
    if (loss === null) return "Enter previous and current weight";
    return loss === 0 ? "No change" : `${Math.abs(loss).toFixed(1)}% ${loss > 0 ? "loss" : "gain"}`;
  }
  return "Calculated when scored";
}
export function AssessmentFields({ section, answers, onChange, errors, readOnly }: AssessmentFieldsProps) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-6">{section.fields.filter(field => isAssessmentFieldApplicable(field, answers)).map(field => {
    const id = `assessment-field-${field.id}`; const errorId = `${id}-error`; const error = errors[field.id];
    const value = answers[field.id]; const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}`;
    const errorMarkup = error ? <p id={errorId} className="text-sm text-destructive" role="alert">{error}</p> : null;
    if (field.kind === "multi_select") {
      const selected = Array.isArray(value) ? value : [];
      return <fieldset id={id} key={field.id} tabIndex={-1} disabled={readOnly} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className="col-[1/-1] min-w-0 space-y-3">
        <legend className="mb-2 font-medium">{label} <span className="text-sm font-normal text-muted-foreground">{field.required ? "Required" : "Optional"}</span></legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-2">{field.options?.map(option => <label key={option.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="checkbox" className="mt-1 size-4 accent-primary focus-visible:outline-ring" checked={selected.includes(option.id)} onChange={event => onChange(field.id, event.target.checked ? [...selected, option.id] : selected.filter(item => item !== option.id))} />
          <span>{option.label}</span>
        </label>)}</div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={Array.isArray(value) && value.length === 0} onChange={event => onChange(field.id, event.target.checked ? [] : null)} />None</label>
          {value !== undefined && value !== null && <Button variant="ghost" isDisabled={readOnly} onPress={() => onChange(field.id, null)}>Clear answer</Button>}
        </div>{errorMarkup}
      </fieldset>;
    }
    if (field.readOnly || field.kind === "calculated") return <div key={field.id} id={id} tabIndex={-1} className="space-y-2">
      <p className="font-medium">{label}</p><p className="min-h-11 rounded-lg bg-muted/50 px-3 py-2">{field.kind === "calculated" ? calculated(field, answers) : value === undefined || value === null || value === "" ? "Not provided" : String(value)}</p>{errorMarkup}
    </div>;
    return <div key={field.id} className="space-y-2">
      <label htmlFor={id} className="block font-medium">{label} <span className="text-sm font-normal text-muted-foreground">{field.required ? "Required" : "Optional"}</span></label>
      {field.kind === "select" ? <select id={id} className={control} disabled={readOnly} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={typeof value === "string" ? value : ""} onChange={event => onChange(field.id, event.target.value || null)}>
        <option value="">Select an option</option>{field.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select> : <input id={id} className={control} disabled={readOnly} type={field.kind === "date" ? "date" : "text"} inputMode={field.kind === "number" ? "decimal" : undefined} maxLength={ASSESSMENT_ANSWER_TEXT_LIMIT} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => onChange(field.id, field.kind === "number" ? assessmentNumericInput(event.target.value) : event.target.value || null)} />}
      {errorMarkup}
    </div>;
  })}</div>;
}
