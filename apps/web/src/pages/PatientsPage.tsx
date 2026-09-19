import type { AssessmentSummary, AuthenticatedUser, Facility, Patient, RegisterPatient } from "@niq/application-contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { ApiRequestError, getPatient, listAssessments, listFacilities, listPatients, registerPatient } from "../lib/api";
import { Icon } from "../lib/icons";

import { DateDisplay } from "../components/DateDisplay";
import { StatusBadge } from "../components/StatusBadge";
import { patientAgeLabel, latestAssessmentDates, todayDate, assessmentStatusLabels } from "../lib/patient-display";

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
  const columns: Array<DataTableColumn<PatientRow>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <Link className="grid gap-1 text-primary" to={`/patients/${row.original.reference}`}><strong>{row.original.displayName}</strong><span className="text-xs text-muted-foreground">{row.original.reference}</span></Link> },
    { id: "ageGender", header: "Age / gender", cell: ({ row }) => `${row.original.age ?? "—"} · ${row.original.gender}` },
    { accessorKey: "facility", header: "Facility" }, { id: "lastAssessment", header: "Last assessment", cell: ({ row }) => assessmentState === "error" ? "Unavailable" : assessmentState === "loading" ? "Loading…" : row.original.lastAssessment ? <DateDisplay value={row.original.lastAssessment} /> : "No assessments" },
    { id: "open", header: () => <span className="sr-only">Open</span>, cell: ({ row }) => <RouterButtonLink variant="ghost" size="icon-sm" to={`/patients/${row.original.reference}`} aria-label={`Open ${row.original.reference}`}><Icon name="chevron" size={18}/></RouterButtonLink> },
  ];
  const hasFilters = query.trim() || facility !== "all" || gender !== "all" || registeredThisMonth;
  const emptyContent = <div className="table-empty-content">
    {loadState === "loading" ? <span>Loading patients…</span>
      : loadState === "error" ? <><strong>Patients could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></>
      : hasFilters
      ? <><strong>No matching patients</strong><span>Try changing the search or filters.</span></>
      : <Button className="patient-empty-action" variant="outline" size="sm" onPress={() => setShowRegistration(true)}><Icon name="plus" size={16} />Register patient</Button>}
  </div>;
  return <>
    <h1 className="patient-page-title">Patients</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Patients</span><span>{filtered.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search patients" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search patients…" /></InputGroup>{(patients.length > 0 || !!hasFilters) && <TooltipTrigger><Button className="size-10 shrink-0" size="icon-lg" aria-label="Add patient" onPress={() => setShowRegistration(true)}><Icon name="plus" size={20} /></Button><Tooltip>Add patient</Tooltip></TooltipTrigger>}</div>
    </div>
    {registeredThisMonth && <div className="flex items-center gap-3 text-sm"><span>Registered this month ({new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })})</span><Button variant="link" onPress={() => { setSearchParams(params => { params.delete("registered"); return params; }); setPage(1); }}>Clear</Button></div>}
    <div className="patient-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { setFacility(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilityOptions.map((item) => <SelectItem key={item.id} id={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by gender" selectedKey={gender} onSelectionChange={(key) => { setGender(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All genders</SelectItem><SelectItem id="Female">Female</SelectItem><SelectItem id="Male">Male</SelectItem><SelectItem id="Other">Other</SelectItem><SelectItem id="Unknown">Unknown</SelectItem></SelectContent></Select>
    </div>
    {assessmentState === "error" && <Alert><AlertDescription>Assessment history could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button></AlertDescription></Alert>}
    <section className="surface table-surface"><div className="mobile-card-list">{visiblePatients.length ? visiblePatients.map((patient)=><Link className="mobile-data-card" to={`/patients/${patient.reference}`} key={patient.id}><div><strong>{patient.displayName}</strong><span>{patient.reference} · {patient.age} · {patient.gender}</span></div><span>{patient.facility}</span></Link>) : emptyContent}</div>
      <div className="desktop-table p-5">{visiblePatients.length ? <DataTable columns={columns} data={visiblePatients} label="Patients" /> : emptyContent}</div>
    </section>
    {filtered.length > 0 && <Pagination className="mt-4" aria-label="Patients pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    {showRegistration && <PatientRegistrationDialog organizationId={user.organizationId} facilities={facilityOptions.filter(item => item.status === "ACTIVE")} onClose={() => setShowRegistration(false)} onRegistered={(patient) => { setPatients((current) => [patient, ...current]); setShowRegistration(false); }} />}
  </>;
}

function PatientRegistrationForm({ organizationId, facilities, onCancel, onRegistered, onBusyChange }: { organizationId: string; facilities: Facility[]; onCancel: () => void; onRegistered: (patient: Patient) => void; onBusyChange?: (busy: boolean) => void }) {
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [gender, setGender] = useState<Patient["gender"] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!facilityId || !gender) {
      setMessage("Select a facility and gender.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const input: RegisterPatient = {
      medicalRecordNumber: String(form.get("mrn") ?? ""),
      homeFacilityId: facilityId,
      dateOfBirth: String(form.get("dateOfBirth") ?? ""),
      gender,
      name: String(form.get("name") ?? ""),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    };
    if (input.dateOfBirth > todayDate()) { setMessage("Date of birth cannot be in the future."); return; }
    setIsSubmitting(true);
    onBusyChange?.(true);
    setMessage(null);
    try {
      onRegistered(await registerPatient(organizationId, input));
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The patient could not be registered. Please try again.");
      setIsSubmitting(false);
      onBusyChange?.(false);
    }
  }

  return <form className="p-5 grid gap-5" onSubmit={submit}>
    <fieldset disabled={isSubmitting} className="grid gap-4">
      <legend className="mb-4 font-semibold">Patient details</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="patient-name">Patient name</FieldLabel><Input id="patient-name" name="name" autoComplete="name" required autoFocus /></Field>
        <Field><FieldLabel htmlFor="patient-mrn">Medical record number</FieldLabel><Input id="patient-mrn" name="mrn" placeholder="Hospital MRN" required /></Field>
        <Field><FieldLabel>Facility</FieldLabel><Select aria-label="Facility" placeholder="Select facility" selectedKey={facilityId} onSelectionChange={key => setFacilityId(String(key))} isRequired isDisabled={isSubmitting}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{facilities.map(item => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="patient-birth">Date of birth</FieldLabel><Input id="patient-birth" type="date" name="dateOfBirth" max={todayDate()} required /></Field>
        <Field><FieldLabel>Gender</FieldLabel><Select aria-label="Gender" placeholder="Select gender" selectedKey={gender} onSelectionChange={key => setGender(String(key) as Patient["gender"])} isRequired isDisabled={isSubmitting}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["FEMALE", "MALE", "OTHER", "UNKNOWN"] as const).map(value => <SelectItem id={value} key={value}>{genderLabel(value)}</SelectItem>)}</SelectContent></Select></Field>
      </div>
    </fieldset>
    <fieldset disabled={isSubmitting} className="border-t pt-4 grid gap-4"><legend className="font-semibold">Contact details</legend><div className="grid gap-4 sm:grid-cols-2">
      <Field><FieldLabel htmlFor="patient-phone">Mobile number (optional)</FieldLabel><Input id="patient-phone" name="phone" type="tel" autoComplete="tel" /></Field>
      <Field><FieldLabel htmlFor="patient-email">Email address (optional)</FieldLabel><Input id="patient-email" name="email" type="email" autoComplete="email" /></Field>
    </div></fieldset>
    {facilities.length === 0 && <Alert><AlertDescription>Add an active facility before registering a patient.</AlertDescription></Alert>}
    {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    <div className="form-footer"><Button type="button" variant="outline" isDisabled={isSubmitting} onPress={onCancel}>Cancel</Button><Button type="submit" isDisabled={isSubmitting || facilities.length === 0}>{isSubmitting ? "Registering…" : "Register patient"}</Button></div></form>;
}

function PatientRegistrationDialog({ organizationId, facilities, onClose, onRegistered }: { organizationId: string; facilities: Facility[]; onClose: () => void; onRegistered: (patient: Patient) => void }) {
  const [busy, setBusy] = useState(false);
  return <Dialog ariaLabel="Register patient" isOpen isDismissable={!busy} isKeyboardDismissDisabled={busy} showCloseButton={!busy} onOpenChange={(open) => { if (!open && !busy) onClose(); }} className="patient-registration-dialog">
    <DialogHeader className="patient-registration-dialog-header"><DialogTitle>Register patient</DialogTitle></DialogHeader>
    <div className="patient-registration-dialog-body"><PatientRegistrationForm organizationId={organizationId} facilities={facilities} onBusyChange={setBusy} onCancel={onClose} onRegistered={onRegistered} /></div>
  </Dialog>;
}

export function RegisterPatientPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  useEffect(() => { listFacilities(user.organizationId).then((items) => setFacilityOptions(items.filter((item) => item.status === "ACTIVE"))).catch(() => setFacilityOptions([])); }, [user.organizationId]);
  return <><PageHeader eyebrow="Patient registration" title="Register a patient" description="Only collect information required for care and assessment."/>
    <div className="surface"><PatientRegistrationForm organizationId={user.organizationId} facilities={facilityOptions} onCancel={() => navigate("/patients")} onRegistered={() => navigate("/patients")} /></div>
  </>;
}

export function PatientDetailPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const { patientLocator = "" } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<AssessmentSummary[]>([]);
  const [patientTab, setPatientTab] = useState("details");
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
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
  if (failed) return <Alert variant="destructive"><AlertDescription>This patient could not be loaded. <Button variant="link" onPress={() => setReload(value => value + 1)}>Retry</Button> <Link to="/patients">Back to patients</Link></AlertDescription></Alert>;
  if (!patient) return <p className="muted">Loading patient…</p>;
  const age = patientAgeLabel(patient.dateOfBirth);
  return <>
    <div className="breadcrumb"><Link to="/patients">Patients</Link><span>/</span><span>{patient.reference}</span></div>
    <header className="patient-detail-header">
      <div className="patient-detail-summary">
        <div className="organization-title-row"><h1>{patient.displayName}</h1></div>
        <p>{patient.reference} · {age} · {genderLabel(patient.gender)} · {patient.homeFacility?.name ?? "No facility"}</p>
      </div>
      {!(patientTab === "assessments" && historyState === "ready" && history.length === 0) && <RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18}/>New assessment</RouterButtonLink>}
    </header>
    <Tabs selectedKey={patientTab} onSelectionChange={(key) => setPatientTab(String(key))} className="organization-detail-tabs gap-5">
      <TabsList variant="line" aria-label="Patient record" className="w-full justify-start gap-5 border-b p-0">
        <TabsTrigger id="details" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Details</TabsTrigger>
        <TabsTrigger id="assessments" className="flex-none rounded-none border-0 px-1 pb-3 text-foreground/80 shadow-none data-selected:text-primary after:bg-primary">Assessments {historyState === "ready" && <span className="patient-tab-count">{history.length}</span>}</TabsTrigger>
      </TabsList>
      <TabsContent id="details">
        <div className="admin-detail-grid">
          <Card className="surface admin-detail-card"><h2 className="card-heading-divider">Patient information</h2><dl className="patient-definition"><div><dt>Patient reference</dt><dd>{patient.reference}</dd></div><div><dt>Date of birth</dt><dd>{patient.dateOfBirth ? formatPatientDate(patient.dateOfBirth) : "—"}</dd></div><div><dt>Gender</dt><dd>{genderLabel(patient.gender)}</dd></div><div><dt>Age</dt><dd>{age}</dd></div></dl></Card>
          <Card className="surface admin-detail-card"><h2 className="card-heading-divider">Care and contact</h2><dl className="patient-definition"><div><dt>Home facility</dt><dd>{patient.homeFacility?.name ?? "—"}</dd></div><div><dt>Mobile number</dt><dd>{patient.phone || "Not provided"}</dd></div><div><dt>Email address</dt><dd>{patient.email || "Not provided"}</dd></div><div><dt>Registered</dt><dd>{formatPatientDate(patient.createdAt)}</dd></div></dl></Card>
        </div>
      </TabsContent>
      <TabsContent id="assessments">
        <Card className="surface p-5">
          {historyState === "loading" ? <p>Loading assessments…</p> : historyState === "error" ? <div className="grid gap-3"><p>Assessment history could not be loaded.</p><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></div> : history.length ? <DataTable label="Patient assessments" data={history} columns={[
            { id: "date", header: "Started", cell: ({ row }) => <DateDisplay value={row.original.createdAt} /> },
            { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "No facility" },
            { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={assessmentStatusLabels[row.original.status]} /> },
          ]} /> : <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><h2 className="font-semibold">Start this patient’s first assessment</h2><RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18} />New assessment</RouterButtonLink></div>}
        </Card>
      </TabsContent>
    </Tabs>
  </>;
}
