import { correctPatientMrnSchema, type Patient } from "@niq/application-contracts";
import { useState, type FormEvent } from "react";
import { ApiRequestError } from "../lib/api";
import { correctPatientMrn } from "../lib/patient-edit";
import { useUnsavedFormClose } from "./useUnsavedFormClose";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export function CorrectPatientMrnDialog({ organizationId, patient, onClose, onSaved }: {
  organizationId: string;
  patient: Patient;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}) {
  const [mrn, setMrn] = useState(patient.medicalRecordNumber);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ medicalRecordNumber?: string; reason?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { requestClose, confirmation } = useUnsavedFormClose({
    subject: "MRN correction", onClose, isBusy: () => busy,
    isDirty: () => mrn !== patient.medicalRecordNumber || reason.length > 0,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = correctPatientMrnSchema.safeParse({ medicalRecordNumber: mrn, reason });
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map(issue => issue.path[0]));
      setErrors({
        medicalRecordNumber: invalid.has("medicalRecordNumber") ? "Enter a medical record number." : undefined,
        reason: invalid.has("reason") ? "Enter a reason with at least 3 characters." : undefined,
      });
      return;
    }
    setErrors({});
    setMessage(null);
    setBusy(true);
    try { onSaved(await correctPatientMrn(organizationId, patient.reference, parsed.data)); }
    catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The medical record number could not be corrected. Please try again.");
      setBusy(false);
    }
  }

  return <><Dialog ariaLabel="Correct medical record number" className="facility-dialog" isOpen isDismissable={!busy} isKeyboardDismissDisabled={busy} showCloseButton={!busy} onOpenChange={open => { if (!open) requestClose(); }}>
    <DialogHeader><DialogTitle>Correct medical record number</DialogTitle><DialogDescription>Use this only to correct a registration error. The change and your reason will be recorded in the audit trail.</DialogDescription></DialogHeader>
    <form className="clinical-form" noValidate onSubmit={submit}>
      <div className="form-fields grid gap-4">
        <Field data-invalid={!!errors.medicalRecordNumber || undefined}><FieldLabel htmlFor="correct-patient-mrn">Medical record number</FieldLabel><Input id="correct-patient-mrn" value={mrn} maxLength={120} autoComplete="off" autoFocus aria-invalid={!!errors.medicalRecordNumber} onChange={event => { setMrn(event.target.value); setErrors(current => ({ ...current, medicalRecordNumber: undefined })); }} />{errors.medicalRecordNumber && <FieldError>{errors.medicalRecordNumber}</FieldError>}</Field>
        <Field data-invalid={!!errors.reason || undefined}><FieldLabel htmlFor="correct-patient-mrn-reason">Reason for correction</FieldLabel><Textarea id="correct-patient-mrn-reason" value={reason} maxLength={500} aria-invalid={!!errors.reason} onChange={event => { setReason(event.target.value); setErrors(current => ({ ...current, reason: undefined })); }} /><FieldDescription>Describe the error briefly. Avoid entering patient identifiers in the reason.</FieldDescription>{errors.reason && <FieldError>{errors.reason}</FieldError>}</Field>
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
      </div>
      <div className="form-footer"><Button type="button" variant="outline" isDisabled={busy} onPress={requestClose}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Saving…" : "Save correction"}</Button></div>
    </form>
  </Dialog>{confirmation}</>;
}
