import { idSchema, type OrganizationDetails } from "@niq/application-contracts";
import { buttonVariants } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState, NotFoundState, PageHeader } from "../components/Page";
import { ScoringConnectionPanel } from "../components/ScoringConnection";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, getOrganization, getOrganizationBySlug } from "../lib/api";

const deploymentLabels = { NIQ_HOSTED: "NIQ hosted", CLIENT_CLOUD: "Client cloud", ON_PREM: "On-premises" } as const;
const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;
const limitLabel = (value: number | null | undefined) => value == null ? "Unlimited" : value.toLocaleString();

export function AdminOrganizationDetailPage() {
  const { organizationSlug = "" } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const load = useCallback(() => {
    setState("loading");
    const request = idSchema.safeParse(organizationSlug).success ? getOrganization(organizationSlug) : getOrganizationBySlug(organizationSlug);
    request.then((value) => {
      setDetails(value);
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
    <PageHeader eyebrow="Client organization" title={organization.displayName} description={organization.legalName} action={<StatusBadge status={statusLabels[organization.status]} />} />
    <div className="admin-detail-grid">
      <section className="surface admin-detail-card"><h2>Organization setup</h2><dl className="stacked-definition"><div><dt>URL name</dt><dd>{organization.slug}</dd></div><div><dt>Deployment</dt><dd>{deploymentLabels[organization.deploymentMode]}</dd></div><div><dt>Created</dt><dd>{organization.createdAt.toLocaleString()}</dd></div></dl></section>
      <section className="surface admin-detail-card"><h2>Service access</h2><div className="service-state"><span className={organization.scoringEnabled ? "health-ok" : "health-warn"} /><div><strong>Scoring</strong><small>{organization.scoringEnabled ? "Enabled by NIQ" : "Disabled by NIQ"}</small></div></div><div className="service-state"><span className={organization.faceScanEnabled ? "health-ok" : "health-warn"} /><div><strong>Face scan</strong><small>{organization.faceScanEnabled ? "Enabled by NIQ" : "Disabled by NIQ"}</small></div></div></section>
      <section className="surface admin-detail-card"><h2>Usage limits</h2><dl className="definition-grid"><div><dt>Users</dt><dd>{limitLabel(entitlement?.userLimit)}</dd></div><div><dt>Scores / month</dt><dd>{limitLabel(entitlement?.scoringMonthlyLimit)}</dd></div><div><dt>Face scans / month</dt><dd>{limitLabel(entitlement?.faceScanMonthlyLimit)}</dd></div></dl></section>
      <section className="surface admin-detail-card"><h2>Administrator onboarding</h2>{invitations.length ? invitations.map((invitation) => <div className="invite-summary" key={invitation.id}><div><strong>{invitation.email}</strong><small>Expires {invitation.expiresAt.toLocaleString()}</small></div><span>{invitation.status.toLowerCase()}</span></div>) : <p className="muted">No administrator invitations have been created.</p>}</section>
      <ScoringConnectionPanel organizationId={organization.id} connection={details.scoringConnection} onActivated={(connection) => setDetails({ ...details, scoringConnection: connection })} />
    </div>
  </>;
}
