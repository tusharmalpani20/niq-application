import type { ComponentType } from "react";
import { HeartPulse, Lightbulb, ShieldCheck, TriangleAlert } from "lucide-react";
import { getOverviewRisk } from "../lib/api";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;
type Insight = {
  title: string;
  detail: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  color: string;
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function comparison(now: number, before: number, label: string) {
  if (now === before) return `The same ${label} count as 30 days ago.`;
  return `${Math.abs(now - before)} ${now > before ? "more" : "fewer"} than 30 days ago.`;
}

function insightsFor(risk: Risk): Insight[] {
  const { categories, categories30DaysAgo: previous } = risk;
  const previousTotal = previous.low + previous.moderate + previous.high;
  const atRisk = categories.moderate + categories.high;
  const previousAtRisk = previous.moderate + previous.high;
  const atRiskPercent = risk.assessedPatients ? Math.round(atRisk / risk.assessedPatients * 100) : 0;
  const previousAtRiskPercent = previousTotal ? Math.round(previousAtRisk / previousTotal * 100) : null;
  const riskChange = previousAtRiskPercent === null ? null : atRiskPercent - previousAtRiskPercent;

  return [
    {
      title: `${atRiskPercent}% of scored patients are at nutritional risk`,
      detail: riskChange === null
        ? `${countLabel(atRisk, "patient", "patients")} in moderate or high risk. No scored patients 30 days ago.`
        : `${countLabel(atRisk, "patient", "patients")} in moderate or high risk. ${riskChange === 0 ? "Unchanged" : `${Math.abs(riskChange)} percentage points ${riskChange > 0 ? "higher" : "lower"}`} vs 30 days ago.`,
      icon: HeartPulse,
      color: "bg-rose-50 text-rose-600",
    },
    {
      title: countLabel(categories.high, "patient is", "patients are") + " high risk",
      detail: comparison(categories.high, previous.high, "high-risk patient"),
      icon: TriangleAlert,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      title: countLabel(categories.low, "patient has", "patients have") + " a low-risk NIQ category",
      detail: comparison(categories.low, previous.low, "low-risk patient"),
      icon: ShieldCheck,
      color: "bg-teal-50 text-teal-600",
    },
  ];
}

export function NutritionInsights({ risk }: { risk: Risk | null }) {
  const hasCurrentScores = (risk?.assessedPatients ?? 0) > 0;
  const insights = risk && hasCurrentScores ? insightsFor(risk) : [];

  return <div className="surface flex min-w-0 flex-col p-5" aria-label="Key nutrition insights">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-5 text-primary" aria-hidden="true" />Key nutrition insights</h2>
        <p className="mt-1 text-xs text-muted-foreground">Latest final NIQ category for each patient</p>
      </div>
      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Now vs 30 days ago</span>
    </div>
    {!risk ? <p className="mt-5 text-sm text-muted-foreground">Nutrition insights are unavailable right now.</p>
      : insights.length ? <div className="mt-4 rounded-2xl border border-border px-4">
        <ul className="divide-y divide-border">{insights.map(({ title, detail, icon: Icon, color }) => <li key={title} className="flex items-start gap-3 py-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="size-5" aria-hidden={true} /></span>
          <span className="min-w-0"><strong className="block text-sm font-semibold leading-snug">{title}</strong><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span></span>
        </li>)}</ul>
      </div> : <div className="mt-4 flex flex-1 items-center gap-3 rounded-2xl border border-border p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600"><Lightbulb className="size-5" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold">No final NIQ categories yet</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Complete an assessment with a final NIQ category to see patient risk insights and 30-day comparisons.</p></div>
      </div>}
  </div>;
}
