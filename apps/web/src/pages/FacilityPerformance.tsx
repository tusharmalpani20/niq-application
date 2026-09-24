import type { FacilityPerformance as Performance } from "@niq/application-contracts";
import { Activity, ScanFace } from "lucide-react";
import { Link } from "react-router-dom";

type Trend = Performance["assessments"];
const monthLabel = (month: string) => new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

function PerformanceCard({ label, trend, to, icon: Icon }: { label: string; trend: Trend; to: string; icon: typeof Activity }) {
  const current = trend.months.at(-1)?.count ?? 0;
  const difference = trend.previous === null ? null : current - trend.previous.count;
  const maximum = Math.max(1, ...trend.months.map(item => item.count));
  const points = trend.months.map((item, index) => `${3 + index * 21},${44 - item.count / maximum * 40}`).join(" ");
  return <Link to={to} className="surface grid gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><Icon className="size-5 text-primary" aria-hidden="true" /></div>
    <div className="flex items-center justify-between gap-3"><strong className="text-3xl font-semibold tabular-nums">{current}</strong><svg role="img" aria-label={`${label}, last six months: ${trend.months.map(item => `${monthLabel(item.month)} ${item.count}`).join(", ")}`} viewBox="0 0 112 48" className="h-12 w-28 shrink-0 text-primary"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg></div>
    {trend.previous && <p className="text-xs text-muted-foreground"><span className="font-medium tabular-nums">{difference! > 0 ? "+" : difference! < 0 ? "−" : ""}{Math.abs(difference!)}</span> vs {monthLabel(trend.previous.through.slice(0, 7))} 1–{Number(trend.previous.through.slice(-2))} ({trend.previous.count})</p>}
  </Link>;
}

export function FacilityPerformance({ performance, facilityId }: { performance: Performance; facilityId: string }) {
  const month = performance.assessments.months.at(-1)?.month;
  return <section className="mt-6" aria-label="Facility performance">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold">This month</h2><p className="text-sm text-muted-foreground">Completed work at this facility</p></div><span className="text-xs text-muted-foreground">{month ? monthLabel(month) : "Current month"} to date · {performance.timezone}</span></div>
    <div className="grid gap-4 sm:grid-cols-2"><PerformanceCard label="Assessments completed" trend={performance.assessments} to={`/assessments?facility=${facilityId}`} icon={Activity} /><PerformanceCard label="Face scans completed" trend={performance.faceScans} to={`/assessments?facility=${facilityId}`} icon={ScanFace} /></div>
  </section>;
}
