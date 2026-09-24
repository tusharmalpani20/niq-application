import { hasChangedInputs, useUnsavedFormClose } from "../components/useUnsavedFormClose";
import { hasPermission } from "@niq/application-contracts";
import type { AuthenticatedUser, Facility } from "@niq/application-contracts";
import { Search, Pencil, Power } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { updateFacility } from "../lib/facility-management";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, createFacility, listFacilities } from "../lib/api";
import { Icon } from "../lib/icons";

const pageSize = 10;

export function FacilitiesPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const canManage = hasPermission(user.role, "facilities.manage");
  const [editing, setEditing] = useState<Facility | null>(null);
  const [changingStatus, setChangingStatus] = useState<Facility | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    listFacilities(user.organizationId)
      .then((items) => { if (active) { setFacilities(items); setLoadState("ready"); } })
      .catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [user.organizationId, reload]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return facilities.filter((facility) => {
      const matchesQuery = !normalizedQuery || `${facility.name} ${facility.code} ${facility.timezone}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (status === "all" || facility.status === status);
    });
  }, [facilities, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  const visibleFacilities = filtered.slice((page - 1) * pageSize, page * pageSize);
  function saved(facility: Facility) {
    setFacilities((items) => [...items.filter((item) => item.id !== facility.id), facility].sort((a, b) => a.name.localeCompare(b.name)));
    setShowForm(false); setEditing(null);
  }
  const actions = (facility: Facility) => <div className="flex gap-2">
    <TooltipTrigger><Button size="icon-sm" variant="outline" aria-label={`Edit ${facility.name}`} onPress={() => { setEditing(facility); setShowForm(true); }}><Pencil aria-hidden="true" /></Button><Tooltip>Edit facility</Tooltip></TooltipTrigger>
    <TooltipTrigger><Button size="icon-sm" variant={facility.status === "ACTIVE" ? "destructive-outline" : "outline"} aria-label={`${facility.status === "ACTIVE" ? "Deactivate" : "Activate"} ${facility.name}`} onPress={() => { setError(null); setChangingStatus(facility); }}><Power aria-hidden="true" /></Button><Tooltip>{facility.status === "ACTIVE" ? "Deactivate facility" : "Activate facility"}</Tooltip></TooltipTrigger>
  </div>;
  const columns: Array<DataTableColumn<Facility>> = [
    { accessorKey: "name", header: "Facility", cell: ({ row }) => <Link className="text-foreground hover:underline font-normal" to={`/facilities/${row.original.id}`}>{row.original.name}</Link> },
    { accessorKey: "code", header: "Code" },
    { accessorKey: "timezone", header: "Timezone" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status === "ACTIVE" ? "Active" : "Deactivated"} /> },
  ];
  if (canManage) columns.push({ id: "actions", header: "Actions", cell: ({ row }) => actions(row.original) });
  const hasFilters = query.trim() || status !== "all";
  const emptyContent = <div className="table-empty-content">
    {loadState === "loading" ? <span>Loading facilities…</span>
      : loadState === "error" ? <><strong>Facilities could not be loaded</strong><Button variant="outline" onPress={() => { setLoadState("loading"); setReload((n) => n + 1); }}>Retry</Button></>
      : hasFilters ? <><strong>No matching facilities</strong><span>Try changing the search or filter.</span></>
      : <><p className="text-sm text-foreground">No facilities yet</p><p className="text-sm">{canManage ? "Add a facility to organize patients and staff access." : "Facilities will appear here once added."}</p>{canManage && <Button className="patient-empty-action" variant="outline" size="sm" onPress={() => setShowForm(true)}><Icon name="plus" size={16}/>Add facility</Button>}</>}
  </div>;

  return <>
    <h1 className="patient-page-title">Facilities</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Facilities</span><span>{facilities.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search facilities" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search facilities…" /></InputGroup>{canManage && <TooltipTrigger><Button className="size-10 shrink-0" size="icon-lg" aria-label="Add facility" onPress={() => setShowForm(true)}><Icon name="plus" size={20}/></Button><Tooltip>Add facility</Tooltip></TooltipTrigger>}</div>
    </div>
    <div className="patient-filter-bar facility-filter-bar"><Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="ACTIVE">Active</SelectItem><SelectItem id="INACTIVE">Deactivated</SelectItem></SelectContent></Select></div>
    <section className="surface table-surface"><div className="mobile-card-list">{visibleFacilities.length ? visibleFacilities.map((facility) => <article className="mobile-data-card" key={facility.id}><div><Link className="text-foreground hover:underline font-normal" to={`/facilities/${facility.id}`}>{facility.name}</Link><span>{facility.code} · {facility.timezone}</span></div><StatusBadge status={facility.status === "ACTIVE" ? "Active" : "Deactivated"}/>{canManage && actions(facility)}</article>) : emptyContent}</div><div className="desktop-table p-5"><DataTable columns={columns} data={visibleFacilities} label="Facilities" emptyContent={emptyContent}/></div></section>
    {filtered.length > 0 && <Pagination className="mt-4" aria-label="Facilities pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    {showForm && canManage && <FacilityDialog organizationId={user.organizationId} facility={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={saved} />}
    <AlertDialog ariaLabel="Change facility status" isOpen={!!changingStatus} isDismissable={!savingStatus} onOpenChange={(open) => { if (!open && !savingStatus) setChangingStatus(null); }}>
      <AlertDialogHeader><AlertDialogTitle>{changingStatus?.status === "ACTIVE" ? "Deactivate" : "Activate"} {changingStatus?.name}?</AlertDialogTitle><AlertDialogDescription>{changingStatus?.status === "ACTIVE" ? "New patients cannot be registered at this facility while it is inactive. Existing records are kept." : "This facility will be available for patient registration again."}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel isDisabled={savingStatus}>Cancel</AlertDialogCancel><AlertDialogAction slot={undefined} variant={changingStatus?.status === "ACTIVE" ? "destructive" : "default"} isDisabled={savingStatus} onPress={async () => {
        if (!changingStatus || savingStatus) return;
        setSavingStatus(true); setError(null);
        try { saved(await updateFacility(user.organizationId, changingStatus.id, { status: changingStatus.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })); setChangingStatus(null); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "The facility could not be updated."); }
        finally { setSavingStatus(false); }
      }}>{savingStatus ? "Saving…" : changingStatus?.status === "ACTIVE" ? "Deactivate facility" : "Activate facility"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>
  </>;
}

export function FacilityDialog({ organizationId, facility, onClose, onSaved }: { organizationId: string; facility: Facility | null; onClose: () => void; onSaved: (facility: Facility) => void }) {
  const timezone = facility?.timezone ?? "Asia/Kolkata";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { requestClose, confirmation } = useUnsavedFormClose({ subject: "facility", onClose, isBusy: () => isSubmitting, isDirty: () => hasChangedInputs(formRef.current) });
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage(null);
    try {
      const input = { name: String(form.get("name") ?? "").trim(), code: String(form.get("code") ?? "").trim(), timezone };
      onSaved(facility ? await updateFacility(organizationId, facility.id, input) : await createFacility(organizationId, input));
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The facility could not be saved. Please try again.");
      setIsSubmitting(false);
    }
  }

  return <><Dialog ariaLabel={facility ? "Edit facility" : "Add facility"} className="facility-dialog" isOpen isDismissable={!isSubmitting} isKeyboardDismissDisabled={isSubmitting} showCloseButton={!isSubmitting} onOpenChange={(open) => { if (!open) requestClose(); }}>
    <DialogHeader><DialogTitle>{facility ? "Edit facility" : "Add facility"}</DialogTitle></DialogHeader>
    <form ref={formRef} className="clinical-form" onSubmit={submit}><fieldset disabled={isSubmitting} className="form-fields facility-dialog-fields m-0 min-w-0 border-0"><Field><FieldLabel htmlFor="facility-name" className="required-field-label">Facility name <span aria-hidden="true">*</span></FieldLabel><Input id="facility-name" defaultValue={facility?.name} name="name" placeholder="e.g. Delhi Central" required autoFocus/></Field><Field><FieldLabel htmlFor="facility-code" className="required-field-label">Facility code <span aria-hidden="true">*</span></FieldLabel><Input id="facility-code" defaultValue={facility?.code} name="code" placeholder="DEL" required/></Field><Field><FieldLabel>Timezone</FieldLabel><p className="text-sm text-muted-foreground">{timezone === "Asia/Kolkata" ? "India Standard Time (Asia/Kolkata)" : timezone}</p></Field>{message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}</fieldset><div className="form-footer"><Button type="button" variant="outline" isDisabled={isSubmitting} onPress={requestClose}>Cancel</Button><Button type="submit" isDisabled={isSubmitting}>{isSubmitting ? "Saving…" : facility ? "Save changes" : "Add facility"}</Button></div></form>
  </Dialog>{confirmation}</>;
}
