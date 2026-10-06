import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, Facility, Patient } from "@niq/application-contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ArrowDownUp, Building2, CalendarDays, ClipboardCheck, Clock3, Download, Eye, HeartHandshake, IdCard, Mail, Pencil, Phone, Search, Send, Star, TriangleAlert, UserRound, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PatientForm, PatientFormDialog } from "../components/PatientForm";
import { CorrectPatientMrnDialog } from "../components/CorrectPatientMrnDialog";
import { CorrectPatientDobDialog } from "../components/CorrectPatientDobDialog";
import { PatientHeader } from "../components/PatientHeader";
import { useWorkspaceRevision } from "../features/notifications/useWorkspaceRevision";
import { PatientAssessmentOverview } from "../components/PatientAssessmentOverview";
import { PatientEmptyIllustration } from "../components/PatientEmptyIllustration";
import { PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { getPatient, listFacilities, listPatientAssessments, listPatientPage, setAssessmentPriority } from "../lib/api";
import { Icon } from "../lib/icons";

import { DateDisplay } from "../components/DateDisplay";
import { StatusBadge } from "../components/StatusBadge";
import { patientAgeLabel, assessmentStatusLabels, type PatientSort } from "../lib/patient-display";

const pageSize = 10;
type PatientRow = { id: string; reference: string; displayName: string; age: string; createdAt: Date; gender: string; facility: string; facilityId: string | null; lastAssessment: Date | null };

function PatientsSkeleton({ showActions }: { showActions: boolean }) {
  return <section className="surface table-surface mobile-list-surface" role="status" aria-label="Loading patients">
    <span className="sr-only">Loading patients…</span>
    <div className="mobile-card-list" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <article className="mobile-data-card list-mobile-card" key={index}>
      <div className="mobile-card-heading"><div className="mobile-card-primary min-w-0 flex-1"><Skeleton className="h-4 w-36 max-w-full motion-reduce:animate-none" /><Skeleton className="h-3 w-48 max-w-full motion-reduce:animate-none" /></div>{showActions && <div className="mobile-card-actions"><Skeleton className="size-8 motion-reduce:animate-none" /></div>}</div>
      <Skeleton className="h-3 w-32 max-w-full motion-reduce:animate-none" />
    </article>)}</div>
    <div className="desktop-table p-5" aria-hidden="true"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Patient</th><th>Age / gender</th><th>Facility</th><th>Last assessment</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{Array.from({ length: 6 }, (_, index) => <tr key={index}>
      <td><div className="grid gap-2"><Skeleton className="h-4 w-36 max-w-full motion-reduce:animate-none" /><Skeleton className="h-3 w-20 motion-reduce:animate-none" /></div></td>
      <td><Skeleton className="h-4 w-28 motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-4 w-32 motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-4 w-24 motion-reduce:animate-none" /></td>
      <td><div className="flex justify-end gap-2">{showActions && <Skeleton className="size-8 motion-reduce:animate-none" />}<Skeleton className="size-8 motion-reduce:animate-none" /></div></td>
    </tr>)}</tbody></table></div></div>
  </section>;
}

function PatientDetailSkeleton() {
  return <div role="status" aria-label="Loading patient" className="space-y-5">
    <span className="sr-only">Loading patient…</span>
    <div aria-hidden="true" className="space-y-3 border-b border-border pb-5">
      <Skeleton className="h-4 w-32 motion-reduce:animate-none" />
      <Skeleton className="h-9 w-56 max-w-full motion-reduce:animate-none" />
      <Skeleton className="h-4 w-64 max-w-full motion-reduce:animate-none" />
    </div>
    <div aria-hidden="true" className="flex gap-5 border-b border-border pb-3"><Skeleton className="h-5 w-16 motion-reduce:animate-none" /><Skeleton className="h-5 w-28 motion-reduce:animate-none" /></div>
    <div aria-hidden="true" className="grid gap-5 lg:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="surface space-y-4 p-5">
      <Skeleton className="h-5 w-40 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-52 max-w-full motion-reduce:animate-none" />
      <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
    </div>)}</div>
    <div aria-hidden="true" className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="surface space-y-4 p-5">
      <Skeleton className="h-5 w-36 motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 3 }, (_, field) => <Skeleton key={field} className="h-16 w-full motion-reduce:animate-none" />)}</div>
    </div>)}</div>
  </div>;
}

