import type { ReactNode } from "react";
import { calculateAssessmentBmi, calculateAssessmentWeightChange, type AssessmentScoreResult, type AssessmentScoreReviews, type FormAnswers, type FormField } from "@niq/application-contracts";
import { assessmentFieldGroups } from "./AssessmentFields";
import { TumourTypeIcon } from "./TumourTypeIcon";
import { CancerTypeIcon } from "./CancerTypeIcon";
import { DiseaseChoiceIcon } from "./DiseaseChoiceIcon";
import { TreatmentChoiceIcon } from "./TreatmentChoiceIcon";
import { MedicationSupplementIcon } from "./MedicationSupplementIcon";
import { HealthHistoryChoiceIcon } from "./HealthHistoryChoiceIcon";
import { ClinicalGutChoiceIcon } from "./ClinicalGutChoiceIcon";
import { DietaryIntakeIcon } from "./DietaryIntakeIcon";
import { DietaryStatusIcon } from "./DietaryStatusIcon";
import { DietarySymptomIcon } from "./DietarySymptomIcon";
import { formatGenderAnswer } from "./formatGenderAnswer";

const diseaseFields = new Set(["stage", "metastasis_site", "relapse_status"]);
const treatmentFields = new Set(["treatment_status", "palliative_status", "palliative_timing", "cancer_surgical_status", "current_cancer_treatment"]);
const clinicalGutFields = new Set(["appetite_status", "gastrointestinal_symptoms", "bowel_pattern", "stool_frequency"]);
const dietaryStatusFields = new Set(["functional_capacity", "stress_level", "fluid_intake"]);

/** Use the same option drawings as the editor; labels remain the source of meaning. */
function answerIcon(fieldId: string, optionId: string): ReactNode {
  if (fieldId === "tumour_type") return <TumourTypeIcon type={optionId} />;
  if (fieldId === "cancer_type") return <CancerTypeIcon type={optionId} />;
  if (diseaseFields.has(fieldId)) return <DiseaseChoiceIcon type={optionId} />;
  if (treatmentFields.has(fieldId)) return <TreatmentChoiceIcon type={optionId} />;
  if (fieldId === "current_medications" || fieldId === "supplements_intake") return <MedicationSupplementIcon type={optionId} />;
  if (fieldId === "co_morbidities" || fieldId === "previous_surgeries" || fieldId === "family_history_cancer") return <HealthHistoryChoiceIcon type={optionId} />;
  if (clinicalGutFields.has(fieldId)) return <ClinicalGutChoiceIcon type={optionId} />;
  if (fieldId === "dietary_intake") return <DietaryIntakeIcon type={optionId} />;
  if (fieldId === "dietary_symptoms") return <DietarySymptomIcon type={optionId} />;
  if (dietaryStatusFields.has(fieldId)) return <DietaryStatusIcon type={optionId} />;
  return null;
}

function scoredAnswer(field: FormField, answers: FormAnswers, item?: AssessmentScoreResult["components"][number], derived?: AssessmentScoreResult["derived"]): string {
  if (field.kind === "calculated") {
    if (field.id === "protein_intake") {
      if (derived?.proteinAdequacy === "adequate") return "Adequate";
      if (derived?.proteinAdequacy === "inadequate") return "Inadequate";
      return "Not available in saved score";
    }
    if (field.id === "bmi") {
      const height = answers.height_cm;
      const weight = answers.current_weight_kg;
      const value = typeof height === "number" && typeof weight === "number" ? calculateAssessmentBmi(height, weight) : null;
      return value === null ? "Not available" : value.toFixed(1);
    }
    if (field.id === "weight_loss") {
      const previous = answers.previous_weight_kg;
      const current = answers.current_weight_kg;
      const value = typeof previous === "number" && typeof current === "number" ? calculateAssessmentWeightChange(previous, current) : null;
      return value === null ? "Not available" : value === 0 ? "No change" : `${Math.abs(value).toFixed(1)}% ${value > 0 ? "loss" : "gain"}`;
    }
    return item?.status === "answered" ? "Calculated from assessment answers" : "Not available";
  }
  const raw = answers[field.id];
  if (raw === undefined || raw === null || raw === "") return "Not answered";
  if (Array.isArray(raw)) return raw.length ? raw.map(value => field.options?.find(option => option.id === value)?.label ?? value).join(", ") : "None";
  const label = field.options?.find(option => option.id === raw)?.label
    ?? (field.id === "gender" && typeof raw === "string" ? formatGenderAnswer(raw) : String(raw));
  return field.unit ? `${label} ${field.unit}` : label;
}

