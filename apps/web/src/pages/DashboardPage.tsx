import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, ClinicalReviewQueue, Patient } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, ClipboardCheck, ClipboardList, Plus, Sparkles, Stethoscope, TriangleAlert, UserRoundPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OverviewUsage } from "../components/OverviewUsage";
import { GreetingIllustration } from "../components/GreetingIllustration";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { getOrganization, getOverviewRisk, listAssessments, listOrganizationUsers, listPatients } from "../lib/api";
import { overviewGrowth } from "./overview-growth";
import { OverviewStatCard } from "./OverviewStatCard";
import { AssessmentActivityCalendar, RiskOverviewCards } from "./OverviewClinicalCards";
import { OverviewBottomCards } from "./OverviewBottomCards";

type Overview = { patients: Patient[]; assessments: AssessmentSummary[]; risk: Awaited<ReturnType<typeof getOverviewRisk>> | null; highRiskPatients: number | null; highRiskPatients30DaysAgo: number | null; enabledUsers: number | null; pendingInvitations: number; seats: number; userLimit: number | null; queuedReviews: ClinicalReviewQueue | null; myReviews: ClinicalReviewQueue | null };

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
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
    </div>
  </>;
}

function ActionCard({ title, count, detail, to }: { title: string; count: number | string; detail: string; to: string }) {
  return <Link to={to} className="surface flex min-h-32 flex-col justify-between gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-start justify-between gap-3"><h3 className="font-medium text-foreground">{title}</h3><ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <div><strong className="text-2xl font-semibold">{count}</strong><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
  </Link>;
}

function QuickActions({ assessments, canAddPatient, canCreateAssessment, queuedReviews, myReviews }: { assessments: AssessmentSummary[]; canAddPatient: boolean; canCreateAssessment: boolean; queuedReviews: ClinicalReviewQueue | null; myReviews: ClinicalReviewQueue | null }) {
  const draft = assessments.filter(item => item.myAction === "EDIT_DRAFT" || item.myAction === "CORRECT_DRAFT")
    .sort((a, b) => (b.updatedAt ?? b.createdAt).getTime() - (a.updatedAt ?? a.createdAt).getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0];
  const reviewDetail = [queuedReviews?.total ? `${queuedReviews.total} waiting` : null, myReviews?.total ? `${myReviews.total} in progress` : null].filter(Boolean).join(" · ") || "Open review work";
  const actions = [
    ...(draft ? [{ label: draft.myAction === "CORRECT_DRAFT" ? "Continue corrections" : "Continue draft", detail: `${draft.reference} · ${draft.patient.displayName}`, to: `/assessments/${draft.reference}`, icon: ClipboardList }] : []),
    ...(canCreateAssessment ? [{ label: "New assessment", detail: "Start an assessment", to: "/assessments/new", icon: Plus }] : []),
    ...(canAddPatient ? [{ label: "Add patient", detail: "Register a new patient", to: "/patients/new", icon: UserRoundPlus }] : []),
    { label: "Clinical reviews", detail: reviewDetail, to: "/assessments?tab=clinical-reviews", icon: Stethoscope },
  ];
  return <section className="relative mt-7 overflow-hidden rounded-2xl border border-primary/20 p-4 text-foreground shadow-sm" aria-label="Quick actions" style={{ background: "linear-gradient(110deg, color-mix(in srgb, var(--primary) 23%, white), color-mix(in srgb, var(--primary) 10%, white) 62%, color-mix(in srgb, var(--secondary) 8%, white))" }}>
    <div className="pointer-events-none absolute -right-12 -top-20 size-44 rounded-full border border-primary/15" aria-hidden="true" />
    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-3 lg:w-56 lg:shrink-0"><span className="grid size-12 shrink-0 place-items-center rounded-full border border-primary/20 bg-white/60 text-brand-ink"><Sparkles className="size-6" aria-hidden="true" /></span><div><h2 className="text-base font-semibold">Quick actions</h2><p className="text-sm text-muted-foreground">Start or continue care</p></div></div>
      <div className={`grid flex-1 grid-cols-2 gap-2 ${actions.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>{actions.map(({ label, detail, to, icon: Icon }) => <Link key={label} to={to} title={detail} aria-label={`${label}: ${detail}`} className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-primary/15 bg-white/60 px-2 py-2 text-center text-xs font-medium text-foreground no-underline transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-14 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm"><Icon className="size-4 shrink-0 text-brand-ink" aria-hidden="true" /><span className="min-w-0"><span className="block">{label}</span>{(to === `/assessments/${draft?.reference}` || to === "/assessments?tab=clinical-reviews") && <span className="block truncate text-[11px] font-normal text-muted-foreground sm:text-xs">{detail}</span>}</span></Link>)}</div>
    </div>
  </section>;
}

function RecentPatients({ patients }: { patients: Patient[] }) {
  const recent = [...patients].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 4);
  return <section className="surface mt-7 p-5" aria-label="Recently registered patients">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recently registered patients</h2><Link className="text-sm text-primary hover:underline" to="/patients">Register or find a patient</Link></div>
    {recent.length ? <ul className="divide-y">{recent.map(patient => <li key={patient.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><Link className="font-medium text-foreground hover:underline" to={`/patients/${patient.reference}`}>{patient.displayName}</Link><p className="text-xs text-muted-foreground">{patient.reference} · {patient.homeFacility?.name ?? "No home facility"}</p></div><span className="shrink-0 text-xs text-muted-foreground">{patient.createdAt.toLocaleDateString("en-GB")}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No patients have been registered yet.</p>}
  </section>;
}

function UserSeats({ enabled, reserved, pending, limit }: { enabled: number; reserved: number; pending: number; limit: number | null }) {
  const percent = limit === null ? null : limit === 0 ? (reserved > 0 ? 100 : 0) : Math.min(100, reserved / limit * 100);
  return <section aria-label="Team and user seats" className="mt-7"><Link to="/users" className="surface flex flex-wrap items-center justify-between gap-4 p-4 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"><div><h2 className="font-semibold">Team and user seats</h2><p className="mt-1 text-sm text-muted-foreground">{enabled} enabled users · {pending} pending invitations</p></div><div className="min-w-44 text-sm"><span className="font-medium">{limit === null ? "Unlimited seats" : `${reserved} of ${limit} seats reserved`}</span>{percent !== null && <div role="meter" aria-label="User seats" aria-valuemin={0} aria-valuemax={Math.max(limit ?? 0, reserved, 1)} aria-valuenow={reserved} aria-valuetext={`${reserved} of ${limit} seats reserved`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={reserved >= (limit ?? Infinity) ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${percent}%` }} /></div>}</div></Link></section>;
}

