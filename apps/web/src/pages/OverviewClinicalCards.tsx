import type { AssessmentSummary } from "@niq/application-contracts";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, ShieldCheck, TriangleAlert } from "lucide-react";
import { getOverviewActivity, getOverviewRisk } from "../lib/api";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;
type Activity = Awaited<ReturnType<typeof getOverviewActivity>>["items"][number];
const activityPageSize = 5;
const actions: Record<Activity["action"], { label: string; color: string }> = {
  ASSESSMENT_CREATED: { label: "Assessment created", color: "bg-slate-400" },
  ASSESSMENT_SUBMITTED: { label: "Submitted for scoring", color: "bg-primary" },
  CLINICAL_REVIEW_COMPLETE: { label: "Clinical review completed", color: "bg-amber-500" },
};
function dayKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }

/** Keep the most recent occurrence of an action per assessment and local day for the overview. */
export function summarizeAssessmentActivity(items: Activity[]): Activity[] {
  const latest = new Map<string, Activity>();
  for (const item of items) {
    const key = `${dayKey(item.occurredAt)}:${item.assessmentId}:${item.action}`;
    const prior = latest.get(key);
    if (!prior || item.occurredAt > prior.occurredAt) latest.set(key, item);
  }
  return [...latest.values()].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

export function AssessmentActivityCalendar({ organizationId, assessments }: { organizationId: string; assessments: AssessmentSummary[] }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date());
  const [items, setItems] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setItems([]); setLoading(true); setError(false);
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    getOverviewActivity(organizationId, from, to).then(result => { if (active) setItems(result.items); }).catch(() => { if (active) { setItems([]); setError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, month]);
  const byAssessment = useMemo(() => new Map(assessments.map(item => [item.id, item])), [assessments]);
  const visibleItems = summarizeAssessmentActivity(items.filter(item => byAssessment.has(item.assessmentId)));
  const selectedItems = visibleItems.filter(item => dayKey(item.occurredAt) === dayKey(selected));
  const pageCount = Math.max(1, Math.ceil(selectedItems.length / activityPageSize));
  const pageItems = selectedItems.slice((page - 1) * activityPageSize, page * activityPageSize);
  const selectDate = (date: Date) => { setSelected(date); setPage(1); };
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next); selectDate(next);
  };
  return <section className="surface mt-7 p-5" aria-label="My assessment activity">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden="true" />My assessment activity</h2><p className="mt-1 text-sm text-muted-foreground">Select a day to see the assessments you worked on.</p></div>
      <button type="button" className="rounded-full border px-3 py-1 text-sm hover:bg-muted" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); selectDate(today); }}>Today</button>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[280px] rounded-xl border bg-muted/30 p-3 md:mx-0 md:max-w-none">
        <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Previous month" className="rounded-md p-1 hover:bg-muted" onClick={() => changeMonth(-1)}><ChevronLeft className="size-4" /></button><strong className="text-sm">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" className="rounded-md p-1 hover:bg-muted" onClick={() => changeMonth(1)}><ChevronRight className="size-4" /></button></div>
        <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">{"SMTWTFS".split("").map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span key={`pad-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
          const events = visibleItems.filter(item => dayKey(item.occurredAt) === dayKey(date));
          const active = dayKey(date) === dayKey(selected);
          return <button key={index} type="button" aria-label={date.toLocaleDateString(undefined, { dateStyle: "full" })} aria-pressed={active} className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm hover:bg-primary/10 ${active ? "bg-primary text-primary-foreground hover:bg-primary" : ""}`} onClick={() => selectDate(date)}><span>{index + 1}</span><span className="mt-0.5 flex min-h-1 gap-0.5">{[...new Set(events.map(event => event.action))].map(action => <span key={action} className={`size-1.5 rounded-full ${actions[action].color} ${active ? "ring-1 ring-white" : ""}`} />)}</span></button>;
        })}</div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">{Object.entries(actions).map(([key, value]) => <span key={key} className="flex items-center gap-1"><i className={`size-1.5 rounded-full ${value.color}`} />{value.label}</span>)}</div>
      </div>
      <div className="min-w-0"><div className="mb-3"><h3 className="font-semibold">{selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3><p className="text-sm text-muted-foreground">{loading ? "Loading activity…" : `${selectedItems.length} ${selectedItems.length === 1 ? "action" : "actions"}`}</p></div>
        {loading ? <p className="text-sm text-muted-foreground">Loading activity…</p> : error ? <p role="alert" className="text-sm text-muted-foreground">Activity could not be loaded for this month.</p> : selectedItems.length ? <>
          <ul className="divide-y">{pageItems.map(item => { const assessment = byAssessment.get(item.assessmentId)!; return <li key={item.id}><Link to={`/assessments/${assessment.reference}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 text-sm hover:bg-muted/50"><span><strong className="text-foreground">{assessment.reference}</strong><span className="ml-2 text-muted-foreground">{assessment.patient.displayName}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><i aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${actions[item.action].color}`} />{actions[item.action].label}</span></span><time className="text-xs text-muted-foreground">{item.occurredAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time></Link></li>; })}</ul>
          {pageCount > 1 && <nav aria-label="Activity pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">{(page - 1) * activityPageSize + 1}–{Math.min(page * activityPageSize, selectedItems.length)} of {selectedItems.length}</span><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page === pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div></nav>}
        </> : <p className="rounded-xl bg-muted/30 p-5 text-sm text-muted-foreground">No assessment activity on this day.</p>}
      </div>
    </div>
  </section>;
}

