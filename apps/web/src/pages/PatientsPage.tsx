import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { assessments, patients as demoPatients, type PatientSummary } from "../lib/demo-data";
import { Icon } from "../lib/icons";

const pageSize = 10;
// Patient persistence is not available yet; never present demonstration records as tenant data.
const patientRecords: PatientSummary[] = [];

export function PatientsPage() {
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("all");
  const [status, setStatus] = useState("all");
  const [sex, setSex] = useState("all");
  const [page, setPage] = useState(1);
  const facilities = useMemo(() => [...new Set(patientRecords.map((patient) => patient.facility))], [patientRecords]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return patientRecords.filter((patient) => {
      const matchesQuery = !normalizedQuery || `${patient.reference} ${patient.displayName} ${patient.facility}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (facility === "all" || patient.facility === facility) && (status === "all" || patient.status === status) && (sex === "all" || patient.sex === sex);
    });
  }, [facility, patientRecords, query, sex, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePatients = filtered.slice((page - 1) * pageSize, page * pageSize);
  const columns: Array<DataTableColumn<PatientSummary>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <><strong>{row.original.displayName}</strong><span className="cell-subtitle">{row.original.reference}</span></> },
    { id: "ageSex", header: "Age / sex", cell: ({ row }) => `${row.original.age} · ${row.original.sex}` },
    { accessorKey: "facility", header: "Facility" }, { accessorKey: "lastAssessment", header: "Last assessment" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "open", header: () => <span className="sr-only">Open</span>, cell: ({ row }) => <RouterButtonLink variant="ghost" size="icon-sm" to={`/patients/${row.original.id}`} aria-label={`Open ${row.original.reference}`}><Icon name="chevron" size={18}/></RouterButtonLink> },
  ];
  const hasFilters = query.trim() || facility !== "all" || status !== "all" || sex !== "all";
  const emptyContent = <div className="table-empty-content">
    {hasFilters
      ? <><strong>No matching patients</strong><span>Try changing the search or filters.</span></>
      : <RouterButtonLink className="patient-empty-action" variant="outline" size="sm" to="/patients/new"><Icon name="plus" size={16} />Register patient</RouterButtonLink>}
  </div>;
  return <>
    <h1 className="patient-page-title">Patients</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Patients</span><span>{patientRecords.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search patients" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search patients…" /></InputGroup><RouterButtonLink className="size-10 shrink-0" size="icon-lg" to="/patients/new" aria-label="Register patient"><Icon name="plus" size={20} /></RouterButtonLink></div>
    </div>
    <div className="patient-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { setFacility(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilities.map((name) => <SelectItem key={name} id={name}>{name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="Draft">Draft</SelectItem><SelectItem id="Pending scoring">Pending scoring</SelectItem><SelectItem id="Scoring unavailable">Scoring unavailable</SelectItem><SelectItem id="Under review">Under review</SelectItem><SelectItem id="Completed">Completed</SelectItem></SelectContent></Select>
      <Select aria-label="Filter by sex" selectedKey={sex} onSelectionChange={(key) => { setSex(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All sexes</SelectItem><SelectItem id="Female">Female</SelectItem><SelectItem id="Male">Male</SelectItem><SelectItem id="Other">Other</SelectItem><SelectItem id="Unknown">Unknown</SelectItem></SelectContent></Select>
    </div>
    <section className="surface table-surface"><div className="mobile-card-list">{visiblePatients.length ? visiblePatients.map((patient)=><Link className="mobile-data-card" to={`/patients/${patient.id}`} key={patient.id}><div><strong>{patient.displayName}</strong><span>{patient.reference} · {patient.sex}, {patient.age}</span></div><StatusBadge status={patient.status}/><span>{patient.facility}</span></Link>) : emptyContent}</div>
      <div className="desktop-table p-5"><DataTable columns={columns} data={visiblePatients} label="Patients" emptyContent={emptyContent} /></div>
    </section>
    <Pagination className="mt-4" aria-label="Patients pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>
  </>;
}

export function RegisterPatientPage() {
  const navigate = useNavigate(); const [saved, setSaved] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaved(true); window.setTimeout(()=>navigate("/patients"), 600); }
  return <><PageHeader eyebrow="Patient registration" title="Register a patient" description="Only collect information required for care and assessment."/>
    <form className="surface clinical-form" onSubmit={submit}><div className="form-section"><div className="form-section-copy"><span>01</span><div><h2>Patient identity</h2><p>Identifiers are encrypted before storage.</p></div></div><div className="form-fields"><Field><FieldLabel>Medical record number</FieldLabel><Input name="mrn" placeholder="Hospital MRN" required/></Field><Field><FieldLabel>Facility</FieldLabel><NativeSelect className="w-full" name="facility"><NativeSelectOption>Chennai Central</NativeSelectOption><NativeSelectOption>Hyderabad</NativeSelectOption><NativeSelectOption>Bengaluru</NativeSelectOption></NativeSelect></Field><div className="field-grid"><Field><FieldLabel>Date of birth</FieldLabel><Input type="date" name="dateOfBirth" required/></Field><Field><FieldLabel>Sex</FieldLabel><NativeSelect className="w-full" name="sex"><NativeSelectOption value="">Select</NativeSelectOption><NativeSelectOption>Female</NativeSelectOption><NativeSelectOption>Male</NativeSelectOption><NativeSelectOption>Other</NativeSelectOption><NativeSelectOption>Unknown</NativeSelectOption></NativeSelect></Field></div></div></div>
      <div className="form-section"><div className="form-section-copy"><span>02</span><div><h2>Contact information</h2><p>Used only for approved care communication.</p></div></div><div className="form-fields"><Field><FieldLabel>Patient name</FieldLabel><Input name="name" autoComplete="name" required/></Field><div className="field-grid"><Field><FieldLabel>Mobile number</FieldLabel><Input name="phone" type="tel" autoComplete="tel"/></Field><Field><FieldLabel>Email address</FieldLabel><Input name="email" type="email" autoComplete="email"/></Field></div></div></div>
      <div className="form-footer"><RouterButtonLink variant="outline" to="/patients">Cancel</RouterButtonLink><Button type="submit" isDisabled={saved}>{saved ? "Registered" : "Register patient"}</Button></div></form>
  </>;
}

export function PatientDetailPage() {
  const { patientId } = useParams(); const patient = demoPatients.find((item)=>item.id===patientId) ?? demoPatients[0]!; const related = assessments.filter((item)=>item.patientId===patient.id);
  return <><div className="breadcrumb"><Link to="/patients">Patients</Link><span>/</span><span>{patient.reference}</span></div><PageHeader eyebrow={patient.reference} title={patient.displayName} description={`${patient.age} years · ${patient.sex} · ${patient.facility}`} action={<RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18}/>New assessment</RouterButtonLink>}/>
    <div className="detail-grid"><Card className="surface"><div className="section-heading"><div><p className="page-eyebrow">Patient details</p><h2>Clinical profile</h2></div><Button variant="link">Edit</Button></div><dl className="definition-grid"><div><dt>Patient reference</dt><dd>{patient.reference}</dd></div><div><dt>Home facility</dt><dd>{patient.facility}</dd></div><div><dt>Date of birth</dt><dd>Protected record</dd></div><div><dt>Contact</dt><dd>Protected record</dd></div></dl></Card><Card className="surface timeline"><div className="section-heading"><div><p className="page-eyebrow">History</p><h2>Assessments</h2></div></div>{related.length ? related.map((item)=><Link to={`/assessments/${item.id}`} key={item.id}><span className="timeline-node"/><div><strong>{item.id}</strong><span>{item.date} · {item.version}</span></div><StatusBadge status={item.status}/></Link>) : <p className="muted">No assessments yet.</p>}</Card></div>
  </>;
}
