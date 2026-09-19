import type { ScoringOrganizationInfo } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getScoringOrganizationInfo } from "../lib/api";

export function CapacityCard({ title, used, limit, detail, to }: { title: string; used: number; limit: number | null; detail: string; to: string }) {
  const percent = limit === null ? null : limit === 0 ? (used > 0 ? 100 : 0) : Math.min(100, used / limit * 100);
  return <Link to={to} className="surface grid gap-3 p-5 no-underline focus-visible:outline-2 focus-visible:outline-primary">
    <span className="text-sm font-medium">{title}</span>
    <div><strong className="text-3xl font-semibold">{used.toLocaleString()}</strong><span className="ml-2 text-sm text-muted-foreground">{limit === null ? "used · Unlimited" : `of ${limit.toLocaleString()} used`}</span></div>
    {percent !== null && <><div role="meter" aria-label={title} aria-valuemin={0} aria-valuemax={Math.max(limit ?? 0, used, 1)} aria-valuenow={used} aria-valuetext={`${used} of ${limit} used`} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={used >= (limit ?? Infinity) ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${percent}%` }} /></div><span className="text-xs text-muted-foreground">{Math.max(0, (limit ?? 0) - used).toLocaleString()} remaining</span></>}
    <span className="text-xs text-muted-foreground">{detail}</span>
  </Link>;
}

export function OverviewUsage({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<ScoringOrganizationInfo | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  useEffect(() => {
    let active = true;
    setData(null); setError(false);
    getScoringOrganizationInfo(organizationId).then((value) => { if (active) { setData(value); setLoadedAt(new Date()); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [organizationId, attempt]);
  const period = data ? new Date(`${data.usage.period}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : "This calendar month";
  return <section className="mt-7 grid gap-4" aria-label="Scoring usage">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Scoring usage</h2><p className="text-sm text-muted-foreground">{period} · UTC</p></div><Button variant="outline" onPress={() => setAttempt((value) => value + 1)} isDisabled={!data && !error}>Refresh</Button></div>
    {error ? <div className="surface p-5"><p role="status">Scoring usage is unavailable.</p><Link className="text-primary underline" to="/settings/scoring">Check scoring connection</Link></div> : !data ? <p role="status" className="text-sm text-muted-foreground">Loading usage…</p> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <CapacityCard title="Scores" used={data.usage.scores} limit={data.limits.scoresPerMonth} detail={data.services.scoring.enabled ? "Scores used this month" : "Scoring is disabled"} to="/settings/scoring" />
        <CapacityCard title="Face scans" used={data.usage.faceScans} limit={data.limits.faceScansPerMonth} detail={data.services.faceScan.enabled ? "Face scans used this month" : "Face scans are disabled"} to="/settings/scoring" />
      </div>
      {loadedAt && <p className="text-xs text-muted-foreground">Last refreshed {loadedAt.toLocaleString()}. Monthly limits reset at the start of each month.</p>}
    </>}
  </section>;
}
