import { AssessmentDateInput } from "./AssessmentDateInput";
import { ASSESSMENT_ANSWER_TEXT_LIMIT, calculateAssessmentBmi, calculateAssessmentWeightChange, isAssessmentFieldApplicable, type AssessmentFormManifest, type FormAnswer, type FormAnswers, type FormField } from "@niq/application-contracts";
import { AssessmentWeightComparison } from "./AssessmentWeightComparison";
import { Tooltip, TooltipTrigger } from "../../components/ui/tooltip";
import { X } from "lucide-react";
import { SearchCombobox } from "../../components/ui/combobox";
import { ChoiceGroup, MultipleChoiceGroup } from "../../components/ui/choice-group";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Link } from "react-router-dom";
import { assessmentNumericInput } from "./assessmentNumericInput";
import { AssessmentMeasurementInput, AssessmentMeasurementUnitControl } from "./AssessmentMeasurementInput";
import { metricUnits, type MeasurementUnits } from "./measurement-units";
export { assessmentNumericInput } from "./assessmentNumericInput";

export type AssessmentFieldsProps = {
  section: AssessmentFormManifest["sections"][number]; answers: FormAnswers;
  onChange: (id: string, value: FormAnswer) => void; errors: Record<string, string>; readOnly: boolean; heightSourceDate?: string; onEditContact?: () => void;
  patientReference?: string; canEditPatient?: boolean; canCorrectDob?: boolean;
  measurementUnits?: MeasurementUnits; onMeasurementUnitsChange?: (units: MeasurementUnits) => void;
};
function calculated(field: FormField, answers: FormAnswers): string {
  if (field.id === "protein_intake") return "Derived from dietary intake when you submit for scoring";
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
export function addAssessmentMultiChoice(selected: string[], choice: string): string[] {
  return [...selected, choice];
}
const otherFields: Record<string, { option: string; detail: string }> = {
  cancer_type: { option: "cancer_other", detail: "cancer_type_other" },
  metastasis_site: { option: "others", detail: "metastasis_other" },
};
/** Keep conditional follow-ups with their controlling question, not behind a separator. */
export function assessmentFieldGroups(fields: FormField[], answers: FormAnswers): FormField[][] {
  const visible = fields.filter(field => isAssessmentFieldApplicable(field, answers));
  const parents: Record<string, string> = { age: "patient_name", gender: "patient_name", contact: "patient_name", current_weight_kg: "height_cm", bmi: "height_cm", previous_weight_kg: "weight_loss", protein_intake: "dietary_intake", treatment_cycle_number: "current_cancer_treatment", treatment_cycle_frequency: "current_cancer_treatment" };
  const root = (field: FormField): string => {
    const parentId = parents[field.id] ?? field.visibleWhen?.[0]?.fieldId;
    const parent = visible.find(item => item.id === parentId);
    return parent ? root(parent) : field.id;
  };
  const groups = new Map<string, FormField[]>();
  for (const field of visible) { const id = root(field); groups.set(id, [...(groups.get(id) ?? []), field]); }
  return [...groups.values()].map(group => group[0]?.id === "weight_loss" ? [...group.filter(field => field.id !== "weight_loss"), ...group.filter(field => field.id === "weight_loss")] : group);
}
export function AssessmentFields({ section, answers, onChange, errors, readOnly, heightSourceDate, onEditContact, patientReference, canEditPatient, canCorrectDob, measurementUnits = metricUnits, onMeasurementUnitsChange }: AssessmentFieldsProps) {
  const renderField = (field: FormField) => {
    const id = `assessment-field-${field.id}`; const errorId = `${id}-error`;
    const value = answers[field.id]; const error = errors[field.id];
    const label = `${field.label}${field.unit && field.unit !== "surgeries" ? ` (${field.unit})` : ""}`;
    const required = field.required ? <><span aria-hidden="true" className="ml-1 text-destructive">*</span><span className="sr-only"> (required)</span></> : null;
    const errorMarkup = error ? <p id={errorId} className="text-sm text-destructive" role="alert">{error}</p> : null;
    const reset = value !== undefined && value !== null && value !== "" && !readOnly && !field.readOnly && field.kind !== "calculated" ? <TooltipTrigger><Button variant="ghost" size="icon" className="size-8" aria-label={`Clear ${field.label}`} onPress={() => onChange(field.id, null)}><X className="size-3.5" /></Button><Tooltip>Clear {field.label.toLowerCase()}</Tooltip></TooltipTrigger> : null;
    if (field.kind === "multi_select") {
      const selected = Array.isArray(value) ? value : [];
      const allOptions = [...(field.options ?? []), ...(explicitNoneFields.has(field.id) ? [{ id: "__none__", label: "None" }] : [])];
      if (allOptions.length <= 6) return <fieldset id={id} key={field.id} tabIndex={-1} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className="col-[1/-1] min-w-0 space-y-3">
        <legend className="mb-2 w-full text-sm font-medium"><span className="flex min-h-8 items-center justify-between gap-2"><span>{label}{required}</span>{reset}</span></legend>
        <MultipleChoiceGroup label={label} options={allOptions} value={Array.isArray(value) && !selected.length && explicitNoneFields.has(field.id) ? ["__none__"] : selected} disabled={readOnly} onChange={next => {
          if (next.includes("__none__") && !selected.includes("__none__") && selected.length) onChange(field.id, []);
          else { const choices = next.filter(id => id !== "__none__"); onChange(field.id, choices.length ? choices : next.includes("__none__") ? [] : null); }
        }} />{errorMarkup}
      </fieldset>;
      const options = (field.options || []).filter(option => !selected.includes(option.id));
      if (explicitNoneFields.has(field.id)) options.push({ id: "__none__", label: "None" });
      return <fieldset id={id} key={field.id} tabIndex={-1} disabled={readOnly} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className="col-[1/-1] min-w-0 space-y-3">
        <legend className="mb-2 w-full text-sm font-medium"><span className="flex min-h-8 items-center justify-between gap-2"><span>{label}{required}</span>{reset}</span></legend>
        {Array.isArray(value) && <div className="flex flex-wrap items-center gap-2">{selected.length ? selected.map(item => <span key={item} className="inline-flex max-w-full items-center rounded-full border border-primary/20 bg-primary/5 pl-3 text-sm">
          <span className="break-words">{field.options?.find(option => option.id === item)?.label || item}</span>
          <Button variant="ghost" size="icon" className="ml-1 size-9 rounded-full" isDisabled={readOnly} aria-label={`Remove ${field.options?.find(option => option.id === item)?.label || item}`} onPress={() => onChange(field.id, selected.length === 1 ? null : selected.filter(choice => choice !== item))}><X className="size-3.5" /></Button>
        </span>) : explicitNoneFields.has(field.id) ? <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 pl-3 text-sm">None<Button variant="ghost" size="icon" className="ml-1 size-9 rounded-full" isDisabled={readOnly} aria-label={`Remove None from ${field.label}`} onPress={() => onChange(field.id, null)}><X className="size-3.5" /></Button></span> : <span className="text-sm text-muted-foreground">No selections</span>}</div>}
        {!readOnly && <div className="max-w-md"><SearchCombobox key={JSON.stringify(value)} label={`Add ${field.label.toLowerCase()}`} placeholder={`Add ${field.label.toLowerCase()}…`} options={options} value={null} onChange={choice => onChange(field.id, choice === "__none__" ? [] : addAssessmentMultiChoice(selected, choice))} invalid={Boolean(error)} describedBy={error ? errorId : undefined} /></div>}
        {errorMarkup}
      </fieldset>;
    }
    if (field.readOnly || field.kind === "calculated") return <div key={field.id} id={id} tabIndex={-1} className="space-y-1.5">
      <p className="text-sm text-muted-foreground">{label}</p><p className="min-h-8 font-medium">{field.kind === "calculated" ? calculated(field, answers) : value === undefined || value === null || value === "" ? "Not provided" : String(value)}</p>{field.id === "contact" && !value && onEditContact && !readOnly && <Button variant="link" className="px-0" onPress={onEditContact}>Add contact</Button>}{errorMarkup}
      {error && field.id === "age" && patientReference && (canCorrectDob ? <Link className="text-sm text-brand-ink underline" to={`/patients/${encodeURIComponent(patientReference)}?edit=dateOfBirth`}>Correct date of birth in patient details</Link> : <p className="text-sm text-muted-foreground">Ask an organization admin to correct the date of birth.</p>)}
      {error && field.id === "gender" && patientReference && (canEditPatient ? <Link className="text-sm text-brand-ink underline" to={`/patients/${encodeURIComponent(patientReference)}?edit=gender`}>Edit gender in patient details</Link> : <p className="text-sm text-muted-foreground">Ask someone with patient editing access to update this detail.</p>)}
    </div>;
    if (field.id === "height_cm" || field.id === "current_weight_kg" || field.id === "previous_weight_kg") {
      const isHeight = field.id === "height_cm";
      const unit = isHeight ? measurementUnits.height : measurementUnits.weight;
      return <div key={field.id} className="min-w-0 space-y-2">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2"><label htmlFor={id} className="block text-sm font-medium">{field.label}{required}</label><div className="flex items-center gap-1">{reset}<AssessmentMeasurementUnitControl label={field.label} kind={isHeight ? "height" : "weight"} unit={unit} onUnitChange={next => onMeasurementUnitsChange?.({ ...measurementUnits, [isHeight ? "height" : "weight"]: next })} disabled={typeof value === "string"} /></div></div>
        <AssessmentMeasurementInput key={`${id}-${unit}`} id={id} label={field.label} kind={isHeight ? "height" : "weight"} value={value} unit={unit} showQuickValues={field.id !== "previous_weight_kg"} onChange={next => onChange(field.id, next)} disabled={readOnly} invalid={Boolean(error)} describedBy={error ? errorId : undefined} required={field.required} />
        {isHeight && heightSourceDate && <p className="text-xs text-muted-foreground">Height from assessment on {new Date(heightSourceDate).toLocaleDateString()}</p>}
        {errorMarkup}
      </div>;
    }
    const other = otherFields[field.id];
    return <div key={field.id} className={`min-w-0 space-y-2 ${field.kind === "select" && (field.options?.length || 0) <= 6 ? "col-[1/-1]" : ""}`}>
      <div className="flex min-h-8 items-center justify-between gap-2"><label htmlFor={id} className="block text-sm font-medium">{label}{required}</label>{reset}</div>
      {field.kind === "date" ? <AssessmentDateInput id={id} label={label} value={typeof value === "string" ? value : ""} disabled={readOnly} required={field.required} invalid={Boolean(error)} describedBy={error ? errorId : undefined} onChange={next => onChange(field.id, next)} /> : field.kind === "select" ? (field.options?.length || 0) <= 6 ? <ChoiceGroup id={id} label={label} options={field.options || []} value={typeof value === "string" ? value : ""} onChange={choice => onChange(field.id, choice)} disabled={readOnly} required={field.required} invalid={Boolean(error)} describedBy={error ? errorId : undefined} /> : <SearchCombobox id={id} label={label} options={field.options || []} value={typeof value === "string" ? value : null} onChange={choice => onChange(field.id, choice)} disabled={readOnly} required={field.required} invalid={Boolean(error)} describedBy={error ? errorId : undefined} onCreate={other ? text => { onChange(field.id, other.option); onChange(other.detail, text); } : undefined} /> : <Input id={id} className="min-h-11 bg-background" disabled={readOnly} type={field.kind === "number" ? "number" : "text"} min={field.kind === "number" ? field.min : undefined} step={field.kind === "number" ? field.integer ? 1 : "any" : undefined} inputMode={field.kind === "number" ? "decimal" : undefined} maxLength={ASSESSMENT_ANSWER_TEXT_LIMIT} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => {
        const next = field.kind === "number" ? assessmentNumericInput(event.target.value) : event.target.value || null;
        if (field.kind === "number" && typeof next === "number" && field.min !== undefined && next < field.min) return;
        onChange(field.id, next);
      }} />}
      {field.id === "height_cm" && heightSourceDate && <p className="text-xs text-muted-foreground">Height from assessment on {new Date(heightSourceDate).toLocaleDateString()}</p>}
      {errorMarkup}
    </div>;
  };
  return <div className="@container space-y-6">{assessmentFieldGroups(section.fields, answers).map(group => <div key={group[0]!.id} data-question-group={group[0]!.id} className={`grid ${(section.id === "personal_details" || group[0]!.id === "current_cancer_treatment") ? "grid-cols-1 @min-[30rem]:grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]"} items-start gap-x-6 gap-y-4 border-b border-border pb-6 last:border-b-0 last:pb-0`}>{group.some(field => field.id === "weight_loss") && group.some(field => field.id === "previous_weight_kg") ? <AssessmentWeightComparison answers={answers} unit={measurementUnits.weight}>{group.filter(field => field.id !== "weight_loss").map(renderField)}</AssessmentWeightComparison> : group.map(renderField)}</div>)}</div>;
}
