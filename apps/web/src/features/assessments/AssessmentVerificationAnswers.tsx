import { assessmentFieldError, calculateAssessmentWeightChange, isAssessmentFieldApplicable, type FormAnswers, type FormField } from "@niq/application-contracts";
import { assessmentFieldGroups } from "./AssessmentFields";
import { assessmentOptionIcon } from "./assessmentOptionIcon";
import { formatGenderAnswer } from "./formatGenderAnswer";

function AnswerValue({ field, answers }: { field: FormField; answers: FormAnswers }) {
  const value = answers[field.id];
  const empty = value === null || value === undefined || value === "" || typeof value === "string" && !value.trim();
  const display = empty ? "Not answered" : Array.isArray(value)
    ? value.length ? value.map(id => field.options?.find(option => option.id === id)?.label ?? id).join(", ") : "None"
    : field.options?.find(option => option.id === value)?.label ?? (field.id === "gender" && typeof value === "string" ? formatGenderAnswer(value) : String(value));
  const error = assessmentFieldError(field, value);
  const choiceIds = Array.isArray(value) ? value : typeof value === "string" && field.options?.some(option => option.id === value) ? [value] : [];
  const visualChoices = choiceIds.map(id => ({ id, label: field.options?.find(option => option.id === id)?.label ?? id, icon: assessmentOptionIcon(field.id, id) }));

  return <span className={`min-w-0 break-words ${error ? "text-destructive" : ""}`}>
    {visualChoices.some(choice => choice.icon) ? <span className="flex flex-wrap gap-2">{visualChoices.map(choice => <span key={choice.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 py-1 pl-1 pr-2.5 text-sm font-medium"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-5" aria-hidden="true">{choice.icon}</span><span className="break-words">{choice.label}</span></span>)}</span> : <>{display}{field.unit && !empty && ` ${field.unit}`}</>}
    {error && error !== "Required" && <span className="block text-sm">{error}</span>}
  </span>;
}

function AnswerItem({ field, answers, spanColumns = false }: { field: FormField; answers: FormAnswers; spanColumns?: boolean }) {
  return <div className={`min-w-0 space-y-1.5 ${spanColumns ? "@min-[28rem]:col-span-2" : ""}`} data-review-answer={field.id}>
    <dt className="break-words text-sm text-muted-foreground">{field.label}{field.required && " *"}</dt>
    <dd className="min-w-0 text-sm font-medium text-foreground"><AnswerValue field={field} answers={answers} /></dd>
  </div>;
}

function DietaryAnswers({ fields, answers }: { fields: FormField[]; answers: FormAnswers }) {
  const visible = fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers));
  const byId = new Map(visible.map(field => [field.id, field]));
  const previous = answers.previous_weight_kg;
  const current = answers.current_weight_kg;
  const change = typeof previous === "number" && typeof current === "number" ? calculateAssessmentWeightChange(previous, current) : null;
  const difference = change !== null && typeof previous === "number" && typeof current === "number" ? current - previous : null;
  const amount = difference === null ? null : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Math.abs(difference));
  const changeLabel = difference === null ? "Add both weights to see the change" : difference === 0 ? "No weight change" : `${amount} kg ${difference > 0 ? "gain" : "loss"} (${Math.abs(change!).toFixed(1)}%)`;
  const parts = [
    { title: "Dietary intake", ids: ["dietary_intake"] },
    { title: "Symptoms", ids: ["dietary_symptoms"] },
    { title: "Daily activity", ids: ["functional_capacity"] },
    { title: "Stress level", ids: ["stress_level"] },
    { title: "Fluid intake", ids: ["fluid_intake"] },
  ];
  const shown = new Set(["previous_weight_kg", ...parts.flatMap(part => part.ids)]);

  return <div className="@container min-w-0 divide-y divide-border/70">
    <section className="min-w-0 pb-4" data-review-dietary-part="Weight comparison">
      <h4 className="mb-3 text-sm font-semibold text-foreground">Weight comparison</h4>
      <dl className="grid min-w-0 gap-4 @min-[28rem]:grid-cols-2">
        {byId.get("previous_weight_kg") && <AnswerItem field={byId.get("previous_weight_kg")!} answers={answers} />}
        <div className="min-w-0 space-y-1.5"><dt className="text-sm text-muted-foreground">Current weight</dt><dd className="text-sm font-medium">{typeof current === "number" && current > 0 ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(current)} kg` : "Not answered"}<span className="block text-xs font-normal text-muted-foreground">From Personal details</span></dd></div>
        <div className="min-w-0 space-y-1.5 @min-[28rem]:col-span-2"><dt className="text-sm text-muted-foreground">Change over 1–2 months</dt><dd className="text-sm font-semibold text-foreground">{changeLabel}</dd></div>
      </dl>
    </section>
    {parts.map(part => {
      const partFields = part.ids.map(id => byId.get(id)).filter((field): field is FormField => Boolean(field));
      if (!partFields.length) return null;
      return <dl key={part.title} className="grid min-w-0 gap-4 py-4 last:pb-0 @min-[28rem]:grid-cols-2" data-review-dietary-part={part.title}>
        {partFields.map(field => <AnswerItem key={field.id} field={field} answers={answers} spanColumns={field.kind === "multi_select"} />)}
      </dl>;
    })}
    {visible.filter(field => !shown.has(field.id)).map(field => <dl key={field.id} className="grid min-w-0 gap-4 py-4 last:pb-0 @min-[28rem]:grid-cols-2"><AnswerItem field={field} answers={answers} spanColumns={field.kind === "multi_select"} /></dl>)}
  </div>;
}

export function AssessmentVerificationAnswers({ sectionId, fields, answers }: { sectionId: string; fields: FormField[]; answers: FormAnswers }) {
  if (sectionId === "dietary_details") return <DietaryAnswers fields={fields} answers={answers} />;

  return <div className="@container min-w-0 divide-y divide-border/70">{assessmentFieldGroups(fields, answers).map(group => {
    const visible = group.filter(field => field.kind !== "calculated");
    if (!visible.length) return null;
    return <dl key={group[0]!.id} data-review-question-group={group[0]!.id} className="grid min-w-0 gap-4 py-4 first:pt-0 last:pb-0 @min-[28rem]:grid-cols-2">
      {visible.map(field => <AnswerItem key={field.id} field={field} answers={answers} spanColumns={field.kind === "multi_select" || field.id === "treatment_status" || group[0]!.id === "current_cancer_treatment" && field.id === "current_cancer_treatment"} />)}
    </dl>;
  })}</div>;
}
