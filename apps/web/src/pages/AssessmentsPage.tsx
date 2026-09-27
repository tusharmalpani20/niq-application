import { ClinicalReviewQueue } from "../features/assessments/ClinicalReviewQueue";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { assessmentStatusSchema, hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, Facility } from "@niq/application-contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { ChevronRight, Search, Star } from "lucide-react";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { AssessmentEmptyIllustration } from "../components/AssessmentEmptyIllustration";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { listAssessments, listFacilities, setAssessmentPriority } from "../lib/api";
import { facilityWorkStatuses, openAssessmentStatuses } from "../lib/assessment-work";

import { Icon } from "../lib/icons";

import { DateDisplay } from "../components/DateDisplay";
import { assessmentStatusLabels } from "../lib/patient-display";

const assessmentPageSize = 10;
type AssessmentTab = "assessments" | "my-work" | "clinical-reviews" | "completed";
const assessmentDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
const initialStatus = (params: URLSearchParams) => {
  const value = params.get("status");
  return value === "WORK" || value === "OPEN" || value === "MY_ACTIONS" || value === "EDIT_DRAFT" || value === "SEND_FOR_REVIEW" || value === "CORRECT_DRAFT" || value === "PRIORITY" || value === "COMPLETED_THIS_MONTH" || assessmentStatusSchema.safeParse(value).success ? value! : "all";
};
const tabStatus = (params: URLSearchParams, tab: AssessmentTab) => {
  const status = initialStatus(params);
  if (tab === "my-work" && status === "MY_ACTIONS") return "all";
  if (tab === "completed" && status === "COMPLETED") return "all";
  return status;
};
const initialTab = (params: URLSearchParams, canOpen: boolean): AssessmentTab => {
  const tab = params.get("tab");
  if (tab === "clinical-reviews" && canOpen) return "clinical-reviews";
  if (tab === "my-work" && canOpen) return "my-work";
  if (tab === "completed") return "completed";
  const status = initialStatus(params);
  if (canOpen && ["MY_ACTIONS", "EDIT_DRAFT", "CORRECT_DRAFT", "SEND_FOR_REVIEW"].includes(status)) return "my-work";
  if (["COMPLETED", "COMPLETED_THIS_MONTH"].includes(status)) return "completed";
  return "assessments";
};
const matchesTab = (record: AssessmentSummary, tab: AssessmentTab) => {
  if (tab === "my-work") return !!record.myAction;
  if (tab === "completed") return record.status === "COMPLETED";
  return true;
};
const matchesStatus = (record: AssessmentSummary, status: string, now: Date) => {
  if (status === "all") return true;
  if (status === "WORK") return facilityWorkStatuses.has(record.status);
  if (status === "OPEN") return openAssessmentStatuses.has(record.status);
  if (status === "MY_ACTIONS") return !!record.myAction;
  if (status === "EDIT_DRAFT" || status === "SEND_FOR_REVIEW" || status === "CORRECT_DRAFT") return record.myAction === status;
  if (status === "PRIORITY") return record.isPriority;
  if (status === "COMPLETED_THIS_MONTH") return record.status === "COMPLETED" && record.completedAt !== null && record.completedAt.getFullYear() === now.getFullYear() && record.completedAt.getMonth() === now.getMonth();
  return record.status === status;
};
const assessmentListStatus = (record: AssessmentSummary) => record.myAction === "CORRECT_DRAFT" ? "Needs correction" : record.myAction === "SEND_FOR_REVIEW" ? "Ready to send" : assessmentStatusLabels[record.status];
const assessmentActionLabel = (record: AssessmentSummary) => {
  if (record.myAction === "CORRECT_DRAFT") return "Continue corrections";
  if (record.myAction === "SEND_FOR_REVIEW") return "Send for review";
  switch (record.status) {
    case "DRAFT": return "Open draft";
    case "READY_FOR_SCORING": return "Review answers";
    case "SCORING_PENDING": return "View progress";
    case "SCORING_UNAVAILABLE": return "Review issue";
    case "SCORED": return "View score";
    case "UNDER_REVIEW": return "View review";
    case "COMPLETED": return "View result";
    case "VOIDED": return "View assessment";
  }
};

