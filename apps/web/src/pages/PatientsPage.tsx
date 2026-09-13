import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState, PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { assessments, patients } from "../lib/demo-data";
import { Icon } from "../lib/icons";

export function PatientsPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => patients.filter((patient) => `${patient.reference} ${patient.displayName} ${patient.facility}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const columns: Array<DataTableColumn<(typeof patients)[number]>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <><strong>{row.original.displayName}</strong><span className="cell-subtitle">{row.original.reference}</span></> },
    { id: "ageSex", header: "Age / sex", cell: ({ row }) => `${row.original.age} · ${row.original.sex}` },
    { accessorKey: "facility", header: "Facility" }, { accessorKey: "lastAssessment", header: "Last assessment" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "open", header: () => <span className="sr-only">Open</span>, cell: ({ row }) => <RouterButtonLink variant="ghost" size="icon-sm" to={`/patients/${row.original.id}`} aria-label={`Open ${row.original.reference}`}><Icon name="chevron" size={18}/></RouterButtonLink> },
  ];
  return <><PageHeader eyebrow="Clinical records" title="Patients" description="Find patients across your organization's facilities." action={<RouterButtonLink to="/patients/new"><Icon name="plus" size={18}/>Register patient</RouterButtonLink>}/>
    <section className="surface table-surface"><div className="toolbar"><InputGroup className="max-w-sm"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="Search patients" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search patient reference or facility"/></InputGroup><NativeSelect aria-label="Filter facility"><NativeSelectOption>All facilities</NativeSelectOption><NativeSelectOption>Chennai Central</NativeSelectOption><NativeSelectOption>Hyderabad</NativeSelectOption><NativeSelectOption>Bengaluru</NativeSelectOption></NativeSelect></div>
      {filtered.length ? <><div className="mobile-card-list">{filtered.map((patient)=><Link className="mobile-data-card" to={`/patients/${patient.id}`} key={patient.id}><div><strong>{patient.displayName}</strong><span>{patient.reference} · {patient.sex}, {patient.age}</span></div><StatusBadge status={patient.status}/><span>{patient.facility}</span></Link>)}</div>
      <div className="desktop-table"><DataTable columns={columns} data={filtered} /></div></> : <EmptyState title="No patients found" description="Try a different patient reference or facility."/>}
    </section></>;
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
  const { patientId } = useParams(); const patient = patients.find((item)=>item.id===patientId) ?? patients[0]!; const related = assessments.filter((item)=>item.patientId===patient.id);
  return <><div className="breadcrumb"><Link to="/patients">Patients</Link><span>/</span><span>{patient.reference}</span></div><PageHeader eyebrow={patient.reference} title={patient.displayName} description={`${patient.age} years · ${patient.sex} · ${patient.facility}`} action={<RouterButtonLink to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18}/>New assessment</RouterButtonLink>}/>
    <div className="detail-grid"><Card className="surface"><div className="section-heading"><div><p className="page-eyebrow">Patient details</p><h2>Clinical profile</h2></div><Button variant="link">Edit</Button></div><dl className="definition-grid"><div><dt>Patient reference</dt><dd>{patient.reference}</dd></div><div><dt>Home facility</dt><dd>{patient.facility}</dd></div><div><dt>Date of birth</dt><dd>Protected record</dd></div><div><dt>Contact</dt><dd>Protected record</dd></div></dl></Card><Card className="surface timeline"><div className="section-heading"><div><p className="page-eyebrow">History</p><h2>Assessments</h2></div></div>{related.length ? related.map((item)=><Link to={`/assessments/${item.id}`} key={item.id}><span className="timeline-node"/><div><strong>{item.id}</strong><span>{item.date} · {item.version}</span></div><StatusBadge status={item.status}/></Link>) : <p className="muted">No assessments yet.</p>}</Card></div>
  </>;
}
