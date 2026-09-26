import type { Patient } from "@niq/application-contracts";
import { CircleHelp, Mars, UserRound, Venus, type LucideIcon } from "lucide-react";

const genderIcons: Record<Patient["gender"], LucideIcon> = {
  FEMALE: Venus,
  MALE: Mars,
  OTHER: UserRound,
  UNKNOWN: CircleHelp,
};

export function PatientGenderIcon({ gender }: { gender: string }) {
  const Icon = genderIcons[gender as Patient["gender"]] ?? CircleHelp;
  return <Icon className="size-4" aria-hidden="true" />;
}
