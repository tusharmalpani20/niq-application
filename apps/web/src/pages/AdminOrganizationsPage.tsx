import type { Organization } from "@niq/application-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { OrganizationOnboardingForm } from "./AdminCreateOrganizationPage";
import { listOrganizations } from "../lib/api";
import { Icon } from "../lib/icons";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;

function OrganizationOnboardingDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  if (!open) return null;
  return <dialog className="admin-modal" ref={dialogRef} aria-labelledby="onboard-organization-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="admin-modal-panel">
      <header className="admin-modal-header"><div><h2 id="onboard-organization-title">Add organization</h2><p>Create the client account, limits and first administrator invitation.</p></div><button className="icon-button" type="button" aria-label="Close add organization" onClick={onClose}><Icon name="close" size={19} /></button></header>
      <div className="admin-modal-body"><OrganizationOnboardingForm onCancel={onClose} onCreated={onCreated} /></div>
    </div>
  </dialog>;
}

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const onboardingWasOpen = useRef(false);

  const load = useCallback(() => {
    setState("loading");
    listOrganizations().then((items) => { setOrganizations(items); setState("ready"); }).catch(() => setState("error"));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (showOnboarding) {
      onboardingWasOpen.current = true;
    } else if (onboardingWasOpen.current) {
      addButtonRef.current?.focus();
      onboardingWasOpen.current = false;
    }
  }, [showOnboarding]);

  const closeOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return <>
    <PageHeader title="Organizations" action={<button ref={addButtonRef} className="btn btn-primary icon-action" type="button" aria-label="Add organization" title="Add organization" onClick={() => setShowOnboarding(true)}><Icon name="plus" size={20} /><span className="sr-only">Add organization</span></button>} />
    {state === "loading" ? <section className="surface"><LoadingState label="Loading organizations" /></section> : state === "error" ? <ErrorState retry={load} /> : organizations.length === 0 ? <section className="surface"><EmptyState title="No organizations" description="Create the first client organization." /></section> : <section className="surface table-surface">
      <div className="responsive-table desktop-table"><table><thead><tr><th>Organization</th><th>URL name</th><th>Status</th><th>Created</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
        {organizations.map((organization) => <tr key={organization.id}><td><strong>{organization.displayName}</strong><span className="cell-subtitle">{organization.legalName}</span></td><td>{organization.slug}</td><td><StatusBadge status={statusLabels[organization.status]} /></td><td>{organization.createdAt.toLocaleDateString()}</td><td><Link className="row-link" to={`/admin/organizations/${organization.id}`} aria-label={`Manage ${organization.displayName}`}><Icon name="chevron" size={17} /></Link></td></tr>)}
      </tbody></table></div>
      <div className="mobile-card-list">{organizations.map((organization) => <Link className="mobile-data-card" key={organization.id} to={`/admin/organizations/${organization.id}`} aria-label={`Manage ${organization.displayName}`}><div><strong>{organization.displayName}</strong><span>{organization.legalName}</span></div><div className="mobile-organization-meta"><span>URL name: {organization.slug}</span><StatusBadge status={statusLabels[organization.status]} /></div></Link>)}</div>
    </section>}
    <OrganizationOnboardingDialog open={showOnboarding} onClose={closeOnboarding} onCreated={load} />
  </>;
}
