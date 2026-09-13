import type { Organization } from "@niq/application-contracts";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { listOrganizations } from "../lib/api";
import { Icon } from "../lib/icons";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setState("loading");
    listOrganizations().then((items) => { setOrganizations(items); setState("ready"); }).catch(() => setState("error"));
  }, []);

  useEffect(() => { load(); }, [load]);

  return <>
    <PageHeader title="Organizations" action={<Link className="btn btn-primary icon-action" to="/admin/organizations/new" aria-label="Add organization" title="Add organization"><Icon name="plus" size={20} /><span className="sr-only">Add organization</span></Link>} />
    {state === "loading" ? <section className="surface"><LoadingState label="Loading organizations" /></section> : state === "error" ? <ErrorState retry={load} /> : organizations.length === 0 ? <section className="surface"><EmptyState title="No organizations" description="Create the first client organization." /></section> : <section className="surface table-surface">
      <div className="responsive-table desktop-table"><table><thead><tr><th>Organization</th><th>URL name</th><th>Status</th><th>Created</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
        {organizations.map((organization) => <tr key={organization.id}><td><strong>{organization.displayName}</strong><span className="cell-subtitle">{organization.legalName}</span></td><td>{organization.slug}</td><td><StatusBadge status={statusLabels[organization.status]} /></td><td>{organization.createdAt.toLocaleDateString()}</td><td><Link className="row-link" to={`/admin/organizations/${organization.id}`} aria-label={`Manage ${organization.displayName}`}><Icon name="chevron" size={17} /></Link></td></tr>)}
      </tbody></table></div>
      <div className="mobile-card-list">{organizations.map((organization) => <Link className="mobile-data-card" key={organization.id} to={`/admin/organizations/${organization.id}`} aria-label={`Manage ${organization.displayName}`}><div><strong>{organization.displayName}</strong><span>{organization.legalName}</span></div><div className="mobile-organization-meta"><span>URL name: {organization.slug}</span><StatusBadge status={statusLabels[organization.status]} /></div></Link>)}</div>
    </section>}
  </>;
}
