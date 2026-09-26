import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, ClinicalReviewQueue, Patient } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, ClipboardCheck, ClipboardList, Plus, Sparkles, Stethoscope, TriangleAlert, UserRoundPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OverviewUsage } from "../components/OverviewUsage";
import { GreetingIllustration } from "../components/GreetingIllustration";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { getOrganization, getOverviewRisk, listAssessments, listOrganizationUsers, listPatients } from "../lib/api";
import { assessmentStatusLabels } from "../lib/patient-display";
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

function GreetingBanner({ hour, displayName, canCreateAssessment }: { hour: number; displayName: string; canCreateAssessment: boolean }) {
  const greeting = greetingForHour(hour);
  const period = greeting === "Good morning" ? "morning" : greeting === "Good afternoon" ? "afternoon" : "evening";
  const title = `${greeting}, ${displayName}!`;
  return <>
    <div className="flex min-w-0 items-center gap-4">
      <GreetingIllustration period={period} />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
    </div>
    {canCreateAssessment && <RouterButtonLink to="/assessments/new" className="shrink-0"><Plus className="size-4" aria-hidden="true" />New assessment</RouterButtonLink>}
  </>;
}

function ActionCard({ title, count, detail, to }: { title: string; count: number | string; detail: string; to: string }) {
  return <Link to={to} className="surface flex min-h-32 flex-col justify-between gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-start justify-between gap-3"><h3 className="font-medium text-foreground">{title}</h3><ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <div><strong className="text-2xl font-semibold">{count}</strong><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
  </Link>;
}

