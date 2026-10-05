import { facilitySchema, hasPermission, membershipRoleLabels } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, Facility, FacilityPerformance as Performance, OrganizationUser, Patient } from "@niq/application-contracts";
import { ClipboardCheck, ClipboardList, Pencil, Power, UserRoundPlus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { getFacilityPerformance, listAssessments, listFacilities, listOrganizationUsers, listPatients } from "../lib/api";
import { updateFacility } from "../lib/facility-management";
import { openAssessmentStatuses } from "../lib/assessment-work";
import { assessmentStatusLabels } from "../lib/patient-display";
import { FacilityDialog } from "./FacilitiesPage";
import { FacilityPerformance } from "./FacilityPerformance";
import { useWorkspaceRevision } from "../features/notifications/useWorkspaceRevision";
import { OverviewStatCard } from "./OverviewStatCard";
import { periodGrowth } from "./overview-growth";
import { facilityUrl } from "../lib/facility-url";

type FacilityOverview = { facility: Facility; patients: Patient[]; assessments: AssessmentSummary[]; team: OrganizationUser[] | null; performance: Performance | null };
const dateLabel = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
const activityLinkClass = "font-medium text-primary hover:underline focus-visible:underline";

function StatSkeleton() {
  return <div className="surface flex min-h-28 min-w-0 items-center gap-2 p-3 sm:gap-4 sm:p-4">
    <Skeleton className="size-10 shrink-0 rounded-xl sm:size-14 sm:rounded-2xl motion-reduce:animate-none" />
    <div className="min-w-0 flex-1 border-l border-border/70 pl-2 sm:pl-4"><Skeleton className="h-3 w-24 max-w-full motion-reduce:animate-none" /><Skeleton className="mt-2 h-7 w-14 motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-28 max-w-full motion-reduce:animate-none" /></div>
  </div>;
}

function ActivitySkeleton() {
  return <section className="surface p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><Skeleton className="h-5 w-40 max-w-full motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-32 max-w-full motion-reduce:animate-none" /></div><Skeleton className="h-4 w-20 shrink-0 motion-reduce:animate-none" /></div>
    <div className="mt-4 grid gap-3">{Array.from({ length: 3 }, (_, index) => <div className="flex items-center justify-between gap-3 border-t border-border pt-3" key={index}><div className="min-w-0 flex-1"><Skeleton className="h-4 w-28 max-w-full motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-40 max-w-full motion-reduce:animate-none" /></div><Skeleton className="h-5 w-20 shrink-0 rounded-full motion-reduce:animate-none" /></div>)}</div>
  </section>;
}

function FacilityDetailSkeleton({ canManage, canOpenAssessment, canManageUsers, facility }: { canManage: boolean; canOpenAssessment: boolean; canManageUsers: boolean; facility: Facility | null }) {
  return <div role="status" aria-label="Loading facility"><span className="sr-only">Loading facility…</span>
    {facility ? <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/facilities">Facilities</Link><span aria-hidden="true">/</span><span aria-current="page">{facility.name}</span></nav> : <div className="breadcrumb" aria-hidden="true"><Skeleton className="h-4 w-20 motion-reduce:animate-none" /><span>/</span><Skeleton className="h-4 w-28 motion-reduce:animate-none" /></div>}
    <header className="patient-detail-header border-b border-border pb-4"><div className="patient-detail-summary min-w-0">{facility ? <><div className="organization-title-row"><h1>{facility.name}</h1><StatusBadge status={facility.status === "ACTIVE" ? "Active" : "Deactivated"} /></div><p>{facility.code} · {facility.timezone}</p></> : <div aria-hidden="true"><div className="organization-title-row"><Skeleton className="h-8 w-52 max-w-full motion-reduce:animate-none" /><Skeleton className="h-6 w-20 rounded-full motion-reduce:animate-none" /></div><Skeleton className="mt-3 h-4 w-40 max-w-full motion-reduce:animate-none" /></div>}</div>{canManage && <div className="flex gap-2" aria-hidden="true"><Skeleton className="size-10 motion-reduce:animate-none" /><Skeleton className="size-10 motion-reduce:animate-none" /></div>}</header>
    <div aria-hidden="true">
    <section aria-label="Facility at a glance" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <StatSkeleton key={index} />)}</section>
    {canOpenAssessment && <section className="mt-6" aria-label="Facility performance"><Skeleton className="h-5 w-48 max-w-full motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-64 max-w-full motion-reduce:animate-none" /><div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4"><StatSkeleton /><StatSkeleton /></div><div className="surface mt-4 p-5" aria-label="Patient risk categories"><Skeleton className="h-5 w-44 max-w-full motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-56 max-w-full motion-reduce:animate-none" /><Skeleton className="mx-auto mt-5 size-48 rounded-full lg:size-56 motion-reduce:animate-none" /><div className="mt-5 flex flex-wrap justify-center gap-4"><Skeleton className="h-4 w-20 motion-reduce:animate-none" /><Skeleton className="h-4 w-24 motion-reduce:animate-none" /><Skeleton className="h-4 w-20 motion-reduce:animate-none" /></div></div></section>}
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><ActivitySkeleton /><ActivitySkeleton /></div>
    {canManageUsers && <section className="surface mt-4 p-5" aria-label="Facility team"><Skeleton className="h-5 w-36 motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-28 motion-reduce:animate-none" /><div className="mt-5 grid gap-3 sm:grid-cols-2">{Array.from({ length: 3 }, (_, index) => <div className="rounded-lg border border-border p-3" key={index}><Skeleton className="h-4 w-28 max-w-full motion-reduce:animate-none" /><Skeleton className="mt-2 h-3 w-44 max-w-full motion-reduce:animate-none" /></div>)}</div></section>}
  </div></div>;
}

export function FacilityDetailPage() {
  const workspaceRevision = useWorkspaceRevision(["assessment", "patient", "facility", "users"]);
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const location = useLocation();
  const { facilityId: facilityLocator } = useParams();
  const routeFacility = facilitySchema.safeParse((location.state as { facility?: unknown } | null)?.facility);
  const [loadedFacility, setLoadedFacility] = useState<Facility | null>(null);
  const matchesRoute = (facility: Facility) => facility.organizationId === user.organizationId && (facility.id === facilityLocator || facility.code.toLowerCase() === facilityLocator?.toLowerCase());
  const headerFacility = (loadedFacility && matchesRoute(loadedFacility) ? loadedFacility : null) ?? (routeFacility.success && matchesRoute(routeFacility.data) ? routeFacility.data : null);
  const canManage = hasPermission(user.role, "facilities.manage");
  const canManageUsers = hasPermission(user.role, "users.manage");
  const canOpenAssessment = hasPermission(user.role, "assessments.read");
  const [overview, setOverview] = useState<FacilityOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState(current => current === "ready" ? current : "loading");
    const facilitiesPromise = listFacilities(user.organizationId).then(facilities => {
      if (active) setLoadedFacility(facilities.find(item => item.id === facilityLocator || item.code.toLowerCase() === facilityLocator?.toLowerCase()) ?? null);
      return facilities;
    });
    void Promise.all([
      facilitiesPromise, listPatients(user.organizationId), listAssessments(user.organizationId),
      canManageUsers ? listOrganizationUsers(user.organizationId).catch(() => null) : Promise.resolve(null),
    ]).then(async ([facilities, patients, assessments, users]) => {
      if (!active) return;
      const facility = facilities.find(item => item.id === facilityLocator || item.code.toLowerCase() === facilityLocator?.toLowerCase());
      if (!facility) { setState("missing"); return; }
      const performance = canOpenAssessment ? await getFacilityPerformance(user.organizationId, facility.id).catch(() => null) : null;
      if (!active) return;
      setOverview({
        facility,
        patients: patients.filter(item => item.homeFacility?.id === facility.id),
        assessments: assessments.filter(item => item.facility?.id === facility.id),
        team: users?.filter(item => item.active && item.status === "ACTIVE" && (!item.facilities?.length || item.facilities.some(assigned => assigned.id === facility.id))) ?? null,
        performance,
      });
      setState("ready");
      if (`/facilities/${encodeURIComponent(facilityLocator ?? "")}` !== facilityUrl(facility)) navigate(facilityUrl(facility), { replace: true });
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [user.organizationId, canManageUsers, canOpenAssessment, facilityLocator, navigate, reload, workspaceRevision]);

  if (state === "loading") return <FacilityDetailSkeleton canManage={canManage} canOpenAssessment={canOpenAssessment} canManageUsers={canManageUsers} facility={headerFacility} />;
  if (state === "missing") return <Alert><AlertDescription>Facility not found or you do not have access. <Link to="/facilities">Back to facilities</Link></AlertDescription></Alert>;
  if (state === "error" || !overview) return <Alert variant="destructive"><AlertDescription>Facility overview could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button></AlertDescription></Alert>;

  const { facility, patients, assessments, team, performance } = overview;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previousCutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const inLast30Days = (date: Date) => date >= cutoff && date <= now;
  const inPrevious30Days = (date: Date) => date >= previousCutoff && date < cutoff;
  const newPatients = patients.filter(item => inLast30Days(item.createdAt)).length;
  const previousPatients = patients.filter(item => inPrevious30Days(item.createdAt)).length;
  const completionDates = assessments.flatMap(item => item.status === "COMPLETED" && item.completedAt ? [item.completedAt] : []);
  const completed = completionDates.filter(inLast30Days).length;
  const previousCompleted = completionDates.filter(inPrevious30Days).length;
  const open = assessments.filter(item => openAssessmentStatuses.has(item.status));
  const underReview = assessments.filter(item => item.status === "UNDER_REVIEW");
  const needsAttention = assessments.filter(item => item.status === "SCORING_UNAVAILABLE");
  const work = [...open, ...underReview, ...needsAttention].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
  const recentPatients = [...patients].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
  const visibleTeam = [...(team ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)).slice(0, 5);
  const teamColumns: DataTableColumn<OrganizationUser>[] = [
    { id: "name", header: "Name", cell: ({ row }) => row.original.displayName },
    { id: "email", header: "Email", cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span> },
    { id: "role", header: "Role", cell: ({ row }) => membershipRoleLabels[row.original.role] },
  ];
  const saveFacility = (updated: Facility) => { setOverview(value => value ? { ...value, facility: updated } : value); setEditing(false); setChangingStatus(false); if (facilityLocator?.toLowerCase() !== updated.code.toLowerCase()) navigate(facilityUrl(updated), { replace: true }); };

  return <>
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/facilities">Facilities</Link><span aria-hidden="true">/</span><span aria-current="page">{facility.name}</span></nav>
    <header className="patient-detail-header border-b border-border pb-4">
      <div className="patient-detail-summary"><div className="organization-title-row"><h1>{facility.name}</h1><StatusBadge status={facility.status === "ACTIVE" ? "Active" : "Deactivated"} /></div><p>{facility.code} · {facility.timezone}</p></div>
      {canManage && <div className="flex gap-2">
        <TooltipTrigger><Button variant="outline" size="icon-lg" className="size-10" aria-label="Edit facility" onPress={() => setEditing(true)}><Pencil className="size-4" /></Button><Tooltip>Edit facility</Tooltip></TooltipTrigger>
        <TooltipTrigger><Button variant={facility.status === "ACTIVE" ? "destructive-outline" : "outline"} size="icon-lg" className="size-10" aria-label={`${facility.status === "ACTIVE" ? "Deactivate" : "Activate"} facility`} onPress={() => { setStatusError(null); setChangingStatus(true); }}><Power className="size-4" /></Button><Tooltip>{facility.status === "ACTIVE" ? "Deactivate facility" : "Activate facility"}</Tooltip></TooltipTrigger>
      </div>}
    </header>

    {facility.status !== "ACTIVE" && <Alert className="mb-5"><AlertDescription>This facility is deactivated. Existing patient and assessment records remain available.</AlertDescription></Alert>}
    <section aria-label="Facility at a glance" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <OverviewStatCard label="Total patients" value={patients.length} icon={UsersRound} detail="With this home facility" to={`/patients?facility=${facility.id}`} />
      <OverviewStatCard label="Patients registered" value={newPatients} icon={UserRoundPlus} trend={periodGrowth(newPatients, previousPatients)} detail="vs previous 30 days" />
      <OverviewStatCard label="Assessments completed" value={completed} icon={ClipboardCheck} trend={periodGrowth(completed, previousCompleted)} detail="vs previous 30 days" to={`/assessments?facility=${facility.id}&status=COMPLETED`} />
      <OverviewStatCard label="Open assessments" value={open.length} icon={ClipboardList} detail="Draft or ready for scoring" to={`/assessments?facility=${facility.id}&status=OPEN`} />
    </section>

    {canOpenAssessment && (performance ? <FacilityPerformance performance={performance} /> : <section className="surface mt-6 p-5" aria-label="Facility performance"><h2 className="font-semibold">Scoring and patient categories</h2><p className="mt-2 text-sm text-muted-foreground">Facility performance data could not be loaded. Refresh this page to try again.</p></section>)}

    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section className="surface p-5" aria-label="Facility assessment work">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Assessment and review work</h2><p className="mt-1 text-sm text-muted-foreground">{open.length} open · {underReview.length} under review{needsAttention.length ? ` · ${needsAttention.length} scoring unavailable` : ""}</p></div><Link className="text-sm text-primary hover:underline" to={`/assessments?facility=${facility.id}&status=WORK`}>View assessments</Link></div>
        {work.length ? <ul className="mt-3 divide-y">{work.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div>{canOpenAssessment ? <Link className={activityLinkClass} to={`/assessments/${item.reference}`}>{item.reference}</Link> : <span className="font-medium">{item.reference}</span>}<p className="text-xs text-muted-foreground">{item.patient.displayName} · Started {dateLabel(item.createdAt)}</p></div><StatusBadge status={assessmentStatusLabels[item.status]} /></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No open assessments, reviews, or scoring issues at this facility.</p>}
      </section>
      <section className="surface p-5" aria-label="Facility patients">
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold">Recent patients</h2><Link className="text-sm text-primary hover:underline" to={`/patients?facility=${facility.id}`}>View patients</Link></div>
        {recentPatients.length ? <ul className="mt-3 divide-y">{recentPatients.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><Link className={activityLinkClass} to={`/patients/${item.reference}`}>{item.displayName}</Link><p className="text-xs text-muted-foreground">{item.reference}</p></div><span className="text-xs text-muted-foreground">Registered {dateLabel(item.createdAt)}</span></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No patients have this home facility.</p>}
      </section>
    </div>

    {canManageUsers && <section className="surface table-surface mt-4" aria-label="Facility team">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5"><div><h2 className="font-semibold">Team with access</h2><p className="mt-1 text-sm text-muted-foreground">{team ? `${team.length} enabled members` : "Team information unavailable"}</p></div><Link className="text-sm text-primary hover:underline" to="/users">Manage users</Link></div>
      {team === null ? <p className="p-5 text-sm text-muted-foreground">Team information could not be loaded.</p> : visibleTeam.length ? <>
        <div className="mobile-card-list">{visibleTeam.map(item => <article className="mobile-data-card" key={item.membershipId}><strong>{item.displayName}</strong><span>{item.email}</span><span>{membershipRoleLabels[item.role]}</span></article>)}</div>
        <div className="desktop-table p-5"><DataTable label="Facility team members" columns={teamColumns} data={visibleTeam} /></div>
      </> : <p className="p-5 text-sm text-muted-foreground">No enabled team members have access.</p>}
    </section>}

    {editing && <FacilityDialog organizationId={user.organizationId} facility={facility} onClose={() => setEditing(false)} onSaved={saveFacility} />}
    <AlertDialog ariaLabel="Change facility status" isOpen={changingStatus} isDismissable={!savingStatus} onOpenChange={open => { if (!open && !savingStatus) setChangingStatus(false); }}>
      <AlertDialogHeader><AlertDialogTitle>{facility.status === "ACTIVE" ? "Deactivate" : "Activate"} {facility.name}?</AlertDialogTitle><AlertDialogDescription>{facility.status === "ACTIVE" ? "New patients cannot be registered at this facility while it is inactive. Existing records are kept." : "This facility will be available for patient registration again."}</AlertDialogDescription></AlertDialogHeader>
      {statusError && <p role="alert" className="text-destructive">{statusError}</p>}
      <AlertDialogFooter><AlertDialogCancel isDisabled={savingStatus}>Cancel</AlertDialogCancel><AlertDialogAction slot={undefined} variant={facility.status === "ACTIVE" ? "destructive" : "default"} isDisabled={savingStatus} onPress={async () => {
        if (savingStatus) return;
        setSavingStatus(true); setStatusError(null);
        try { saveFacility(await updateFacility(user.organizationId, facility.id, { status: facility.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })); }
        catch (error) { setStatusError(error instanceof Error ? error.message : "The facility could not be updated."); }
        finally { setSavingStatus(false); }
      }}>{savingStatus ? "Saving…" : facility.status === "ACTIVE" ? "Deactivate facility" : "Activate facility"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>
  </>;
}
