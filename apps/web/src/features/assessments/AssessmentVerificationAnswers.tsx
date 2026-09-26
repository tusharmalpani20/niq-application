import { assessmentFieldError, isAssessmentFieldApplicable, type FormAnswers, type FormField } from "@niq/application-contracts";
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

function AnswerItem({ field, answers, compact = false }: { field: FormField; answers: FormAnswers; compact?: boolean }) {
  return <div className="min-w-0 space-y-1.5" data-review-answer={field.id}>
    <dt className={`break-words text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>{field.label}{field.required && " *"}</dt>
    <dd className="min-w-0 text-sm font-medium text-foreground"><AnswerValue field={field} answers={answers} /></dd>
  </div>;
}

function TreatmentAnswers({ fields, answers }: { fields: FormField[]; answers: FormAnswers }) {
  const visible = fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers));
  const byId = new Map(visible.map(field => [field.id, field]));
  const parts = [
    { title: "Care path", main: "treatment_status", details: ["palliative_status", "palliative_timing"] },
    { title: "Surgery", main: "cancer_surgical_status", details: ["surgery_date", "planned_surgery_date"] },
    { title: "Current treatment", main: "current_cancer_treatment", details: ["treatment_cycle_number", "treatment_cycle_frequency"] },
    { title: "Medications & supplements", main: null, details: ["current_medications", "supplements_intake"] },
  ];
  const shown = new Set(parts.flatMap(part => [part.main, ...part.details]));

  return <div className="@container min-w-0"><div className="grid min-w-0 gap-3 @min-[36rem]:grid-cols-2">
    {parts.map(part => {
      const main = part.main ? byId.get(part.main) : null;
      const details = part.details.map(id => byId.get(id)).filter((field): field is FormField => Boolean(field));
      if (!main && !details.length) return null;
      return <section key={part.title} className="min-w-0 rounded-xl border border-border bg-muted/20 p-4" data-review-treatment-part={part.title}>
        <h4 className="mb-4 text-sm font-semibold text-foreground">{part.title}</h4>
        <dl className="grid min-w-0 gap-4">
          {main && <AnswerItem field={main} answers={answers} />}
          {details.length > 0 && <div className={`grid min-w-0 gap-4 border-l-2 border-primary/20 pl-3 ${main ? "ml-1" : ""}`}>
            {details.map(field => <AnswerItem key={field.id} field={field} answers={answers} compact={Boolean(main)} />)}
          </div>}
        </dl>
      </section>;
    })}
    {visible.filter(field => !shown.has(field.id)).map(field => <dl key={field.id} className="p-4"><AnswerItem field={field} answers={answers} /></dl>)}
  </div></div>;
}

export function AssessmentVerificationAnswers({ sectionId, fields, answers }: { sectionId: string; fields: FormField[]; answers: FormAnswers }) {
  if (sectionId === "treatment") return <TreatmentAnswers fields={fields} answers={answers} />;

  return <div className="min-w-0 divide-y divide-border/70">{assessmentFieldGroups(fields, answers).map(group => {
    const visible = group.filter(field => field.kind !== "calculated");
    if (!visible.length) return null;
    return <dl key={group[0]!.id} data-review-question-group={group[0]!.id} className="grid min-w-0 gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-2">
      {visible.map(field => <AnswerItem key={field.id} field={field} answers={answers} />)}
    </dl>;
  })}</div>;
}
