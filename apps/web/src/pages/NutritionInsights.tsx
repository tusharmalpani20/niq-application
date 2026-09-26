import type { ComponentType } from "react";
import { HeartPulse, Lightbulb, MessageCircle, Utensils } from "lucide-react";
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

function insightsFor(risk: Risk): Insight[] {
  const { categories, categories30DaysAgo: previous } = risk;
  const previousTotal = previous.low + previous.moderate + previous.high;
  const atRisk = categories.moderate + categories.high;
  const previousAtRisk = previous.moderate + previous.high;
  const atRiskPercent = risk.assessedPatients ? Math.round(atRisk / risk.assessedPatients * 100) : 0;
  const previousAtRiskPercent = previousTotal ? Math.round(previousAtRisk / previousTotal * 100) : null;
  const riskChange = previousAtRiskPercent === null ? null : atRiskPercent - previousAtRiskPercent;
  const protein = risk.nutrition.protein;
  const barrier = risk.nutrition.eatingBarrier;

  return [
    {
      title: `${atRisk} of ${countLabel(risk.assessedPatients, "scored patient", "scored patients")} (${atRiskPercent}%) at nutritional risk`,
      detail: riskChange === null
        ? "Moderate or high NIQ category. No comparable scored patients 30 days ago."
        : `Moderate or high NIQ category. ${riskChange === 0 ? "Unchanged" : `${Math.abs(riskChange)} percentage points ${riskChange > 0 ? "higher" : "lower"}`} vs 30 days ago.`,
      icon: HeartPulse,
      color: "bg-rose-50 text-rose-600",
    },
    {
      title: protein.assessed
        ? `${protein.inadequate} of ${protein.assessed} patients had inadequate protein intake`
        : "Protein intake results not yet available",
      detail: protein.assessed
        ? `${Math.round(protein.inadequate / protein.assessed * 100)}% of patients with a protein result on their latest final assessment.`
        : "Shown when a completed assessment has a protein adequacy result.",
      icon: Utensils,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      title: barrier.top
        ? `Most reported eating barrier: ${barrier.top.label}`
        : barrier.assessed ? "No eating barriers reported by at-risk patients" : "Eating barrier data not yet available",
      detail: barrier.top
        ? `Reported by ${barrier.top.count} of ${countLabel(barrier.assessed, "at-risk patient", "at-risk patients")} who answered the dietary symptoms question.`
        : barrier.assessed ? `${countLabel(barrier.assessed, "at-risk patient answered", "at-risk patients answered")} the dietary symptoms question.`
          : "Shown when patients with moderate or high NIQ risk report dietary symptoms.",
      icon: MessageCircle,
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
        <p className="mt-1 text-xs text-muted-foreground">Latest completed assessment for each patient</p>
      </div>
      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Risk vs 30 days ago</span>
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
