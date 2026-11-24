import { assessmentFieldError, calculateAssessmentWeightChange, isAssessmentFieldApplicable, type FormAnswers, type FormField } from "@niq/application-contracts";
import type { LucideIcon } from "lucide-react";
import { assessmentFieldGroups } from "./AssessmentFields";
import { assessmentOptionIcon } from "./assessmentOptionIcon";
import { formatGenderAnswer } from "./formatGenderAnswer";
import { assessmentOptionLabel } from "./assessmentOptionLabel";
import { AssessmentBmiCard } from "./AssessmentBmiCard";
import { AssessmentWeightTrend, formatAssessmentWeight } from "./AssessmentWeightComparison";
import type { WeightUnit } from "./measurement-units";
import { personalDetailIcons } from "./personalDetailIcons";

function AnswerValue({ field, answers, weightUnit }: { field: FormField; answers: FormAnswers; weightUnit?: WeightUnit }) {
  const value = answers[field.id];
  const empty = value === null || value === undefined || value === "" || typeof value === "string" && !value.trim();
  const display = empty ? "Not answered" : Array.isArray(value)
    ? value.length ? value.map(id => assessmentOptionLabel(field, id)).join(", ") : "None"
    : weightUnit && typeof value === "number" ? formatAssessmentWeight(value, weightUnit)
      : field.options?.some(option => option.id === value) ? assessmentOptionLabel(field, String(value)) : field.id === "gender" && typeof value === "string" ? formatGenderAnswer(value) : String(value);
  const unit = weightUnit ?? field.unit;
  const error = assessmentFieldError(field, value);
  const choiceIds = Array.isArray(value) ? value : typeof value === "string" && field.options?.some(option => option.id === value) ? [value] : [];
  const visualChoices = choiceIds.map(id => ({ id, label: assessmentOptionLabel(field, id), icon: assessmentOptionIcon(field.id, id) }));

  return <span className={`min-w-0 break-words ${error ? "text-destructive" : ""}`}>
    {visualChoices.some(choice => choice.icon) ? <span className="flex flex-wrap gap-2">{visualChoices.map(choice => <span key={choice.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 py-1 pl-1 pr-2.5 text-sm font-medium"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-5" aria-hidden="true">{choice.icon}</span><span className="break-words">{choice.label}</span></span>)}</span> : <>{display}{unit && !empty && ` ${unit}`}</>}
    {error && error !== "Required" && <span className="block text-sm">{error}</span>}
  </span>;
}

function AnswerItem({ field, answers, spanColumns = false, icon: Icon, weightUnit, label = field.label }: { field: FormField; answers: FormAnswers; spanColumns?: boolean; icon?: LucideIcon; weightUnit?: WeightUnit; label?: string }) {
  return <div className={`min-w-0 space-y-1.5 ${spanColumns ? "@min-[28rem]:col-span-2" : ""}`} data-review-answer={field.id}>
    <dt className="flex min-w-0 items-center gap-2 break-words text-sm text-muted-foreground">{Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />}<span>{label}{field.required && " *"}</span></dt>
    <dd className="min-w-0 text-sm font-medium text-foreground"><AnswerValue field={field} answers={answers} weightUnit={weightUnit} /></dd>
  </div>;
}

function weightChangeLabel(previous: FormAnswers[string] | undefined, current: FormAnswers[string] | undefined, unit: WeightUnit) {
  if (typeof previous !== "number" || typeof current !== "number") return "Add both weights to see the change";
  const change = calculateAssessmentWeightChange(previous, current);
  if (change === null) return "Add both weights to see the change";
  const difference = current - previous;
  if (difference === 0) return "No weight change";
  const amount = formatAssessmentWeight(Math.abs(difference), unit);
  return `${amount} ${unit} ${difference > 0 ? "gain" : "loss"} (${Math.abs(change).toFixed(1)}%)`;
}

function DietaryAnswers({ fields, answers, weightUnit, assessmentDate }: { fields: FormField[]; answers: FormAnswers; weightUnit: WeightUnit; assessmentDate?: string }) {
  const visible = fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers));
  const byId = new Map(visible.map(field => [field.id, field]));
  const previousWeight = byId.get("previous_weight_kg");
  const sixMonthWeight = byId.get("weight_six_months_kg");
  const current = answers.current_weight_kg;
  const parts = [
    { title: "Dietary intake", ids: ["dietary_intake"] },
    { title: "Symptoms", ids: ["dietary_symptoms"] },
    { title: "Daily activity", ids: ["functional_capacity"] },
    { title: "Stress level", ids: ["stress_level"] },
    { title: "Fluid intake", ids: ["fluid_intake"] },
  ];
  const shown = new Set(["previous_weight_kg", "weight_six_months_kg", ...parts.flatMap(part => part.ids)]);

  return <div className="@container min-w-0 divide-y divide-border/70">
    <section className="min-w-0 pb-4" data-review-dietary-part="Weight comparison">
      <h4 className="mb-3 text-sm font-semibold text-foreground">Weight comparison</h4>
      <dl className="grid min-w-0 gap-4 @min-[28rem]:grid-cols-2">
        {previousWeight && <AnswerItem field={previousWeight} answers={answers} weightUnit={weightUnit} label={sixMonthWeight ? "Weight 1 month ago" : undefined} />}
        {sixMonthWeight && <AnswerItem field={sixMonthWeight} answers={answers} weightUnit={weightUnit} />}
        <div className={`min-w-0 space-y-1.5 ${sixMonthWeight ? "@min-[28rem]:col-span-2" : ""}`}><dt className="text-sm text-muted-foreground">Current weight</dt><dd className="text-sm font-medium">{typeof current === "number" && Number.isFinite(current) && current > 0 ? `${formatAssessmentWeight(current, weightUnit)} ${weightUnit}` : "Not answered"}<span className="block text-xs font-normal text-muted-foreground">From Personal details</span></dd></div>
        <div className={`min-w-0 space-y-1.5 ${sixMonthWeight ? "" : "@min-[28rem]:col-span-2"}`}><dt className="text-sm text-muted-foreground">{sixMonthWeight ? "Change over 1 month" : "Change over 1–2 months"}</dt><dd className="text-sm font-semibold text-foreground">{weightChangeLabel(answers.previous_weight_kg, current, weightUnit)}</dd></div>
        {sixMonthWeight && <div className="min-w-0 space-y-1.5"><dt className="text-sm text-muted-foreground">Change over 6 months</dt><dd className="text-sm font-semibold text-foreground">{weightChangeLabel(answers.weight_six_months_kg, current, weightUnit)}</dd></div>}
      </dl>
      {sixMonthWeight && <AssessmentWeightTrend answers={answers} unit={weightUnit} assessmentDate={assessmentDate} />}
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

