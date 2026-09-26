import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Link } from "react-router-dom";

type OverviewStatCardProps = {
  label: string;
  value: number | null;
  icon: LucideIcon;
  detail: string;
  to?: string;
  tone?: "primary" | "alert";
  trend?: { change: number; percent: number | null; increaseIsGood: boolean };
};

export function OverviewStatCard({ label, value, icon: Icon, detail, to, tone = "primary", trend }: OverviewStatCardProps) {
  const Direction = trend?.change === 0 ? Minus : trend && trend.change < 0 ? ArrowDown : ArrowUp;
  const trendColor = !trend || trend.change === 0 ? "text-muted-foreground" : (trend.change > 0) === trend.increaseIsGood ? "text-success" : "text-destructive";
  const content = <>
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl sm:size-14 sm:rounded-2xl ${tone === "alert" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`} aria-hidden="true"><Icon className="size-5 sm:size-7" strokeWidth={2.25} /></span>
    <span className="min-w-0 self-stretch border-l border-border/70 pl-2 sm:pl-4">
      <span className="block text-xs font-medium leading-tight text-muted-foreground sm:text-sm">{label}</span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <strong className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-3xl">{value ?? "—"}</strong>
        {trend && <span className={`inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums ${trendColor}`} aria-label={`${trend.change > 0 ? "Up" : trend.change < 0 ? "Down" : "No change"} ${trend.percent === null ? Math.abs(trend.change) : `${Math.abs(trend.percent)} percent`}`}><Direction className="size-4" aria-hidden="true" />{trend.percent === null ? Math.abs(trend.change) : `${Math.abs(trend.percent)}%`}</span>}
      </span>
      {detail && <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>}
    </span>
  </>;
  const className = "surface flex min-h-28 min-w-0 items-center gap-2 p-3 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:gap-4 sm:p-4";
  return to ? <Link to={to} className={`${className} hover:bg-primary/5`}>{content}</Link> : <div className={className}>{content}</div>;
}
