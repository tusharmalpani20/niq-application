import { useId, type ReactNode } from "react";
import { calculateAssessmentWeightChange, type FormAnswers } from "@niq/application-contracts";
import { kgToPounds, type WeightUnit } from "./measurement-units";

export const formatAssessmentWeight = (value: number, unit: WeightUnit) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(unit === "lb" ? kgToPounds(value) : value);

function isValidWeight(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function AssessmentWeightTrend({ answers, unit = "kg", assessmentDate }: { answers: FormAnswers; unit?: WeightUnit; assessmentDate?: string }) {
  const gradientId = useId();
  const { weight_six_months_kg: sixMonthsAgo, previous_weight_kg: oneMonthAgo, current_weight_kg: current } = answers;
  if (!isValidWeight(sixMonthsAgo) || !isValidWeight(oneMonthAgo) || !isValidWeight(current)) return null;

  const lowest = Math.min(sixMonthsAgo, oneMonthAgo, current);
  const highest = Math.max(sixMonthsAgo, oneMonthAgo, current);
  const padding = Math.max(1, (highest - lowest) * 0.2);
  const lower = Math.max(0, Math.floor(lowest - padding));
  const upper = Math.ceil(highest + padding);
  const left = 48, right = 480, top = 24, bottom = 128;
  const date = assessmentDate ? new Date(assessmentDate) : null;
  const dateLabel = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
  const points = ([
    { label: "6 months ago", axisLabel: "6 mo ago", monthsAgo: 6, kg: sixMonthsAgo, anchor: "start" },
    { label: "1 month ago", axisLabel: "1 mo ago", monthsAgo: 1, kg: oneMonthAgo, anchor: "end" },
    { label: dateLabel ? `Current weight (${dateLabel})` : "Current weight", axisLabel: dateLabel ?? "Current", monthsAgo: 0, kg: current, anchor: "end" },
  ] as const).map(point => ({
    ...point,
    x: right - point.monthsAgo / 6 * (right - left),
    y: top + (upper - point.kg) / (upper - lower) * (bottom - top),
    value: `${formatAssessmentWeight(point.kg, unit)} ${unit}`,
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");

  return <figure className="surface mt-4 overflow-hidden p-4 sm:p-5">
    <figcaption className="font-semibold">Weight trend</figcaption>
    <svg className="mt-3 block max-h-56 w-full text-foreground" viewBox="0 0 500 156" role="img"
      aria-label={`Weight trend. ${points.map(point => `${point.label}: ${point.value}`).join(", ")}`}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="var(--primary)" stopOpacity=".2" />
        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
      </linearGradient></defs>
      {[top, (top + bottom) / 2, bottom].map(y => <line key={y} x1={left} x2={right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 5" />)}
      <text x={left - 10} y={top + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{formatAssessmentWeight(upper, unit)}</text>
      <text x={left - 10} y={bottom + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{formatAssessmentWeight(lower, unit)}</text>
      <polygon points={`${left},${bottom} ${line} ${right},${bottom}`} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(({ label, axisLabel, monthsAgo, x, y, value, anchor }) => <g key={label}>
        <circle cx={x} cy={y} r={monthsAgo === 0 ? 6 : 4.5} fill={monthsAgo === 0 ? "var(--primary)" : "var(--card)"} stroke="var(--primary)" strokeWidth="2.5" />
        <text x={x} y={y - 12} textAnchor={anchor} fill="currentColor" fontSize="13" fontWeight="700">{value}</text>
        <text x={monthsAgo === 1 ? x - 8 : x} y="149" textAnchor={anchor} fill="var(--muted-foreground)" fontSize="12">{axisLabel}</text>
      </g>)}
    </svg>
  </figure>;
}

function WeightChangeCard({ previous, current, unit, period, fieldId }: {
  previous: FormAnswers[string] | undefined; current: number | null; unit: WeightUnit; period: "1 month" | "6 months"; fieldId?: string;
}) {
  const percent = typeof previous === "number" && current !== null ? calculateAssessmentWeightChange(previous, current) : null;
  const difference = percent !== null && typeof previous === "number" && current !== null ? current - previous : null;
  const change = difference === null ? null : difference === 0 ? "No change" : `${formatAssessmentWeight(Math.abs(difference), unit)} ${unit} ${difference > 0 ? "gain" : "loss"}`;
  const context = percent === null || difference === null
    ? current !== null ? `Enter weight from ${period} ago to see the change.` : "Enter current weight in Personal details to see the change."
    : difference === 0 ? `0 ${unit} (0%)` : `${Math.abs(percent).toFixed(1)}% ${difference > 0 ? "increase" : "decrease"} from earlier weight`;
  return <div id={fieldId} tabIndex={fieldId ? -1 : undefined} className="rounded-xl border border-primary/15 bg-primary/5 p-4" aria-live="polite" aria-atomic="true">
    <p className="text-sm font-medium text-muted-foreground">Change over {period}</p>
    {change && <p className="mt-1 text-2xl font-semibold leading-tight text-foreground">{change}</p>}
    <p className={`text-sm ${change ? "mt-1 text-muted-foreground" : "mt-2 font-medium text-foreground"}`}>{context}</p>
  </div>;
}

/** Compare measurements without implying that weight gain or loss is clinically good/bad. */
export function AssessmentWeightComparison({ answers, children, unit = "kg", showSixMonthChange = false, assessmentDate }: {
  answers: FormAnswers; children: ReactNode; unit?: WeightUnit; showSixMonthChange?: boolean; assessmentDate?: string;
}) {
  const weight = answers.current_weight_kg;
  const current = isValidWeight(weight) ? weight : null;
  return <section className="col-[1/-1] min-w-0" aria-label="Weight comparison">
    <h3 className="mb-4 text-base font-semibold">Weight comparison</h3>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-4">
      {children}
      <div className="space-y-2"><p className="flex min-h-9 items-center text-base font-medium">Current weight ({unit})</p><p className="flex min-h-12 items-center rounded-lg border border-border bg-muted/50 px-3 text-base">{current !== null ? `${formatAssessmentWeight(current, unit)} ${unit}` : "Not entered"}</p><p className="text-xs text-muted-foreground">From Personal details</p></div>
    </div>
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
      <WeightChangeCard previous={answers.previous_weight_kg} current={current} unit={unit} period="1 month" fieldId="assessment-field-weight_loss" />
      {showSixMonthChange && <WeightChangeCard previous={answers.weight_six_months_kg} current={current} unit={unit} period="6 months" />}
    </div>
    {showSixMonthChange && <AssessmentWeightTrend answers={answers} unit={unit} assessmentDate={assessmentDate} />}
  </section>;
}
