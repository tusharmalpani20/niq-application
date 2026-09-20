import type { AssessmentSummary, AuthenticatedUser, Facility } from "@niq/application-contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Search } from "lucide-react";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { listAssessments, listFacilities } from "../lib/api";

import { Icon } from "../lib/icons";

import { DateDisplay } from "../components/DateDisplay";
import { assessmentStatusLabels } from "../lib/patient-display";

const assessmentPageSize = 10;
const assessmentDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);

export function AssessmentsPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [records, setRecords] = useState<AssessmentSummary[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    Promise.all([listAssessments(user.organizationId), listFacilities(user.organizationId)]).then(([items, facilities]) => { if (active) { setRecords(items); setFacilities(facilities); setLoadState("ready"); } }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [user.organizationId, reload]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesQuery = !normalizedQuery || `${record.patient.reference} ${record.patient.displayName} ${record.facility?.name ?? ""}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (facility === "all" || record.facility?.id === facility) && (status === "all" || record.status === status);
    });
  }, [facility, query, records, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / assessmentPageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * assessmentPageSize, currentPage * assessmentPageSize);
  const columns: Array<DataTableColumn<AssessmentSummary>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <div className="grid gap-1"><Link className="text-primary font-semibold" to={`/assessments/${row.original.id}`}>{row.original.patient.displayName}</Link><span className="text-xs text-muted-foreground">{row.original.patient.reference}</span></div> },
    { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "—" },
    { id: "created", header: "Started", cell: ({ row }) => <DateDisplay value={row.original.createdAt} /> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={assessmentStatusLabels[row.original.status]} /> },
  ];
  const hasFilters = query.trim() || facility !== "all" || status !== "all";
  const emptyContent = <div className="table-empty-content">{loadState === "loading" ? <span>Loading assessments…</span> : loadState === "error" ? <><strong>Assessments could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></> : hasFilters ? <><strong>No matching assessments</strong><span>Try changing the search or filters.</span></> : <><strong>Create your first assessment</strong><RouterButtonLink to="/assessments/new"><Icon name="plus" size={18} />New assessment</RouterButtonLink></>}</div>;
  return <>
    <h1 className="patient-page-title">Assessments</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Assessments</span><span>{records.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search assessments" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search assessments…" /></InputGroup><TooltipTrigger><Button className="size-10 shrink-0" size="icon-lg" aria-label="New assessment" onPress={() => navigate("/assessments/new")}><Icon name="plus" size={20}/></Button><Tooltip>New assessment</Tooltip></TooltipTrigger></div>
    </div>
    <div className="patient-filter-bar assessment-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { setFacility(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilities.map(item => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem>{Object.entries(assessmentStatusLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select>
    </div>
    <section className="surface table-surface"><div className="mobile-card-list">{visible.length ? visible.map((record) => <article className="mobile-data-card" key={record.id}><div><Link className="font-semibold text-primary" to={`/assessments/${record.id}`}>{record.patient.reference}</Link><span>{record.patient.displayName}</span></div><StatusBadge status={assessmentStatusLabels[record.status]}/><span>{record.facility?.name ?? "No facility"} · {assessmentDate(record.createdAt)}</span></article>) : emptyContent}</div><div className="desktop-table p-5"><DataTable columns={columns} data={visible} label="Assessments" emptyContent={emptyContent} /></div></section>
    {filtered.length > 0 && <Pagination className="mt-4" aria-label="Assessments pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={loadState !== "ready" || currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={loadState !== "ready" || currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
  </>;
}

