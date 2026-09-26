import type { AssessmentSummary } from "@niq/application-contracts";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, ShieldCheck } from "lucide-react";
import { getOverviewActivity, getOverviewRisk } from "../lib/api";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;
type Activity = Awaited<ReturnType<typeof getOverviewActivity>>["items"][number];
const activityPageSize = 5;
const actionSequence: Activity["action"][] = ["ASSESSMENT_CREATED", "ASSESSMENT_SUBMITTED", "CLINICAL_REVIEW_COMPLETE"];
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

type AssessmentDayActivity = { assessmentId: string; latestAt: Date; milestones: Activity[] };
function groupAssessmentActivity(items: Activity[]): AssessmentDayActivity[] {
  const groups = new Map<string, AssessmentDayActivity>();
  for (const item of items) {
    const group = groups.get(item.assessmentId);
    if (group) {
      group.milestones.push(item);
      if (item.occurredAt > group.latestAt) group.latestAt = item.occurredAt;
    } else {
      groups.set(item.assessmentId, { assessmentId: item.assessmentId, latestAt: item.occurredAt, milestones: [item] });
    }
  }
  return [...groups.values()].map(group => ({ ...group, milestones: group.milestones.sort((a, b) => actionSequence.indexOf(a.action) - actionSequence.indexOf(b.action)) }))
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
}

