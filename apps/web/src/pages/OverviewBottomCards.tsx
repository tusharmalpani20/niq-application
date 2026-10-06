import type { OverviewSummary } from "@niq/application-contracts";
import { ArrowRight, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getOverviewNutrition, getOverviewRisk, getOverviewSummary } from "../lib/api";
import { assessmentStatusLabels } from "../lib/patient-display";
import { NutritionInsights } from "./NutritionInsights";
import { RecentPatientsEmptyIllustration } from "../components/DashboardEmptyIllustrations";
import { OverviewInsightsSkeleton } from "./OverviewSkeleton";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;
type Nutrition = Awaited<ReturnType<typeof getOverviewNutrition>>;

export function OverviewBottomCards({ organizationId, initial, risk, nutrition, nutritionLoaded }: { organizationId: string; initial: OverviewSummary["recent"]; risk: Risk | null; nutrition: Nutrition | null; nutritionLoaded: boolean }) {
  const [recent, setRecent] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(false);
  const pageCount = Math.max(1, Math.ceil(recent.total / recent.pageSize));
  const changePage = (page: number) => {
    setLoading(true); setPageError(false);
    getOverviewSummary(organizationId, 1, page).then(result => setRecent(result.recent)).catch(() => setPageError(true)).finally(() => setLoading(false));
  };

  return <section className="mt-7 grid gap-4 min-[720px]:grid-cols-2" aria-label="Recent patients and NIQ insights">
    <div className="surface p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-semibold"><UsersRound className="size-5 text-primary" aria-hidden="true" />Recent patients</h2><p className="mt-1 text-xs text-muted-foreground">Last 3 days</p></div><Link className="flex items-center gap-1 text-sm text-primary hover:underline" to="/patients">View all <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      {recent.total ? <><ul className="mt-4 divide-y">{recent.items.map(({ patient, assessment }) => <li key={patient.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 text-sm"><div className="min-w-0"><Link className="font-medium text-primary hover:underline focus-visible:underline" to={`/patients/${patient.reference}`}>{patient.displayName}</Link><p className="text-xs text-muted-foreground">{patient.reference} · {patient.homeFacility?.name ?? "No home facility"}</p></div><div className="text-left text-xs text-muted-foreground min-[420px]:text-right">{assessment ? <><Link className="font-medium text-primary hover:underline focus-visible:underline" to={`/assessments/${assessment.reference}`}>{assessment.reference}</Link><p>{assessmentStatusLabels[assessment.status]} · {assessment.completedAt?.toLocaleDateString("en-GB") ?? assessment.createdAt.toLocaleDateString("en-GB")}</p></> : "No assessment yet"}</div></li>)}</ul>{pageCount > 1 && <nav aria-label="Recent patient pages" className="mt-3 flex justify-center border-t pt-3 text-sm"><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={recent.page === 1 || loading} onClick={() => changePage(recent.page - 1)}>Previous</button><span>Page {recent.page} of {pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={recent.page === pageCount || loading} onClick={() => changePage(recent.page + 1)}>Next</button></div></nav>}</> : <div className="mt-3 flex min-h-40 flex-col items-center justify-center text-center"><RecentPatientsEmptyIllustration /><p className="mt-1 text-sm text-muted-foreground">No patient registrations or new assessments in the last 3 days.</p></div>}
      {pageError && <p role="alert" className="mt-2 text-xs text-destructive">That page could not be loaded. Please try again.</p>}
    </div>
    {nutritionLoaded ? <NutritionInsights risk={risk} nutrition={nutrition} /> : <OverviewInsightsSkeleton />}
  </section>;
}
