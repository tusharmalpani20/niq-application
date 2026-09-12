import { useState } from "react";
import { facilities } from "../lib/demo-data";
import { Icon } from "../lib/icons";
import { PageHeader } from "../components/Page";

export function FacilitiesPage() {
  const [showForm, setShowForm] = useState(false);
  return <><PageHeader eyebrow="Organization setup" title="Facilities" description="Track branches inside one central Apollo Group application." action={<button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><Icon name="plus" size={18}/>Add facility</button>}/>
    {showForm && <section className="surface inline-form"><div className="section-heading"><div><p className="page-eyebrow">New facility</p><h2>Add a branch</h2></div><button className="text-button" onClick={() => setShowForm(false)}>Cancel</button></div><form><div className="field-grid three"><label>Facility name<input placeholder="e.g. Apollo Delhi" required/></label><label>Facility code<input placeholder="DEL" required/></label><label>Timezone<select defaultValue="Asia/Kolkata"><option>Asia/Kolkata</option></select></label></div><div className="form-actions"><button className="btn btn-primary" type="button">Save facility</button></div></form></section>}
    <section className="card-grid">{facilities.map((facility) => <article className="facility-card" key={facility.id}><div className="facility-icon"><Icon name="building"/></div><div><h2>{facility.name}</h2><p>{facility.code} · {facility.timezone}</p></div><dl><div><dt>Users</dt><dd>{facility.users}</dd></div><div><dt>Assessments</dt><dd>{facility.assessments}</dd></div></dl><button className="btn btn-outline btn-small">Manage</button></article>)}</section>
    <div className="notice notice-info"><strong>One central application</strong><span>Facilities are used for reporting and context only. Patients remain available across the organization, and facility-based restrictions are not enabled.</span></div>
  </>;
}
