import { idSchema, type OrganizationAdminStats, type OrganizationDetails } from "@niq/application-contracts";
import { Building2, ClipboardCheck, Hospital, Power, PowerOff, UserRound, UsersRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DateDisplay } from "../components/DateDisplay";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, NotFoundState } from "../components/Page";
import { ScoringConnectionPanel } from "../components/ScoringConnection";
import { AdminOrganizationUsers } from "../components/AdminOrganizationUsers";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, getOrganization, getOrganizationAdminStats, getOrganizationBySlug, listOrganizationUsersPage, setOrganizationStatus } from "../lib/api";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;

function OrganizationDetailSkeleton() {
  return <div role="status" aria-label="Loading organization">
    <span className="sr-only">Loading organization…</span>
    <Skeleton className="mb-6 h-4 w-44 motion-reduce:animate-none" />
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="grid gap-3"><Skeleton className="h-8 w-56 max-w-full motion-reduce:animate-none" /><Skeleton className="h-4 w-40 motion-reduce:animate-none" /></div><Skeleton className="h-10 w-44 motion-reduce:animate-none" /></div>
    <div className="mb-5 flex gap-5 border-b pb-3"><Skeleton className="h-4 w-16 motion-reduce:animate-none" /><Skeleton className="h-4 w-16 motion-reduce:animate-none" /><Skeleton className="h-4 w-24 motion-reduce:animate-none" /></div>
    <section className="surface p-5 sm:p-6"><Skeleton className="h-5 w-44 motion-reduce:animate-none" /><div className="mt-5 grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div className="grid gap-3 rounded-xl border p-4" key={index}><Skeleton className="h-4 w-24 motion-reduce:animate-none" /><Skeleton className="h-5 w-32 max-w-full motion-reduce:animate-none" /></div>)}</div></section>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="surface grid gap-3 p-5" key={index}><Skeleton className="h-4 w-28 motion-reduce:animate-none" /><Skeleton className="h-8 w-16 motion-reduce:animate-none" /><Skeleton className="h-3 w-32 max-w-full motion-reduce:animate-none" /></div>)}</div>
  </div>;
}

