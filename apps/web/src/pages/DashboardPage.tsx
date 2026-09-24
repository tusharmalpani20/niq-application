import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, ClinicalReviewQueue, Patient } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, Building2, ClipboardList, UserRound, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OverviewUsage } from "../components/OverviewUsage";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { getOrganization, listAssessments, listFacilities, listOrganizationUsers, listPatients } from "../lib/api";
import { assessmentStatusLabels } from "../lib/patient-display";
import { monthlyTrend } from "./monthly-trend";
import { MonthlyTrendCard } from "./MonthlyTrendCard";

type Overview = { patients: Patient[]; assessments: AssessmentSummary[]; facilityCount: number; enabledUsers: number | null; pendingInvitations: number; seats: number; userLimit: number | null; queuedReviews: ClinicalReviewQueue | null; myReviews: ClinicalReviewQueue | null };

function ActionCard({ title, count, detail, to }: { title: string; count: number | string; detail: string; to: string }) {
  return <Link to={to} className="surface flex min-h-32 flex-col justify-between gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-start justify-between gap-3"><h3 className="font-medium text-foreground">{title}</h3><ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <div><strong className="text-2xl font-semibold">{count}</strong><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
  </Link>;
}

function RecentPatients({ patients }: { patients: Patient[] }) {
  const recent = [...patients].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 4);
  return <section className="surface mt-7 p-5" aria-label="Recently registered patients">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recently registered patients</h2><Link className="text-sm text-primary hover:underline" to="/patients">Register or find a patient</Link></div>
    {recent.length ? <ul className="divide-y">{recent.map(patient => <li key={patient.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><Link className="font-medium text-foreground hover:underline" to={`/patients/${patient.reference}`}>{patient.displayName}</Link><p className="text-xs text-muted-foreground">{patient.reference} · {patient.homeFacility?.name ?? "No home facility"}</p></div><span className="shrink-0 text-xs text-muted-foreground">{patient.createdAt.toLocaleDateString("en-GB")}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No patients have been registered yet.</p>}
  </section>;
}

function OpenAssessments({ records }: { records: AssessmentSummary[] }) {
  const recent = [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 3);
  return <section className="surface p-5" aria-label="Open assessments">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Open assessments in your facilities</h3><p className="text-sm text-muted-foreground">{records.length} to continue or score</p></div><Link className="text-sm text-primary hover:underline" to="/assessments?status=OPEN">View all open assessments</Link></div>
    {recent.length ? <ul className="divide-y">{recent.map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><Link className="font-medium text-foreground hover:underline" to={`/assessments/${record.reference}`}>{record.patient.displayName}</Link><p className="text-xs text-muted-foreground">{record.reference} · {record.facility?.name ?? "No facility"}</p></div><span className="text-xs text-muted-foreground">{assessmentStatusLabels[record.status]} · Started {record.createdAt.toLocaleDateString("en-GB")}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No open assessments in your accessible facilities.</p>}
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
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(false);
    const org = user.organizationId;
    const reviews = (params: Record<string, string>) => listClinicalReviews(org, new URLSearchParams({ page: "1", pageSize: "3", ...params }));
    Promise.all([
      listPatients(org),
      listFacilities(org),
      isAdmin || isClinician ? listAssessments(org) : Promise.resolve([] as AssessmentSummary[]),
      isAdmin ? listOrganizationUsers(org) : Promise.resolve(null),
      isAdmin ? getOrganization(org) : Promise.resolve(null),
      isAdmin || isClinician ? reviews({ state: "QUEUED" }).catch(() => null) : Promise.resolve(null),
      isClinician ? reviews({ state: "IN_REVIEW", mine: "true" }).catch(() => null) : Promise.resolve(null),
    ]).then(([patients, facilities, assessments, members, organization, queuedReviews, myReviews]) => {
      if (!active) return;
      setData({
        patients, assessments, queuedReviews, myReviews,
        seats: members?.filter((item) => item.active).length ?? 0,
        userLimit: organization?.entitlement?.userLimit ?? null,
        facilityCount: facilities.filter((item) => item.status === "ACTIVE").length,
        enabledUsers: members ? members.filter((item) => item.active && item.status === "ACTIVE").length : null,
        pendingInvitations: organization?.invitations.filter((item) => item.status === "PENDING" && item.expiresAt.getTime() > Date.now()).length ?? 0,
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user.organizationId, isAdmin, isClinician, attempt]);

  const now = new Date();
  const patientTrend = data ? monthlyTrend(data.patients.map(item => item.createdAt), now) : null;
  const completedTrend = data ? monthlyTrend(data.assessments.flatMap(item => item.status === "COMPLETED" && item.completedAt ? [item.completedAt] : []), now) : null;
  const openAssessments = data?.assessments.filter(item => item.status === "DRAFT" || item.status === "READY_FOR_SCORING") ?? [];
  const scoringIssues = data?.assessments.filter(item => item.status === "SCORING_UNAVAILABLE").length ?? 0;
  const monthlyMetrics = [
    { label: "Patients registered this month", trend: patientTrend, to: "/patients?registered=this-month", icon: CalendarDays },
    ...(isClinician || isAdmin ? [{ label: "Assessments completed this month", trend: completedTrend, to: "/assessments?status=COMPLETED_THIS_MONTH", icon: ClipboardList }] : []),
  ];
  const snapshotMetrics = [
    { label: "Patients in your facilities", value: data?.patients.length, detail: null, to: "/patients", icon: UserRound },
    { label: "Active facilities", value: data?.facilityCount, detail: null, to: "/facilities", icon: Building2 },
  ];
  const metricCard = ({ label, value, detail, to, icon: MetricIcon }: { label: string; value: number | undefined; detail: string | null; to: string; icon: typeof UserRound }) => <Link key={label} to={to} className="surface grid gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><MetricIcon className="size-5 text-primary" aria-hidden="true" /></div>
    <strong className="text-3xl font-semibold tracking-tight">{value ?? "—"}</strong>
    {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
  </Link>;
  return <>
    <h1 className="patient-page-title">Overview</h1>
    {error ? <Card className="surface p-6"><p role="alert">Overview could not be loaded.</p><Button className="w-fit" variant="outline" onPress={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <section aria-label="This month" aria-busy={!data} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">This month</h2><span className="text-xs text-muted-foreground">{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })} to date</span></div>
        <div className="grid gap-4 sm:grid-cols-2">{monthlyMetrics.map(metric => <MonthlyTrendCard key={metric.label} {...metric} />)}</div>
      </section>
      <section aria-label="At a glance" aria-busy={!data} className="mt-7 space-y-3">
        <h2 className="text-lg font-semibold">At a glance</h2>
        <div className="grid gap-4 sm:grid-cols-2">{snapshotMetrics.map(metricCard)}</div>
      </section>
    </>}
    {data && isClinician && <section className="mt-7" aria-label="Clinical work">
      <div className="mb-4"><h2 className="text-lg font-semibold">Clinical work</h2><p className="text-sm text-muted-foreground">Assessments and reviews in your accessible facilities</p></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <OpenAssessments records={openAssessments} />
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
    {data && !isAdmin && !isClinician && <section className="mt-7" aria-label="Patient registration"><h2 className="text-lg font-semibold">Patient registration</h2><p className="text-sm text-muted-foreground">Register patients and keep their details current.</p><RecentPatients patients={data.patients} /></section>}
  </>;
}