function QuickActions({ assessments, canAddPatient }: { assessments: AssessmentSummary[]; canAddPatient: boolean }) {
  const draft = assessments.filter(item => item.myAction === "EDIT_DRAFT" || item.myAction === "CORRECT_DRAFT")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const actions = [
    ...(draft ? [{ label: draft.myAction === "CORRECT_DRAFT" ? "Continue corrections" : "Continue draft", detail: `${draft.reference} · ${draft.patient.displayName}`, to: `/assessments/${draft.reference}`, icon: ClipboardList }] : []),
    ...(canAddPatient ? [{ label: "Add patient", detail: "Register a new patient", to: "/patients/new", icon: UserRoundPlus }] : []),
    { label: "Clinical reviews", detail: "Open review work", to: "/assessments?tab=clinical-reviews", icon: Stethoscope },
  ];
  return <section className="relative mt-7 overflow-hidden rounded-2xl border border-primary/30 p-4 text-white shadow-md" aria-label="Quick actions" style={{ background: "linear-gradient(110deg, color-mix(in srgb, var(--primary) 28%, #173942), color-mix(in srgb, var(--secondary) 20%, #173942))" }}>
    <div className="pointer-events-none absolute -right-12 -top-20 size-44 rounded-full border border-white/20" aria-hidden="true" />
    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-3 lg:w-56 lg:shrink-0"><span className="grid size-12 shrink-0 place-items-center rounded-full border border-white/25 bg-white/15"><Sparkles className="size-6" aria-hidden="true" /></span><div><h2 className="text-base font-semibold">Quick actions</h2><p className="text-sm text-white/85">Start or continue care</p></div></div>
      <div className="grid flex-1 gap-2 min-[650px]:grid-cols-3">{actions.map(({ label, detail, to, icon: Icon }) => <Link key={label} to={to} title={detail} aria-label={`${label}: ${detail}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white bg-white px-3 py-2 text-center text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Icon className="size-4 shrink-0 text-brand-ink" aria-hidden="true" />{label}</Link>)}</div>
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

function MyAssessmentActions({ records }: { records: AssessmentSummary[] }) {
  const recent = [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 3);
  const actionLabel = (record: AssessmentSummary) => record.myAction === "CORRECT_DRAFT" ? "Continue corrections" : record.myAction === "SEND_FOR_REVIEW" ? "Send for review" : assessmentStatusLabels[record.status];
  return <section className="surface p-5" aria-label="My assessment actions">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">My assessment actions</h3><p className="text-sm text-muted-foreground">{records.length} to continue or send</p></div><Link className="text-sm text-primary hover:underline" to="/assessments?status=MY_ACTIONS">View all my actions</Link></div>
    {recent.length ? <ul className="divide-y">{recent.map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><Link className="font-medium text-foreground hover:underline" to={`/assessments/${record.reference}`}>{record.patient.displayName}</Link><p className="text-xs text-muted-foreground">{record.reference} · {record.facility?.name ?? "No facility"}</p></div><span className="text-xs text-muted-foreground">{actionLabel(record)} · Started {record.createdAt.toLocaleDateString("en-GB")}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No assessment actions assigned to you.</p>}
  </section>;
}

function ReviewWork({ queued, mine }: { queued: ClinicalReviewQueue | null; mine: ClinicalReviewQueue | null }) {
  return <section className="surface p-5" aria-label="Clinical reviews">
    <h3 className="font-semibold">Clinical reviews</h3>
    {queued?.total === 0 && mine?.total === 0 ? <p className="mt-4 text-sm text-muted-foreground">No reviews are waiting or assigned to you.</p>
      : <div className="mt-3 divide-y">
        {(!queued || !mine) && <p className="py-3 text-sm text-muted-foreground">Some review counts are unavailable. <Link className="text-primary hover:underline" to="/assessments?tab=clinical-reviews">Open reviews</Link></p>}
        {!!queued?.total && <Link className="flex items-center justify-between gap-3 py-3 text-sm text-foreground hover:text-primary" to="/assessments?tab=clinical-reviews&review=QUEUED"><span>Awaiting a reviewer</span><span className="font-semibold">{queued.total} <ArrowRight className="inline size-4" aria-hidden="true" /></span></Link>}
        {!!mine?.total && <Link className="flex items-center justify-between gap-3 py-3 text-sm text-foreground hover:text-primary" to="/assessments?tab=clinical-reviews&review=mine-active"><span>My reviews in progress</span><span className="font-semibold">{mine.total} <ArrowRight className="inline size-4" aria-hidden="true" /></span></Link>}
      </div>}
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
  const highRiskTrend = data?.highRiskPatients != null && data.highRiskPatients30DaysAgo != null
    ? { change: data.highRiskPatients - data.highRiskPatients30DaysAgo, percent: null, increaseIsGood: false }
    : undefined;
  const myAssessmentActions = data?.assessments.filter(item => !!item.myAction) ?? [];
  const scoringIssues = data?.assessments.filter(item => item.status === "SCORING_UNAVAILABLE").length ?? 0;
  return <>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4" aria-label="Overview greeting">
      <GreetingBanner hour={localTime.getHours()} displayName={user.displayName} canCreateAssessment={canCreateAssessment} />
    </header>
    {error ? <Card className="surface p-6"><p role="alert">Overview could not be loaded.</p><Button className="w-fit" variant="outline" onPress={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <section aria-label="Overview statistics" aria-busy={!data} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewStatCard label="Total patients" value={patientGrowth?.total ?? null} icon={UsersRound} trend={patientGrowth ? { change: patientGrowth.added, percent: patientGrowth.percent, increaseIsGood: true } : undefined} detail="vs 30 days ago" to="/patients" />
        {(isClinician || isAdmin) && <>
          <OverviewStatCard label="Assessments completed" value={completedGrowth?.total ?? null} icon={ClipboardCheck} trend={completedGrowth ? { change: completedGrowth.added, percent: completedGrowth.percent, increaseIsGood: true } : undefined} detail="vs 30 days ago" to="/assessments?status=COMPLETED" />
          <OverviewStatCard label="High Risk patients" value={data?.highRiskPatients ?? null} icon={TriangleAlert} tone="alert" trend={highRiskTrend} detail="vs 30 days ago" />
          <OverviewStatCard label="My assessment actions" value={data ? myAssessmentActions.length : null} icon={ClipboardList} detail="Drafts, corrections, ready to send" to="/assessments?status=MY_ACTIONS" />
        </>}
      </section>
    </>}
    {data && (isClinician || isAdmin) && <>
      <QuickActions assessments={data.assessments} canAddPatient={hasPermission(user.role, "patients.create")} />
      <AssessmentActivityCalendar organizationId={user.organizationId} assessments={data.assessments} />
      <RiskOverviewCards risk={data.risk} assessments={data.assessments} />
    </>}
    {data && isClinician && <section className="mt-7" aria-label="Clinical work">
      <div className="mb-4"><h2 className="text-lg font-semibold">Clinical work</h2><p className="text-sm text-muted-foreground">Assessments and reviews in your accessible facilities</p></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MyAssessmentActions records={myAssessmentActions} />
        <ReviewWork queued={data.queuedReviews} mine={data.myReviews} />
      </div>
    </section>}
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