export function RiskOverviewCards({ risk, assessments }: { risk: Risk | null; assessments: AssessmentSummary[] }) {
  const counts = risk?.categories;
  const total = risk?.assessedPatients ?? 0;
  const low = total ? (counts?.low ?? 0) / total * 100 : 0;
  const moderate = total ? (counts?.moderate ?? 0) / total * 100 : 0;
  const highAssessments = risk?.highRiskAssessments.map(item => assessments.find(assessment => assessment.id === item.assessmentId && assessment.patient.id === item.patientId)).filter((item): item is AssessmentSummary => !!item).sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)) ?? [];
  const categories = [{ label: "Low Risk", count: counts?.low ?? 0, color: "bg-primary" }, { label: "Moderate Risk", count: counts?.moderate ?? 0, color: "bg-amber-400" }, { label: "High Risk", count: counts?.high ?? 0, color: "bg-rose-500" }];
  return <section className="mt-4 grid gap-4 min-[720px]:grid-cols-2" aria-label="Assessment risk and patients needing attention">
    <div className="surface p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" />Final NIQ categories</h2><p className="mt-1 text-xs text-muted-foreground">Each patient’s latest completed assessment</p>
      {risk ? <div className="mt-5 flex flex-wrap items-center gap-4 lg:gap-6"><div role="img" aria-label={`${categories.map(item => `${item.label}: ${item.count}`).join(", ")}`} className="grid size-24 shrink-0 place-items-center rounded-full lg:size-36" style={{ background: total ? `conic-gradient(var(--primary) 0 ${low}%, #fbbf24 ${low}% ${low + moderate}%, #f43f5e ${low + moderate}% 100%)` : "var(--muted)" }}><div className="grid size-16 place-content-center rounded-full bg-background text-center lg:size-24"><strong className="text-xl lg:text-2xl">{total}</strong><span className="text-[10px] text-muted-foreground lg:text-xs">scored patients</span></div></div><ul className="min-w-40 flex-1 space-y-3">{categories.map(item => <li key={item.label} className="flex items-center gap-2 text-sm"><i className={`size-2.5 rounded-full ${item.color}`} /><span className="flex-1">{item.label}</span><strong>{item.count}</strong><span className="w-10 text-right text-xs text-muted-foreground">{total ? Math.round(item.count / total * 100) : 0}%</span></li>)}</ul></div> : <p className="mt-5 text-sm text-muted-foreground">Risk categories are unavailable.</p>}
      <p className="mt-4 text-xs text-muted-foreground">Patients without a completed NIQ category are excluded.</p>
    </div>
    <div className="surface p-5"><h2 className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-5 text-rose-500" aria-hidden="true" />Patients needing attention</h2><p className="mt-1 text-xs text-muted-foreground">Latest completed assessment: High Risk</p>
      {!risk ? <p className="mt-5 text-sm text-muted-foreground">Patient risk information is unavailable.</p> : highAssessments.length ? <ul className="mt-4 divide-y">{highAssessments.slice(0, 4).map(item => <li key={item.id}><Link to={`/assessments/${item.reference}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary"><span><strong className="block">{item.patient.displayName}</strong><span className="text-xs text-muted-foreground">{item.reference} · {item.completedAt?.toLocaleDateString() ?? "Completed"}</span></span><span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700">High Risk</span></Link></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No patients currently have a High Risk final category.</p>}
    </div>
  </section>;
}
