import { GlassWater, Soup, TrendingDown, TrendingUp, Utensils, type LucideIcon } from "lucide-react";

/** Decorative cues only; the choice labels carry the dietary meaning. */
const icons: Record<string, LucideIcon> = {
  dietary_intake_normal: Utensils,
  dietary_intake_more_than_usual: TrendingUp,
  dietary_intake_reduced: TrendingDown,
  dietary_intake_liquid: GlassWater,
  dietary_intake_little_solid: Soup,
};

export function DietaryIntakeIcon({ type }: { type: string }) {
  if (type === "dietary_intake_tube_feeding") return <svg data-dietary-intake-icon={type} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0" aria-hidden="true">
    <path d="M9 3h6v7H9zM12 3V1M9 6h6M12 10v2c0 2 4 2 4 5v2" />
    <path d="M13 21h6M16 19v2" />
  </svg>;
  const Icon = icons[type];
  return Icon ? <Icon data-dietary-intake-icon={type} className="size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null;
}
