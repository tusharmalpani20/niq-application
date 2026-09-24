import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import type { MonthlyTrend } from "./monthly-trend";

function TrendLine({ label, trend }: { label: string; trend: MonthlyTrend }) {
  const values = trend.months.map(item => item.count);
  const maximum = Math.max(...values, 0);
  const points = values.map((value, index) => {
    const x = 3 + index * 106 / 5;
    const y = maximum === 0 ? 24 : 45 - value / maximum * 42;
    return `${x},${y}`;
  }).join(" ");
  const description = trend.months.map((item, index) => `${item.month.toLocaleDateString(undefined, { month: "short", year: "numeric" })}: ${item.count}${index === 5 ? " to date" : ""}`).join(", ");
  return <svg role="img" aria-label={`${label}, monthly totals for the last six months: ${description}`} viewBox="0 0 112 48" className="h-12 w-28 shrink-0 text-primary">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function MonthlyTrendCard({ label, to, icon: Icon, trend }: { label: string; to: string; icon: LucideIcon; trend: MonthlyTrend | null }) {
  const current = trend?.months[5]?.count;
  const previous = trend?.previous;
  const difference = previous && current !== undefined ? current - previous.count : null;
  const Direction = difference === null || difference === 0 ? Minus : difference > 0 ? ArrowUpRight : ArrowDownRight;
  const period = previous && trend ? `${previous.through.toLocaleDateString(undefined, { month: "short" })} 1–${previous.through.getDate()}${previous.through.getFullYear() !== trend.months[5]?.month.getFullYear() ? `, ${previous.through.getFullYear()}` : ""}` : "";
  return <Link to={to} className="surface grid gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><Icon className="size-5 text-primary" aria-hidden="true" /></div>
    <div className="flex items-center justify-between gap-3"><strong className="text-3xl font-semibold tracking-tight tabular-nums">{current ?? "—"}</strong>{trend && <TrendLine label={label} trend={trend} />}</div>
    {difference !== null && <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Direction className="size-3.5" aria-hidden="true" /><span className="font-medium tabular-nums">{difference > 0 ? "+" : difference < 0 ? "−" : ""}{Math.abs(difference)}</span><span>vs {period}{previous?.count === 0 ? " (0)" : ""}</span></span>}
  </Link>;
}
