import type { AssessmentSummary, Patient } from "@niq/application-contracts";
import { ArrowRight, Lightbulb, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getOverviewRisk } from "../lib/api";
import { assessmentStatusLabels } from "../lib/patient-display";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;
type Category = "low" | "moderate" | "high";

export function OverviewBottomCards({ patients, assessments, risk }: { patients: Patient[]; assessments: AssessmentSummary[]; risk: Risk | null }) {
  const [page, setPage] = useState(1);
  const latestByPatient = new Map<string, AssessmentSummary>();
  for (const assessment of assessments) {
    const previous = latestByPatient.get(assessment.patient.id);
    if (!previous || assessment.createdAt > previous.createdAt) latestByPatient.set(assessment.patient.id, assessment);
  }
  const recent = [...patients].sort((a, b) => {
    const aDate = Math.max(a.createdAt.getTime(), latestByPatient.get(a.id)?.createdAt.getTime() ?? 0);
    const bDate = Math.max(b.createdAt.getTime(), latestByPatient.get(b.id)?.createdAt.getTime() ?? 0);
    return bDate - aDate;
  });
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(recent.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagePatients = recent.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const categories: { key: Category; label: string; color: string }[] = [
    { key: "low", label: "Low Risk", color: "bg-primary" },
    { key: "moderate", label: "Moderate Risk", color: "bg-amber-400" },
    { key: "high", label: "High Risk", color: "bg-rose-500" },
  ];

  return <section className="mt-7 grid gap-4 min-[720px]:grid-cols-2" aria-label="Recent patients and NIQ insights">
    <div className="surface p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><UsersRound className="size-5 text-primary" aria-hidden="true" />Recent patients</h2><Link className="flex items-center gap-1 text-sm text-primary hover:underline" to="/patients">View all <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      {recent.length ? <><ul className="mt-4 divide-y">{pagePatients.map(patient => { const assessment = latestByPatient.get(patient.id); return <li key={patient.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 text-sm"><div className="min-w-0"><Link className="font-medium text-foreground hover:text-primary hover:underline" to={`/patients/${patient.reference}`}>{patient.displayName}</Link><p className="text-xs text-muted-foreground">{patient.reference} · {patient.homeFacility?.name ?? "No home facility"}</p></div><div className="text-left text-xs text-muted-foreground min-[420px]:text-right">{assessment ? <><Link className="font-medium text-foreground hover:text-primary hover:underline" to={`/assessments/${assessment.reference}`}>{assessment.reference}</Link><p>{assessmentStatusLabels[assessment.status]} · {assessment.completedAt?.toLocaleDateString("en-GB") ?? assessment.createdAt.toLocaleDateString("en-GB")}</p></> : "No assessment yet"}</div></li>; })}</ul>{pageCount > 1 && <nav aria-label="Recent patient pages" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span className="text-muted-foreground">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, recent.length)} of {recent.length}</span><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></nav>}</> : <p className="mt-5 text-sm text-muted-foreground">No patients have been registered yet.</p>}
    </div>
    <div className="surface flex flex-col p-5"><h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-5 text-primary" aria-hidden="true" />NIQ insights</h2><p className="mt-1 text-xs text-muted-foreground">Final categories compared with 30 days ago</p>
      {!risk ? <p className="mt-5 text-sm text-muted-foreground">NIQ insights are unavailable.</p> : risk.assessedPatients === 0 && Object.values(risk.categories30DaysAgo).every(count => count === 0) ? <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center"><div className="grid size-24 place-items-center rounded-full bg-primary/10"><Lightbulb className="size-11 text-primary" strokeWidth={1.5} aria-hidden="true" /></div><div><p className="font-semibold">Insights will appear here</p><p className="mt-1 max-w-64 text-sm text-muted-foreground">Complete an assessment with a final NIQ category to see category trends.</p></div></div> : <div className="mt-4"><div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 text-xs text-muted-foreground"><span>Category</span><span className="text-right">Now</span><span className="text-right">30 days ago</span></div><ul className="divide-y">{categories.map(({ key, label, color }) => <li key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3 text-sm"><span className="flex items-center gap-2"><i className={`size-2.5 rounded-full ${color}`} />{label}</span><strong className="min-w-8 text-right">{risk.categories[key]}</strong><span className="min-w-20 text-right text-muted-foreground">{risk.categories30DaysAgo[key]}</span></li>)}</ul><p className="mt-3 text-xs text-muted-foreground">One final category per patient, based on their latest completed assessment at each date.</p></div>}
    </div>
  </section>;
}
