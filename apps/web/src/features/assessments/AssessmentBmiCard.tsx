import { calculateAssessmentBmi, type FormAnswers } from "@niq/application-contracts";

const reference = [
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

function arcPoint(value: number, radius = 89): [number, number] {
  const angle = Math.PI * (1 - (value - 10) / 30);
  return [120 + radius * Math.cos(angle), 108 - radius * Math.sin(angle)];
}

function arcPath(start: number, end: number): string {
  const [x1, y1] = arcPoint(start);
  const [x2, y2] = arcPoint(end);
  return `M ${x1} ${y1} A 89 89 0 0 1 ${x2} ${y2}`;
}

export function AssessmentBmiCard({ answers }: { answers: FormAnswers }) {
  const bmi = typeof answers.height_cm === "number" && typeof answers.current_weight_kg === "number"
    ? calculateAssessmentBmi(answers.height_cm, answers.current_weight_kg) : null;
  const adult = typeof answers.age === "number" && answers.age >= 20;
  const category = bmi !== null && adult ? adultBmiCategory(bmi) : null;
  const position = bmi === null ? null : arcPoint(Math.max(10, Math.min(40, bmi)));

  return <section id="assessment-field-bmi" tabIndex={-1} aria-label="Body mass index" className="col-[1/-1] min-w-0 rounded-xl border border-border bg-primary/5 p-4 sm:p-5">
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">Body mass index</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <strong className="text-4xl font-semibold tracking-tight tabular-nums">{bmi === null ? "—" : bmi.toFixed(1)}</strong>
          {bmi !== null && <span className="text-sm text-muted-foreground">kg/m²</span>}
        </div>
        {category && <p className="mt-2 text-sm font-semibold">{category} <span className="font-normal text-muted-foreground">· Adult reference</span></p>}
        {bmi === null && <p className="mt-2 text-sm text-muted-foreground">Enter height and current weight to calculate BMI.</p>}
        {bmi !== null && !adult && <p className="mt-2 text-sm text-muted-foreground">Adult BMI categories do not apply under age 20.</p>}
        {category && <p className="mt-2 text-xs text-muted-foreground">BMI is a screening tool, not a diagnosis. Consider other health information too.</p>}
      </div>
      {adult && <svg viewBox="0 0 240 122" className="mx-auto w-full max-w-64" aria-hidden="true">
        {reference.map(band => <path key={band.label} d={arcPath(band.min, band.max)} fill="none" stroke={band.color} strokeWidth="15" />)}
        {position && <><circle cx={position[0]} cy={position[1]} r="10" fill="white" stroke="var(--foreground)" strokeWidth="2.5" /><circle cx={position[0]} cy={position[1]} r="3" fill="var(--foreground)" /></>}
        <text x="31" y="121" fontSize="10" fill="var(--muted-foreground)">10</text>
        <text x="194" y="121" fontSize="10" fill="var(--muted-foreground)">40+</text>
      </svg>}
    </div>
    {adult && <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs sm:grid-cols-4">
      {reference.map(band => <div key={band.label} className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: band.color }} /><span className="truncate">{band.label}</span><span className="ml-auto shrink-0 text-muted-foreground">{band.range}</span></div>)}
    </div>}
  </section>;
}
