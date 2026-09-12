import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { assessments, patients } from "../lib/demo-data";
import { Icon } from "../lib/icons";

export function PatientsPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => patients.filter((patient) => `${patient.reference} ${patient.displayName} ${patient.facility}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <><PageHeader eyebrow="Clinical records" title="Patients" description="Find patients across every Apollo Group facility." action={<Link className="btn btn-primary" to="/patients/new"><Icon name="plus" size={18}/>Register patient</Link>}/>
    <section className="surface table-surface"><div className="toolbar"><label className="search-control"><Icon name="search" size={18}/><span className="sr-only">Search patients</span><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search patient reference or facility"/></label><select aria-label="Filter facility"><option>All facilities</option><option>Chennai Central</option><option>Hyderabad</option><option>Bengaluru</option></select></div>
      {filtered.length ? <><div className="mobile-card-list">{filtered.map((patient)=><Link className="mobile-data-card" to={`/patients/${patient.id}`} key={patient.id}><div><strong>{patient.displayName}</strong><span>{patient.reference} · {patient.sex}, {patient.age}</span></div><StatusBadge status={patient.status}/><span>{patient.facility}</span></Link>)}</div>
      <div className="responsive-table desktop-table"><table><thead><tr><th>Patient</th><th>Age / sex</th><th>Facility</th><th>Last assessment</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filtered.map((patient)=><tr key={patient.id}><td><strong>{patient.displayName}</strong><span className="cell-subtitle">{patient.reference}</span></td><td>{patient.age} · {patient.sex}</td><td>{patient.facility}</td><td>{patient.lastAssessment}</td><td><StatusBadge status={patient.status}/></td><td><Link className="row-link" to={`/patients/${patient.id}`} aria-label={`Open ${patient.reference}`}><Icon name="chevron" size={18}/></Link></td></tr>)}</tbody></table></div></> : <EmptyState title="No patients found" description="Try a different patient reference or facility."/>}
    </section></>;
}

export function RegisterPatientPage() {
  const navigate = useNavigate(); const [saved, setSaved] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaved(true); window.setTimeout(()=>navigate("/patients"), 600); }
  return <><PageHeader eyebrow="Patient registration" title="Register a patient" description="Only collect information required for care and assessment."/>
    <form className="surface clinical-form" onSubmit={submit}><div className="form-section"><div className="form-section-copy"><span>01</span><div><h2>Patient identity</h2><p>Identifiers are encrypted before storage.</p></div></div><div className="form-fields"><label>Medical record number<input name="mrn" placeholder="Hospital MRN" required/></label><label>Facility<select name="facility"><option>Chennai Central</option><option>Hyderabad</option><option>Bengaluru</option></select></label><div className="field-grid"><label>Date of birth<input type="date" name="dateOfBirth" required/></label><label>Sex<select name="sex"><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Unknown</option></select></label></div></div></div>
      <div className="form-section"><div className="form-section-copy"><span>02</span><div><h2>Contact information</h2><p>Used only for approved care communication.</p></div></div><div className="form-fields"><label>Patient name<input name="name" autoComplete="name" required/></label><div className="field-grid"><label>Mobile number<input name="phone" type="tel" autoComplete="tel"/></label><label>Email address<input name="email" type="email" autoComplete="email"/></label></div></div></div>
      <div className="form-footer"><Link className="btn btn-outline" to="/patients">Cancel</Link><button className="btn btn-primary" disabled={saved}>{saved ? "Registered" : "Register patient"}</button></div></form>
  </>;
}

export function PatientDetailPage() {
  const { patientId } = useParams(); const patient = patients.find((item)=>item.id===patientId) ?? patients[0]!; const related = assessments.filter((item)=>item.patientId===patient.id);
  return <><div className="breadcrumb"><Link to="/patients">Patients</Link><span>/</span><span>{patient.reference}</span></div><PageHeader eyebrow={patient.reference} title={patient.displayName} description={`${patient.age} years · ${patient.sex} · ${patient.facility}`} action={<Link className="btn btn-primary" to={`/assessments/new?patient=${patient.id}`}><Icon name="plus" size={18}/>New assessment</Link>}/>
    <div className="detail-grid"><section className="surface"><div className="section-heading"><div><p className="page-eyebrow">Patient details</p><h2>Clinical profile</h2></div><button className="text-button">Edit</button></div><dl className="definition-grid"><div><dt>Patient reference</dt><dd>{patient.reference}</dd></div><div><dt>Home facility</dt><dd>{patient.facility}</dd></div><div><dt>Date of birth</dt><dd>Protected record</dd></div><div><dt>Contact</dt><dd>Protected record</dd></div></dl></section><aside className="surface timeline"><div className="section-heading"><div><p className="page-eyebrow">History</p><h2>Assessments</h2></div></div>{related.length ? related.map((item)=><Link to={`/assessments/${item.id}`} key={item.id}><span className="timeline-node"/><div><strong>{item.id}</strong><span>{item.date} · {item.version}</span></div><StatusBadge status={item.status}/></Link>) : <p className="muted">No assessments yet.</p>}</aside></div>
  </>;
}
