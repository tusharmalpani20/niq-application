import { idSchema, type OrganizationDetails, type OrganizationUser } from "@niq/application-contracts";
import { Power, PowerOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DateDisplay } from "../components/DateDisplay";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState, NotFoundState } from "../components/Page";
import { ScoringConnectionPanel } from "../components/ScoringConnection";
import { AdminOrganizationUsers } from "../components/AdminOrganizationUsers";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, getOrganization, getOrganizationBySlug, listOrganizationUsers, setOrganizationStatus } from "../lib/api";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;

export function AdminOrganizationDetailPage() {
  const { organizationSlug = "" } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("details");
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const load = useCallback(() => {
    setState("loading");
    const request = idSchema.safeParse(organizationSlug).success ? getOrganization(organizationSlug) : getOrganizationBySlug(organizationSlug);
    request.then(async (value) => {
      const organizationUsers = await listOrganizationUsers(value.organization.id);
      setDetails(value);
      setUsers(organizationUsers);
      setState("ready");
      if (organizationSlug !== value.organization.slug) navigate(`/admin/organizations/${value.organization.slug}`, { replace: true });
    }).catch((error: unknown) => setState(error instanceof ApiRequestError && error.response.error.code === "NOT_FOUND" ? "not-found" : "error"));
  }, [navigate, organizationSlug]);
  useEffect(() => { load(); }, [load]);

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

  if (state === "loading") return <section className="surface"><LoadingState label="Loading organization" /></section>;
  if (state === "not-found") return <section className="surface"><NotFoundState title="Organization not found" description="This organization may have been deleted, or its URL name may have changed." action={<Link className={buttonVariants()} to="/admin/organizations">Back to organizations</Link>} /></section>;
  if (state === "error" || !details) return <ErrorState retry={load} />;
  const { organization, entitlement, invitations } = details;
  return <>
    <div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>{organization.displayName}</span></div>
    <header className="organization-detail-header">
      <div className="organization-title-row"><h1>{organization.displayName}</h1><StatusBadge status={statusLabels[organization.status]} /></div>
      {organization.legalName !== organization.displayName && <p>{organization.legalName}</p>}
    </header>
    <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))} className="organization-detail-tabs gap-5">
      <TabsList variant="line" aria-label="Organization management" className="w-full justify-start gap-5 border-b p-0">
        <TabsTrigger id="details" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Details</TabsTrigger>
        <TabsTrigger id="users" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Users <Badge variant="secondary" className="px-1.5 py-0 text-xs tabular-nums">{users.length}</Badge></TabsTrigger>
        <TabsTrigger id="scoring" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">NIQ Scoring</TabsTrigger>
      </TabsList>
      <TabsContent id="details">
        <div className="admin-detail-grid">
          <section className="surface admin-detail-card">
            <h2 className="card-heading-divider">Organization</h2>
            <dl className="divide-y divide-border text-sm">
              <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-muted-foreground">URL name</dt><dd className="break-all font-medium">{organization.slug}</dd></div>
              <div className="flex justify-between gap-3 py-4"><dt className="text-muted-foreground">User limit</dt><dd className="font-medium">{entitlement?.userLimit == null ? "Unlimited" : entitlement.userLimit.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-3 py-4"><dt className="text-muted-foreground">Created</dt><dd><DateDisplay value={organization.createdAt} /></dd></div>
            </dl>
            <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><Button variant="outline" onPress={() => setTab("users")}>View users</Button>{organization.status !== "CLOSED" && <Button variant="ghost" onPress={() => { setStatusError(null); setConfirmStatus(true); }}>{organization.status === "ACTIVE" ? <PowerOff /> : <Power />}{organization.status === "ACTIVE" ? "Disable organization" : "Enable organization"}</Button>}</div>
          </section>
          <section className="surface admin-detail-card"><h2 className="card-heading-divider">Administrator invitation</h2>{invitations.length ? invitations.map((invitation) => <div className="invite-summary" key={invitation.id}><div className="min-w-0"><strong className="break-all">{invitation.email}</strong>{invitation.status === "PENDING" && <small>Expires <DateDisplay value={invitation.expiresAt} /></small>}</div><span className="invitation-status" data-status={invitation.status.toLowerCase()}>{invitation.status.toLowerCase()}</span></div>) : <p className="muted">No administrator invitations.</p>}</section>
        </div>
      </TabsContent>
      <TabsContent id="users"><AdminOrganizationUsers users={users} /></TabsContent>
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
