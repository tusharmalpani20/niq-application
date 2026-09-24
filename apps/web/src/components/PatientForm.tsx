import { useUnsavedFormClose } from "./useUnsavedFormClose";
import { registerPatientSchema, updatePatientSchema, type Facility, type Patient } from "@niq/application-contracts";
import { useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { DateInput, displayDate } from "./ui/date-input";
import { Dialog, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ApiRequestError, registerPatient } from "../lib/api";
import { updatePatient } from "../lib/patient-edit";
import { todayDate } from "../lib/patient-display";

type PatientFormHandle = { requestClose: () => void };

type Props = {
  ref?: Ref<PatientFormHandle>;
  organizationId: string;
  facilities: Facility[];
  patient?: Patient;
  onCancel: () => void;
  onSaved: (patient: Patient) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function PatientForm({ organizationId, facilities, patient, onCancel, onSaved, onBusyChange, ref }: Props) {
  const [facilityId, setFacilityId] = useState<string | null>(patient?.homeFacility?.id ?? null);
  const [gender, setGender] = useState<Patient["gender"] | null>(patient?.gender ?? null);
  const [birth, setBirth] = useState(patient?.dateOfBirth ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);

  function isDirty() {
    // Read actual input values at dismissal so browser autofill is protected too.
    const form = formRef.current;
    const changedText = ["name", "mrn", "phone", "email"].some(name => {
      const input = form?.elements.namedItem(name) as HTMLInputElement | null;
      return input && input.value !== input.defaultValue;
    });
    const changedBirth = form?.querySelector<HTMLInputElement>("#patient-birth")?.value !== displayDate(patient?.dateOfBirth ?? "");
    const dirty = changedText || changedBirth || facilityId !== (patient?.homeFacility?.id ?? null) || gender !== (patient?.gender ?? null);
    return !!dirty;
  }
  const { requestClose, confirmation } = useUnsavedFormClose({ subject: "patient", onClose: onCancel, isBusy: () => submitting.current, isDirty });
  useImperativeHandle(ref, () => ({ requestClose }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [birthInvalid, setBirthInvalid] = useState(false);
  const options = facilities.filter(item => item.status === "ACTIVE" || item.id === patient?.homeFacility?.id);
  const currentFacility = patient?.homeFacility;
  const missingCurrent = currentFacility && !options.some(item => item.id === currentFacility.id);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const parsed = (patient ? updatePatientSchema : registerPatientSchema).safeParse({
      medicalRecordNumber: String(form.get("mrn") ?? ""), homeFacilityId: facilityId,
      dateOfBirth: birth, gender, name: String(form.get("name") ?? ""),
      phone, ...(email ? { email } : {}),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setBirthInvalid(parsed.error.issues.some(item => item.path[0] === "dateOfBirth"));
      setMessage(!facilityId || !gender ? "Select a facility and gender." : issue?.path[0] === "dateOfBirth"
        ? birth > todayDate() && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? "Date of birth cannot be in the future." : "Enter a valid date of birth in dd/mm/yyyy format."
        : issue?.path[0] === "phone" ? phone ? "Mobile number must contain digits only." : "Enter a mobile number."
        : "Check the patient details and enter a valid name, medical record number and contact information.");
      return;
    }
    submitting.current = true;
    setIsSubmitting(true);
    onBusyChange?.(true);
    setMessage(null);
    try {
      onSaved(patient ? await updatePatient(organizationId, patient.reference, updatePatientSchema.parse(parsed.data)) : await registerPatient(organizationId, registerPatientSchema.parse(parsed.data)));
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : `The patient could not be ${patient ? "updated" : "registered"}. Please try again.`);
      submitting.current = false;
      setIsSubmitting(false);
      onBusyChange?.(false);
    }
  }

  return <><form ref={formRef} className="clinical-form" onSubmit={submit}>
    <fieldset disabled={isSubmitting} className="form-fields facility-dialog-fields m-0 min-w-0 border-0 grid gap-5">
      <div className="grid gap-4">
        <h3 className="font-semibold">Patient details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="patient-name" className="required-field-label">Patient name <span aria-hidden="true">*</span></FieldLabel><Input id="patient-name" name="name" defaultValue={patient?.displayName} autoComplete="name" required maxLength={200} autoFocus /></Field>
          <Field><FieldLabel htmlFor="patient-mrn" className="required-field-label">Medical record number <span aria-hidden="true">*</span></FieldLabel><Input id="patient-mrn" name="mrn" defaultValue={patient?.medicalRecordNumber} placeholder="Hospital MRN" maxLength={120} required /></Field>
          <Field><FieldLabel className="required-field-label">Facility <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Facility" placeholder="Select facility" selectedKey={facilityId} onSelectionChange={key => setFacilityId(String(key))} isRequired isDisabled={isSubmitting}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map(item => <SelectItem id={item.id} key={item.id}>{item.name}{item.status !== "ACTIVE" ? " (inactive)" : ""}</SelectItem>)}{missingCurrent && <SelectItem id={currentFacility.id}>{currentFacility.name} (current)</SelectItem>}</SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="patient-birth" className="required-field-label">Date of birth <span aria-hidden="true">*</span></FieldLabel><DateInput id="patient-birth" label="Date of birth" value={birth} disabled={isSubmitting} required invalid={birthInvalid} max={todayDate()} onChange={value => { setBirth(value ?? ""); setBirthInvalid(false); }} /></Field>
          <Field><FieldLabel className="required-field-label">Gender <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Gender" placeholder="Select gender" selectedKey={gender} onSelectionChange={key => setGender(String(key) as Patient["gender"])} isRequired isDisabled={isSubmitting}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["FEMALE", "MALE", "OTHER", "UNKNOWN"] as const).map(value => <SelectItem id={value} key={value}>{value[0] + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select></Field>
        </div>
      </div>
      <div className="border-t pt-4 grid gap-4"><h3 className="font-semibold">Contact details</h3><div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="patient-phone" className="required-field-label">Mobile number <span aria-hidden="true">*</span></FieldLabel><Input id="patient-phone" name="phone" defaultValue={patient?.phone} type="tel" inputMode="numeric" pattern="[0-9]*" title="Use digits only" autoComplete="tel" maxLength={40} required onInput={event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, ""); }} /></Field>
        <Field><FieldLabel htmlFor="patient-email">Email address (optional)</FieldLabel><Input id="patient-email" name="email" defaultValue={patient?.email} type="email" autoComplete="email" maxLength={320} /></Field>
      </div></div>
      {!options.length && !missingCurrent && <Alert><AlertDescription>Add an active facility before registering a patient.</AlertDescription></Alert>}
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    </fieldset>
    <div className="form-footer"><Button type="button" variant="outline" isDisabled={isSubmitting} onPress={requestClose}>Cancel</Button><Button type="submit" isDisabled={isSubmitting || (!options.length && !missingCurrent)}>{isSubmitting ? "Saving…" : patient ? "Save changes" : "Register patient"}</Button></div>
  </form>
    {confirmation}
  </>;
}

export function PatientFormDialog({ onClose, ...props }: Omit<Props, "onCancel" | "onBusyChange" | "ref"> & { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const form = useRef<PatientFormHandle>(null);
  const title = props.patient ? "Edit patient" : "Register patient";
  return <Dialog ariaLabel={title} className="facility-dialog patient-registration-dialog" isOpen isDismissable={!busy} isKeyboardDismissDisabled={busy} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) form.current?.requestClose(); }}>
    <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    <PatientForm {...props} ref={form} onBusyChange={setBusy} onCancel={onClose} />
  </Dialog>;
}
