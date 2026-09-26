import { ASSESSMENT_ATTESTATION_STATEMENT_V2, assessmentFieldError, getAssessmentAnswerCoverage, isAssessmentFieldApplicable, type AssessmentWorkflow, type FaceScanSession } from "@niq/application-contracts";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssessmentReports } from "./AssessmentReports";
import { FaceScanResults } from "./FaceScanResults";
import { assessmentSectionIcons } from "./AssessmentSectionNavigation";
import { assessmentOptionIcon } from "./assessmentOptionIcon";

export function AssessmentSubmissionDialog({ record, scanStatus, scanSession, busy, onClose, onEdit, onSubmit }: {
  record: AssessmentWorkflow;
  scanStatus: string;
  scanSession: FaceScanSession | null;
  busy: boolean;
  onClose: () => void;
  onEdit: (sectionId: string) => void;
  onSubmit: (reviewedSectionIds: string[]) => Promise<void>;
}) {
  const steps = record.manifest.sections.flatMap(section => [
    { id: section.id, title: section.title },
    ...(section.id === "personal_details" ? [{ id: "face_scan", title: "Face scan" }] : []),
  ]).concat({ id: "reports", title: "Attachments" });
  const [stepIndex, setStepIndex] = useState(0);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const finalStep = stepIndex === steps.length;
  const step = steps[stepIndex];
  const StepIcon = finalStep ? CheckCircle2 : assessmentSectionIcons[step?.id as keyof typeof assessmentSectionIcons] ?? ClipboardList;
  const allReviewed = steps.every(item => reviewed.includes(item.id));
  const coverage = getAssessmentAnswerCoverage(record.manifest, record.answers);

  function markReviewed(selected: boolean) {
    if (!step) return;
    setReviewed(current => selected ? [...new Set([...current, step.id])] : current.filter(id => id !== step.id));
    setConfirmed(false);
  }

  return <Dialog isOpen ariaLabel="Verify assessment before scoring" className="facility-dialog assessment-verification-dialog" isDismissable={false} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogHeader><DialogTitle>Verify assessment before scoring</DialogTitle></DialogHeader>
    <div className="assessment-verification-body facility-dialog-fields space-y-5">
      <div>
      {!finalStep && <p className="mt-2 text-sm text-muted-foreground">Review each section before requesting a score.</p>}
      <p className="mt-3 text-xs font-medium text-muted-foreground" aria-live="polite">Step {stepIndex + 1} of {steps.length + 1} · {finalStep ? "Confirm" : step?.title}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Verification progress" aria-valuemin={0} aria-valuemax={steps.length + 1} aria-valuenow={stepIndex + 1}><div className="h-full bg-primary" style={{ width: `${((stepIndex + 1) / (steps.length + 1)) * 100}%` }} /></div>
      </div>
      <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
      {finalStep ? <div className="space-y-4">
        <h3 className="flex items-center gap-3 text-base font-semibold"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><StepIcon className="size-5" aria-hidden="true" /></span>Ready to request a score</h3>
        <p className="text-sm text-muted-foreground">All {steps.length} sections reviewed. Your confirmation will be saved with this scoring request.</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmed} disabled={busy || !allReviewed} onChange={event => setConfirmed(event.target.checked)}/><span>{ASSESSMENT_ATTESTATION_STATEMENT_V2}</span></label>
      </div> : <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-3 text-base font-semibold"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><StepIcon className="size-5" aria-hidden="true" /></span>{step?.title}</h3><Button variant="outline" className="min-h-10" isDisabled={busy} onPress={() => { if (step) onEdit(step.id); }}>{step?.id === "face_scan" ? scanSession?.state === "COMPLETED" || scanStatus === "Done" ? "Rescan" : "Open face scan" : step?.id === "reports" ? "Edit attachments" : "Edit answers"}</Button></div>
        {step?.id === "face_scan" ? scanSession?.state === "COMPLETED" && scanSession.result ? <FaceScanResults session={scanSession}/> : <p className="text-sm text-muted-foreground">{scanStatus === "Done" ? "A completed face scan is saved. Results are loading." : "No completed face scan results are available."}</p>
          : step?.id === "reports" ? record.reports.length ? <AssessmentReports organizationId={record.organizationId} assessmentId={record.id} reports={record.reports} revision={record.revision} readOnly showIntro={false} onChanged={async () => {}} /> : <p className="text-sm text-muted-foreground">No attachments added.</p>
          : record.manifest.sections.filter(section => section.id === step?.id).map(section => <dl key={section.id} className="grid min-w-0 gap-3">{section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, record.answers)).map(field => {
            const value = record.answers[field.id];
            const empty = value === null || value === undefined || value === "" || typeof value === "string" && !value.trim();
            const display = empty ? "Not answered" : Array.isArray(value) ? value.length ? value.map(id => field.options?.find(option => option.id === id)?.label ?? id).join(", ") : "None" : field.options?.find(option => option.id === value)?.label ?? String(value);
            const error = assessmentFieldError(field, value);
            const choiceIds = Array.isArray(value) ? value : typeof value === "string" && field.options?.some(option => option.id === value) ? [value] : [];
            const visualChoices = choiceIds.map(id => ({ id, label: field.options?.find(option => option.id === id)?.label ?? id, icon: assessmentOptionIcon(field.id, id) }));
            return <div key={field.id} className="grid min-w-0 gap-2 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"><dt className="break-words text-sm text-muted-foreground">{field.label}{field.required && " *"}</dt><dd className={`min-w-0 break-words ${error ? "text-destructive" : ""}`}>{visualChoices.some(choice => choice.icon) ? <span className="flex flex-wrap gap-2">{visualChoices.map(choice => <span key={choice.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-sm font-medium">{choice.icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5" aria-hidden="true">{choice.icon}</span>}<span className="break-words">{choice.label}</span></span>)}</span> : <>{display}{field.unit && !empty && ` ${field.unit}`}</>}{error && error !== "Required" && <p className="text-sm">{error}</p>}</dd></div>;
          })}</dl>)}
        {step && record.manifest.sections.some(section => section.id === step.id) && <p className="text-xs text-muted-foreground">{coverage.sections.find(section => section.id === step.id)?.answered ?? 0}/{coverage.sections.find(section => section.id === step.id)?.total ?? 0} answers provided</p>}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={!!step && reviewed.includes(step.id)} disabled={busy} onChange={event => markReviewed(event.target.checked)}/><span>I have reviewed this section.</span></label>
      </div>}
      </section>
    </div>
    <div className="form-footer assessment-verification-footer">
      <Button variant="outline" isDisabled={busy} onPress={onClose}>Cancel</Button>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {stepIndex > 0 && <Button variant="outline" isDisabled={busy} onPress={() => { setConfirmed(false); setStepIndex(stepIndex - 1); }}><ArrowLeft aria-hidden="true"/>Back</Button>}
        {finalStep ? <Button isDisabled={busy || !allReviewed || !confirmed} onPress={() => { void onSubmit(reviewed); }}>{busy ? "Submitting…" : "Confirm and request score"}<ArrowRight aria-hidden="true"/></Button>
          : <Button isDisabled={busy || !step || !reviewed.includes(step.id)} onPress={() => setStepIndex(stepIndex + 1)}>Next<ArrowRight aria-hidden="true"/></Button>}
      </div>
    </div>
  </Dialog>;
}