export function AssessmentVerificationAnswers({ sectionId, fields, answers, assessmentDate, weightUnit = "kg" }: {
  sectionId: string; fields: FormField[]; answers: FormAnswers; assessmentDate?: string; weightUnit?: WeightUnit;
}) {
  if (sectionId === "dietary_details") return <DietaryAnswers fields={fields} answers={answers} assessmentDate={assessmentDate} weightUnit={weightUnit} />;

  return <div className="@container min-w-0 divide-y divide-border/70">{assessmentFieldGroups(fields, answers).map(group => {
    const visible = group.filter(field => field.kind !== "calculated");
    if (!visible.length) return null;
    return <dl key={group[0]!.id} data-review-question-group={group[0]!.id} className="grid min-w-0 gap-4 py-4 first:pt-0 last:pb-0 @min-[28rem]:grid-cols-2">
      {visible.map(field => <AnswerItem key={field.id} field={field} answers={answers} weightUnit={field.id === "current_weight_kg" ? weightUnit : undefined} icon={sectionId === "personal_details" ? personalDetailIcons[field.id] : undefined} spanColumns={field.kind === "multi_select" || field.id === "treatment_status" || group[0]!.id === "current_cancer_treatment" && field.id === "current_cancer_treatment"} />)}
    </dl>;
  })}{sectionId === "personal_details" && fields.some(field => field.id === "bmi") && <div className="pt-4"><AssessmentBmiCard answers={answers} showAnchor={false} /></div>}</div>;
}