export function AssessmentActivityCalendar({ organizationId, assessments }: { organizationId: string; assessments: AssessmentSummary[] }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(() => new Date());
  const [items, setItems] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setItems([]); setLoading(true); setError(false);
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    getOverviewActivity(organizationId, from, to).then(result => {
      if (!active) return;
      setItems(result.items);
      // Month navigation leaves no day selected until data loads; then show its most recent active day.
      setSelected(current => current ?? result.items.find(item => assessments.some(assessment => assessment.id === item.assessmentId))?.occurredAt ?? null);
    }).catch(() => { if (active) { setItems([]); setError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, month, assessments]);
  const byAssessment = useMemo(() => new Map(assessments.map(item => [item.id, item])), [assessments]);
  const visibleItems = summarizeAssessmentActivity(items.filter(item => byAssessment.has(item.assessmentId)));
  const selectedItems = selected ? visibleItems.filter(item => dayKey(item.occurredAt) === dayKey(selected)) : [];
  const selectedAssessments = groupAssessmentActivity(selectedItems);
  const pageCount = Math.max(1, Math.ceil(selectedAssessments.length / activityPageSize));
  const pageAssessments = selectedAssessments.slice((page - 1) * activityPageSize, page * activityPageSize);
  const selectDate = (date: Date) => { setSelected(date); setPage(1); };
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next); setSelected(null); setPage(1);
  };
  return <section className="surface mt-7 p-5" aria-label="My assessment activity">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden="true" />My assessment activity</h2><p className="mt-1 text-sm text-muted-foreground">Assessments you created, submitted or reviewed, grouped by day.</p></div>
      <button type="button" className="rounded-full border px-3 py-1 text-sm hover:bg-muted" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); selectDate(today); }}>Today</button>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[280px] rounded-xl border bg-muted/30 p-3 md:mx-0 md:max-w-none">
        <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Previous month" className="rounded-md p-1 hover:bg-muted" onClick={() => changeMonth(-1)}><ChevronLeft className="size-4" /></button><strong className="text-sm">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" className="rounded-md p-1 hover:bg-muted" onClick={() => changeMonth(1)}><ChevronRight className="size-4" /></button></div>
        <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span key={`pad-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
          const events = visibleItems.filter(item => dayKey(item.occurredAt) === dayKey(date));
          const active = selected !== null && dayKey(date) === dayKey(selected);
          const assessmentCount = new Set(events.map(event => event.assessmentId)).size;
          const dateLabel = date.toLocaleDateString(undefined, { dateStyle: "full" });
          return <button key={index} type="button" aria-label={assessmentCount ? `${dateLabel}, ${assessmentCount} ${assessmentCount === 1 ? "assessment" : "assessments"}, ${events.length} ${events.length === 1 ? "milestone" : "milestones"}` : dateLabel} aria-pressed={active} className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm hover:bg-primary/10 ${active ? "bg-primary text-primary-foreground hover:bg-primary" : ""}`} onClick={() => selectDate(date)}><span>{index + 1}</span><span className="mt-0.5 flex min-h-2 gap-0.5">{[...new Set(events.map(event => event.action))].map(action => <span key={action} className={`size-2 rounded-full ${actions[action].color} ${active ? "ring-1 ring-white" : ""}`} />)}</span></button>;
        })}</div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">{Object.entries(actions).map(([key, value]) => <span key={key} className="flex items-center gap-1"><i aria-hidden="true" className={`size-2 rounded-full ${value.color}`} />{value.label}</span>)}</div>
      </div>
      <div className="min-w-0"><div className="mb-3"><h3 className="font-semibold">{selected ? selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3><p className="text-sm text-muted-foreground">{loading ? "Loading activity…" : `${selectedAssessments.length} ${selectedAssessments.length === 1 ? "assessment" : "assessments"}${selectedItems.length ? ` · ${selectedItems.length} ${selectedItems.length === 1 ? "milestone" : "milestones"}` : ""}`}</p></div>
        {loading ? <p className="text-sm text-muted-foreground">Loading activity…</p> : error ? <p role="alert" className="text-sm text-muted-foreground">Activity could not be loaded for this month.</p> : selectedAssessments.length ? <>
          <ul className="divide-y">{pageAssessments.map(group => { const assessment = byAssessment.get(group.assessmentId)!; return <li key={group.assessmentId}><Link to={`/assessments/${assessment.reference}`} className="block rounded-lg px-2 py-3 text-sm hover:bg-muted/50"><span className="flex flex-wrap items-baseline gap-x-2"><strong className="text-foreground">{assessment.patient.displayName}</strong><span className="text-xs text-muted-foreground">{assessment.reference}</span></span><span className="mt-1.5 flex flex-wrap gap-2">{group.milestones.map(item => <span key={item.action} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground"><i aria-hidden="true" className={`size-2 shrink-0 rounded-full ${actions[item.action].color}`} />{actions[item.action].label}<time className="ml-1 text-muted-foreground">{item.occurredAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time></span>)}</span></Link></li>; })}</ul>
          {pageCount > 1 && <nav aria-label="Activity pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">{(page - 1) * activityPageSize + 1}–{Math.min(page * activityPageSize, selectedAssessments.length)} of {selectedAssessments.length} assessments</span><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page === pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div></nav>}
        </> : <p className="rounded-xl bg-muted/30 p-5 text-sm text-muted-foreground">{selected ? "No assessment milestones on this day." : "No assessment milestones in this month."}</p>}
      </div>
    </div>
  </section>;
}

export function RiskOverviewCards({ risk }: { risk: Risk | null }) {
  const counts = risk?.categories;
  const total = risk?.assessedPatients ?? 0;
  const low = total ? (counts?.low ?? 0) / total * 100 : 0;
  const moderate = total ? (counts?.moderate ?? 0) / total * 100 : 0;
  const categories = [{ label: "Low Risk", count: counts?.low ?? 0, color: "bg-primary" }, { label: "Moderate Risk", count: counts?.moderate ?? 0, color: "bg-amber-400" }, { label: "High Risk", count: counts?.high ?? 0, color: "bg-rose-500" }];
  return <section className="mt-4" aria-label="Assessment risk overview">
    <div className="surface p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" />NIQ risk overview</h2><p className="mt-1 text-xs text-muted-foreground">Each patient’s latest completed assessment</p>
      {risk ? <div className="mt-5"><div role="img" aria-label={`${total} scored patients; ${categories.map(item => `${item.label}: ${item.count}`).join(", ")}`} className="mx-auto grid size-48 place-items-center rounded-full lg:size-56" style={{ background: total ? `conic-gradient(var(--primary) 0 ${low}%, #fbbf24 ${low}% ${low + moderate}%, #f43f5e ${low + moderate}% 100%)` : "var(--muted)" }}><div className="grid size-32 place-content-center rounded-full bg-background text-center lg:size-40"><strong className="text-4xl">{total}</strong><span className="text-xs text-muted-foreground">scored patients</span></div></div><ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">{categories.map(item => <li key={item.label} className="flex items-center gap-2 text-sm"><i className={`size-2.5 rounded-full ${item.color}`} /><span>{item.label}</span></li>)}</ul></div> : <p className="mt-5 text-sm text-muted-foreground">Risk categories are unavailable.</p>}
    </div>
  </section>;
}