export function AdminOrganizationDetailPage() {
  const { organizationSlug = "" } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("details");
  const [usersTotal, setUsersTotal] = useState<number | null>(null);
  const [usersCountLoading, setUsersCountLoading] = useState(true);
  const [stats, setStats] = useState<OrganizationAdminStats | null>(null);
  const [statsState, setStatsState] = useState<"loading" | "ready" | "error">("loading");
  const [statsReload, setStatsReload] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const load = useCallback(() => {
    setState("loading");
    setUsersTotal(null);
    setUsersCountLoading(true);
    const request = idSchema.safeParse(organizationSlug).success ? getOrganization(organizationSlug, { includeInvitations: false }) : getOrganizationBySlug(organizationSlug, { includeInvitations: false });
    request.then((value) => {
      setDetails(value);
      setState("ready");
      void listOrganizationUsersPage(value.organization.id, { page: 1, pageSize: 1 }).then((result) => setUsersTotal(result.total)).catch(() => setUsersTotal(null)).finally(() => setUsersCountLoading(false));
      if (organizationSlug !== value.organization.slug) navigate(`/admin/organizations/${value.organization.slug}`, { replace: true });
    }).catch((error: unknown) => setState(error instanceof ApiRequestError && error.response.error.code === "NOT_FOUND" ? "not-found" : "error"));
  }, [navigate, organizationSlug]);
  useEffect(() => { load(); }, [load]);
  const organizationId = details?.organization.id;
  useEffect(() => {
    if (state !== "ready" || !organizationId) return;
    let active = true;
    setStatsState("loading");
    getOrganizationAdminStats(organizationId).then((value) => { if (active) { setStats(value); setStatsState("ready"); } }).catch(() => { if (active) setStatsState("error"); });
    return () => { active = false; };
  }, [organizationId, state, statsReload]);

  async function changeStatus() {
    if (!details || details.organization.status === "CLOSED") return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const organization = await setOrganizationStatus(details.organization.id, details.organization.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
      setDetails((current) => current ? { ...current, organization } : current);
      setConfirmStatus(false);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "The organization status could not be changed. Try again.");
    } finally { setStatusBusy(false); }
  }

  if (state === "loading") return <OrganizationDetailSkeleton />;
  if (state === "not-found") return <section className="surface"><NotFoundState title="Organization not found" description="This organization may have been deleted, or its URL name may have changed." action={<Link className={buttonVariants()} to="/admin/organizations">Back to organizations</Link>} /></section>;
  if (state === "error" || !details) return <ErrorState retry={load} />;
  const { organization, entitlement } = details;
  return <>
    <div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>{organization.displayName}</span></div>
    <header className="organization-detail-header flex flex-wrap items-start justify-between gap-4">
      <div><div className="organization-title-row"><h1>{organization.displayName}</h1><StatusBadge status={statusLabels[organization.status]} /></div>
        {organization.legalName !== organization.displayName && <p className="mt-1 text-sm text-muted-foreground">{organization.legalName}</p>}</div>
      {organization.status !== "CLOSED" && <Button variant={organization.status === "ACTIVE" ? "destructive-outline" : "outline"} onPress={() => { setStatusError(null); setConfirmStatus(true); }}>{organization.status === "ACTIVE" ? <PowerOff /> : <Power />}{organization.status === "ACTIVE" ? "Disable organization" : "Enable organization"}</Button>}
    </header>
    <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))} className="organization-detail-tabs gap-5">
      <TabsList variant="line" aria-label="Organization management" className="w-full justify-start gap-5 border-b p-0">
        <TabsTrigger id="details" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Details</TabsTrigger>
        <TabsTrigger id="users" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Users {usersCountLoading ? <Skeleton className="ml-1 inline-block h-3 w-4 motion-reduce:animate-none" /> : usersTotal === null ? null : <span className="tab-count ml-1 text-xs tabular-nums">{usersTotal}</span>}</TabsTrigger>
        <TabsTrigger id="scoring" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">NIQ Scoring</TabsTrigger>
      </TabsList>
      <TabsContent id="details">
        <div className="grid gap-5"><section className="surface min-w-0 p-5 sm:p-6">
          <h2 className="mb-5 flex items-center gap-2 border-b pb-4 text-base font-semibold"><Building2 className="size-5 text-primary" aria-hidden="true" />Organization details</h2>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div className="min-w-0 rounded-xl border bg-muted/20 p-4"><dt className="text-muted-foreground">User limit</dt><dd className="mt-2 font-semibold">{entitlement?.userLimit == null ? "Unlimited" : entitlement.userLimit.toLocaleString()}</dd></div>
            <div className="min-w-0 rounded-xl border bg-muted/20 p-4"><dt className="text-muted-foreground">Created</dt><dd className="mt-2 font-semibold"><DateDisplay value={organization.createdAt} /></dd></div>
          </dl>
        </section>
        <section aria-labelledby="organization-stats-heading"><h2 id="organization-stats-heading" className="mb-3 text-base font-semibold">Organization at a glance</h2>
          {statsState === "loading" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading organization statistics">{Array.from({ length: 4 }, (_, index) => <div className="surface grid gap-3 p-5" key={index}><Skeleton className="h-4 w-28 motion-reduce:animate-none" /><Skeleton className="h-8 w-16 motion-reduce:animate-none" /><Skeleton className="h-3 w-32 max-w-full motion-reduce:animate-none" /></div>)}</div> : statsState === "error" || !stats ? <div className="surface flex flex-wrap items-center justify-between gap-3 p-5" role="alert"><p className="text-sm text-muted-foreground">Statistics could not be loaded.</p><Button variant="outline" size="sm" onPress={() => setStatsReload((value) => value + 1)}>Retry</Button></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="surface p-5"><UsersRound className="mb-4 size-5 text-primary" aria-hidden="true" /><h3 className="text-sm text-muted-foreground">Active users</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{stats.activeUsers.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{entitlement?.userLimit == null ? "Unlimited user limit" : `of ${entitlement.userLimit.toLocaleString()} allowed`}</p></div>
            <div className="surface p-5"><Hospital className="mb-4 size-5 text-primary" aria-hidden="true" /><h3 className="text-sm text-muted-foreground">Facilities</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{stats.facilities.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Across this organization</p></div>
            <div className="surface p-5"><UserRound className="mb-4 size-5 text-primary" aria-hidden="true" /><h3 className="text-sm text-muted-foreground">Patients</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{stats.patients.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Current patient records</p></div>
            <div className="surface p-5"><ClipboardCheck className="mb-4 size-5 text-primary" aria-hidden="true" /><h3 className="text-sm text-muted-foreground">Assessments completed</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{stats.completedAssessments30Days.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Last 30 days</p></div>
          </div>}
        </section></div>
      </TabsContent>
      <TabsContent id="users"><AdminOrganizationUsers organizationId={organization.id} active={tab === "users"} onTotalChange={setUsersTotal} /></TabsContent>
      <TabsContent id="scoring">
        <ScoringConnectionPanel className="min-w-0" organizationId={organization.id} connection={details.scoringConnection} onActivated={(connection) => setDetails({ ...details, scoringConnection: connection })} onDisconnected={() => setDetails({ ...details, scoringConnection: null })} showHeading={false} />
      </TabsContent>
    </Tabs>
    <AlertDialog ariaLabel="Change organization status" isOpen={confirmStatus} onOpenChange={(open) => { if (!statusBusy) setConfirmStatus(open); }} isDismissable={!statusBusy}>
      <AlertDialogHeader><AlertDialogMedia>{organization.status === "ACTIVE" ? <PowerOff /> : <Power />}</AlertDialogMedia><AlertDialogTitle>{organization.status === "ACTIVE" ? "Disable" : "Enable"} {organization.displayName}?</AlertDialogTitle><AlertDialogDescription>{organization.status === "ACTIVE" ? "Users will be unable to sign in until you enable the organization again." : "Users will be able to sign in again."}</AlertDialogDescription></AlertDialogHeader>
      {statusError && <Alert variant="destructive"><AlertDescription>{statusError}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel isDisabled={statusBusy}>Cancel</AlertDialogCancel><Button variant={organization.status === "ACTIVE" ? "destructive" : "default"} isDisabled={statusBusy} onPress={changeStatus}>{statusBusy ? "Saving…" : organization.status === "ACTIVE" ? "Disable organization" : "Enable organization"}</Button></AlertDialogFooter>
    </AlertDialog>
  </>;
}
