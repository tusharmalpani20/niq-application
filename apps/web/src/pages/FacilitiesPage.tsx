import type { AuthenticatedUser, Facility } from "@niq/application-contracts";
import { type FormEvent, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ApiRequestError, createFacility, listFacilities } from "../lib/api";
import { Icon } from "../lib/icons";
import { PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";

export function FacilitiesPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listFacilities(user.organizationId).then((items) => { if (active) setFacilities(items); }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [user.organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setIsSubmitting(true);
    setMessage(null);
    try {
      const facility = await createFacility(user.organizationId, { name: String(form.get("name") ?? ""), code: String(form.get("code") ?? ""), timezone: String(form.get("timezone") ?? "Asia/Kolkata") });
      setFacilities((current) => [...current, facility].sort((first, second) => first.name.localeCompare(second.name)));
      formElement.reset();
      setShowForm(false);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The facility could not be saved. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <><PageHeader eyebrow="Organization setup" title="Facilities" description="Track branches inside one central application." action={<Button onPress={() => { setShowForm(!showForm); setMessage(null); }}><Icon name="plus" size={18}/>Add facility</Button>}/>
    {showForm && <Card className="surface inline-form"><div className="section-heading"><div><p className="page-eyebrow">New facility</p><h2>Add a branch</h2></div><Button variant="link" isDisabled={isSubmitting} onPress={() => setShowForm(false)}>Cancel</Button></div><form onSubmit={submit}><div className="field-grid three"><Field><FieldLabel>Facility name</FieldLabel><Input name="name" placeholder="e.g. Delhi Central" required autoFocus/></Field><Field><FieldLabel>Facility code</FieldLabel><Input name="code" placeholder="DEL" required/></Field><Field><FieldLabel>Timezone</FieldLabel><NativeSelect name="timezone" defaultValue="Asia/Kolkata"><NativeSelectOption>Asia/Kolkata</NativeSelectOption></NativeSelect></Field></div>{message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}<div className="form-actions"><Button type="submit" isDisabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save facility"}</Button></div></form></Card>}
    {loadFailed ? <Alert variant="destructive"><AlertTitle>Facilities could not be loaded</AlertTitle><AlertDescription>Refresh the page to try again.</AlertDescription></Alert> : facilities.length ? <section className="card-grid">{facilities.map((facility) => <Card className="facility-card" key={facility.id}><div className="facility-icon"><Icon name="building"/></div><div><h2>{facility.name}</h2><p>{facility.code} · {facility.timezone}</p></div><StatusBadge status={facility.status === "ACTIVE" ? "Active" : "Deactivated"}/></Card>)}</section> : <Card className="surface"><div className="table-empty-content"><strong>No facilities yet</strong><Button variant="outline" size="sm" onPress={() => setShowForm(true)}><Icon name="plus" size={16}/>Add facility</Button></div></Card>}
    <Alert><AlertTitle>One central application</AlertTitle><AlertDescription>Facilities are used for reporting and context only. Patients remain available across the organization, and facility-based restrictions are not enabled.</AlertDescription></Alert>
  </>;
}
