import {
  Activity, Atom, Bandage, Bone, CircleMinus, Droplets, Dumbbell, Fish,
  Heart, HeartPulse, Leaf, Pill, Shield, ShieldPlus, Sparkles, type LucideIcon,
} from "lucide-react";

/** Decorative cues for medication and supplement options; labels carry the meaning. */
const icons: Record<string, LucideIcon> = {
  current_medications_blood_thinners: Droplets,
  current_medications_anti_hypertensives: HeartPulse,
  current_medications_anti_diabetics: Activity,
  current_medications_thyroid: Atom,
  current_medications_cholesterols: Heart,
  current_medications_steroids: Pill,
  current_medications_anti_histamines: Shield,
  current_medications_pain_medications: Bandage,
  current_medications_antibiotics: ShieldPlus,
  current_medications_antacid: Pill,
  supplements_intake_protein: Dumbbell,
  supplements_intake_iron: Atom,
  supplements_intake_calcium: Bone,
  supplements_intake_folic_acid: Leaf,
  supplements_intake_multivitamins: Sparkles,
  supplements_intake_omega_3: Fish,
  __none__: CircleMinus,
};

export function MedicationSupplementIcon({ type }: { type: string }) {
  const Icon = icons[type];
  return Icon ? <Icon data-intake-choice-icon={type} className="size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" /> : null;
}
