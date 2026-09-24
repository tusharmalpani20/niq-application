import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, Facility, Patient, PatientActivity } from "@niq/application-contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { Pencil, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PatientForm, PatientFormDialog } from "../components/PatientForm";
import { PatientHeader } from "../components/PatientHeader";
import { PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { getPatient, listAssessments, listFacilities, listPatientActivity, listPatients } from "../lib/api";
import { Icon } from "../lib/icons";

import { DateDisplay } from "../components/DateDisplay";
import { StatusBadge } from "../components/StatusBadge";
import { patientAgeLabel, latestAssessmentDates, assessmentStatusLabels } from "../lib/patient-display";

const pageSize = 10;
type PatientRow = { id: string; reference: string; displayName: string; age: string; createdAt: Date; gender: string; facility: string; facilityId: string | null; lastAssessment: Date | null };

const genderLabel = (gender: Patient["gender"]) => gender[0] + gender.slice(1).toLowerCase();
const formatPatientDate = (value: string | Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(typeof value === "string" ? `${value}T00:00:00` : value));
const patientRow = (patient: Patient, dates: Map<string, Date>): PatientRow => ({
  id: patient.id,
  reference: patient.reference,
  displayName: patient.displayName,
  age: patientAgeLabel(patient.dateOfBirth),
  createdAt: patient.createdAt,
  gender: genderLabel(patient.gender),
  facility: patient.homeFacility?.name ?? "—",
  facilityId: patient.homeFacility?.id ?? null,
  lastAssessment: dates.get(patient.id) ?? null,
});

export function PatientsPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const [searchParams, setSearchParams] = useSearchParams();
  const registeredThisMonth = searchParams.get("registered") === "this-month";
  const [patients, setPatients] = useState<Patient[]>([]);
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("all");
  const [gender, setGender] = useState("all");
  const [page, setPage] = useState(1);
  const [showRegistration, setShowRegistration] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [assessmentState, setAssessmentState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);
  const patientRecords = useMemo(() => { const dates = latestAssessmentDates(assessments); return patients.map(patient => patientRow(patient, dates)); }, [patients, assessments]);
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    setPatients([]);
    Promise.all([listPatients(user.organizationId), listFacilities(user.organizationId)])
      .then(([patientItems, facilityItems]) => {
        if (!active) return;
        setPatients(patientItems);
        setFacilityOptions(facilityItems);
        setLoadState("ready");
      })
      .catch(() => { if (active) setLoadState("error"); });
    setAssessmentState("loading");
    listAssessments(user.organizationId).then(items => { if (active) { setAssessments(items); setAssessmentState("ready"); } }).catch(() => { if (active) setAssessmentState("error"); });
    return () => { active = false; };
  }, [user.organizationId, reload]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return patientRecords.filter((patient) => {
      const createdAt = patient.createdAt;
      const now = new Date();
      if (registeredThisMonth && (!createdAt || createdAt.getFullYear() !== now.getFullYear() || createdAt.getMonth() !== now.getMonth())) return false;
      const matchesQuery = !normalizedQuery || `${patient.reference} ${patient.displayName} ${patient.facility}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (facility === "all" || patient.facilityId === facility) && (gender === "all" || patient.gender === gender);
    });
  }, [facility, gender, patientRecords, patients, query, registeredThisMonth]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visiblePatients = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const editAction = (patient: PatientRow) => hasPermission(user.role, "patients.edit") && <TooltipTrigger><Button variant="ghost" size="icon-sm" aria-label={`Edit ${patient.reference}`} onPress={() => setEditingPatient(patients.find(item => item.id === patient.id) ?? null)}><Pencil className="size-4" /></Button><Tooltip>Edit patient</Tooltip></TooltipTrigger>;
  const columns: Array<DataTableColumn<PatientRow>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <Link className="grid gap-1 text-foreground hover:underline" to={`/patients/${row.original.reference}`}><span className="font-normal">{row.original.displayName}</span><span className="text-xs text-muted-foreground">{row.original.reference}</span></Link> },
    { id: "ageGender", header: "Age / gender", cell: ({ row }) => `${row.original.age ?? "—"} · ${row.original.gender}` },
    { accessorKey: "facility", header: "Facility" }, { id: "lastAssessment", header: "Last assessment", cell: ({ row }) => assessmentState === "error" ? "Unavailable" : assessmentState === "loading" ? "Loading…" : row.original.lastAssessment ? <DateDisplay value={row.original.lastAssessment} /> : "No assessments" },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <div className="flex items-center justify-end gap-1">{editAction(row.original)}<RouterButtonLink variant="ghost" size="icon-sm" to={`/patients/${row.original.reference}`} aria-label={`Open ${row.original.reference}`}><Icon name="chevron" size={18}/></RouterButtonLink></div> },
  ];
  const hasFilters = query.trim() || facility !== "all" || gender !== "all" || registeredThisMonth;
  const emptyContent = <div className="table-empty-content">
    {loadState === "loading" ? <span>Loading patients…</span>
      : loadState === "error" ? <><strong>Patients could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></>
      : hasFilters
      ? <><strong>No matching patients</strong><span>Try changing the search or filters.</span></>
      : <><p className="text-sm text-foreground">No patients yet</p><p className="text-sm">Register a patient to start recording assessments.</p><Button className="patient-empty-action" variant="outline" size="sm" onPress={() => setShowRegistration(true)}><Icon name="plus" size={16} />Register patient</Button></>}
  </div>;
  return <>
    <h1 className="patient-page-title">Patients</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Patients</span><span>{filtered.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search patients" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search patients…" /></InputGroup><TooltipTrigger><Button className="size-10 shrink-0" size="icon-lg" aria-label="Add patient" onPress={() => setShowRegistration(true)}><Icon name="plus" size={20} /></Button><Tooltip>Add patient</Tooltip></TooltipTrigger></div>
    </div>
    {registeredThisMonth && <div className="flex items-center gap-3 text-sm"><span>Registered this month ({new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })})</span><Button variant="link" onPress={() => { setSearchParams(params => { params.delete("registered"); return params; }); setPage(1); }}>Clear</Button></div>}
    <div className="patient-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { setFacility(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilityOptions.map((item) => <SelectItem key={item.id} id={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by gender" selectedKey={gender} onSelectionChange={(key) => { setGender(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All genders</SelectItem><SelectItem id="Female">Female</SelectItem><SelectItem id="Male">Male</SelectItem><SelectItem id="Other">Other</SelectItem><SelectItem id="Unknown">Unknown</SelectItem></SelectContent></Select>
    </div>
    {assessmentState === "error" && <Alert><AlertDescription>Assessment history could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button></AlertDescription></Alert>}
    <section className="surface table-surface"><div className="mobile-card-list">{visiblePatients.length ? visiblePatients.map((patient)=><div className="mobile-data-card" key={patient.id}><Link className="min-w-0 flex-1" to={`/patients/${patient.reference}`}><div><div className="font-normal">{patient.displayName}</div><span>{patient.reference} · {patient.age} · {patient.gender}</span></div><span>{patient.facility}</span></Link>{editAction(patient)}</div>) : emptyContent}</div>
      <div className="desktop-table p-5"><DataTable columns={columns} data={visiblePatients} label="Patients" emptyContent={emptyContent} /></div>
    </section>
    {filtered.length > 0 && <Pagination className="mt-4" aria-label="Patients pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    {editingPatient && <PatientFormDialog organizationId={user.organizationId} facilities={facilityOptions} patient={editingPatient} onClose={() => setEditingPatient(null)} onSaved={updated => { setPatients(current => current.map(item => item.id === updated.id ? updated : item)); setEditingPatient(null); }} />}
    {showRegistration && <PatientFormDialog organizationId={user.organizationId} facilities={facilityOptions.filter(item => item.status === "ACTIVE")} onClose={() => setShowRegistration(false)} onSaved={(patient) => { setPatients((current) => [patient, ...current]); setShowRegistration(false); }} />}
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

function LatestAssessment({ history, state, canRead, canEdit }: { history: AssessmentSummary[]; state: "loading" | "ready" | "error"; canRead: boolean; canEdit: boolean }) {
  const latest = history[0];
  return <section className="surface mb-5 p-5" aria-label="Latest assessment">
    <h2 className="font-semibold">Latest assessment</h2>
    {state === "loading" ? <p className="mt-3 text-sm text-muted-foreground">Loading assessment history…</p>
      : state === "error" ? <p className="mt-3 text-sm text-muted-foreground">Assessment history is unavailable.</p>
      : !latest ? <p className="mt-3 text-sm text-muted-foreground">No assessments yet.</p>
      : <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{latest.reference}</span><StatusBadge status={assessmentStatusLabels[latest.status]} /></div>
          <p className="text-sm text-muted-foreground">{latest.facility?.name ?? "No facility"} · Started <DateDisplay value={latest.createdAt} />{latest.completedAt && <> · Completed <DateDisplay value={latest.completedAt} /></>}</p></div>
        {canRead && <RouterButtonLink variant="outline" to={`/assessments/${latest.reference}`}>{canEdit && (latest.status === "DRAFT" || latest.status === "READY_FOR_SCORING") ? "Continue assessment" : "Open assessment"}</RouterButtonLink>}
      </div>}
  </section>;
}

function PatientDetailView({ user, patientLocator }: { user: AuthenticatedUser; patientLocator: string }) {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<AssessmentSummary[]>([]);
  const [patientTab, setPatientTab] = useState("details");
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(false);
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  const [activity, setActivity] = useState<PatientActivity[]>([]);
  const [activityState, setActivityState] = useState<"loading" | "ready" | "error">("loading");
  const [activityReload, setActivityReload] = useState(0);
  useEffect(() => {
    let active = true;
    setPatient(null);
    setFailed(false);
    getPatient(user.organizationId, patientLocator).then((value) => {
      if (!active) return;
      setPatient(value);
      setHistoryState("loading");
      listAssessments(user.organizationId).then(items => { if (active) { setHistory(items.filter(item => item.patient.id === value.id).sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime())); setHistoryState("ready"); } }).catch(() => { if (active) setHistoryState("error"); });
      if (patientLocator !== value.reference) navigate(`/patients/${value.reference}`, { replace: true });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [navigate, patientLocator, user.organizationId, reload]);
  useEffect(() => {
    if (!patient || !hasPermission(user.role, "users.manage")) return;
    let active = true;
    setActivityState("loading");
    listPatientActivity(user.organizationId, patient.reference).then(items => { if (active) { setActivity(items); setActivityState("ready"); } }).catch(() => { if (active) setActivityState("error"); });
    return () => { active = false; };
  }, [patient?.id, patient?.reference, user.organizationId, user.role, activityReload]);
  if (failed) return <Alert variant="destructive"><AlertDescription>This patient could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button> <Link to="/patients">Back to patients</Link></AlertDescription></Alert>;
  if (!patient) return <p className="muted">Loading patient…</p>;
  const canEditPatient = hasPermission(user.role, "patients.edit");
  const canEditAssessment = hasPermission(user.role, "assessments.edit");
  const canReadAssessment = hasPermission(user.role, "assessments.read");
  const openEditor = async () => {
    setEditLoading(true);
    setEditError(false);
    try { setFacilityOptions(await listFacilities(user.organizationId)); setEditing(true); }
    catch { setEditError(true); }
    finally { setEditLoading(false); }
  };
  return <>
    <PatientHeader patient={patient} action={<div className="flex flex-wrap gap-2">{canEditPatient && <Button variant="outline" onPress={openEditor} isDisabled={editLoading}>{editLoading ? "Loading…" : "Edit patient"}</Button>}{canEditAssessment && <RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18} />New assessment</RouterButtonLink>}</div>} />
    {editError && <Alert variant="destructive"><AlertDescription>Facilities could not be loaded for editing. <Button variant="link" onPress={openEditor}>Retry</Button></AlertDescription></Alert>}
    <Tabs selectedKey={patientTab} onSelectionChange={(key) => setPatientTab(String(key))} className="organization-detail-tabs gap-5">
      <TabsList variant="line" aria-label="Patient record" className="w-full justify-start gap-5 border-b p-0">
        <TabsTrigger id="details" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Details</TabsTrigger>
        <TabsTrigger id="assessments" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Assessments {historyState === "ready" && <span className="patient-tab-count">{history.length}</span>}</TabsTrigger>
      </TabsList>
      <TabsContent id="details">
        <LatestAssessment history={history} state={historyState} canRead={canReadAssessment} canEdit={canEditAssessment} />
        <div className="admin-detail-grid">
          <Card className="surface admin-detail-card"><h2 className="card-heading-divider">Patient information</h2><dl className="patient-definition"><div><dt>Date of birth</dt><dd>{patient.dateOfBirth ? formatPatientDate(patient.dateOfBirth) : "—"}</dd></div><div><dt>Gender</dt><dd>{genderLabel(patient.gender)}</dd></div><div><dt>Registered</dt><dd>{formatPatientDate(patient.createdAt)}</dd></div></dl></Card>
          <Card className="surface admin-detail-card"><h2 className="card-heading-divider">Care and contact</h2><dl className="patient-definition"><div><dt>Home facility</dt><dd>{patient.homeFacility?.name ?? "—"}</dd></div><div><dt>Mobile number</dt><dd>{patient.phone || "Not provided"}</dd></div><div><dt>Email address</dt><dd>{patient.email || "Not provided"}</dd></div></dl></Card>
        </div>
        {hasPermission(user.role, "users.manage") && <section className="surface mt-5 p-5" aria-label="Patient record activity">
          <h2 className="font-semibold">Record activity</h2>
          {activityState === "loading" ? <p className="mt-3 text-sm text-muted-foreground">Loading activity…</p>
            : activityState === "error" ? <p className="mt-3 text-sm text-muted-foreground">Activity could not be loaded. <Button variant="link" onPress={() => setActivityReload(value => value + 1)}>Retry</Button></p>
            : activity.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No recorded changes yet.</p>
            : <ul className="mt-3 divide-y">{activity.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{item.type === "REGISTERED" ? "Patient registered" : item.type === "CONTACT_UPDATED" ? "Contact updated" : "Profile updated"} · {item.actorName}</span><time className="text-muted-foreground" dateTime={item.occurredAt.toISOString()}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(item.occurredAt)}</time></li>)}</ul>}
        </section>}
      </TabsContent>
      <TabsContent id="assessments">
        <Card className="surface p-5">
          {historyState === "loading" ? <p>Loading assessments…</p> : historyState === "error" ? <div className="grid gap-3"><p>Assessment history could not be loaded.</p><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></div> : history.length ? <DataTable label="Patient assessments" data={history} columns={[
            { id: "reference", header: "Assessment", cell: ({ row }) => hasPermission(user.role, "assessments.read") ? <Link className="text-foreground hover:underline font-normal" to={`/assessments/${row.original.reference}`}>{row.original.reference}</Link> : row.original.reference },
            { id: "date", header: "Started", cell: ({ row }) => hasPermission(user.role, "assessments.read") ? <Link className="text-foreground underline" to={`/assessments/${row.original.reference}`}><DateDisplay value={row.original.createdAt} /></Link> : <DateDisplay value={row.original.createdAt} /> },
            { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "No facility" },
            { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={assessmentStatusLabels[row.original.status]} /> },
          ]} /> : <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><h2 className="font-semibold">{hasPermission(user.role, "assessments.edit") ? "Start this patient’s first assessment" : "No assessments yet"}</h2>{hasPermission(user.role, "assessments.edit") && <RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18} />New assessment</RouterButtonLink>}</div>}
        </Card>
      </TabsContent>
    </Tabs>
    {editing && <PatientFormDialog organizationId={user.organizationId} facilities={facilityOptions} patient={patient} onClose={() => setEditing(false)} onSaved={updated => { setPatient(updated); setEditing(false); setActivityReload(value => value + 1); }} />}
  </>;
}
