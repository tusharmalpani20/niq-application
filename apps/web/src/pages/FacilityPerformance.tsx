import type { FacilityPerformance as Performance } from "@niq/application-contracts";
import { Activity, ScanFace } from "lucide-react";
import { Link } from "react-router-dom";

type Trend = Performance["assessments"];
const monthLabel = (month: string) => new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

function UsageCard({ label, count, trend, to, icon: Icon }: { label: string; count: number; trend: Trend; to: string; icon: typeof Activity }) {
  const maximum = Math.max(1, ...trend.months.map(item => item.count));
  const points = trend.months.map((item, index) => `${3 + index * 21},${44 - item.count / maximum * 40}`).join(" ");
  return <Link to={to} className="surface flex min-h-40 flex-col justify-between gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{label}</span><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span></div>
    <div className="flex items-end justify-between gap-3"><div><strong className="block text-3xl font-semibold tabular-nums">{count}</strong><span className="text-xs text-muted-foreground">Past 30 days</span></div><div className="text-right"><span className="text-[11px] text-muted-foreground">6-month trend</span><svg role="img" aria-label={`${label}, monthly trend: ${trend.months.map(item => `${monthLabel(item.month)} ${item.count}`).join(", ")}`} viewBox="0 0 112 48" className="h-10 w-28 shrink-0 text-primary"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg></div></div>
  </Link>;
}

export function FacilityPerformance({ performance, facilityId }: { performance: Performance; facilityId: string }) {
  const categories = [
    { label: "Low risk", count: performance.risk.categories.low, color: "bg-primary" },
    { label: "Moderate risk", count: performance.risk.categories.moderate, color: "bg-amber-400" },
    { label: "High risk", count: performance.risk.categories.high, color: "bg-rose-500" },
  ];
  const total = performance.risk.assessedPatients;
  return <section className="mt-6" aria-label="Facility performance">
    <div className="mb-3"><h2 className="font-semibold">Scoring and face scans</h2><p className="text-sm text-muted-foreground">Completed activity at this facility in the past 30 days</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <UsageCard label="Assessments scored" count={performance.last30Days.scored} trend={performance.assessments} to={`/assessments?facility=${facilityId}`} icon={Activity} />
      <UsageCard label="Face scans completed" count={performance.last30Days.faceScans} trend={performance.faceScans} to={`/assessments?facility=${facilityId}`} icon={ScanFace} />
    </div>
    <section className="surface mt-4 p-5" aria-label="Patient risk categories">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Patient risk categories</h2><p className="mt-1 text-sm text-muted-foreground">Latest completed assessment per patient at this facility</p></div><span className="text-sm text-muted-foreground">{total} assessed {total === 1 ? "patient" : "patients"}</span></div>
      {total ? <>
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={categories.map(item => `${item.label}: ${item.count}`).join(", ")}>{categories.map(item => item.count > 0 && <span key={item.label} className={item.color} style={{ width: `${item.count / total * 100}%` }} />)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{categories.map(item => <div key={item.label} className="rounded-xl border border-border px-4 py-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><span className={`size-2.5 rounded-full ${item.color}`} />{item.label}</div><strong className="mt-2 block text-2xl font-semibold tabular-nums">{item.count}</strong></div>)}</div>
      </> : <p className="mt-5 rounded-xl bg-muted/40 px-4 py-5 text-sm text-muted-foreground">Risk categories will appear when a patient has a completed assessment here.</p>}
    </section>
  </section>;
}