export function DashboardPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const isAdmin = hasPermission(user.role, "users.manage");
  const isClinician = hasPermission(user.role, "reviews.claim");
  const canCreateAssessment = hasPermission(user.role, "assessments.edit");
  const [localTime, setLocalTime] = useState(() => new Date());
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLocalTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    setData(null); setError(false);
    const org = user.organizationId;
    const reviews = (params: Record<string, string>) => listClinicalReviews(org, new URLSearchParams({ page: "1", pageSize: "3", ...params }));
    Promise.all([
      listPatients(org),
      isAdmin || isClinician ? listAssessments(org) : Promise.resolve([] as AssessmentSummary[]),
      isAdmin || isClinician ? getOverviewRisk(org).catch(() => null) : Promise.resolve(null),
      isAdmin ? listOrganizationUsers(org) : Promise.resolve(null),
      isAdmin ? getOrganization(org) : Promise.resolve(null),
      isAdmin || isClinician ? reviews({ state: "QUEUED" }).catch(() => null) : Promise.resolve(null),
      isClinician ? reviews({ state: "IN_REVIEW", mine: "true" }).catch(() => null) : Promise.resolve(null),
    ]).then(([patients, assessments, overviewRisk, members, organization, queuedReviews, myReviews]) => {
      if (!active) return;
      setData({
        patients, assessments, risk: overviewRisk, highRiskPatients: overviewRisk?.highRiskPatients ?? null, highRiskPatients30DaysAgo: overviewRisk?.highRiskPatients30DaysAgo ?? null, queuedReviews, myReviews,
        seats: members?.filter((item) => item.active).length ?? 0,
        userLimit: organization?.entitlement?.userLimit ?? null,
        enabledUsers: members ? members.filter((item) => item.active && item.status === "ACTIVE").length : null,
        pendingInvitations: organization?.invitations.filter((item) => item.status === "PENDING" && item.expiresAt.getTime() > Date.now()).length ?? 0,
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user.organizationId, isAdmin, isClinician, attempt]);

  const now = new Date();
  const patientGrowth = data ? overviewGrowth(data.patients.map(item => item.createdAt), now) : null;
  const completedGrowth = data ? overviewGrowth(data.assessments.flatMap(item => item.status === "COMPLETED" && item.completedAt ? [item.completedAt] : []), now) : null;
  const highRiskTrend = data?.highRiskPatients != null && data.highRiskPatients30DaysAgo != null && data.highRiskPatients !== data.highRiskPatients30DaysAgo
    ? { change: data.highRiskPatients - data.highRiskPatients30DaysAgo, percent: null, increaseIsGood: false }
    : undefined;
  const myAssessmentActions = data?.assessments.filter(item => !!item.myAction) ?? [];
  const scoringIssues = data?.assessments.filter(item => item.status === "SCORING_UNAVAILABLE").length ?? 0;
  return <>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4" aria-label="Overview greeting">
      <GreetingBanner hour={localTime.getHours()} displayName={user.displayName} />
    </header>
    {error ? <Card className="surface p-6"><p role="alert">Overview could not be loaded.</p><Button className="w-fit" variant="outline" onPress={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <section aria-label="Overview statistics" aria-busy={!data} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <OverviewStatCard label="Total patients" value={patientGrowth?.total ?? null} icon={UsersRound} trend={patientGrowth ? { change: patientGrowth.added, percent: patientGrowth.percent, increaseIsGood: true } : undefined} detail="vs 30 days ago" to="/patients" />
        {(isClinician || isAdmin) && <>
          <OverviewStatCard label="Assessments completed" value={completedGrowth?.total ?? null} icon={ClipboardCheck} trend={completedGrowth ? { change: completedGrowth.added, percent: completedGrowth.percent, increaseIsGood: true } : undefined} detail="vs 30 days ago" to="/assessments?status=COMPLETED" />
          <OverviewStatCard label="High Risk patients" value={data?.highRiskPatients ?? null} icon={TriangleAlert} tone="alert" trend={highRiskTrend} detail="vs 30 days ago" />
          <OverviewStatCard label="My assessment actions" value={data ? myAssessmentActions.length : null} icon={ClipboardList} detail="Drafts, corrections, ready to send" to="/assessments?status=MY_ACTIONS" />
        </>}
      </section>
    </>}
    {data && (isClinician || isAdmin) && <>
      <QuickActions assessments={data.assessments} canAddPatient={hasPermission(user.role, "patients.create")} canCreateAssessment={canCreateAssessment} queuedReviews={data.queuedReviews} myReviews={data.myReviews} />
      <AssessmentActivityCalendar organizationId={user.organizationId} assessments={data.assessments} />
      <RiskOverviewCards risk={data.risk} assessments={data.assessments} />
    </>}
    {data && isAdmin && <>
      <section className="mt-7" aria-label="Organization operations">
        <div className="mb-4"><h2 className="text-lg font-semibold">Organization operations</h2><p className="text-sm text-muted-foreground">Items an administrator can investigate or assign</p></div>
        {data.queuedReviews?.total === 0 && scoringIssues === 0 && data.pendingInvitations === 0
          ? <div className="surface p-5 text-sm"><strong className="font-medium">All clear</strong><p className="mt-1 text-muted-foreground">No unclaimed reviews, scoring exceptions, or pending invitations.</p></div>
          : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(!data.queuedReviews || data.queuedReviews.total > 0) && <ActionCard title="Awaiting review assignment" count={data.queuedReviews?.total ?? "—"} detail={data.queuedReviews ? "Unclaimed clinical reviews" : "Review count unavailable"} to="/assessments?tab=clinical-reviews&review=QUEUED" />}
            {scoringIssues > 0 && <ActionCard title="Scoring unavailable" count={scoringIssues} detail="Open the assessment to inspect and retry when appropriate" to="/assessments?status=SCORING_UNAVAILABLE" />}
            {data.pendingInvitations > 0 && <ActionCard title="Pending invitations" count={data.pendingInvitations} detail="Review invitations and available seats" to="/users" />}
          </div>}
      </section>
      <UserSeats enabled={data.enabledUsers ?? 0} reserved={data.seats + data.pendingInvitations} pending={data.pendingInvitations} limit={data.userLimit} />
      <OverviewUsage organizationId={user.organizationId} />
    </>}
    {data && (isClinician || isAdmin) && <OverviewBottomCards patients={data.patients} assessments={data.assessments} risk={data.risk} />}
    {data && !isAdmin && !isClinician && <section className="mt-7" aria-label="Patient registration"><h2 className="text-lg font-semibold">Patient registration</h2><p className="text-sm text-muted-foreground">Register patients and keep their details current.</p><RecentPatients patients={data.patients} /></section>}
  </>;
}
