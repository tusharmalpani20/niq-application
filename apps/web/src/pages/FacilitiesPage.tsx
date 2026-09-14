import type { AuthenticatedUser, Facility } from "@niq/application-contracts";
import { Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, createFacility, listFacilities } from "../lib/api";
import { Icon } from "../lib/icons";

const pageSize = 10;

export function FacilitiesPage() {
  const user = useOutletContext<AuthenticatedUser>();
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
  }, [user.organizationId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return facilities.filter((facility) => {
      const matchesQuery = !normalizedQuery || `${facility.name} ${facility.code} ${facility.timezone}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (status === "all" || facility.status === status);
    });
  }, [facilities, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleFacilities = filtered.slice((page - 1) * pageSize, page * pageSize);
  const columns: Array<DataTableColumn<Facility>> = [
    { accessorKey: "name", header: "Facility", cell: ({ row }) => <strong>{row.original.name}</strong> },
    { accessorKey: "code", header: "Code" },
    { accessorKey: "timezone", header: "Timezone" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status === "ACTIVE" ? "Active" : "Deactivated"} /> },
  ];
  const hasFilters = query.trim() || status !== "all";
  const emptyContent = <div className="table-empty-content">
    {loadState === "loading" ? <span>Loading facilities…</span>
      : loadState === "error" ? <><strong>Facilities could not be loaded</strong><span>Refresh the page to try again.</span></>
      : hasFilters ? <><strong>No matching facilities</strong><span>Try changing the search or filter.</span></>
      : <Button className="patient-empty-action" variant="outline" size="sm" onPress={() => setShowForm(true)}><Icon name="plus" size={16}/>Add facility</Button>}
  </div>;

  return <>
    <h1 className="patient-page-title">Facilities</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Facilities</span><span>{facilities.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search facilities" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search facilities…" /></InputGroup><Button className="size-10 shrink-0" size="icon-lg" aria-label="Add facility" onPress={() => setShowForm(true)}><Icon name="plus" size={20}/></Button></div>
    </div>
    <div className="patient-filter-bar facility-filter-bar"><Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="ACTIVE">Active</SelectItem><SelectItem id="INACTIVE">Inactive</SelectItem></SelectContent></Select></div>
    <section className="surface table-surface"><div className="mobile-card-list">{visibleFacilities.length ? visibleFacilities.map((facility) => <article className="mobile-data-card" key={facility.id}><div><strong>{facility.name}</strong><span>{facility.code} · {facility.timezone}</span></div><StatusBadge status={facility.status === "ACTIVE" ? "Active" : "Deactivated"}/></article>) : emptyContent}</div><div className="desktop-table p-5"><DataTable columns={columns} data={visibleFacilities} label="Facilities" emptyContent={emptyContent}/></div></section>
    <Pagination className="mt-4" aria-label="Facilities pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>
    {showForm && <FacilityDialog
      organizationId={user.organizationId}
      onClose={() => setShowForm(false)}
      onCreated={(facility) => { setFacilities((current) => [...current, facility].sort((first, second) => first.name.localeCompare(second.name))); setShowForm(false); }}
    />}
  </>;
}

function FacilityDialog({ organizationId, onClose, onCreated }: { organizationId: string; onClose: () => void; onCreated: (facility: Facility) => void }) {
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage(null);
    try {
      onCreated(await createFacility(organizationId, { name: String(form.get("name") ?? ""), code: String(form.get("code") ?? ""), timezone }));
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The facility could not be saved. Please try again.");
      setIsSubmitting(false);
    }
  }

  return <Dialog ariaLabel="Add facility" isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogHeader><DialogTitle>Add facility</DialogTitle></DialogHeader>
    <form className="clinical-form" onSubmit={submit}><Field><FieldLabel className="required-field-label">Facility name <span aria-hidden="true">*</span></FieldLabel><Input name="name" placeholder="e.g. Delhi Central" required autoFocus/></Field><Field><FieldLabel className="required-field-label">Facility code <span aria-hidden="true">*</span></FieldLabel><Input name="code" placeholder="DEL" required/></Field><Field><FieldLabel className="required-field-label">Timezone <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Timezone" selectedKey={timezone} onSelectionChange={(key) => setTimezone(String(key))} isRequired><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="Asia/Kolkata">Asia/Kolkata</SelectItem></SelectContent></Select></Field>{message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}<div className="form-footer"><Button type="button" variant="outline" isDisabled={isSubmitting} onPress={onClose}>Cancel</Button><Button type="submit" isDisabled={isSubmitting}>{isSubmitting ? "Saving…" : "Add facility"}</Button></div></form>
  </Dialog>;
}
