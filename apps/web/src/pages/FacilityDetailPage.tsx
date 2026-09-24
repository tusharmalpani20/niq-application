import { hasPermission, membershipRoleLabels } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, Facility, FacilityPerformance as Performance, OrganizationUser, Patient } from "@niq/application-contracts";
import { Pencil, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { getFacilityPerformance, listAssessments, listFacilities, listOrganizationUsers, listPatients } from "../lib/api";
import { updateFacility } from "../lib/facility-management";
import { openAssessmentStatuses } from "../lib/assessment-work";
import { assessmentStatusLabels } from "../lib/patient-display";
import { FacilityDialog } from "./FacilitiesPage";
import { FacilityPerformance } from "./FacilityPerformance";

type FacilityOverview = { facility: Facility; patients: Patient[]; assessments: AssessmentSummary[]; team: OrganizationUser[] | null; performance: Performance | null };
const dateLabel = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <div className="surface p-5"><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-3 block text-3xl font-semibold">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

export function FacilityDetailPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { facilityId } = useParams();
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
    setState("loading");
    setOverview(null);
    Promise.all([
      listFacilities(user.organizationId), listPatients(user.organizationId), listAssessments(user.organizationId),
      canManageUsers ? listOrganizationUsers(user.organizationId).catch(() => null) : Promise.resolve(null),
      canManageUsers && facilityId ? getFacilityPerformance(user.organizationId, facilityId).catch(() => null) : Promise.resolve(null),
    ]).then(([facilities, patients, assessments, users, performance]) => {
      if (!active) return;
      const facility = facilities.find(item => item.id === facilityId);
      if (!facility) { setState("missing"); return; }
      setOverview({
        facility,
        patients: patients.filter(item => item.homeFacility?.id === facility.id),
        assessments: assessments.filter(item => item.facility?.id === facility.id),
        team: users?.filter(item => item.active && item.status === "ACTIVE" && (!item.facilities?.length || item.facilities.some(assigned => assigned.id === facility.id))) ?? null,
        performance,
      });
      setState("ready");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [user.organizationId, canManageUsers, facilityId, reload]);

  if (state === "loading") return <p role="status">Loading facility…</p>;
  if (state === "missing") return <Alert><AlertDescription>Facility not found or you do not have access. <Link to="/facilities">Back to facilities</Link></AlertDescription></Alert>;
  if (state === "error" || !overview) return <Alert variant="destructive"><AlertDescription>Facility overview could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button></AlertDescription></Alert>;

  const { facility, patients, assessments, team, performance } = overview;
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
  const saveFacility = (updated: Facility) => { setOverview(value => value ? { ...value, facility: updated } : value); setEditing(false); setChangingStatus(false); };

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
    <section aria-label="Facility at a glance" className={`grid gap-4 sm:grid-cols-2${canManageUsers ? " lg:grid-cols-3" : ""}`}>
      <Metric label="Patients" value={patients.length} detail="Home facility is here" />
      <Metric label="Open assessments" value={open.length} detail="Draft or ready for scoring" />
      {canManageUsers && <Metric label="Enabled team members" value={team?.length ?? "—"} detail={team ? "Members with access to this facility" : "Team information unavailable"} />}
    </section>

    {canManageUsers && (performance ? <FacilityPerformance performance={performance} facilityId={facility.id} /> : <section className="surface mt-6 p-5" aria-label="Facility performance"><h2 className="font-semibold">This month</h2><p className="mt-2 text-sm text-muted-foreground">Performance data could not be loaded. Refresh this page to try again.</p></section>)}

    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section className="surface p-5" aria-label="Facility assessment work">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Assessment and review work</h2><p className="mt-1 text-sm text-muted-foreground">{open.length} open · {underReview.length} under review{needsAttention.length ? ` · ${needsAttention.length} scoring unavailable` : ""}</p></div><Link className="text-sm text-primary hover:underline" to={`/assessments?facility=${facility.id}&status=WORK`}>View assessments</Link></div>
        {work.length ? <ul className="mt-3 divide-y">{work.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div>{canOpenAssessment ? <Link className="font-medium text-foreground hover:underline" to={`/assessments/${item.reference}`}>{item.reference}</Link> : <span className="font-medium">{item.reference}</span>}<p className="text-xs text-muted-foreground">{item.patient.displayName} · Started {dateLabel(item.createdAt)}</p></div><StatusBadge status={assessmentStatusLabels[item.status]} /></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No open assessments, reviews, or scoring issues at this facility.</p>}
      </section>
      <section className="surface p-5" aria-label="Facility patients">
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold">Recent patients</h2><Link className="text-sm text-primary hover:underline" to={`/patients?facility=${facility.id}`}>View patients</Link></div>
        {recentPatients.length ? <ul className="mt-3 divide-y">{recentPatients.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><Link className="font-medium text-foreground hover:underline" to={`/patients/${item.reference}`}>{item.displayName}</Link><p className="text-xs text-muted-foreground">{item.reference}</p></div><span className="text-xs text-muted-foreground">Registered {dateLabel(item.createdAt)}</span></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No patients have this home facility.</p>}
      </section>
    </div>

    {canManageUsers && <section className="surface table-surface mt-4" aria-label="Facility team">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5"><h2 className="font-semibold">Team with access</h2><Link className="text-sm text-primary hover:underline" to="/users">Manage users</Link></div>
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
