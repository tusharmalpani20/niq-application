import type { FacilityPerformance as Performance } from "@niq/application-contracts";
import { Activity, ScanFace } from "lucide-react";
import { OverviewStatCard } from "./OverviewStatCard";
import { periodGrowth } from "./overview-growth";

export function FacilityPerformance({ performance, facilityId }: { performance: Performance; facilityId: string }) {
  const categories = [
    { label: "Low risk", count: performance.risk.categories.low, color: "bg-primary" },
    { label: "Moderate risk", count: performance.risk.categories.moderate, color: "bg-amber-400" },
    { label: "High risk", count: performance.risk.categories.high, color: "bg-rose-500" },
  ];
  const total = performance.risk.assessedPatients;
  const low = total ? performance.risk.categories.low / total * 100 : 0;
  const moderate = total ? performance.risk.categories.moderate / total * 100 : 0;
  return <section className="mt-6" aria-label="Facility performance">
    <div className="mb-3"><h2 className="font-semibold">Scoring and face scans</h2><p className="text-sm text-muted-foreground">Completed activity at this facility in the past 30 days</p></div>
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <OverviewStatCard label="Assessments scored" value={performance.last30Days.scored} trend={periodGrowth(performance.last30Days.scored, performance.previous30Days.scored)} detail="vs previous 30 days" icon={Activity} to={`/assessments?facility=${facilityId}`} />
      <OverviewStatCard label="Face scans completed" value={performance.last30Days.faceScans} trend={periodGrowth(performance.last30Days.faceScans, performance.previous30Days.faceScans)} detail="vs previous 30 days" icon={ScanFace} />
    </div>
    <section className="surface mt-4 p-5" aria-label="Patient risk categories">
      <h2 className="font-semibold">Patient risk categories</h2><p className="mt-1 text-xs text-muted-foreground">Latest completed assessment per patient at this facility</p>
      <div className="mt-5">
        <div role="img" aria-label={`${total} assessed patients; ${categories.map(item => `${item.label}: ${item.count}`).join(", ")}`} className="mx-auto grid size-48 place-items-center rounded-full lg:size-56" style={{ background: total ? `conic-gradient(var(--primary) 0 ${low}%, #fbbf24 ${low}% ${low + moderate}%, #f43f5e ${low + moderate}% 100%)` : "var(--muted)" }}>
          <div className="grid size-32 place-content-center rounded-full bg-background text-center lg:size-40"><strong className="text-4xl">{total}</strong><span className="text-xs text-muted-foreground">assessed patients</span></div>
        </div>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">{categories.map(item => <li key={item.label} className="flex items-center gap-2 text-sm"><i className={`size-2.5 rounded-full ${item.color}`} aria-hidden="true" /><span>{item.label}</span><span className="tabular-nums text-muted-foreground">{item.count}</span></li>)}</ul>
      </div>
    </section>
  </section>;
}
