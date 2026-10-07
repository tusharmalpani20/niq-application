import type { Organization } from "@niq/application-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Power, PowerOff, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { DataTableColumn } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { AdminListSkeleton } from "../components/AdminListSkeleton";
import { OrganizationEmptyIllustration } from "../components/OrganizationEmptyIllustration";
import { ErrorState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { DateDisplay } from "../components/DateDisplay";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrganizationOnboardingForm } from "./AdminCreateOrganizationPage";
import { ApiRequestError, listOrganizationsPage, setOrganizationStatus } from "../lib/api";

const statusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;
const pageSize = 10;

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
      <DialogHeader className="relative border-b p-5 pr-14"><DialogTitle id="onboard-organization-title" className="text-lg">Add organization</DialogTitle><DialogDescription>Create the organization and invite its first administrator.</DialogDescription><Button className="absolute right-4 top-4" variant="ghost" size="icon-sm" aria-label="Close add organization" onPress={requestClose}><X /></Button></DialogHeader>
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
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "closed">("all");
  const [statusTarget, setStatusTarget] = useState<Organization | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const onboardingWasOpen = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setState("loading");
    listOrganizationsPage({ page, pageSize, search: debouncedSearch, status: statusFilter }).then((result) => {
      if (!active) return;
      setOrganizations(result.items);
      setTotal(result.total);
      setState("ready");
      if (result.total > 0 && result.items.length === 0 && page > 1) setPage(Math.max(1, Math.ceil(result.total / pageSize)));
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [page, debouncedSearch, statusFilter, reload]);
  const load = useCallback(() => setReload((value) => value + 1), []);

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

  async function changeOrganizationStatus() {
    if (!statusTarget || statusTarget.status === "CLOSED") return;
    const status = statusTarget.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setStatusBusy(true);
    setStatusMessage(null);
    try {
      const organization = await setOrganizationStatus(statusTarget.id, status);
      setOrganizations((current) => current.map((item) => item.id === organization.id ? organization : item));
      load();
      setStatusTarget(null);
    } catch (error) {
      setStatusMessage(error instanceof ApiRequestError || error instanceof Error ? error.message : "The organization status could not be changed.");
      setStatusTarget(null);
    } finally {
      setStatusBusy(false);
    }
  }

  function organizationActions(organization: Organization) {
    return <div className="flex items-center justify-start gap-2">
      {organization.status !== "CLOSED" && <TooltipTrigger><Button variant={organization.status === "ACTIVE" ? "destructive-outline" : "outline"} size="icon" aria-label={organization.status === "ACTIVE" ? `Disable ${organization.displayName}` : `Enable ${organization.displayName}`} onPress={() => setStatusTarget(organization)}>{organization.status === "ACTIVE" ? <PowerOff className="size-4" /> : <Power className="size-4" />}</Button><Tooltip>{organization.status === "ACTIVE" ? "Disable organization" : "Enable organization"}</Tooltip></TooltipTrigger>}
    </div>;
  }

  const columns: Array<DataTableColumn<Organization>> = [
    { id: "organization", header: "Organization", cell: ({ row }) => <><Link className="font-medium text-primary hover:underline" to={`/admin/organizations/${row.original.slug}`}>{row.original.displayName}</Link>{row.original.legalName !== row.original.displayName && <span className="cell-subtitle">{row.original.legalName}</span>}</> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={statusLabels[row.original.status]} /> },
    { id: "created", header: "Created", cell: ({ row }) => <DateDisplay value={row.original.createdAt} /> },
    { id: "actions", header: "Actions", cell: ({ row }) => organizationActions(row.original) },
  ];

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const showLoading = state === "loading" || search.trim() !== debouncedSearch;
  const searched = debouncedSearch.length > 0;
  const emptyStatus = statusFilter === "all" ? "organizations" : `${statusFilter} organizations`;
  const emptyTitle = searched ? `No ${emptyStatus} match your search` : statusFilter === "all" ? "No organizations yet" : `No ${emptyStatus}`;
  const emptyDescription = searched ? "Try another name or clear the search." : statusFilter === "all" ? "Create the first organization to get started." : `${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} organizations will appear here.`;

  return <>
    <PageHeader title="Organizations" />
    <div className="grid gap-4">
      {statusMessage && <Alert variant="destructive"><AlertDescription>{statusMessage}</AlertDescription></Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:border-b">
        <Tabs selectedKey="organizations" className="border-b sm:border-0">
          <TabsList variant="line" aria-label="Organization management" className="gap-2 p-0">
            <TabsTrigger id="organizations" className="rounded-none border-0 px-1 pb-2 text-primary shadow-none after:bg-primary">Organizations <span className="tab-count ml-1 text-xs tabular-nums">{total}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex min-w-0 items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-80">
            <Input aria-label="Search organizations" placeholder="Search organizations…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-10 pr-9" />
            {search && <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground" onPress={() => { setSearch(""); setPage(1); }}><X aria-hidden="true" /></Button>}
          </div>
          <TooltipTrigger><Button ref={addButtonRef} size="icon-lg" className="size-10 shrink-0" aria-label="Add organization" onPress={() => setShowOnboarding(true)}><Plus /><span className="sr-only">Add organization</span></Button><Tooltip>Add organization</Tooltip></TooltipTrigger>
        </div>
      </div>
      <Select aria-label="Filter organizations by status" selectedKey={statusFilter} onSelectionChange={(key) => { setStatusFilter(String(key) as typeof statusFilter); setPage(1); }} className="w-full sm:w-64"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem>{Object.entries(statusLabels).map(([id, label]) => <SelectItem id={id.toLowerCase()} key={id}>{label}</SelectItem>)}</SelectContent></Select>
      {showLoading ? <AdminListSkeleton label="organizations" columns={["Organization", "Status", "Created", "Actions"]} /> : state === "error" ? <ErrorState retry={load} /> : <section className="surface table-surface organization-table-card">
        {organizations.length === 0 ? <div className="table-empty-content illustrated-empty-state" role="status"><OrganizationEmptyIllustration variant={searched ? "search" : statusFilter} /><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div> : <>
          <div className="desktop-table p-5"><DataTable columns={columns} data={organizations} label="Organizations" /></div>
          <div className="mobile-card-list">{organizations.map((organization) => <article className="mobile-data-card" key={organization.id}><div><Link className="font-medium text-primary hover:underline" to={`/admin/organizations/${organization.slug}`}>{organization.displayName}</Link>{organization.legalName !== organization.displayName && <span>{organization.legalName}</span>}</div><div className="mobile-organization-meta"><StatusBadge status={statusLabels[organization.status]} />{organizationActions(organization)}</div></article>)}</div>
        </>}
      </section>}
      {!showLoading && state === "ready" && total > 0 && <Pagination aria-label="Organizations pagination"><PaginationContent>
        <PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage(page - 1)}>Previous</Button></PaginationItem>
        <PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount}</span></PaginationItem>
        <PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage(page + 1)}>Next</Button></PaginationItem>
      </PaginationContent></Pagination>}
    </div>
    <OrganizationOnboardingDialog open={showOnboarding} onClose={closeOnboarding} onCreated={load} />
    {statusTarget && <AlertDialog ariaLabel={statusTarget.status === "ACTIVE" ? "Disable organization" : "Enable organization"} isOpen onOpenChange={(open) => { if (!open && !statusBusy) setStatusTarget(null); }} isDismissable={!statusBusy}>
      <AlertDialogHeader><AlertDialogMedia>{statusTarget.status === "ACTIVE" ? <PowerOff /> : <Power />}</AlertDialogMedia><AlertDialogTitle>{statusTarget.status === "ACTIVE" ? "Disable organization?" : "Enable organization?"}</AlertDialogTitle><AlertDialogDescription>{statusTarget.status === "ACTIVE" ? `${statusTarget.displayName} users will be unable to sign in until the organization is enabled again.` : `${statusTarget.displayName} users will be able to sign in again.`}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel isDisabled={statusBusy}>Cancel</AlertDialogCancel><AlertDialogAction variant={statusTarget.status === "ACTIVE" ? "destructive" : "default"} isDisabled={statusBusy} onPress={changeOrganizationStatus}>{statusBusy ? "Saving…" : statusTarget.status === "ACTIVE" ? "Disable organization" : "Enable organization"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>}
  </>;
}
