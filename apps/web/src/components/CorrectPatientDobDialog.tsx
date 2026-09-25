import { correctPatientDobSchema, type Patient } from "@niq/application-contracts";
import { useState, type FormEvent } from "react";
import { ApiRequestError } from "../lib/api";
import { correctPatientDob } from "../lib/patient-edit";
import { todayDate } from "../lib/patient-display";
import { useUnsavedFormClose } from "./useUnsavedFormClose";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { DateInput } from "./ui/date-input";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

export function CorrectPatientDobDialog({ organizationId, patient, onClose, onSaved }: {
  organizationId: string;
  patient: Patient;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}) {
  const [dateOfBirth, setDateOfBirth] = useState(patient.dateOfBirth ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ dateOfBirth?: string; reason?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { requestClose, confirmation } = useUnsavedFormClose({
    subject: "date of birth correction", onClose, isBusy: () => busy,
    isDirty: () => dateOfBirth !== (patient.dateOfBirth ?? "") || reason.length > 0,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = correctPatientDobSchema.safeParse({ dateOfBirth, reason });
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map(issue => issue.path[0]));
      setErrors({
        dateOfBirth: invalid.has("dateOfBirth") ? "Enter a valid date of birth in dd/mm/yyyy format." : undefined,
        reason: invalid.has("reason") ? "Enter a reason with at least 3 characters." : undefined,
      });
      return;
    }
    setErrors({});
    setMessage(null);
    setBusy(true);
    try { onSaved(await correctPatientDob(organizationId, patient.reference, parsed.data)); }
    catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The date of birth could not be corrected. Please try again.");
      setBusy(false);
    }
  }

  return <><Dialog ariaLabel="Correct date of birth" className="facility-dialog" isOpen isDismissable={!busy} isKeyboardDismissDisabled={busy} showCloseButton={!busy} onOpenChange={open => { if (!open) requestClose(); }}>
    <DialogHeader><DialogTitle>Correct date of birth</DialogTitle><DialogDescription>Draft and future assessments will use the corrected date. Submitted assessments stay unchanged.</DialogDescription></DialogHeader>
    <form className="clinical-form" noValidate onSubmit={submit}>
      <div className="form-fields facility-dialog-fields grid gap-4">
        <Field data-invalid={!!errors.dateOfBirth || undefined}><FieldLabel htmlFor="correct-patient-dob">Date of birth</FieldLabel><DateInput id="correct-patient-dob" label="Date of birth" value={dateOfBirth} disabled={busy} required invalid={!!errors.dateOfBirth} max={todayDate()} onChange={value => { setDateOfBirth(value ?? ""); setErrors(current => ({ ...current, dateOfBirth: undefined })); }} />{errors.dateOfBirth && <FieldError>{errors.dateOfBirth}</FieldError>}</Field>
        <Field data-invalid={!!errors.reason || undefined}><FieldLabel htmlFor="correct-patient-dob-reason">Reason for correction</FieldLabel><Textarea id="correct-patient-dob-reason" value={reason} maxLength={500} aria-invalid={!!errors.reason} onChange={event => { setReason(event.target.value); setErrors(current => ({ ...current, reason: undefined })); }} /><FieldDescription>Describe the error briefly. Avoid entering patient identifiers in the reason.</FieldDescription>{errors.reason && <FieldError>{errors.reason}</FieldError>}</Field>
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
      </div>
      <div className="form-footer"><Button type="button" variant="outline" isDisabled={busy} onPress={requestClose}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Saving…" : "Save correction"}</Button></div>
    </form>
  </Dialog>{confirmation}</>;
}