const genderLabel = (gender: Patient["gender"]) => gender[0] + gender.slice(1).toLowerCase();
const formatPatientDate = (value: string | Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(typeof value === "string" ? `${value}T00:00:00` : value));
function PatientDetailField({ icon: FieldIcon, label, value, action, wide = false }: { icon: LucideIcon; label: string; value: ReactNode; action?: ReactNode; wide?: boolean }) {
  return <div className={`flex min-w-0 items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-3.5 ${wide ? "sm:col-span-2" : ""}`}>
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FieldIcon className="size-4" aria-hidden="true" /></span>
    <div className="min-w-0 flex-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground"><span className="min-w-0 break-words">{value}</span>{action}</dd></div>
  </div>;
}
const patientRow = (patient: Patient & { lastAssessmentAt: Date | null }): PatientRow => ({
  id: patient.id,
  reference: patient.reference,
  displayName: patient.displayName,
  age: patientAgeLabel(patient.dateOfBirth),
  createdAt: patient.createdAt,
  gender: genderLabel(patient.gender),
  facility: patient.homeFacility?.name ?? "—",
  facilityId: patient.homeFacility?.id ?? null,
  lastAssessment: patient.lastAssessmentAt,
});

const assessmentAction = (record: AssessmentSummary) => {
  if (record.myAction === "CORRECT_DRAFT") return { label: "Make corrections", icon: Pencil };
  if (record.myAction === "SEND_FOR_REVIEW") return { label: "Review & send", icon: Send };
  switch (record.status) {
    case "DRAFT": return { label: "Continue draft", icon: Pencil };
    case "READY_FOR_SCORING": return { label: "Review answers", icon: ClipboardCheck };
    case "SCORING_PENDING": return { label: "View progress", icon: Clock3 };
    case "SCORING_UNAVAILABLE": return { label: "Review issue", icon: TriangleAlert };
    case "SCORED": return { label: "View score", icon: Eye };
    case "UNDER_REVIEW": return { label: "View review", icon: Eye };
    case "COMPLETED": return { label: "View result", icon: Eye };
    default: return { label: "View assessment", icon: Eye };
  }
};

