import type { OrganizationDetails } from "@niq/application-contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { activateScoring, ApiRequestError, getOrganization } from "../lib/api";

const deploymentLabels = { NIQ_HOSTED: "NIQ hosted", CLIENT_CLOUD: "Client cloud", ON_PREM: "On-premises" } as const;
const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;
const limitLabel = (value: number | null | undefined) => value == null ? "Unlimited" : value.toLocaleString();

export function AdminOrganizationDetailPage() {
  const { organizationId = "" } = useParams();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [activating, setActivating] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const load = useCallback(() => { setState("loading"); getOrganization(organizationId).then((value) => { setDetails(value); setState("ready"); }).catch(() => setState("error")); }, [organizationId]);
  useEffect(() => { load(); }, [load]);

  async function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivating(true);
    setActivationMessage(null);
    const form = event.currentTarget;
    const token = String(new FormData(form).get("activationToken"));
    try {
      await activateScoring(organizationId, { activationToken: token });
      form.reset();
      load();
    } catch (error) {
      setActivationMessage(error instanceof ApiRequestError ? error.message : "Scoring activation could not be completed.");
    } finally {
      setActivating(false);
    }
  }

  if (state === "loading") return <section className="surface"><LoadingState label="Loading organization" /></section>;
  if (state === "error" || !details) return <ErrorState retry={load} />;
  const { organization, entitlement, invitations } = details;
  return <>
    <div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>{organization.displayName}</span></div>
    <PageHeader eyebrow="Client organization" title={organization.displayName} description={organization.legalName} action={<StatusBadge status={statusLabels[organization.status]} />} />
    <div className="admin-detail-grid">
      <section className="surface admin-detail-card"><h2>Organization setup</h2><dl className="stacked-definition"><div><dt>Slug</dt><dd>{organization.slug}</dd></div><div><dt>Deployment</dt><dd>{deploymentLabels[organization.deploymentMode]}</dd></div><div><dt>Created</dt><dd>{organization.createdAt.toLocaleString()}</dd></div></dl></section>
      <section className="surface admin-detail-card"><h2>Service access</h2><div className="service-state"><span className={organization.scoringEnabled ? "health-ok" : "health-warn"} /><div><strong>Scoring</strong><small>{organization.scoringEnabled ? "Enabled by NIQ" : "Disabled by NIQ"}</small></div></div><div className="service-state"><span className={organization.faceScanEnabled ? "health-ok" : "health-warn"} /><div><strong>Face scan</strong><small>{organization.faceScanEnabled ? "Enabled by NIQ" : "Disabled by NIQ"}</small></div></div></section>
      <section className="surface admin-detail-card"><h2>Usage limits</h2><dl className="definition-grid"><div><dt>Users</dt><dd>{limitLabel(entitlement?.userLimit)}</dd></div><div><dt>Scores / month</dt><dd>{limitLabel(entitlement?.scoringMonthlyLimit)}</dd></div><div><dt>Face scans / month</dt><dd>{limitLabel(entitlement?.faceScanMonthlyLimit)}</dd></div></dl></section>
      <section className="surface admin-detail-card"><h2>Administrator onboarding</h2>{invitations.length ? invitations.map((invitation) => <div className="invite-summary" key={invitation.id}><div><strong>{invitation.email}</strong><small>Expires {invitation.expiresAt.toLocaleString()}</small></div><span>{invitation.status.toLowerCase()}</span></div>) : <p className="muted">No administrator invitations have been created.</p>}</section>
      <section className="surface admin-detail-card admin-detail-wide"><div className="section-heading"><div><p className="page-eyebrow">External service</p><h2>Scoring connection</h2></div></div>{details.scoringConnection ? <div className="connection-summary"><span className="health-ok" /><div><strong>Connected</strong><small>Deployment {details.scoringConnection.deploymentId} · activated {details.scoringConnection.activatedAt.toLocaleString()} · key {details.scoringConnection.keyVersion}</small></div></div> : <><div className="notice notice-warning"><div><strong>Not activated</strong><span>Generate a one-time activation token in the NIQ scoring console, then enter it here.</span></div></div><form className="activation-form" onSubmit={submitActivation}><label>One-time activation token<input name="activationToken" type="password" minLength={48} maxLength={256} autoComplete="off" required /></label>{activationMessage && <p className="error-message" role="alert">{activationMessage}</p>}<button className="btn btn-primary" disabled={activating}>{activating ? "Activating…" : "Activate scoring connection"}</button></form></>}</section>
    </div>
  </>;
}
