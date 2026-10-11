import { Drumstick, Egg, Leaf, Sprout, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  vegetarian: Sprout,
  non_vegetarian: Drumstick,
  eggetarian: Egg,
  jain: Leaf,
};

export function DietaryPreferenceIcon({ type }: { type: string }) {
  const Icon = icons[type];
  return Icon ? <Icon data-dietary-preference-icon={type} className="size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null;
}
