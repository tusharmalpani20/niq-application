import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, ClinicalReviewQueue, Patient } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, Building2, ClipboardList, Users, UserRound, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CapacityCard, OverviewUsage } from "../components/OverviewUsage";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { getOrganization, listAssessments, listFacilities, listOrganizationUsers, listPatients } from "../lib/api";

type Overview = { patients: Patient[]; assessments: AssessmentSummary[]; facilityCount: number; enabledUsers: number | null; pendingInvitations: number; seats: number; userLimit: number | null; queuedReviews: ClinicalReviewQueue | null; myReviews: ClinicalReviewQueue | null };

const thisMonth = (date: Date, now: Date) => date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();

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
  const monthly = data?.patients.filter(item => thisMonth(item.createdAt, now)).length;
  const monthlyAssessments = data?.assessments.filter(item => thisMonth(item.createdAt, now)).length;
  const drafts = data?.assessments.filter(item => item.status === "DRAFT" || item.status === "READY_FOR_SCORING").length ?? 0;
  const scoringIssues = data?.assessments.filter(item => item.status === "SCORING_UNAVAILABLE").length ?? 0;
  const metrics = [
    { label: "Patients", value: data?.patients.length, detail: "In your accessible facilities", to: "/patients", icon: UserRound },
    { label: "Registered this month", value: monthly, detail: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }), to: "/patients?registered=this-month", icon: CalendarDays },
    ...(isClinician || isAdmin ? [{ label: "Assessments started this month", value: monthlyAssessments, detail: "In your accessible facilities", to: "/assessments", icon: ClipboardList }] : []),
    { label: "Active facilities", value: data?.facilityCount, detail: "Available to your account", to: "/facilities", icon: Building2 },
    ...(isAdmin ? [{ label: "Enabled users", value: data?.enabledUsers, detail: data ? data.pendingInvitations + " pending invitations" : "Organization-wide", to: "/users", icon: Users }] : []),
  ];
  return <>
    <h1 className="patient-page-title">Overview</h1>
    {error ? <Card className="surface p-6"><p role="alert">Overview could not be loaded.</p><Button className="w-fit" variant="outline" onPress={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <section aria-label="Workspace summary" aria-busy={!data} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, to, icon: MetricIcon }) => <Link key={label} to={to} className="surface grid gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
          <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><MetricIcon className="size-5 text-primary" aria-hidden="true" /></div>
          <strong className="text-3xl font-semibold tracking-tight">{value ?? "—"}</strong>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </Link>)}
      </section>
    </>}
    {data && isClinician && <section className="mt-7" aria-label="Clinical work">
      <div className="mb-4"><h2 className="text-lg font-semibold">Clinical work</h2><p className="text-sm text-muted-foreground">Assessments and reviews in your accessible facilities</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard title="Open drafts" count={drafts} detail="Continue an assessment" to="/assessments" />
        <ActionCard title="Awaiting a reviewer" count={data.queuedReviews?.total ?? "—"} detail={data.queuedReviews ? "Available for an eligible clinician to claim" : "Review count unavailable"} to="/assessments?tab=clinical-reviews&review=QUEUED" />
        <ActionCard title="My reviews in progress" count={data.myReviews?.total ?? "—"} detail={data.myReviews ? "Assigned to you for clinical review" : "Review count unavailable"} to="/assessments?tab=clinical-reviews&review=mine-active" />
      </div>
    </section>}
    {data && isAdmin && <>
      <section className="mt-7" aria-label="Organization operations">
        <div className="mb-4"><h2 className="text-lg font-semibold">Organization operations</h2><p className="text-sm text-muted-foreground">Items an administrator can investigate or assign</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ActionCard title="Awaiting review assignment" count={data.queuedReviews?.total ?? "—"} detail={data.queuedReviews ? "Unclaimed clinical reviews" : "Review count unavailable"} to="/assessments?tab=clinical-reviews&review=QUEUED" />
          <ActionCard title="Scoring unavailable" count={scoringIssues} detail="Open the assessment to inspect and retry when appropriate" to="/assessments?status=SCORING_UNAVAILABLE" />
          <ActionCard title="Pending invitations" count={data.pendingInvitations} detail="Review invitations and available seats" to="/users" />
        </div>
      </section>
      <section aria-label="User capacity" className="mt-7"><CapacityCard title="User capacity" used={data.seats + data.pendingInvitations} limit={data.userLimit} detail={`${data.seats} active memberships · ${data.pendingInvitations} pending invitations`} to="/users" /></section>
      <OverviewUsage organizationId={user.organizationId} />
    </>}
    {data && !isAdmin && !isClinician && <section className="mt-7" aria-label="Patient registration"><h2 className="text-lg font-semibold">Patient registration</h2><p className="text-sm text-muted-foreground">Register patients and keep their details current.</p><RecentPatients patients={data.patients} /></section>}
  </>;
}
