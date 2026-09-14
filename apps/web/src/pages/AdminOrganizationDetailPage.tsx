import { idSchema, type OrganizationDetails, type OrganizationUser } from "@niq/application-contracts";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState, NotFoundState } from "../components/Page";
import { ScoringConnectionPanel } from "../components/ScoringConnection";
import { AdminOrganizationUsers } from "../components/AdminOrganizationUsers";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, getOrganization, getOrganizationBySlug, listOrganizationUsers } from "../lib/api";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;

export function AdminOrganizationDetailPage() {
  const { organizationSlug = "" } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
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
    <Tabs defaultSelectedKey="details" className="organization-detail-tabs gap-5">
      <TabsList variant="line" aria-label="Organization management" className="w-full justify-start gap-5 border-b p-0">
        <TabsTrigger id="details" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Details</TabsTrigger>
        <TabsTrigger id="users" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Users <Badge variant="secondary" className="px-1.5 py-0 text-xs tabular-nums">{users.length}</Badge></TabsTrigger>
        <TabsTrigger id="scoring" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">NIQ Scoring</TabsTrigger>
      </TabsList>
      <TabsContent id="details">
        <div className="admin-detail-grid">
          <section className="surface admin-detail-card"><h2 className="card-heading-divider">Organization</h2><dl className="stacked-definition"><div><dt>URL name</dt><dd>{organization.slug}</dd></div><div><dt>User limit</dt><dd>{entitlement?.userLimit == null ? "Unlimited" : entitlement.userLimit.toLocaleString()}</dd></div><div><dt>Created</dt><dd>{organization.createdAt.toLocaleString()}</dd></div></dl></section>
          <section className="surface admin-detail-card"><h2 className="card-heading-divider">Administrator invitation</h2>{invitations.length ? invitations.map((invitation) => <div className="invite-summary" key={invitation.id}><div><strong>{invitation.email}</strong><small>Expires {invitation.expiresAt.toLocaleString()}</small></div><span className="invitation-status" data-status={invitation.status.toLowerCase()}>{invitation.status.toLowerCase()}</span></div>) : <p className="muted">No administrator invitations have been created.</p>}</section>
        </div>
      </TabsContent>
      <TabsContent id="users"><AdminOrganizationUsers users={users} /></TabsContent>
      <TabsContent id="scoring">
        <ScoringConnectionPanel organizationId={organization.id} connection={details.scoringConnection} onActivated={(connection) => setDetails({ ...details, scoringConnection: connection })} onDisconnected={() => setDetails({ ...details, scoringConnection: null })} />
      </TabsContent>
    </Tabs>
  </>;
}
