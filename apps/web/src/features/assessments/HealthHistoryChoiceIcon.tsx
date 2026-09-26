import { Activity, Brain, CircleMinus, Droplets, Gauge, Heart, HeartPulse, Scissors, UsersRound, type LucideIcon } from "lucide-react";
import { CancerTypeIcon } from "./CancerTypeIcon";

/** Decorative health-history cues; clinical meaning comes from each choice label. */
const icons: Record<string, LucideIcon> = {
  co_morbidities_diabetes: Droplets,
  co_morbidities_hypertension: HeartPulse,
  co_morbidities_thyroid_disorder: Activity,
  co_morbidities_cardiac_disease: Heart,
  co_morbidities_high_cholesterol: Gauge,
  co_morbidities_psychological_disorders: Brain,
  previous_surgeries_yes: Scissors,
  previous_surgeries_no: CircleMinus,
  family_history_cancer_yes: UsersRound,
  family_history_cancer_no: CircleMinus,
  __none__: CircleMinus,
};

const sharedOrganIcons: Record<string, string> = {
  co_morbidities_kidney_disease: "cancer_15",
  co_morbidities_liver_disease: "cancer_5",
};

export function HealthHistoryChoiceIcon({ type }: { type: string }) {
  const organ = sharedOrganIcons[type];
  if (organ) return <span data-health-history-icon={type} className="inline-flex" aria-hidden="true"><CancerTypeIcon type={organ} /></span>;
  const Icon = icons[type];
  return Icon ? <Icon data-health-history-icon={type} className="size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" /> : null;
}
