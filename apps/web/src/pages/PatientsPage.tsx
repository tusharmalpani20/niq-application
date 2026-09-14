import type { AuthenticatedUser, Facility, Patient, RegisterPatient } from "@niq/application-contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { ApiRequestError, getPatient, listFacilities, listPatients, registerPatient } from "../lib/api";
import { Icon } from "../lib/icons";

const pageSize = 10;
type PatientRow = { id: string; reference: string; displayName: string; age: number | null; gender: string; facility: string; lastAssessment: string; status: "Registered" };

function patientAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

const genderLabel = (gender: Patient["gender"]) => gender[0] + gender.slice(1).toLowerCase();
const patientRow = (patient: Patient): PatientRow => ({
  id: patient.id,
  reference: patient.reference,
  displayName: patient.displayName,
  age: patientAge(patient.dateOfBirth),
  gender: genderLabel(patient.gender),
  facility: patient.homeFacility?.name ?? "—",
  lastAssessment: "—",
  status: "Registered",
});

export function PatientsPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [facilityOptions, setFacilityOptions] = useState<Facility[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("all");
  const [status, setStatus] = useState("all");
  const [gender, setGender] = useState("all");
  const [page, setPage] = useState(1);
  const [showRegistration, setShowRegistration] = useState(false);
  const patientRecords = useMemo(() => patients.map(patientRow), [patients]);
  const facilityNames = useMemo(() => [...new Set(patientRecords.map((patient) => patient.facility).filter((name) => name !== "—"))], [patientRecords]);
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    Promise.all([listPatients(user.organizationId), listFacilities(user.organizationId)])
      .then(([patientItems, facilityItems]) => {
        if (!active) return;
        setPatients(patientItems);
        setFacilityOptions(facilityItems.filter((item) => item.status === "ACTIVE"));
        setLoadState("ready");
      })
      .catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [user.organizationId]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return patientRecords.filter((patient) => {
      const matchesQuery = !normalizedQuery || `${patient.reference} ${patient.displayName} ${patient.facility}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (facility === "all" || patient.facility === facility) && (status === "all" || patient.status === status) && (gender === "all" || patient.gender === gender);
    });
  }, [facility, gender, patientRecords, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePatients = filtered.slice((page - 1) * pageSize, page * pageSize);
  const columns: Array<DataTableColumn<PatientRow>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <strong>{row.original.reference}</strong> },
    { id: "ageGender", header: "Age / gender", cell: ({ row }) => `${row.original.age ?? "—"} · ${row.original.gender}` },
    { accessorKey: "facility", header: "Facility" }, { accessorKey: "lastAssessment", header: "Last assessment" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "open", header: () => <span className="sr-only">Open</span>, cell: ({ row }) => <RouterButtonLink variant="ghost" size="icon-sm" to={`/patients/${row.original.reference}`} aria-label={`Open ${row.original.reference}`}><Icon name="chevron" size={18}/></RouterButtonLink> },
  ];
  const hasFilters = query.trim() || facility !== "all" || status !== "all" || gender !== "all";
  const emptyContent = <div className="table-empty-content">
    {loadState === "loading" ? <span>Loading patients…</span>
      : loadState === "error" ? <><strong>Patients could not be loaded</strong><span>Refresh the page to try again.</span></>
      : hasFilters
      ? <><strong>No matching patients</strong><span>Try changing the search or filters.</span></>
      : <Button className="patient-empty-action" variant="outline" size="sm" onPress={() => setShowRegistration(true)}><Icon name="plus" size={16} />Register patient</Button>}
  </div>;
  return <>
    <h1 className="patient-page-title">Patients</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Patients</span><span>{patientRecords.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search patients" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search patients…" /></InputGroup><Button className="size-10 shrink-0" size="icon-lg" aria-label="Register patient" onPress={() => setShowRegistration(true)}><Icon name="plus" size={20} /></Button></div>
    </div>
    <div className="patient-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { setFacility(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilityNames.map((name) => <SelectItem key={name} id={name}>{name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="Registered">Registered</SelectItem><SelectItem id="Draft">Draft</SelectItem><SelectItem id="Pending scoring">Pending scoring</SelectItem><SelectItem id="Scoring unavailable">Scoring unavailable</SelectItem><SelectItem id="Under review">Under review</SelectItem><SelectItem id="Completed">Completed</SelectItem></SelectContent></Select>
      <Select aria-label="Filter by gender" selectedKey={gender} onSelectionChange={(key) => { setGender(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All genders</SelectItem><SelectItem id="Female">Female</SelectItem><SelectItem id="Male">Male</SelectItem><SelectItem id="Other">Other</SelectItem><SelectItem id="Unknown">Unknown</SelectItem></SelectContent></Select>
    </div>
    <section className="surface table-surface"><div className="mobile-card-list">{visiblePatients.length ? visiblePatients.map((patient)=><Link className="mobile-data-card" to={`/patients/${patient.reference}`} key={patient.id}><div><strong>{patient.reference}</strong><span>{patient.gender} · {patient.age}</span></div><StatusBadge status={patient.status}/><span>{patient.facility}</span></Link>) : emptyContent}</div>
      <div className="desktop-table p-5"><DataTable columns={columns} data={visiblePatients} label="Patients" emptyContent={emptyContent} /></div>
    </section>
    <Pagination className="mt-4" aria-label="Patients pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>
    {showRegistration && <PatientRegistrationDialog organizationId={user.organizationId} facilities={facilityOptions} onClose={() => setShowRegistration(false)} onRegistered={(patient) => { setPatients((current) => [patient, ...current]); setShowRegistration(false); }} />}
  </>;
}

function PatientRegistrationForm({ organizationId, facilities, onCancel, onRegistered }: { organizationId: string; facilities: Facility[]; onCancel: () => void; onRegistered: (patient: Patient) => void }) {
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
    setIsSubmitting(true);
    setMessage(null);
    try {
      onRegistered(await registerPatient(organizationId, input));
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The patient could not be registered. Please try again.");
      setIsSubmitting(false);
    }
  }

  return <form className="clinical-form" onSubmit={submit}><div className="form-section"><div className="form-section-copy"><span>01</span><div><h2>Patient identity</h2></div></div><div className="form-fields"><Field><FieldLabel className="required-field-label">Medical record number <span aria-hidden="true">*</span></FieldLabel><Input name="mrn" placeholder="Hospital MRN" required autoFocus/></Field><Field><FieldLabel className="required-field-label">Facility <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Facility" placeholder="Select facility" selectedKey={facilityId} onSelectionChange={(key) => { setFacilityId(String(key)); setMessage(null); }} isRequired><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{facilities.map((facility) => <SelectItem id={facility.id} key={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></Field><div className="field-grid"><Field><FieldLabel className="required-field-label">Date of birth <span aria-hidden="true">*</span></FieldLabel><Input type="date" name="dateOfBirth" required/></Field><Field><FieldLabel className="required-field-label">Gender <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Gender" placeholder="Select gender" selectedKey={gender} onSelectionChange={(key) => { setGender(String(key) as Patient["gender"]); setMessage(null); }} isRequired><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="FEMALE">Female</SelectItem><SelectItem id="MALE">Male</SelectItem><SelectItem id="OTHER">Other</SelectItem><SelectItem id="UNKNOWN">Unknown</SelectItem></SelectContent></Select></Field></div></div></div>
    <div className="form-section"><div className="form-section-copy"><span>02</span><div><h2>Contact information</h2></div></div><div className="form-fields"><Field><FieldLabel className="required-field-label">Patient name <span aria-hidden="true">*</span></FieldLabel><Input name="name" autoComplete="name" required/></Field><div className="field-grid"><Field><FieldLabel>Mobile number</FieldLabel><Input name="phone" type="tel" autoComplete="tel"/></Field><Field><FieldLabel>Email address</FieldLabel><Input name="email" type="email" autoComplete="email"/></Field></div></div></div>
    {facilities.length === 0 && <Alert><AlertDescription>Add an active facility before registering a patient.</AlertDescription></Alert>}
    {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    <div className="form-footer"><Button type="button" variant="outline" isDisabled={isSubmitting} onPress={onCancel}>Cancel</Button><Button type="submit" isDisabled={isSubmitting || facilities.length === 0}>{isSubmitting ? "Registering…" : "Register patient"}</Button></div></form>;
}

function PatientRegistrationDialog({ organizationId, facilities, onClose, onRegistered }: { organizationId: string; facilities: Facility[]; onClose: () => void; onRegistered: (patient: Patient) => void }) {
  return <Dialog ariaLabel="Register patient" isOpen onOpenChange={(open) => { if (!open) onClose(); }} className="patient-registration-dialog">
    <DialogHeader className="patient-registration-dialog-header"><DialogTitle>Register patient</DialogTitle></DialogHeader>
    <div className="patient-registration-dialog-body"><PatientRegistrationForm organizationId={organizationId} facilities={facilities} onCancel={onClose} onRegistered={onRegistered} /></div>
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
  useEffect(() => {
    let active = true;
    setPatient(null);
    setFailed(false);
    getPatient(user.organizationId, patientLocator).then((value) => {
      if (!active) return;
      setPatient(value);
      if (patientLocator !== value.reference) navigate(`/patients/${value.reference}`, { replace: true });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [navigate, patientLocator, user.organizationId]);
  if (failed) return <Alert variant="destructive"><AlertDescription>This patient could not be loaded.</AlertDescription></Alert>;
  if (!patient) return <p className="muted">Loading patient…</p>;
  const age = patientAge(patient.dateOfBirth);
  return <><div className="breadcrumb"><Link to="/patients">Patients</Link><span>/</span><span>{patient.reference}</span></div><PageHeader eyebrow={patient.reference} title={patient.displayName} description={`${age ?? "—"} years · ${genderLabel(patient.gender)} · ${patient.homeFacility?.name ?? "—"}`} action={<RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18}/>New assessment</RouterButtonLink>}/>
    <div className="detail-grid"><Card className="surface"><div className="section-heading"><div><p className="page-eyebrow">Patient details</p><h2>Clinical profile</h2></div><Button variant="link">Edit</Button></div><dl className="definition-grid"><div><dt>Patient reference</dt><dd>{patient.reference}</dd></div><div><dt>Home facility</dt><dd>{patient.homeFacility?.name ?? "—"}</dd></div><div><dt>Date of birth</dt><dd>{patient.dateOfBirth ?? "—"}</dd></div><div><dt>Contact</dt><dd>{patient.phone ?? patient.email ?? "—"}</dd></div></dl></Card><Card className="surface timeline"><div className="section-heading"><div><p className="page-eyebrow">History</p><h2>Assessments</h2></div></div><p className="muted">No assessments yet.</p></Card></div>
  </>;
}
