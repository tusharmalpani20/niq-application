import type { FacilityPerformance as Performance } from "@niq/application-contracts";
import { Activity, ScanFace } from "lucide-react";
import { OverviewStatCard } from "./OverviewStatCard";

export function FacilityPerformance({ performance, facilityId }: { performance: Performance; facilityId: string }) {
  const categories = [
    { label: "Low risk", count: performance.risk.categories.low, color: "bg-primary" },
    { label: "Moderate risk", count: performance.risk.categories.moderate, color: "bg-amber-400" },
    { label: "High risk", count: performance.risk.categories.high, color: "bg-rose-500" },
  ];
  const total = performance.risk.assessedPatients;
  return <section className="mt-6" aria-label="Facility performance">
    <div className="mb-3"><h2 className="font-semibold">Scoring and face scans</h2><p className="text-sm text-muted-foreground">Completed activity at this facility in the past 30 days</p></div>
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <OverviewStatCard label="Assessments scored" value={performance.last30Days.scored} detail="Past 30 days" icon={Activity} to={`/assessments?facility=${facilityId}`} />
      <OverviewStatCard label="Face scans completed" value={performance.last30Days.faceScans} detail="Past 30 days" icon={ScanFace} />
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
