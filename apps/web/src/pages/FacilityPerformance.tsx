import type { FacilityPerformance as Performance } from "@niq/application-contracts";
import { Activity, ScanFace } from "lucide-react";
import { OverviewStatCard } from "./OverviewStatCard";
import { periodGrowth } from "./overview-growth";
import { RiskDonut } from "./RiskDonut";

export function FacilityPerformance({ performance }: { performance: Performance }) {
  return <section className="mt-6" aria-label="Facility performance">
    <div className="mb-3"><h2 className="font-semibold">Scoring and face scans</h2><p className="text-sm text-muted-foreground">Completed activity at this facility in the past 30 days</p></div>
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <OverviewStatCard label="Assessments scored" value={performance.last30Days.scored} trend={periodGrowth(performance.last30Days.scored, performance.previous30Days.scored)} detail="vs previous 30 days" icon={Activity} />
      <OverviewStatCard label="Face scans completed" value={performance.last30Days.faceScans} trend={periodGrowth(performance.last30Days.faceScans, performance.previous30Days.faceScans)} detail="vs previous 30 days" icon={ScanFace} />
    </div>
    <section className="surface mt-4 p-5" aria-label="Patient risk categories">
      <h2 className="font-semibold">Patient risk categories</h2><p className="mt-1 text-xs text-muted-foreground">Latest completed assessment per patient at this facility</p>
      <RiskDonut counts={performance.risk.categories} total={performance.risk.assessedPatients} centerLabel="assessed patients" labels={{ low: "Low risk", moderate: "Moderate risk", high: "High risk" }} />
    </section>
  </section>;
}
