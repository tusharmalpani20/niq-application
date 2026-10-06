import { hasPermission } from "@niq/application-contracts";
import type { AuthenticatedUser, ClinicalReviewQueue, OverviewSummary } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, Building2, ClipboardCheck, ClipboardList, ClipboardPenLine, Link2, Plus, Send, Sparkles, Star, Stethoscope, TriangleAlert, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OverviewUsage } from "../components/OverviewUsage";
import { GreetingIllustration } from "../components/GreetingIllustration";
import { PriorityEmptyIllustration, RecentPatientsEmptyIllustration } from "../components/DashboardEmptyIllustrations";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { useWorkspaceRevision } from "../features/notifications/useWorkspaceRevision";
import { getOrganization, getOverviewRisk, getOverviewSummary, listOrganizationUsers } from "../lib/api";
import { OverviewStatCard } from "./OverviewStatCard";
import { AssessmentActivityCalendar, RiskOverviewCards } from "./OverviewClinicalCards";
import { OverviewBottomCards } from "./OverviewBottomCards";
import { NutritionInsights } from "./NutritionInsights";
import { OverviewActionsSkeleton, OverviewInsightsSkeleton, OverviewPrioritySkeleton, OverviewRecentSkeleton, OverviewRiskSkeleton, OverviewStatSkeleton } from "./OverviewSkeleton";

type Overview = { summary: OverviewSummary; enabledUsers: number | null; pendingInvitations: number; seats: number; userLimit: number | null; queuedReviews: ClinicalReviewQueue | null; myReviews: ClinicalReviewQueue | null };
type Risk = Awaited<ReturnType<typeof getOverviewRisk>>;

