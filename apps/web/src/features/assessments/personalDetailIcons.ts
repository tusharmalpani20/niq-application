import { CalendarDays, Phone, Ruler, UserRound, UsersRound, Weight, type LucideIcon } from "lucide-react";

export const personalDetailIcons: Record<string, LucideIcon> = {
  patient_name: UserRound,
  age: CalendarDays,
  gender: UsersRound,
  contact: Phone,
  height_cm: Ruler,
  current_weight_kg: Weight,
};
