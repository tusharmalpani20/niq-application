import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, ShieldCheck } from "lucide-react";
import { getOverviewActivity, getOverviewActivityDay, getOverviewRisk } from "../lib/api";
import { ActivityEmptyIllustration } from "../components/DashboardEmptyIllustrations";
import { RiskDonut } from "./RiskDonut";

type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;
type ActivityDay = Awaited<ReturnType<typeof getOverviewActivity>>["days"][number];
type DayDetail = Awaited<ReturnType<typeof getOverviewActivityDay>>;
type ActivityAction = ActivityDay["actions"][number];
const actionSequence: ActivityAction[] = ["ASSESSMENT_CREATED", "ASSESSMENT_SUBMITTED", "CLINICAL_REVIEW_COMPLETE"];
const actions: Record<ActivityAction, { label: string; color: string }> = {
  ASSESSMENT_CREATED: { label: "Assessment created", color: "bg-slate-400" },
  ASSESSMENT_SUBMITTED: { label: "Submitted for scoring", color: "bg-primary" },
  CLINICAL_REVIEW_COMPLETE: { label: "Clinical review completed", color: "bg-amber-500" },
};
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function AssessmentActivityCalendar({ organizationId }: { organizationId: string }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(() => new Date());
  const [days, setDays] = useState<ActivityDay[]>([]);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setDays([]); setLoading(true); setError(false);
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    getOverviewActivity(organizationId, from, to).then(result => {
      if (!active) return;
      setDays(result.days);
      // Month navigation leaves no day selected until data loads; then show its most recent active day.
      setSelected(current => current ?? (result.days[0] ? new Date(`${result.days[0].day}T12:00:00`) : null));
    }).catch(() => { if (active) { setDays([]); setError(true); setLoading(false); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, month]);
  const selectedDay = selected ? days.find(item => item.day === dayKey(selected)) : undefined;
  useEffect(() => {
    let active = true;
    setDetail(null);
    if (!selected || !selectedDay || loading || error) return () => { active = false; };
    const from = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
    const to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 1);
    getOverviewActivityDay(organizationId, from, to, page).then(result => { if (active) setDetail(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [organizationId, selected, selectedDay?.day, page, loading, error]);
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
    <div className="grid items-stretch gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[280px] rounded-xl border bg-muted/30 p-3 md:mx-0 md:max-w-none">
        <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Previous month" className="rounded-md p-1 hover:bg-muted" onClick={() => changeMonth(-1)}><ChevronLeft className="size-4" /></button><strong className="text-sm">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" className="rounded-md p-1 hover:bg-muted" onClick={() => changeMonth(1)}><ChevronRight className="size-4" /></button></div>
        <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span key={`pad-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
          const activity = days.find(item => item.day === dayKey(date));
          const eventActions = new Set(activity?.actions ?? []);
          const active = selected !== null && dayKey(date) === dayKey(selected);
          const assessmentCount = activity?.assessmentCount ?? 0;
          const dateLabel = date.toLocaleDateString(undefined, { dateStyle: "full" });
          return <button key={index} type="button" aria-label={assessmentCount ? `${dateLabel}, ${assessmentCount} ${assessmentCount === 1 ? "assessment" : "assessments"}, ${activity!.milestoneCount} ${activity!.milestoneCount === 1 ? "milestone" : "milestones"}` : dateLabel} aria-pressed={active} className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm hover:bg-primary/10 ${active ? "bg-primary text-primary-foreground hover:bg-primary" : ""}`} onClick={() => selectDate(date)}><span>{index + 1}</span><span className="mt-0.5 flex min-h-2 gap-0.5">{actionSequence.filter(action => eventActions.has(action)).map(action => <span key={action} className={`size-2 rounded-full ${actions[action].color} ${active ? "ring-1 ring-white" : ""}`} />)}</span></button>;
        })}</div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">{actionSequence.map(action => <span key={action} className="flex items-center gap-1"><i aria-hidden="true" className={`size-2 rounded-full ${actions[action].color}`} />{actions[action].label}</span>)}</div>
      </div>
      <div className="flex min-w-0 flex-col"><div className="mb-3"><h3 className="font-semibold">{selected ? selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3><p className="text-sm text-muted-foreground">{loading ? "Loading activity…" : `${selectedDay?.assessmentCount ?? 0} ${(selectedDay?.assessmentCount ?? 0) === 1 ? "assessment" : "assessments"}${selectedDay?.milestoneCount ? ` · ${selectedDay.milestoneCount} ${selectedDay.milestoneCount === 1 ? "milestone" : "milestones"}` : ""}`}</p></div>
        {loading || (selectedDay && !detail && !error) ? <p className="text-sm text-muted-foreground">Loading activity…</p> : error ? <p role="alert" className="text-sm text-muted-foreground">Activity could not be loaded for this month.</p> : detail?.assessments.length ? <>
          <ul className="divide-y">{detail.assessments.map(group => <li key={group.assessmentId}><Link to={`/assessments/${group.reference}`} className="block rounded-lg px-2 py-3 text-sm hover:bg-muted/50"><span className="flex flex-wrap items-baseline gap-x-2"><strong className="text-foreground">{group.patientDisplayName}</strong><span className="text-xs text-muted-foreground">{group.reference}</span></span><span className="mt-1.5 flex flex-wrap gap-2">{group.milestones.map(item => <span key={item.action} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground"><i aria-hidden="true" className={`size-2 shrink-0 rounded-full ${actions[item.action].color}`} />{actions[item.action].label}<time className="ml-1 text-muted-foreground">{item.occurredAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time></span>)}</span></Link></li>)}</ul>
          {detail.pageCount > 1 && <nav aria-label="Activity pages" className="mt-4 flex justify-center border-t pt-4 text-sm"><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {detail.pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page === detail.pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div></nav>}
        </> : <div className="flex min-h-60 flex-1 flex-col items-center justify-center rounded-xl border border-primary/10 bg-primary/[.025] p-5 text-center"><ActivityEmptyIllustration /><p className="mt-2 text-sm text-muted-foreground">{selected ? "No assessment milestones on this day." : "No assessment milestones in this month."}</p></div>}
      </div>
    </div>
  </section>;
}

export function RiskOverviewCards({ risk }: { risk: Risk | null }) {
  const counts = risk?.categories;
  const total = risk?.assessedPatients ?? 0;
  return <section className="mt-4" aria-label="Assessment risk overview">
    <div className="surface p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" />NIQ risk overview</h2><p className="mt-1 text-xs text-muted-foreground">Each patient’s latest completed assessment</p>
      {risk ? <RiskDonut counts={{ low: counts?.low ?? 0, moderate: counts?.moderate ?? 0, high: counts?.high ?? 0 }} total={total} centerLabel="scored patients" labels={{ low: "Low Risk", moderate: "Moderate Risk", high: "High Risk" }} /> : <p className="mt-5 text-sm text-muted-foreground">Risk categories are unavailable.</p>}
    </div>
  </section>;
}
