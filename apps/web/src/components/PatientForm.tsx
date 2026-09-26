import { useUnsavedFormClose } from "./useUnsavedFormClose";
import { registerPatientSchema, updatePatientSchema, type Facility, type Patient } from "@niq/application-contracts";
import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { DateInput } from "./ui/date-input";
import { Dialog, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ApiRequestError, registerPatient } from "../lib/api";
import { updatePatient } from "../lib/patient-edit";
import { todayDate } from "../lib/patient-display";

export type PatientFormHandle = { requestClose: () => void };
type PatientField = "name" | "medicalRecordNumber" | "homeFacilityId" | "dateOfBirth" | "gender" | "phone" | "email";

type Props = {
  ref?: Ref<PatientFormHandle>;
  organizationId: string;
  facilities: Facility[];
  patient?: Patient;
  initialName?: string;
  initialFacilityId?: string;
  canCorrectIdentity?: boolean;
  onCancel: () => void;
  onExit?: () => void;
  onSaved: (patient: Patient) => void;
  onBusyChange?: (busy: boolean) => void;
  focusField?: "gender";
  submitLabel?: string;
  cancelLabel?: string;
};

export function PatientForm({ organizationId, facilities, patient, initialName, initialFacilityId: preferredFacilityId, canCorrectIdentity, onCancel, onExit, onSaved, onBusyChange, focusField, submitLabel, cancelLabel = "Cancel", ref }: Props) {
  const activeFacilities = facilities.filter(item => item.status === "ACTIVE");
  const initialFacilityId = useRef(patient?.homeFacility?.id ?? activeFacilities.find(item => item.id === preferredFacilityId)?.id ?? (activeFacilities.length === 1 ? activeFacilities[0]!.id : null)).current;
  const [facilityId, setFacilityId] = useState<string | null>(initialFacilityId);
  const [gender, setGender] = useState<Patient["gender"] | null>(patient?.gender ?? null);
  const [birth, setBirth] = useState(patient?.dateOfBirth ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (focusField) requestAnimationFrame(() => document.getElementById("patient-gender")?.focus());
  }, [focusField]);
  const submitting = useRef(false);

  function isDirty() {
    // Read actual input values at dismissal so browser autofill is protected too.
    const form = formRef.current;
    const changedText = (patient ? ["name", "phone", "email"] : ["name", "mrn", "phone", "email"]).some(name => {
      const input = form?.elements.namedItem(name) as HTMLInputElement | null;
      return input && input.value !== input.defaultValue;
    });
    const dirty = changedText || (!patient && birth !== "") || facilityId !== initialFacilityId || gender !== (patient?.gender ?? null);
    return !!dirty;
  }
  const { requestClose, requestCloseWith, confirmation } = useUnsavedFormClose({ subject: "patient", onClose: onCancel, isBusy: () => submitting.current, isDirty });
  useImperativeHandle(ref, () => ({ requestClose }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PatientField, string>>>({});
  const clearFieldError = (field: PatientField) => setFieldErrors(current => ({ ...current, [field]: undefined }));
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
      ...(!patient ? { medicalRecordNumber: String(form.get("mrn") ?? "") } : {}), homeFacilityId: facilityId,
      ...(!patient ? { dateOfBirth: birth } : {}), gender, name: String(form.get("name") ?? ""),
      phone, ...(email ? { email } : {}),
    });
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map(issue => issue.path[0]));
      setFieldErrors({
        name: invalid.has("name") ? "Enter a patient name." : undefined,
        medicalRecordNumber: invalid.has("medicalRecordNumber") ? "Enter a medical record number." : undefined,
        homeFacilityId: invalid.has("homeFacilityId") ? "Select a facility." : undefined,
        dateOfBirth: invalid.has("dateOfBirth") ? birth > todayDate() && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? "Date of birth cannot be in the future." : "Enter a valid date of birth in dd/mm/yyyy format." : undefined,
        gender: invalid.has("gender") ? "Select a gender." : undefined,
        phone: invalid.has("phone") ? phone ? "Mobile number must contain digits only." : "Enter a mobile number." : undefined,
        email: invalid.has("email") ? "Enter a valid email address." : undefined,
      });
      setMessage(null);
      return;
    }
    setFieldErrors({});
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

  return <><form ref={formRef} className="clinical-form" noValidate onSubmit={submit}>
    <fieldset disabled={isSubmitting} className="form-fields facility-dialog-fields m-0 min-w-0 border-0 grid gap-5">
      <div className="grid gap-4">
        <h3 className="font-semibold">Patient details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!fieldErrors.name || undefined}><FieldLabel htmlFor="patient-name" className="required-field-label">Patient name <span aria-hidden="true">*</span></FieldLabel><Input id="patient-name" name="name" defaultValue={patient?.displayName ?? initialName} autoComplete="name" required maxLength={200} autoFocus={!focusField} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "patient-name-error" : undefined} onChange={() => clearFieldError("name")} />{fieldErrors.name && <FieldError id="patient-name-error">{fieldErrors.name}</FieldError>}</Field>
          <Field data-invalid={!!fieldErrors.medicalRecordNumber || undefined}><FieldLabel htmlFor="patient-mrn" className={patient ? undefined : "required-field-label"}>Medical record number {!patient && <span aria-hidden="true">*</span>}</FieldLabel><Input id="patient-mrn" name={patient ? undefined : "mrn"} defaultValue={patient?.medicalRecordNumber} placeholder="Hospital MRN" maxLength={120} disabled={!!patient} required={!patient} aria-invalid={!!fieldErrors.medicalRecordNumber} aria-describedby={fieldErrors.medicalRecordNumber ? "patient-mrn-error" : undefined} onChange={() => clearFieldError("medicalRecordNumber")} />{patient && <FieldDescription>{canCorrectIdentity ? "Use Correct MRN on the patient record to change this." : "Ask an organization admin to correct this."}</FieldDescription>}{fieldErrors.medicalRecordNumber && <FieldError id="patient-mrn-error">{fieldErrors.medicalRecordNumber}</FieldError>}</Field>
          <Field data-invalid={!!fieldErrors.homeFacilityId || undefined}><FieldLabel className="required-field-label">Facility <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Facility" placeholder="Select facility" selectedKey={facilityId} onSelectionChange={key => { setFacilityId(String(key)); clearFieldError("homeFacilityId"); }} isRequired isInvalid={!!fieldErrors.homeFacilityId} aria-describedby={fieldErrors.homeFacilityId ? "patient-facility-error" : undefined} isDisabled={isSubmitting}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map(item => <SelectItem id={item.id} key={item.id}>{item.name}{item.status !== "ACTIVE" ? " (inactive)" : ""}</SelectItem>)}{missingCurrent && <SelectItem id={currentFacility.id}>{currentFacility.name} (current)</SelectItem>}</SelectContent></Select>{fieldErrors.homeFacilityId && <FieldError id="patient-facility-error">{fieldErrors.homeFacilityId}</FieldError>}</Field>
          <Field data-invalid={!!fieldErrors.dateOfBirth || undefined}><FieldLabel htmlFor="patient-birth" className={patient ? undefined : "required-field-label"}>Date of birth {!patient && <span aria-hidden="true">*</span>}</FieldLabel><DateInput id="patient-birth" label="Date of birth" value={birth} disabled={isSubmitting || !!patient} required={!patient} invalid={!!fieldErrors.dateOfBirth} describedBy={fieldErrors.dateOfBirth ? "patient-birth-error" : undefined} max={todayDate()} onChange={value => { setBirth(value ?? ""); clearFieldError("dateOfBirth"); }} />{patient && <FieldDescription>{canCorrectIdentity ? "Use Correct DOB on the patient record to change this." : "Ask an organization admin to correct this."}</FieldDescription>}{fieldErrors.dateOfBirth && <FieldError id="patient-birth-error">{fieldErrors.dateOfBirth}</FieldError>}</Field>
          <Field data-invalid={!!fieldErrors.gender || undefined}><FieldLabel className="required-field-label">Gender <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Gender" placeholder="Select gender" selectedKey={gender} onSelectionChange={key => { setGender(String(key) as Patient["gender"]); clearFieldError("gender"); }} isRequired isInvalid={!!fieldErrors.gender} aria-describedby={fieldErrors.gender ? "patient-gender-error" : undefined} isDisabled={isSubmitting}><SelectTrigger id="patient-gender"><SelectValue /></SelectTrigger><SelectContent>{(["FEMALE", "MALE", "OTHER", "UNKNOWN"] as const).map(value => <SelectItem id={value} key={value}>{value[0] + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select>{fieldErrors.gender && <FieldError id="patient-gender-error">{fieldErrors.gender}</FieldError>}</Field>
        </div>
      </div>
      <div className="border-t pt-4 grid gap-4"><h3 className="font-semibold">Contact details</h3><div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!fieldErrors.phone || undefined}><FieldLabel htmlFor="patient-phone" className="required-field-label">Mobile number <span aria-hidden="true">*</span></FieldLabel><Input id="patient-phone" name="phone" defaultValue={patient?.phone} type="tel" inputMode="numeric" pattern="[0-9]*" title="Use digits only" autoComplete="tel" maxLength={40} required aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? "patient-phone-error" : undefined} onInput={event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, ""); clearFieldError("phone"); }} />{fieldErrors.phone && <FieldError id="patient-phone-error">{fieldErrors.phone}</FieldError>}</Field>
        <Field data-invalid={!!fieldErrors.email || undefined}><FieldLabel htmlFor="patient-email">Email address (optional)</FieldLabel><Input id="patient-email" name="email" defaultValue={patient?.email} type="email" autoComplete="email" maxLength={320} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "patient-email-error" : undefined} onChange={() => clearFieldError("email")} />{fieldErrors.email && <FieldError id="patient-email-error">{fieldErrors.email}</FieldError>}</Field>
      </div></div>
      {!options.length && !missingCurrent && <Alert><AlertDescription>Add an active facility before registering a patient.</AlertDescription></Alert>}
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    </fieldset>
    <div className="form-footer flex-wrap">{onExit && <Button type="button" variant="outline" className="mr-auto" isDisabled={isSubmitting} onPress={() => requestCloseWith(onExit)}>Exit</Button>}<Button type="button" variant="outline" isDisabled={isSubmitting} onPress={requestClose}>{cancelLabel}</Button><Button type="submit" isDisabled={isSubmitting || (!options.length && !missingCurrent)}>{isSubmitting ? "Saving…" : submitLabel ?? (patient ? "Save changes" : "Register patient")}</Button></div>
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
