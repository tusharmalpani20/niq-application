import type { AssessmentSummary, Patient } from "@niq/application-contracts";
import { ArrowRight, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getOverviewRisk } from "../lib/api";
import { assessmentStatusLabels } from "../lib/patient-display";
import { NutritionInsights } from "./NutritionInsights";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;

export function OverviewBottomCards({ patients, assessments, risk }: { patients: Patient[]; assessments: AssessmentSummary[]; risk: Risk | null }) {
  const [page, setPage] = useState(1);
  const now = Date.now();
  const recentCutoff = now - 3 * 24 * 60 * 60 * 1000;
  const latestByPatient = new Map<string, AssessmentSummary>();
  for (const assessment of assessments) {
    const previous = latestByPatient.get(assessment.patient.id);
    if (!previous || assessment.createdAt > previous.createdAt) latestByPatient.set(assessment.patient.id, assessment);
  }
  const latestActivityAt = (patient: Patient) => Math.max(patient.createdAt.getTime(), latestByPatient.get(patient.id)?.createdAt.getTime() ?? 0);
  const recent = patients.filter(patient => {
    const activityAt = latestActivityAt(patient);
    return activityAt >= recentCutoff && activityAt <= now;
  }).sort((a, b) => {
    return latestActivityAt(b) - latestActivityAt(a);
  });
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(recent.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagePatients = recent.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <section className="mt-7 grid gap-4 min-[720px]:grid-cols-2" aria-label="Recent patients and NIQ insights">
    <div className="surface p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-semibold"><UsersRound className="size-5 text-primary" aria-hidden="true" />Recent patients</h2><p className="mt-1 text-xs text-muted-foreground">Last 3 days</p></div><Link className="flex items-center gap-1 text-sm text-primary hover:underline" to="/patients">View all <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      {recent.length ? <><ul className="mt-4 divide-y">{pagePatients.map(patient => { const assessment = latestByPatient.get(patient.id); return <li key={patient.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 text-sm"><div className="min-w-0"><Link className="font-medium text-foreground hover:text-primary hover:underline" to={`/patients/${patient.reference}`}>{patient.displayName}</Link><p className="text-xs text-muted-foreground">{patient.reference} · {patient.homeFacility?.name ?? "No home facility"}</p></div><div className="text-left text-xs text-muted-foreground min-[420px]:text-right">{assessment ? <><Link className="font-medium text-foreground hover:text-primary hover:underline" to={`/assessments/${assessment.reference}`}>{assessment.reference}</Link><p>{assessmentStatusLabels[assessment.status]} · {assessment.completedAt?.toLocaleDateString("en-GB") ?? assessment.createdAt.toLocaleDateString("en-GB")}</p></> : "No assessment yet"}</div></li>; })}</ul>{pageCount > 1 && <nav aria-label="Recent patient pages" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span className="text-muted-foreground">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, recent.length)} of {recent.length}</span><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></nav>}</> : <p className="mt-5 text-sm text-muted-foreground">No patient registrations or new assessments in the last 3 days.</p>}
    </div>
    <NutritionInsights risk={risk} />
  </section>;
}
