import type { Organization } from "@niq/application-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { DataTableColumn } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrganizationOnboardingForm } from "./AdminCreateOrganizationPage";
import { listOrganizations } from "../lib/api";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;

function OrganizationOnboardingDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    if (open) {
      setDirty(false);
      setConfirmingClose(false);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }, [dirty, onClose]);

  return <>
    <Dialog ariaLabel="Add organization" isOpen={open} onOpenChange={(next) => { if (!next) requestClose(); }} isDismissable showCloseButton={false} className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden p-0 sm:max-w-[780px]">
      <DialogHeader className="relative border-b p-5 pr-14"><DialogTitle id="onboard-organization-title" className="text-lg">Add organization</DialogTitle><DialogDescription>Create the client account, limits and first administrator invitation.</DialogDescription><Button className="absolute right-4 top-4" variant="ghost" size="icon-sm" aria-label="Close add organization" onPress={requestClose}><X /></Button></DialogHeader>
      <div className="admin-modal-body"><OrganizationOnboardingForm onCancel={requestClose} onCreated={onCreated} onDirtyChange={setDirty} /></div>
    </Dialog>
    <AlertDialog ariaLabel="Discard organization changes" isOpen={confirmingClose} onOpenChange={setConfirmingClose} isDismissable={false}>
      <AlertDialogHeader><AlertDialogMedia><AlertTriangle /></AlertDialogMedia><AlertDialogTitle>Discard your changes?</AlertDialogTitle><AlertDialogDescription>The information entered for this organization has not been saved.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel autoFocus>Keep editing</AlertDialogCancel><AlertDialogAction variant="destructive" onPress={() => { setConfirmingClose(false); onClose(); }}>Discard changes</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>
  </>;
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

  const columns: Array<DataTableColumn<Organization>> = [
    { id: "organization", header: "Organization", cell: ({ row }) => <><strong>{row.original.displayName}</strong><span className="cell-subtitle">{row.original.legalName}</span></> },
    { accessorKey: "slug", header: "URL name" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={statusLabels[row.original.status]} /> },
    { id: "created", header: "Created", cell: ({ row }) => row.original.createdAt.toLocaleDateString() },
    { id: "open", header: () => <span className="sr-only">Open</span>, cell: ({ row }) => <Link className="row-link" to={`/admin/organizations/${row.original.id}`} aria-label={`Manage ${row.original.displayName}`}><ChevronRight className="size-4" /></Link> },
  ];

  return <>
    <PageHeader title="Organizations" action={<Button ref={addButtonRef} size="icon-lg" aria-label="Add organization" onPress={() => setShowOnboarding(true)}><Plus /><span className="sr-only">Add organization</span></Button>} />
    {state === "loading" ? <section className="surface"><LoadingState label="Loading organizations" /></section> : state === "error" ? <ErrorState retry={load} /> : organizations.length === 0 ? <section className="surface"><EmptyState title="No organizations" description="Create the first client organization." /></section> : <section className="surface table-surface">
      <div className="desktop-table"><DataTable columns={columns} data={organizations} /></div>
      <div className="mobile-card-list">{organizations.map((organization) => <Link className="mobile-data-card" key={organization.id} to={`/admin/organizations/${organization.id}`} aria-label={`Manage ${organization.displayName}`}><div><strong>{organization.displayName}</strong><span>{organization.legalName}</span></div><div className="mobile-organization-meta"><span>URL name: {organization.slug}</span><StatusBadge status={statusLabels[organization.status]} /></div></Link>)}</div>
    </section>}
    <OrganizationOnboardingDialog open={showOnboarding} onClose={closeOnboarding} onCreated={load} />
  </>;
}
