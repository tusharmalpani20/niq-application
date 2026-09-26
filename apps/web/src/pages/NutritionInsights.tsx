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
  const protein = risk.nutrition.protein;
  const barrier = risk.nutrition.eatingBarrier;

  return [
    {
      title: "At nutritional risk",
      detail: `${atRisk} of ${countLabel(risk.assessedPatients, "patient", "patients")} (${atRiskPercent}%) · ${previousAtRiskPercent === null ? "no 30-day comparison yet" : `${previousAtRiskPercent}% 30 days ago`}`,
      icon: HeartPulse,
      color: "bg-rose-50 text-rose-600",
    },
    {
      title: "Low protein intake",
      detail: protein.assessed
        ? `${protein.inadequate} of ${countLabel(protein.assessed, "patient", "patients")} with protein results`
        : "No protein results yet",
      icon: Utensils,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      title: "Top eating symptom",
      detail: barrier.top
        ? `${barrier.top.label} · ${barrier.top.count} of ${countLabel(barrier.assessed, "at-risk patient", "at-risk patients")}`
        : barrier.assessed ? `None reported by ${countLabel(barrier.assessed, "at-risk patient", "at-risk patients")}`
          : "No symptom data from at-risk patients yet",
      icon: MessageCircle,
      color: "bg-teal-50 text-teal-600",
    },
  ];
}

export function NutritionInsights({ risk }: { risk: Risk | null }) {
  const hasCurrentScores = (risk?.assessedPatients ?? 0) > 0;
  const insights = risk && hasCurrentScores ? insightsFor(risk) : [];

  return <div className="surface flex min-w-0 flex-col p-5" aria-label="Key nutrition insights">
    <div>
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-5 text-primary" aria-hidden="true" />Key nutrition insights</h2>
        <p className="mt-1 text-xs text-muted-foreground">Latest completed result per patient</p>
      </div>
    </div>
    {!risk ? <p className="mt-5 text-sm text-muted-foreground">Nutrition insights are unavailable right now.</p>
      : insights.length ? <div className="mt-4 rounded-2xl border border-border px-4">
        <ul className="divide-y divide-border">{insights.map(({ title, detail, icon: Icon, color }) => <li key={title} className="flex items-start gap-3 py-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="size-5" aria-hidden={true} /></span>
          <span className="min-w-0"><strong className="block text-sm font-semibold leading-snug">{title}</strong><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span></span>
        </li>)}</ul>
      </div> : <div className="mt-4 flex flex-1 items-center gap-3 rounded-2xl border border-border p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600"><Lightbulb className="size-5" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold">No completed NIQ results yet</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Insights will appear after an assessment is completed.</p></div>
      </div>}
  </div>;
}