export function greetingForHour(hour: number): "Good morning" | "Good afternoon" | "Good evening" {
  if (hour >= 6 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function GreetingBanner({ hour, displayName }: { hour: number; displayName: string }) {
  const greeting = greetingForHour(hour);
  const period = greeting === "Good morning" ? "morning" : greeting === "Good afternoon" ? "afternoon" : "evening";
  const title = `${greeting}, ${displayName}!`;
  return <>
    <div className="flex min-w-0 items-center gap-4">
      <GreetingIllustration period={period} />
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground sm:text-base">Precision Nutrition Assessment for Better Cancer Care</p>
      </div>
    </div>
  </>;
}

function ActionCard({ title, count, detail, to }: { title: string; count: number | string; detail: string; to: string }) {
  return <Link to={to} className="surface flex min-h-32 flex-col justify-between gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-start justify-between gap-3"><h3 className="font-medium text-foreground">{title}</h3><ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <div><strong className="text-2xl font-semibold">{count}</strong><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
  </Link>;
}

function QuickActions({ isAdmin, canCreateAssessment, queuedReviews, myReviews, readyToSend, correctionsToMake }: { isAdmin: boolean; canCreateAssessment: boolean; queuedReviews: ClinicalReviewQueue | null; myReviews: ClinicalReviewQueue | null; readyToSend: number; correctionsToMake: number }) {
  const reviewDetail = [queuedReviews?.total ? `${queuedReviews.total} waiting` : null, myReviews?.total ? `${myReviews.total} in progress` : null].filter(Boolean).join(" · ") || "Open review work";
  const actions = isAdmin ? [
    { label: "Add facility", detail: "Create a facility", to: "/facilities?add=1", icon: Building2 },
    { label: "Assign clinical reviews", detail: queuedReviews ? `${queuedReviews.total} awaiting assignment` : "Open review assignments", to: "/assessments?tab=clinical-reviews&review=QUEUED", icon: Stethoscope },
    { label: "Manage users", detail: "Users, roles and invitations", to: "/users", icon: UsersRound },
    { label: "Scoring connection", detail: "Service status and usage", to: "/settings/scoring", icon: Link2 },
  ] : [
    ...(canCreateAssessment ? [{ label: "New assessment", detail: "Start an assessment", to: "/assessments/new", icon: Plus }] : []),
    { label: "Ready to send", detail: `${readyToSend} ${readyToSend === 1 ? "assessment" : "assessments"}`, to: "/assessments?status=SEND_FOR_REVIEW", icon: Send },
    { label: "Corrections to make", detail: `${correctionsToMake} ${correctionsToMake === 1 ? "assessment" : "assessments"}`, to: "/assessments?status=CORRECT_DRAFT", icon: ClipboardPenLine },
    { label: "Clinical reviews", detail: reviewDetail, to: "/assessments?tab=clinical-reviews", icon: Stethoscope },
  ];
  return <section className="surface relative min-w-0 overflow-hidden border-primary/20 p-5 text-foreground" aria-label="Quick actions" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 15%, white), color-mix(in srgb, var(--primary) 4%, white))" }}>
    <div className="pointer-events-none absolute -right-12 -top-20 size-44 rounded-full border border-primary/15" aria-hidden="true" />
    <div className="relative flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/20 bg-white/70 text-brand-ink"><Sparkles className="size-5" aria-hidden="true" /></span><div><h2 className="font-semibold">Quick actions</h2><p className="text-xs text-muted-foreground">{isAdmin ? "Manage patients, reviews and access" : "Start care or open review work"}</p></div></div>
    <div className={`relative mt-5 grid gap-2 ${isAdmin ? "sm:grid-cols-2 xl:grid-cols-4" : ""}`}>{actions.map(({ label, detail, to, icon: Icon }) => <Link key={label} to={to} title={detail} aria-label={`${label}: ${detail}`} className="flex min-h-14 min-w-0 items-center gap-2 rounded-xl border border-primary/15 bg-white/70 px-3 py-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Icon className="size-4 shrink-0 text-brand-ink" aria-hidden="true" /><span className="min-w-0"><span className="block">{label}</span>{to !== "/assessments/new" && <span className="block truncate text-xs font-normal text-muted-foreground">{detail}</span>}</span></Link>)}</div>
  </section>;
}

function PriorityAssessments({ organizationId, initial }: { organizationId: string; initial: OverviewSummary["priority"] }) {
  const [priority, setPriority] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(false);
  const pageCount = Math.max(1, Math.ceil(priority.total / priority.pageSize));
  const changePage = (page: number) => {
    setLoading(true); setPageError(false);
    getOverviewSummary(organizationId, page, 1).then(result => setPriority(result.priority)).catch(() => setPageError(true)).finally(() => setLoading(false));
  };
  return <section className="surface flex min-w-0 flex-col p-5" aria-label="Priority assessments">
    <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Star className="size-5 fill-amber-400 text-amber-500" aria-hidden="true" />Priority assessments</h2><p className="mt-1 text-xs text-muted-foreground">Assessments you marked for follow-up</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{priority.total}</span></div>
    {priority.total ? <><ul className="mt-4 divide-y divide-border">{priority.items.map(item => <li key={item.id}><Link className="group flex items-center justify-between gap-3 py-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary" to={`/assessments/${item.reference}`}><span className="min-w-0"><strong className="block truncate font-medium text-primary group-hover:underline group-focus-visible:underline">{item.patient.displayName}</strong><span className="text-xs text-muted-foreground">{item.reference} · {item.status.replaceAll("_", " ").toLowerCase()}</span></span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link></li>)}</ul>{pageError && <p role="alert" className="mt-2 text-xs text-destructive">That page could not be loaded. Please try again.</p>}{pageCount > 1 && <nav aria-label="Priority assessment pages" className="mt-3 flex justify-center border-t pt-3 text-sm"><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={priority.page === 1 || loading} onClick={() => changePage(priority.page - 1)}>Previous</button><span>Page {priority.page} of {pageCount}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={priority.page === pageCount || loading} onClick={() => changePage(priority.page + 1)}>Next</button></div></nav>}</> : <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-primary/10 bg-primary/[.025] px-5 py-5 text-center"><PriorityEmptyIllustration /><p className="mt-1 text-sm font-medium">Nothing marked yet</p><p className="mt-1 text-xs text-muted-foreground">Mark an assessment as priority to keep it here.</p><Link className="mt-3 inline-block text-sm text-primary hover:underline" to="/assessments">Browse assessments</Link></div>}
  </section>;
}

function RecentPatients({ recent }: { recent: OverviewSummary["recent"]["items"] }) {
  return <section className="surface mt-7 p-5" aria-label="Recently registered patients">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recently registered patients</h2><Link className="text-sm text-primary hover:underline" to="/patients">Register or find a patient</Link></div>
    {recent.length ? <ul className="divide-y">{recent.map(({ patient }) => <li key={patient.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><Link className="font-medium text-foreground hover:underline" to={`/patients/${patient.reference}`}>{patient.displayName}</Link><p className="text-xs text-muted-foreground">{patient.reference} · {patient.homeFacility?.name ?? "No home facility"}</p></div><span className="shrink-0 text-xs text-muted-foreground">{patient.createdAt.toLocaleDateString("en-GB")}</span></li>)}</ul> : <div className="flex min-h-40 flex-col items-center justify-center text-center"><RecentPatientsEmptyIllustration /><p className="mt-1 text-sm text-muted-foreground">No patients have been registered yet.</p></div>}
  </section>;
}

function UserSeats({ enabled, reserved, pending, limit }: { enabled: number; reserved: number; pending: number; limit: number | null }) {
  const percent = limit === null ? null : limit === 0 ? (reserved > 0 ? 100 : 0) : Math.min(100, reserved / limit * 100);
  return <section aria-label="Team and user seats" className="mt-7"><Link to="/users" className="surface flex flex-wrap items-center justify-between gap-4 p-4 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"><div><h2 className="font-semibold">Team and user seats</h2><p className="mt-1 text-sm text-muted-foreground">{enabled} enabled users · {pending} pending invitations</p></div><div className="min-w-44 text-sm"><span className="font-medium">{limit === null ? "Unlimited seats" : `${reserved} of ${limit} seats reserved`}</span>{percent !== null && <div role="meter" aria-label="User seats" aria-valuemin={0} aria-valuemax={Math.max(limit ?? 0, reserved, 1)} aria-valuenow={reserved} aria-valuetext={`${reserved} of ${limit} seats reserved`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={reserved >= (limit ?? Infinity) ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${percent}%` }} /></div>}</div></Link></section>;
}

export function DashboardPage() {
  const workspaceRevision = useWorkspaceRevision(["assessment", "patient", "facility", "users"]);
  const user = useOutletContext<AuthenticatedUser>();
  const isAdmin = hasPermission(user.role, "users.manage");
  const isClinician = hasPermission(user.role, "reviews.claim");
  const canCreateAssessment = hasPermission(user.role, "assessments.create");
  const [localTime, setLocalTime] = useState(() => new Date());
  const [data, setData] = useState<Overview | null>(null);
  const [riskState, setRiskState] = useState<{ risk: Risk | null; loaded: boolean }>({ risk: null, loaded: false });
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLocalTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    setError(false);
    setRiskState({ risk: null, loaded: false });
    const org = user.organizationId;
    const reviews = (params: Record<string, string>) => listClinicalReviews(org, new URLSearchParams({ page: "1", pageSize: "3", ...params }));
    let supplemental: Partial<Overview> = {};
    const update = (patch: Partial<Overview>) => {
      supplemental = { ...supplemental, ...patch };
      if (active) setData(current => current ? { ...current, ...patch } : current);
    };
    getOverviewSummary(org).then(summary => {
      if (!active) return;
      setData({
        summary,
        queuedReviews: null, myReviews: null, seats: 0, userLimit: null, enabledUsers: null, pendingInvitations: 0,
        ...supplemental,
      });
      if (isAdmin || isClinician) {
        // The risk calculation and summary compete for the same database. Starting
        // risk after summary lets both finish sooner than running them together.
        getOverviewRisk(org).then(risk => { if (active) setRiskState({ risk, loaded: true }); })
          .catch(() => { if (active) setRiskState({ risk: null, loaded: true }); });
      }
    }).catch(() => { if (active) setError(true); });
    if (isAdmin || isClinician) {
      reviews({ state: "QUEUED" }).then(queuedReviews => update({ queuedReviews })).catch(() => {});
    }
    if (isClinician) reviews({ state: "IN_REVIEW", mine: "true" }).then(myReviews => update({ myReviews })).catch(() => {});
    if (isAdmin) Promise.all([listOrganizationUsers(org), getOrganization(org)]).then(([members, organization]) => update({
      seats: members.filter(item => item.active).length,
      userLimit: organization.entitlement?.userLimit ?? null,
      enabledUsers: members.filter(item => item.active && item.status === "ACTIVE").length,
      pendingInvitations: organization.invitations.filter(item => item.status === "PENDING" && item.expiresAt.getTime() > Date.now()).length,
    })).catch(() => {});
    return () => { active = false; };
  }, [user.organizationId, isAdmin, isClinician, attempt, workspaceRevision]);

  const growth = (total: number, added: number) => ({ total, added, percent: total > added ? Math.round(added / (total - added) * 100) : null });
  const patientGrowth = data ? growth(data.summary.patientCount, data.summary.patientsAdded30Days) : null;
  const completedGrowth = data ? growth(data.summary.completedCount, data.summary.completedAdded30Days) : null;
  const highRiskTrend = riskState.risk && riskState.risk.highRiskPatients !== riskState.risk.highRiskPatients30DaysAgo
    ? { change: riskState.risk.highRiskPatients - riskState.risk.highRiskPatients30DaysAgo, percent: null, increaseIsGood: false }
    : undefined;
  const myAssessmentActions = data?.summary.myAssessmentActions ?? 0;
  const readyToSend = data?.summary.readyToSend ?? 0;
  const correctionsToMake = data?.summary.correctionsToMake ?? 0;
  const scoringIssues = data?.summary.scoringIssues ?? 0;
  return <>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4" aria-label="Overview greeting">
      <GreetingBanner hour={localTime.getHours()} displayName={user.displayName} />
    </header>
    {error ? <Card className="surface p-6"><p role="alert">Overview could not be loaded.</p><Button className="w-fit" variant="outline" onPress={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <section aria-label="Overview statistics" aria-busy={!data} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {data ? <OverviewStatCard label="Total patients" value={patientGrowth?.total ?? null} icon={UsersRound} trend={patientGrowth ? { change: patientGrowth.added, percent: patientGrowth.percent, increaseIsGood: true } : undefined} detail="vs 30 days ago" to="/patients" /> : <OverviewStatSkeleton />}
        {(isClinician || isAdmin) && <>
          {data ? <OverviewStatCard label="Assessments completed" value={completedGrowth?.total ?? null} icon={ClipboardCheck} trend={completedGrowth ? { change: completedGrowth.added, percent: completedGrowth.percent, increaseIsGood: true } : undefined} detail="vs 30 days ago" to="/assessments?status=COMPLETED" /> : <OverviewStatSkeleton />}
          {riskState.loaded ? <OverviewStatCard label="High risk patients" value={riskState.risk?.highRiskPatients ?? null} icon={TriangleAlert} tone="alert" trend={highRiskTrend} detail="vs 30 days ago" to="/assessments?tab=completed&risk=high" /> : <OverviewStatSkeleton />}
          {isAdmin
            ? data ? <OverviewStatCard label="Reviews awaiting assignment" value={data.queuedReviews?.total ?? null} icon={ClipboardList} detail="Unclaimed clinical reviews" to="/assessments?tab=clinical-reviews&review=QUEUED" /> : <OverviewStatSkeleton />
            : data ? <OverviewStatCard label="My assessment actions" value={myAssessmentActions} icon={ClipboardList} detail="Drafts, corrections, ready to send" to="/assessments?status=MY_ACTIONS" /> : <OverviewStatSkeleton />}
        </>}
      </section>
    </>}
    {!error && (isClinician || isAdmin) && <>
      {isAdmin
        ? <div className="mt-7">{data ? <QuickActions isAdmin canCreateAssessment={false} queuedReviews={data.queuedReviews} myReviews={null} readyToSend={0} correctionsToMake={0} /> : <OverviewActionsSkeleton />}</div>
        : <><div className="mt-7 grid items-stretch gap-4 min-[860px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">{data ? <PriorityAssessments organizationId={user.organizationId} initial={data.summary.priority} /> : <OverviewPrioritySkeleton />}{data ? <QuickActions isAdmin={false} canCreateAssessment={canCreateAssessment} queuedReviews={data.queuedReviews} myReviews={data.myReviews} readyToSend={readyToSend} correctionsToMake={correctionsToMake} /> : <OverviewActionsSkeleton />}</div><AssessmentActivityCalendar organizationId={user.organizationId} /></>}
      {riskState.loaded ? <RiskOverviewCards risk={riskState.risk} /> : <OverviewRiskSkeleton />}
    </>}
    {data && isAdmin && <>
      {(data.queuedReviews?.total !== 0 || scoringIssues > 0 || data.pendingInvitations > 0) && <section className="mt-7" aria-label="Organization operations">
        <div className="mb-4"><h2 className="text-lg font-semibold">Organization operations</h2><p className="text-sm text-muted-foreground">Items an administrator can investigate or assign</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(!data.queuedReviews || data.queuedReviews.total > 0) && <ActionCard title="Awaiting review assignment" count={data.queuedReviews?.total ?? "—"} detail={data.queuedReviews ? "Unclaimed clinical reviews" : "Review count unavailable"} to="/assessments?tab=clinical-reviews&review=QUEUED" />}
            {scoringIssues > 0 && <ActionCard title="Scoring unavailable" count={scoringIssues} detail="Open the assessment to inspect and retry when appropriate" to="/assessments?status=SCORING_UNAVAILABLE" />}
            {data.pendingInvitations > 0 && <ActionCard title="Pending invitations" count={data.pendingInvitations} detail="Review invitations and available seats" to="/users" />}
          </div>
      </section>}
      {data.enabledUsers !== null && <UserSeats enabled={data.enabledUsers} reserved={data.seats + data.pendingInvitations} pending={data.pendingInvitations} limit={data.userLimit} />}
      <OverviewUsage organizationId={user.organizationId} />
    </>}
    {!error && (isClinician || isAdmin) && (data ? <OverviewBottomCards organizationId={user.organizationId} initial={data.summary.recent} risk={riskState.risk} riskLoaded={riskState.loaded} /> : <section className="mt-7 grid gap-4 min-[720px]:grid-cols-2" aria-label="Recent patients and NIQ insights"><OverviewRecentSkeleton />{riskState.loaded ? <NutritionInsights risk={riskState.risk} /> : <OverviewInsightsSkeleton />}</section>)}
    {data && !isAdmin && !isClinician && <section className="mt-7" aria-label="Patient registration"><h2 className="text-lg font-semibold">Patient registration</h2><p className="text-sm text-muted-foreground">Register patients and keep their details current.</p><RecentPatients recent={data.summary.recent.items} /></section>}
    {!data && !error && !isAdmin && !isClinician && <div className="mt-7"><OverviewRecentSkeleton /></div>}
  </>;
}
