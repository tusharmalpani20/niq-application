import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { facilities } from "../lib/demo-data";
import { Icon } from "../lib/icons";
import { PageHeader } from "../components/Page";

export function FacilitiesPage() {
  const [showForm, setShowForm] = useState(false);
  return <><PageHeader eyebrow="Organization setup" title="Facilities" description="Track branches inside one central application." action={<Button onPress={() => setShowForm(!showForm)}><Icon name="plus" size={18}/>Add facility</Button>}/>
    {showForm && <Card className="surface inline-form"><div className="section-heading"><div><p className="page-eyebrow">New facility</p><h2>Add a branch</h2></div><Button variant="link" onPress={() => setShowForm(false)}>Cancel</Button></div><form><div className="field-grid three"><Field><FieldLabel>Facility name</FieldLabel><Input placeholder="e.g. Delhi Central" required/></Field><Field><FieldLabel>Facility code</FieldLabel><Input placeholder="DEL" required/></Field><Field><FieldLabel>Timezone</FieldLabel><NativeSelect defaultValue="Asia/Kolkata"><NativeSelectOption>Asia/Kolkata</NativeSelectOption></NativeSelect></Field></div><div className="form-actions"><Button type="button">Save facility</Button></div></form></Card>}
    <section className="card-grid">{facilities.map((facility) => <Card className="facility-card" key={facility.id}><div className="facility-icon"><Icon name="building"/></div><div><h2>{facility.name}</h2><p>{facility.code} · {facility.timezone}</p></div><dl><div><dt>Users</dt><dd>{facility.users}</dd></div><div><dt>Assessments</dt><dd>{facility.assessments}</dd></div></dl><Button variant="outline" size="sm">Manage</Button></Card>)}</section>
    <Alert><AlertTitle>One central application</AlertTitle><AlertDescription>Facilities are used for reporting and context only. Patients remain available across the organization, and facility-based restrictions are not enabled.</AlertDescription></Alert>
  </>;
}
