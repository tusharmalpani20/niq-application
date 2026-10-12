export const adultBmiReference = [
  { label: "Underweight", min: 10, max: 18.5, color: "#5799c5", range: "<18.5" },
  { label: "Healthy weight", min: 18.5, max: 25, color: "#2a9d8f", range: "18.5–24.9" },
  { label: "Overweight", min: 25, max: 30, color: "#d49a3a", range: "25–29.9" },
  { label: "Obesity", min: 30, max: 40, color: "#bd6172", range: "≥30" },
] as const;

export function adultBmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy weight";
  if (bmi < 30) return "Overweight";
  return "Obesity";
}
