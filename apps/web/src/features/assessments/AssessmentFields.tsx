import { ASSESSMENT_ANSWER_TEXT_LIMIT, calculateAssessmentBmi, calculateAssessmentWeightChange, isAssessmentFieldApplicable, type AssessmentFormManifest, type FormAnswer, type FormAnswers, type FormField } from "@niq/application-contracts";
import { Tooltip, TooltipTrigger } from "../../components/ui/tooltip";
import { X } from "lucide-react";
import { SearchCombobox } from "../../components/ui/combobox";
import { ChoiceGroup } from "../../components/ui/choice-group";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

export type AssessmentFieldsProps = {
  section: AssessmentFormManifest["sections"][number]; answers: FormAnswers;
  onChange: (id: string, value: FormAnswer) => void; errors: Record<string, string>; readOnly: boolean; onEditContact?: () => void;
};
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
const explicitNoneFields = new Set(["current_medications", "supplements_intake", "co_morbidities", "gastrointestinal_symptoms"]);
const otherFields: Record<string, { option: string; detail: string }> = {
  cancer_type: { option: "cancer_other", detail: "cancer_type_other" },
  metastasis_site: { option: "others", detail: "metastasis_other" },
};
export function AssessmentFields({ section, answers, onChange, errors, readOnly, onEditContact }: AssessmentFieldsProps) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-x-6 gap-y-5">{section.fields.filter(field => isAssessmentFieldApplicable(field, answers)).map(field => {
    const id = `assessment-field-${field.id}`; const errorId = `${id}-error`; const error = errors[field.id];
    const value = answers[field.id]; const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}`;
    const required = field.required ? <><span aria-hidden="true" className="ml-1 text-destructive">*</span><span className="sr-only"> (required)</span></> : null;
    const errorMarkup = error ? <p id={errorId} className="text-sm text-destructive" role="alert">{error}</p> : null;
    const reset = value !== undefined && value !== null && !readOnly ? <TooltipTrigger><Button variant="ghost" size="icon" className="size-8" aria-label={`Reset ${field.label}`} onPress={() => onChange(field.id, null)}><X className="size-3.5" /></Button><Tooltip>Reset {field.label.toLowerCase()}</Tooltip></TooltipTrigger> : null;
    if (field.kind === "multi_select") {
      const selected = Array.isArray(value) ? value : [];
      const options = (field.options || []).filter(option => !selected.includes(option.id));
      if (explicitNoneFields.has(field.id)) options.push({ id: "__none__", label: "None" });
      return <fieldset id={id} key={field.id} tabIndex={-1} disabled={readOnly} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className="col-[1/-1] min-w-0 space-y-3 border-b border-border pb-5">
        <legend className="mb-2 text-sm font-medium">{label}{required}</legend>
        {Array.isArray(value) && <div className="flex flex-wrap items-center gap-2">{selected.length ? selected.map(item => <span key={item} className="inline-flex max-w-full items-center rounded-full border border-primary/20 bg-primary/5 pl-3 text-sm">
          <span className="break-words">{field.options?.find(option => option.id === item)?.label || item}</span>
          <Button variant="ghost" size="icon" className="ml-1 size-9 rounded-full" isDisabled={readOnly} aria-label={`Remove ${field.options?.find(option => option.id === item)?.label || item}`} onPress={() => onChange(field.id, selected.filter(choice => choice !== item))}><X className="size-3.5" /></Button>
        </span>) : <span className="text-sm text-muted-foreground">{explicitNoneFields.has(field.id) ? "None" : "No selections"}</span>}{reset}</div>}
        {!readOnly && <div className="max-w-md"><SearchCombobox key={JSON.stringify(value)} label={`Add ${field.label.toLowerCase()}`} placeholder={`Add ${field.label.toLowerCase()}…`} options={options} value={null} onChange={choice => onChange(field.id, choice === "__none__" ? [] : [...selected, choice])} invalid={Boolean(error)} describedBy={error ? errorId : undefined} /></div>}
        {errorMarkup}
      </fieldset>;
    }
    if (field.readOnly || field.kind === "calculated") return <div key={field.id} id={id} tabIndex={-1} className="space-y-1.5">
      <p className="text-sm text-muted-foreground">{label}</p><p className="min-h-8 font-medium">{field.kind === "calculated" ? calculated(field, answers) : value === undefined || value === null || value === "" ? "Not provided" : String(value)}</p>{field.id === "contact" && onEditContact && !readOnly && <Button variant="link" className="px-0" onPress={onEditContact}>{value ? "Edit contact" : "Add contact"}</Button>}{errorMarkup}
    </div>;
    const other = otherFields[field.id];
    const custom = other && value === other.option && typeof answers[other.detail] === "string" ? String(answers[other.detail]) : undefined;
    return <div key={field.id} className={`min-w-0 space-y-2 ${field.kind === "select" && !other && (field.options?.length || 0) <= 6 ? "col-[1/-1] border-b border-border pb-5" : ""}`}>
      <div className="flex min-h-8 items-center justify-between gap-2"><label htmlFor={id} className="block text-sm font-medium">{label}{required}</label>{field.kind === "select" && reset}</div>
      {field.kind === "select" ? !other && (field.options?.length || 0) <= 6 ? <ChoiceGroup id={id} label={label} options={field.options || []} value={typeof value === "string" ? value : ""} onChange={choice => onChange(field.id, choice)} disabled={readOnly} required={field.required} invalid={Boolean(error)} describedBy={error ? errorId : undefined} /> : <SearchCombobox id={id} label={label} options={field.options || []} value={typeof value === "string" ? value : null} onChange={choice => onChange(field.id, choice)} disabled={readOnly} required={field.required} invalid={Boolean(error)} describedBy={error ? errorId : undefined} customValue={custom} onCreate={other ? text => { onChange(field.id, other.option); onChange(other.detail, text); } : undefined} /> : <Input id={id} className="min-h-11 bg-background" disabled={readOnly} type={field.kind === "date" ? "date" : "text"} inputMode={field.kind === "number" ? "decimal" : undefined} maxLength={ASSESSMENT_ANSWER_TEXT_LIMIT} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => onChange(field.id, field.kind === "number" ? assessmentNumericInput(event.target.value) : event.target.value || null)} />}
      {errorMarkup}
    </div>;
  })}</div>;
}