export function AssessmentsPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canOpen = hasPermission(user.role, "assessments.read");
  const canCreate = hasPermission(user.role, "assessments.create");
  const [tab, setTab] = useState<AssessmentTab>(() => initialTab(searchParams, canOpen));
  const [records, setRecords] = useState<AssessmentSummary[]>([]);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [reviewQuery, setReviewQuery] = useState("");
  const [facility, setFacility] = useState(() => searchParams.get("facility") ?? "all");
  const [status, setStatus] = useState(() => tabStatus(searchParams, initialTab(searchParams, canOpen)));
  const reviewFilter = searchParams.get("review") === "QUEUED" ? "QUEUED" : searchParams.get("review") === "mine-active" ? "mine-active" : "all";
  const [reviewState, setReviewState] = useState(reviewFilter);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [priorityBusy, setPriorityBusy] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState("");
  const togglePriority = async (record: AssessmentSummary) => {
    setPriorityBusy(record.id); setPriorityError("");
    try {
      await setAssessmentPriority(user.organizationId, record.id, !record.isPriority);
      setRecords(items => items.map(item => item.id === record.id ? { ...item, isPriority: !record.isPriority } : item));
    } catch (cause) { setPriorityError(cause instanceof Error ? cause.message : "Could not update priority. Please try again."); }
    finally { setPriorityBusy(null); }
  };
  const priorityButton = (record: AssessmentSummary) => <Button variant="ghost" size="icon" className={record.isPriority ? "text-amber-600" : "text-muted-foreground"} aria-label={`${record.isPriority ? "Remove priority from" : "Mark as priority"} ${record.reference}`} aria-pressed={record.isPriority} isDisabled={priorityBusy !== null} onPress={() => { void togglePriority(record); }}><Star className={`size-4 ${record.isPriority ? "fill-current" : ""}`} aria-hidden="true" /></Button>;
  const openButton = (record: AssessmentSummary) => <RouterButtonLink variant="ghost" size="icon" to={`/assessments/${record.reference}`} aria-label={`${assessmentActionLabel(record)} ${record.reference}`} title={assessmentActionLabel(record)}><ChevronRight className="size-4" aria-hidden="true" /></RouterButtonLink>;
  const selectTab = (next: AssessmentTab) => {
    setTab(next);
    setPage(1);
    setSearchParams(params => {
      const updated = new URLSearchParams(params);
      if (next === "assessments") updated.delete("tab"); else updated.set("tab", next);
      updated.delete("status");
      updated.delete("review");
      return updated;
    });
  };
  useEffect(() => {
    setTab(initialTab(searchParams, canOpen));
    setStatus(tabStatus(searchParams, initialTab(searchParams, canOpen)));
    setFacility(searchParams.get("facility") ?? "all");
    setReviewState(reviewFilter);
    setPage(1);
  }, [canOpen, reviewFilter, searchParams]);
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    Promise.all([listAssessments(user.organizationId), listFacilities(user.organizationId)]).then(([items, facilities]) => { if (active) { setRecords(items); setFacilities(facilities); setLoadState("ready"); } }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [user.organizationId, reload]);
  useEffect(() => {
    if (!canOpen) return;
    const controller = new AbortController();
    setReviewCount(null);
    listClinicalReviews(user.organizationId, new URLSearchParams({ page: "1", pageSize: "1" }), controller.signal)
      .then(result => { if (!controller.signal.aborted) setReviewCount(result.total); })
      .catch(() => { if (!controller.signal.aborted) setReviewCount(null); });
    return () => controller.abort();
  }, [canOpen, user.organizationId, reload]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = new Date();
    return records.filter((record) => {
      const matchesQuery = !normalizedQuery || `${record.reference} ${record.patient.reference} ${record.patient.displayName} ${record.facility?.name ?? ""}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (facility === "all" || record.facility?.id === facility) && matchesTab(record, tab) && matchesStatus(record, status, now);
    });
  }, [facility, query, records, status, tab]);
  const myWorkCount = records.filter(record => !!record.myAction).length;
  const completedCount = records.filter(record => record.status === "COMPLETED").length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / assessmentPageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * assessmentPageSize, currentPage * assessmentPageSize);
  const columns: Array<DataTableColumn<AssessmentSummary>> = [
    { id: "reference", header: "Assessment", cell: ({ row }) => canOpen ? <Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${row.original.reference}`}>{row.original.reference}</Link> : row.original.reference },
    { id: "patient", header: "Patient", cell: ({ row }) => <div className="grid gap-1"><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/patients/${row.original.patient.reference}`}>{row.original.patient.displayName}</Link><span className="text-xs text-muted-foreground">{row.original.patient.reference}</span></div> },
    { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "—" },
    { id: "created", header: "Started", cell: ({ row }) => <DateDisplay value={row.original.createdAt} /> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={assessmentListStatus(row.original)} /> },
  ];
  if (canOpen) columns.push({ id: "actions", header: () => <span className="block text-right">Actions</span>, cell: ({ row }) => <div className="flex items-center justify-end gap-1">{priorityButton(row.original)}{openButton(row.original)}</div> });
  const hasFilters = query.trim() || facility !== "all" || status !== "all";
  const emptyContent = <div className={`table-empty-content${loadState === "ready" && !hasFilters ? " illustrated-empty-state" : ""}`}>{loadState === "loading" ? <span>Loading assessments…</span> : loadState === "error" ? <><strong>Assessments could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></> : hasFilters ? <><strong>No matching assessments</strong><span>Try changing the search or filters.</span></> : tab === "my-work" ? <><AssessmentEmptyIllustration /><strong>Nothing needs your action</strong><span>Drafts, corrections, and assessments ready to send will appear here.</span></> : tab === "completed" ? <><AssessmentEmptyIllustration /><strong>No completed assessments yet</strong><span>Completed assessments will appear here.</span></> : <><AssessmentEmptyIllustration /><strong>No assessments to display</strong><span>Assessments will appear here when available.</span>{canCreate && <RouterButtonLink to="/assessments/new">New assessment</RouterButtonLink>}</>}</div>;
  const assessmentContent = <>
    {priorityError && <p role="alert" className="mb-3 text-sm text-destructive">{priorityError}</p>}
    <section className="surface table-surface"><div className="mobile-card-list">{visible.length ? visible.map((record) => <article className="mobile-data-card list-mobile-card" key={record.id}>
      <div className="mobile-card-heading">
        <div className="mobile-card-primary">{canOpen ? <Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${record.reference}`}>{record.reference}</Link> : <span>{record.reference}</span>}<Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/patients/${record.patient.reference}`}>{record.patient.displayName}</Link><span>{record.patient.reference}</span></div>
        {canOpen && <div className="mobile-card-actions">{priorityButton(record)}{openButton(record)}</div>}
      </div>
      <div className="mobile-card-meta"><StatusBadge status={assessmentListStatus(record)}/><span>{record.facility?.name ?? "No facility"} · {assessmentDate(record.createdAt)}</span></div>
    </article>) : emptyContent}</div><div className="desktop-table p-5"><DataTable columns={columns} data={visible} label="Assessments" emptyContent={emptyContent} /></div></section>
    {filtered.length > 0 && <Pagination className="mt-4" aria-label="Assessments pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={loadState !== "ready" || currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={loadState !== "ready" || currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
  </>;
  return <>
    <h1 className="patient-page-title">Assessments</h1>
    <Tabs selectedKey={tab} onSelectionChange={key => selectTab(String(key) as AssessmentTab)}>
    <div className="assessment-list-toolbar flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border max-[620px]:flex-col max-[620px]:items-stretch">
      <TabsList variant="line" aria-label="Assessment lists" className="assessment-list-tabs max-w-full self-stretch"><TabsTrigger id="assessments">All assessments <span className="ml-2 text-xs">{records.length}</span></TabsTrigger>{canOpen && <TabsTrigger id="my-work">My work <span className="ml-2 text-xs">{myWorkCount}</span></TabsTrigger>}{canOpen && <TabsTrigger id="clinical-reviews">Clinical reviews {reviewCount !== null && <span className="ml-2 text-xs">{reviewCount}</span>}</TabsTrigger>}<TabsTrigger id="completed">Completed <span className="ml-2 text-xs">{completedCount}</span></TabsTrigger></TabsList>
      <div className="patient-search-actions ml-auto max-[620px]:ml-0"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label={tab === "clinical-reviews" ? "Search clinical reviews" : "Search by assessment ID, patient name or patient ID"} value={tab === "clinical-reviews" ? reviewQuery : query} onChange={(event) => { if (tab === "clinical-reviews") setReviewQuery(event.target.value); else { setQuery(event.target.value); setPage(1); } }} placeholder="Search assessments or patients…" /></InputGroup>{canCreate && <TooltipTrigger><Button className="size-10 shrink-0" size="icon-lg" aria-label="New assessment" onPress={() => navigate("/assessments/new")}><Icon name="plus" size={20}/></Button><Tooltip>New assessment</Tooltip></TooltipTrigger>}</div>
    </div>
    <div className="patient-filter-bar assessment-filter-bar">
      {tab !== "clinical-reviews" ? <>
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { const selected = String(key); setFacility(selected); setSearchParams(params => { if (selected === "all") params.delete("facility"); else params.set("facility", selected); return params; }); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilities.map(item => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select key={tab} aria-label={tab === "my-work" ? "Filter my work" : tab === "completed" ? "Filter completed assessments" : "Filter by status"} selectedKey={status} onSelectionChange={(key) => { const selected = String(key); setStatus(selected); setSearchParams(params => { const updated = new URLSearchParams(params); if (selected === "all") updated.delete("status"); else updated.set("status", selected); if (tab !== "assessments") updated.set("tab", tab); return updated; }); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tab === "my-work" ? <><SelectItem id="all">All my work</SelectItem><SelectItem id="EDIT_DRAFT">My drafts</SelectItem><SelectItem id="CORRECT_DRAFT">Corrections to make</SelectItem><SelectItem id="SEND_FOR_REVIEW">Ready to send</SelectItem></> : tab === "completed" ? <><SelectItem id="all">All completed</SelectItem><SelectItem id="COMPLETED_THIS_MONTH">Completed this month</SelectItem></> : <><SelectItem id="all">All statuses</SelectItem><SelectItem id="PRIORITY">My priorities</SelectItem><SelectItem id="MY_ACTIONS">My assessment actions</SelectItem><SelectItem id="SEND_FOR_REVIEW">Ready to send</SelectItem><SelectItem id="CORRECT_DRAFT">Corrections to make</SelectItem><SelectItem id="WORK">Assessment and review work</SelectItem><SelectItem id="OPEN">Open assessments</SelectItem><SelectItem id="COMPLETED_THIS_MONTH">Completed this month</SelectItem>{Object.entries(assessmentStatusLabels).filter(([id]) => ["DRAFT", "SCORING_PENDING", "SCORING_UNAVAILABLE", "SCORED", "UNDER_REVIEW", "COMPLETED"].includes(id) || records.some(record => record.status === id)).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</>}</SelectContent></Select>
      </> : <Select aria-label="Review stage" selectedKey={reviewState} onSelectionChange={key => setReviewState(String(key))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All clinical reviews</SelectItem><SelectItem id="QUEUED">Awaiting reviewer</SelectItem><SelectItem id="mine-active">My reviews in progress</SelectItem><SelectItem id="mine">My work</SelectItem><SelectItem id="IN_REVIEW">In review</SelectItem><SelectItem id="RETURNED">Returned for correction</SelectItem><SelectItem id="AWAITING_RESUBMISSION">Awaiting resubmission</SelectItem><SelectItem id="COMPLETED">Completed</SelectItem></SelectContent></Select>}
    </div>
    <TabsContent id="assessments">{tab === "assessments" && assessmentContent}</TabsContent>
    {canOpen && <TabsContent id="my-work">{tab === "my-work" && assessmentContent}</TabsContent>}
    {canOpen && <TabsContent id="clinical-reviews"><ClinicalReviewQueue key={`${user.organizationId}:${user.membershipId}:${reviewFilter}`} user={user} query={reviewQuery} state={reviewState} canCreate={canCreate} onViewAssessments={() => selectTab("assessments")} /></TabsContent>}
    <TabsContent id="completed">{tab === "completed" && assessmentContent}</TabsContent></Tabs>
  </>;
}