const points = (value: number | null) => value === null ? "—" : `${value} ${value === 1 ? "pt" : "pts"}`;

export function AssessmentScoredAnswers({ fields, answers, components, derived, reviewedItems, revised }: {
  fields: FormField[];
  answers: FormAnswers;
  components: AssessmentScoreResult["components"];
  derived?: AssessmentScoreResult["derived"];
  reviewedItems?: AssessmentScoreReviews["sections"][number]["items"];
  revised: boolean;
}) {
  return <div className="@container" data-score-answer-groups>
    {assessmentFieldGroups(fields, answers).map(group => <div key={group[0]!.id} data-score-group={group[0]!.id} className="grid gap-x-6 gap-y-4 border-b border-border py-4 last:border-b-0 @min-[36rem]:grid-cols-2">
      {group.map(field => {
        const item = components.find(component => component.id === field.id);
        const reviewed = reviewedItems?.find(row => row.id === field.id);
        const raw = answers[field.id];
        const selected = field.kind === "multi_select" && Array.isArray(raw) ? raw : null;
        const selectedOption = field.kind === "select" && typeof raw === "string" ? raw : null;
        const icon = selectedOption ? answerIcon(field.id, selectedOption) : null;
        const treatmentWithBothFollowUps = field.id === "treatment_status" && group.some(item => item.id === "palliative_status") && group.some(item => item.id === "palliative_timing");
        return <div key={field.id} data-score-field={field.id} className={`min-w-0 ${group.length === 1 || field.kind === "multi_select" || treatmentWithBothFollowUps ? "@min-[36rem]:col-span-2" : ""}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-medium text-foreground">{field.label}</p>
            {item && <p className="text-xs tabular-nums text-muted-foreground">{revised ? "NIQ " : ""}{points(item.points)}</p>}
          </div>
          {selected ? <div className="mt-2 flex flex-wrap gap-2">{(selected.length ? selected : ["__none__"]).map(optionId => {
            const optionIcon = answerIcon(field.id, optionId);
            const label = optionId === "__none__" ? "None" : field.options?.find(option => option.id === optionId)?.label ?? optionId;
            return <span key={optionId} className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm text-foreground">
              {optionIcon && <span className="shrink-0 text-primary" aria-hidden="true">{optionIcon}</span>}<span className="break-words">{label}</span>
            </span>;
          })}</div> : icon ? <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 py-1.5 pl-1.5 pr-3 text-sm text-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">{icon}</span><span className="break-words">{scoredAnswer(field, answers, item, derived)}</span>
          </div> : <p className={`mt-1 break-words text-sm ${raw === undefined || raw === null || raw === "" ? "text-muted-foreground" : "text-foreground"}`}>{scoredAnswer(field, answers, item, derived)}</p>}
          {field.id === "dietary_intake" && <p className="mt-1 text-xs text-muted-foreground">Used to derive protein intake · No separate points</p>}
          {item?.status === "pending" && <p className="mt-1 text-xs text-muted-foreground">{item.reason || "More information needed"}</p>}
          {revised && reviewed?.reviewedPoints !== null && reviewed?.reviewedPoints !== undefined && <p className="mt-1 text-xs font-medium text-brand-ink">Reviewed {points(reviewed.reviewedPoints)}{reviewed.overridden ? " · Adjusted" : ""}</p>}
        </div>;
      })}
    </div>)}
  </div>;
}