export function PatientsPage() {
  const workspaceRevision = useWorkspaceRevision(["assessment", "patient", "facility"]);
  const user = useOutletContext<AuthenticatedUser>();
  const [searchParams, setSearchParams] = useSearchParams();
  const registeredThisMonth = searchParams.get("registered") === "this-month";
  const [patients, setPatients] = useState<Array<Patient & { lastAssessmentAt: Date | null }>>([]);
  const [total, setTotal] = useState(0);
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [facility, setFacility] = useState(() => searchParams.get("facility") ?? "all");
  const [gender, setGender] = useState("all");
  const [sort, setSort] = useState<PatientSort>("assessment-newest");
  const [page, setPage] = useState(1);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { setFacility(searchParams.get("facility") ?? "all"); setPage(1); }, [searchParams]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true;
    listFacilities(user.organizationId).then(items => { if (active) setFacilityOptions(items); }).catch(() => { if (active) setFacilityOptions([]); });
    return () => { active = false; };
  }, [user.organizationId, reload, workspaceRevision]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
    if (debouncedQuery) params.set("query", debouncedQuery);
    if (facility !== "all") params.set("facility", facility);
    if (gender !== "all") params.set("gender", gender);
    if (registeredThisMonth) params.set("registered", "this-month");
    setLoadState("loading");
    listPatientPage(user.organizationId, params, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setPatients(result.items); setTotal(result.total); setLoadState("ready"); } })
      .catch(() => { if (!controller.signal.aborted) setLoadState("error"); });
    return () => controller.abort();
  }, [user.organizationId, page, sort, debouncedQuery, facility, gender, registeredThisMonth, reload, workspaceRevision]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);
  const showLoading = loadState === "loading" || query.trim() !== debouncedQuery;
  const visiblePatients = patients.map(patientRow);
  const editAction = (patient: PatientRow) => hasPermission(user.role, "patients.edit") && <TooltipTrigger><Button variant="ghost" size="icon-sm" aria-label={`Edit ${patient.reference}`} onPress={() => setEditingPatient(patients.find(item => item.id === patient.id) ?? null)}><Pencil className="size-4" /></Button><Tooltip>Edit patient</Tooltip></TooltipTrigger>;
  const columns: Array<DataTableColumn<PatientRow>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <Link className="group grid gap-1 text-foreground" to={`/patients/${row.original.reference}`}><span className="font-normal text-primary group-hover:underline group-focus-visible:underline">{row.original.displayName}</span><span className="text-xs text-muted-foreground">{row.original.reference}</span></Link> },
    { id: "ageGender", header: "Age / gender", cell: ({ row }) => `${row.original.age ?? "—"} · ${row.original.gender}` },
    { accessorKey: "facility", header: "Facility" }, { id: "lastAssessment", header: "Last assessment", cell: ({ row }) => row.original.lastAssessment ? <DateDisplay value={row.original.lastAssessment} /> : "No assessments" },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <div className="flex items-center justify-end gap-1">{editAction(row.original)}<RouterButtonLink variant="ghost" size="icon-sm" to={`/patients/${row.original.reference}`} aria-label={`Open ${row.original.reference}`}><Icon name="chevron" size={18}/></RouterButtonLink></div> },
  ];
  const hasFilters = query.trim() || facility !== "all" || gender !== "all" || registeredThisMonth;
  const emptyContent = <div className={`table-empty-content${loadState === "ready" && !hasFilters ? " illustrated-empty-state" : ""}`}>
    {loadState === "error" ? <><strong>Patients could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></>
      : hasFilters
      ? <><strong>No matching patients</strong><span>Try changing the search or filters.</span></>
      : <><PatientEmptyIllustration /><strong>No patients to display</strong><span>Patients will appear here when available.</span></>}
  </div>;
  return <>
    <h1 className="patient-page-title">Patients</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Patients</span>{showLoading ? <Skeleton className="h-3 w-7 motion-reduce:animate-none" aria-label="Loading patient count" /> : <span>{total}</span>}</div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search patients" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setLoadState("loading"); }} placeholder="Search patients…" /></InputGroup></div>
    </div>
    {registeredThisMonth && <div className="flex items-center gap-3 text-sm"><span>Registered this month ({new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })})</span><Button variant="link" onPress={() => { setSearchParams(params => { params.delete("registered"); return params; }); setPage(1); }}>Clear</Button></div>}
    <div className="patient-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { const selected = String(key); setFacility(selected); setSearchParams(params => { if (selected === "all") params.delete("facility"); else params.set("facility", selected); return params; }); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilityOptions.map((item) => <SelectItem key={item.id} id={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by gender" selectedKey={gender} onSelectionChange={(key) => { setGender(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All genders</SelectItem><SelectItem id="Female">Female</SelectItem><SelectItem id="Male">Male</SelectItem><SelectItem id="Other">Other</SelectItem><SelectItem id="Unknown">Unknown</SelectItem></SelectContent></Select>
      <div className="patient-sort-control"><span className="patient-sort-label"><ArrowDownUp aria-hidden="true" className="size-4" />Sort by</span><Select aria-label="Sort patients" selectedKey={sort} onSelectionChange={(key) => { setSort(String(key) as PatientSort); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="registered-newest">Registration date: newest first</SelectItem><SelectItem id="registered-oldest">Registration date: oldest first</SelectItem><SelectItem id="assessment-newest">Last assessment: newest first</SelectItem><SelectItem id="assessment-oldest">Last assessment: oldest first</SelectItem></SelectContent></Select></div>
    </div>
    {showLoading ? <PatientsSkeleton showActions={hasPermission(user.role, "patients.edit")} /> : <section className="surface table-surface mobile-list-surface"><div className="mobile-card-list">{visiblePatients.length ? visiblePatients.map((patient)=><article className="mobile-data-card list-mobile-card" key={patient.id}>
      <div className="mobile-card-heading"><Link className="group mobile-card-primary min-w-0 flex-1" to={`/patients/${patient.reference}`}><span className="patient-list-name font-normal group-hover:underline group-focus-visible:underline">{patient.displayName}</span><span>{patient.reference} · {patient.age ?? "—"} · {patient.gender}</span></Link><div className="mobile-card-actions">{editAction(patient)}</div></div>
      <span>{patient.facility}</span>
    </article>) : emptyContent}</div>
      <div className="desktop-table p-5"><DataTable columns={columns} data={visiblePatients} label="Patients" emptyContent={emptyContent} /></div>
    </section>}
    {!showLoading && loadState === "ready" && total > 0 && <Pagination className="mt-4" aria-label="Patients pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage(page - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage(page + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    {editingPatient && <PatientFormDialog organizationId={user.organizationId} facilities={facilityOptions} patient={editingPatient} canCorrectIdentity={user.role === "ORGANIZATION_ADMIN"} onClose={() => setEditingPatient(null)} onSaved={() => { setEditingPatient(null); setReload(current => current + 1); }} />}
  </>;
}

export function RegisterPatientPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  useEffect(() => { listFacilities(user.organizationId).then((items) => setFacilityOptions(items.filter((item) => item.status === "ACTIVE"))).catch(() => setFacilityOptions([])); }, [user.organizationId]);
  return <><PageHeader eyebrow="Patient registration" title="Register a patient" description="Only collect information required for care and assessment."/>
    <div className="surface"><PatientForm organizationId={user.organizationId} facilities={facilityOptions} onCancel={() => navigate("/patients")} onSaved={() => navigate("/patients")} /></div>
  </>;
}

export function PatientDetailPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { patientLocator = "" } = useParams();
  // Reset the record and any open editor when navigation or account scope changes.
  return <PatientDetailView key={`${user.organizationId}:${user.userId}:${user.membershipId}:${user.role}:${patientLocator}`} user={user} patientLocator={patientLocator} />;
}

function PatientDetailView({ user, patientLocator }: { user: AuthenticatedUser; patientLocator: string }) {
  const workspaceRevision = useWorkspaceRevision(["assessment", "patient", "facility"]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedEdit = searchParams.get("edit");
  const requestedEditHandled = useRef(false);
  const [focusEditField, setFocusEditField] = useState<"gender" | undefined>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<AssessmentSummary[]>([]);
  const [patientTab, setPatientTab] = useState("details");
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [priorityBusy, setPriorityBusy] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState("");
  const [editing, setEditing] = useState(false);
  const [correctingMrn, setCorrectingMrn] = useState(false);
  const [correctingDob, setCorrectingDob] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(false);
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  useEffect(() => {
    if (!patient || requestedEditHandled.current || (requestedEdit !== "dateOfBirth" && requestedEdit !== "gender")) return;
    if (requestedEdit === "dateOfBirth") {
      if (user.role === "ORGANIZATION_ADMIN") { requestedEditHandled.current = true; setCorrectingDob(true); }
      return;
    }
    if (!hasPermission(user.role, "patients.edit")) return;
    requestedEditHandled.current = true;
    let active = true;
    setFocusEditField("gender");
    setEditLoading(true);
    setEditError(false);
    listFacilities(user.organizationId).then(options => {
      if (active) { setFacilityOptions(options); setEditing(true); }
    }).catch(() => { if (active) setEditError(true); }).finally(() => { if (active) setEditLoading(false); });
    return () => { active = false; };
  }, [patient, requestedEdit, user.organizationId, user.role]);
  useEffect(() => {
    let active = true;
    setPatient(null);
    setFailed(false);
    setHistory([]);
    setHistoryState("loading");
    getPatient(user.organizationId, patientLocator).then((value) => {
      if (!active) return;
      setPatient(value);
      if (patientLocator !== value.reference) navigate(`/patients/${value.reference}${requestedEdit ? `?edit=${requestedEdit}` : ""}`, { replace: true });
    }).catch(() => { if (active) setFailed(true); });
    listPatientAssessments(user.organizationId, patientLocator).then(items => {
      if (active) { setHistory(items.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime())); setHistoryState("ready"); }
    }).catch(() => { if (active) setHistoryState("error"); });
    return () => { active = false; };
  }, [navigate, patientLocator, user.organizationId, reload, requestedEdit, workspaceRevision]);
  if (failed) return <Alert variant="destructive"><AlertDescription>This patient could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button> <Link to="/patients">Back to patients</Link></AlertDescription></Alert>;
  if (!patient) return <PatientDetailSkeleton />;
  const canEditPatient = hasPermission(user.role, "patients.edit");
  const canCreateAssessment = hasPermission(user.role, "assessments.create");
  const canEditAssessment = hasPermission(user.role, "assessments.edit");
  const canReadAssessment = hasPermission(user.role, "assessments.read");
  const openEditor = async () => {
    setEditLoading(true);
    setEditError(false);
    try { setFacilityOptions(await listFacilities(user.organizationId)); setEditing(true); }
    catch { setEditError(true); }
    finally { setEditLoading(false); }
  };
  const togglePriority = async (record: AssessmentSummary) => {
    setPriorityBusy(record.id);
    setPriorityError("");
    try {
      await setAssessmentPriority(user.organizationId, record.id, !record.isPriority);
      setHistory(items => items.map(item => item.id === record.id ? { ...item, isPriority: !record.isPriority } : item));
    } catch (cause) {
      setPriorityError(cause instanceof Error ? cause.message : "Could not update priority. Please try again.");
    } finally {
      setPriorityBusy(null);
    }
  };
  const priorityButton = (record: AssessmentSummary) => <Button variant="ghost" size="icon" className={record.isPriority ? "text-amber-600" : "text-muted-foreground"} aria-label={`${record.isPriority ? "Remove priority from" : "Mark as priority"} ${record.reference}`} aria-pressed={record.isPriority} isDisabled={priorityBusy !== null} onPress={() => { void togglePriority(record); }}><Star className={`size-4 ${record.isPriority ? "fill-current" : ""}`} aria-hidden="true" /></Button>;
  const openAssessmentButton = (record: AssessmentSummary) => {
    const { label, icon: ActionIcon } = assessmentAction(record);
    return <RouterButtonLink variant="outline" size="sm" className="whitespace-nowrap" to={`/assessments/${record.reference}`} aria-label={`${label} ${record.reference}`}><ActionIcon className="size-4" aria-hidden="true" />{label}</RouterButtonLink>;
  };
  // Reports are not generated yet, so this mirrors the disabled affordance in the main list.
  const downloadButton = (record: AssessmentSummary) => record.status === "COMPLETED" && <span title="PDF reports are not available yet"><Button variant="outline" size="sm" isDisabled aria-label={`Download PDF for ${record.reference} (not yet available)`}><Download className="size-4" aria-hidden="true" />Download PDF</Button></span>;
  const historyColumns: Array<DataTableColumn<AssessmentSummary>> = [
    { id: "reference", header: "Assessment", cell: ({ row }) => canReadAssessment ? <Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${row.original.reference}`}>{row.original.reference}</Link> : row.original.reference },
    { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "—" },
    { id: "created", header: "Started", cell: ({ row }) => <DateDisplay value={row.original.createdAt} /> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={assessmentStatusLabels[row.original.status]} /> },
  ];
  if (canReadAssessment) historyColumns.push({ id: "actions", header: () => <span className="block text-right">Actions</span>, cell: ({ row }) => <div className="flex items-center justify-end gap-2">{openAssessmentButton(row.original)}{downloadButton(row.original)}{priorityButton(row.original)}</div> });
  const historyEmptyContent = <div className="table-empty-content illustrated-empty-state"><strong>{canCreateAssessment ? "Start this patient’s first assessment" : "No assessments yet"}</strong>{canCreateAssessment && <RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18} />New assessment</RouterButtonLink>}</div>;
  return <>
    <PatientHeader patient={patient} action={<div className="flex flex-wrap gap-2">{canEditPatient && <TooltipTrigger><Button variant="outline" size="icon-lg" className="size-10 shrink-0" aria-label="Edit patient" onPress={openEditor} isDisabled={editLoading}><Pencil className="size-4" /></Button><Tooltip>Edit patient</Tooltip></TooltipTrigger>}{canCreateAssessment && <TooltipTrigger><Button size="icon-lg" className="size-10 shrink-0" aria-label="New assessment" onPress={() => navigate(`/assessments/new?patient=${patient.id}`)}><Icon name="plus" size={20} /></Button><Tooltip>New assessment</Tooltip></TooltipTrigger>}</div>} />
    {editError && <Alert variant="destructive"><AlertDescription>Facilities could not be loaded for editing. <Button variant="link" onPress={openEditor}>Retry</Button></AlertDescription></Alert>}
    <Tabs selectedKey={patientTab} onSelectionChange={(key) => setPatientTab(String(key))} className="organization-detail-tabs gap-5">
      <TabsList variant="line" aria-label="Patient record" className="w-full justify-start gap-5 border-b p-0">
        <TabsTrigger id="details" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Details</TabsTrigger>
        <TabsTrigger id="assessments" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Assessments {historyState === "ready" && <span className="ml-2 text-xs">{history.length}</span>}</TabsTrigger>
      </TabsList>
      <TabsContent id="details">
        <PatientAssessmentOverview history={history} state={historyState} organizationId={user.organizationId} membershipId={user.membershipId} canRead={canReadAssessment} canEdit={canEditAssessment} />
        <section aria-labelledby="patient-details-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1"><h2 id="patient-details-heading" className="text-lg font-semibold">Patient details</h2><p className="text-xs text-muted-foreground">Registered <time dateTime={patient.createdAt.toISOString()}>{formatPatientDate(patient.createdAt)}</time></p></div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="surface min-w-0 gap-0 overflow-hidden p-0" aria-labelledby="patient-identity-heading">
              <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-5 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" aria-hidden="true" /></span><div><h3 id="patient-identity-heading" className="font-semibold">Identity</h3><p className="text-xs text-muted-foreground">Record and personal information</p></div></div>
              <dl className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <PatientDetailField icon={IdCard} label="Medical record number" value={patient.medicalRecordNumber} wide action={user.role === "ORGANIZATION_ADMIN" && <TooltipTrigger><Button variant="ghost" size="icon-sm" className="shrink-0 text-primary" aria-label="Correct medical record number" onPress={() => setCorrectingMrn(true)}><Pencil className="size-4" /></Button><Tooltip>Correct MRN</Tooltip></TooltipTrigger>} />
                <PatientDetailField icon={CalendarDays} label="Date of birth" value={patient.dateOfBirth ? formatPatientDate(patient.dateOfBirth) : "—"} action={user.role === "ORGANIZATION_ADMIN" && <TooltipTrigger><Button variant="ghost" size="icon-sm" className="shrink-0 text-primary" aria-label="Correct date of birth" onPress={() => setCorrectingDob(true)}><Pencil className="size-4" /></Button><Tooltip>Correct DOB</Tooltip></TooltipTrigger>} />
                <PatientDetailField icon={UsersRound} label="Gender" value={genderLabel(patient.gender)} />
              </dl>
            </Card>
            <Card className="surface min-w-0 gap-0 overflow-hidden p-0" aria-labelledby="patient-contact-heading">
              <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-5 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HeartHandshake className="size-5" aria-hidden="true" /></span><div><h3 id="patient-contact-heading" className="font-semibold">Care and contact</h3><p className="text-xs text-muted-foreground">Facility and contact information</p></div></div>
              <dl className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <PatientDetailField icon={Building2} label="Home facility" value={patient.homeFacility?.name ?? "—"} />
                <PatientDetailField icon={Phone} label="Mobile number" value={patient.phone || "Not provided"} />
                <PatientDetailField icon={Mail} label="Email address" value={patient.email || "Not provided"} wide />
              </dl>
            </Card>
          </div>
        </section>
      </TabsContent>
      <TabsContent id="assessments">
        {priorityError && <p role="alert" className="mb-3 text-sm text-destructive">{priorityError}</p>}
        <section className="surface table-surface" aria-label="Patient assessments">
          {historyState === "loading" ? <p className="p-5">Loading assessments…</p> : historyState === "error" ? <div className="grid gap-3 p-5"><p>Assessment history could not be loaded.</p><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></div> : <>
            <div className="mobile-card-list">{history.length ? history.map(record => <article className="mobile-data-card list-mobile-card assessment-mobile-card" key={record.id}>
              <div className="mobile-card-heading"><div className="mobile-card-primary">{canReadAssessment ? <Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${record.reference}`}>{record.reference}</Link> : <span>{record.reference}</span>}</div>{canReadAssessment && <div className="mobile-card-actions">{priorityButton(record)}</div>}</div>
              <div className="mobile-card-meta"><StatusBadge status={assessmentStatusLabels[record.status]} /><span>{record.facility?.name ?? "No facility"} · {formatPatientDate(record.createdAt)}</span></div>
              {canReadAssessment && <div className="assessment-card-footer">{openAssessmentButton(record)}<div className="assessment-card-secondary">{downloadButton(record)}</div></div>}
            </article>) : historyEmptyContent}</div>
            <div className="desktop-table p-5"><DataTable label="Patient assessments" data={history} columns={historyColumns} emptyContent={historyEmptyContent} /></div>
          </>}
        </section>
      </TabsContent>
    </Tabs>
    {editing && <PatientFormDialog organizationId={user.organizationId} facilities={facilityOptions} patient={patient} canCorrectIdentity={user.role === "ORGANIZATION_ADMIN"} focusField={focusEditField} onClose={() => setEditing(false)} onSaved={updated => { setPatient(updated); setEditing(false); }} />}
    {correctingMrn && <CorrectPatientMrnDialog organizationId={user.organizationId} patient={patient} onClose={() => setCorrectingMrn(false)} onSaved={updated => { setPatient(updated); setCorrectingMrn(false); }} />}
    {correctingDob && <CorrectPatientDobDialog organizationId={user.organizationId} patient={patient} onClose={() => setCorrectingDob(false)} onSaved={updated => { setPatient(updated); setCorrectingDob(false); }} />}
  </>;
}
