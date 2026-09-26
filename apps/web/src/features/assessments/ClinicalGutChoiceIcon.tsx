import type { ReactNode } from "react";
import {
  ArrowLeftRight, CircleCheck,
  Bubbles, CalendarDays, CircleMinus, Clock3, Flame, Frown, Timer,
  Utensils, UtensilsCrossed, Waves, type LucideIcon,
} from "lucide-react";

/** Decorative cues for appetite and gut choices; the labels carry the clinical meaning. */
const icons: Record<string, LucideIcon> = {
  appetite_status_normal: Utensils,
  appetite_status_no_appetite: UtensilsCrossed,
  gastrointestinal_symptoms_bloating: Bubbles,
  gastrointestinal_symptoms_acidity_reflux: Flame,
  gastrointestinal_symptoms_nausea: Frown,
  gastrointestinal_symptoms_early_satiety: Timer,
  normal: CircleCheck,
  constipation: Clock3,
  diarrhoea: Waves,
  alternating: ArrowLeftRight,
  daily: CalendarDays,
  __none__: CircleMinus,
};

const drawings: Record<string, ReactNode> = {
  appetite_status_reduced: <>
    <path d="M3 3v6m3-6v6M3 9h3M4.5 9v12" />
    <circle cx="16" cy="12" r="5" />
    <path d="M16 7v10" />
    <path d="M16 7a5 5 0 0 0 0 10Z" fill="currentColor" fillOpacity="0.22" stroke="none" />
  </>,
  below_3_week: <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M7 3v4M17 3v4M3 9h18" />
    <circle cx="9" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="15" cy="16.5" r="1.25" fill="currentColor" stroke="none" />
  </>,
  above_3_week: <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M7 3v4M17 3v4M3 9h18" />
    {[[8, 12.5], [12, 12.5], [16, 12.5], [8, 16.5], [12, 16.5]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill="currentColor" stroke="none" />)}
  </>,
  gastrointestinal_symptoms_vomiting: <>
    <path d="M3 20v-4a7 7 0 1 1 11.8-5.1L16 12l-2.5 1.5v2A2.5 2.5 0 0 1 11 18H9v2" />
    <circle cx="11.5" cy="9" r="0.7" fill="currentColor" stroke="none" />
    <path d="M14 15.5c1 0 1.3 1 2.5 1s1.5 1 2.5 1 1.5 1 2 2" />
    <path d="M16 19c1 .2 1.5 1 2 1.5" />
  </>,
  gastrointestinal_symptoms_taste_changes: <>
    <path d="M3 12c2.5-2.6 5.5-3.8 9-3.8s6.5 1.2 9 3.8c-2.5 3-5.5 4.8-9 4.8S5.5 15 3 12Z" />
    <path d="M3 12c4 1.8 14 1.8 18 0" />
    <path d="m18 3 .5 1.5L20 5l-1.5.5L18 7" />
  </>,
  gastrointestinal_symptoms_dysphagia: <>
    <path d="M3 6c2.5-2 5.5-3 9-3s6.5 1 9 3c-2.5 2.5-5.5 4-9 4S5.5 8.5 3 6Z" />
    <path d="M3 6h18" />
    <path d="M12 11v5m-2-2 2 2 2-2" />
    <path d="M7 20h10" />
  </>,
  gastrointestinal_symptoms_pain_while_eating: <>
    <path d="M4 3v6m3-6v6M4 9h3m-1.5 0v12" />
    <path d="m17 3-5 9h5l-3 9 7-11h-5l1-7Z" />
  </>,
  gastrointestinal_symptoms_mouth_ulcers: <>
    <path d="M3 11.5C5.5 9 8.5 8 12 8s6.5 1 9 3.5C19 15.4 16 18 12 18s-7-2.6-9-6.5Z" />
    <path d="M3 11.5c4.5 2.1 13.5 2.1 18 0" />
    <circle cx="14.5" cy="15.4" r="2" />
    <circle cx="14.5" cy="15.4" r="0.65" fill="currentColor" stroke="none" />
  </>,
};

export function ClinicalGutChoiceIcon({ type }: { type: string }) {
  if (drawings[type]) return <svg data-clinical-gut-choice-icon={type} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0" aria-hidden="true">{drawings[type]}</svg>;
  const Icon = icons[type];
  return Icon ? <Icon data-clinical-gut-choice-icon={type} className="size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null;
}
