import { clearInactiveAssessmentAnswers, getAssessmentCompletion, getAssessmentAnswerCoverage, validateAssessmentAnswers, type AssessmentWorkflow, type AuthenticatedUser, type FormAnswers } from "@niq/application-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { PatientHeader } from "@/components/PatientHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ScanFace } from "lucide-react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AssessmentFields } from "./AssessmentFields";
import { AssessmentSectionNavigation } from "./AssessmentSectionNavigation";
import { AssessmentReview } from "./AssessmentReview";
import { AssessmentResult } from "./AssessmentResult";
import { AssessmentReports } from "./AssessmentReports";
import { useDraftNavigationGuard } from "./useDraftNavigationGuard";
import { assessmentRequest, AssessmentRequestError, getAssessment, reconcileAssessmentScoring, retryAssessmentScoring, saveAssessment, submitAssessment } from "./workflow-api";

export function AssessmentEditorPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { assessmentId = "" } = useParams();
  // Remounting prevents a patient/org switch from retaining another patient's in-memory answers.
  return <AssessmentEditor key={`${user.userId}:${user.organizationId}:${assessmentId}`} organizationId={user.organizationId} assessmentId={assessmentId} isAdmin={user.role === "ORGANIZATION_ADMIN"} />;
}
function AssessmentEditor({ organizationId, assessmentId, isAdmin }: { organizationId: string; assessmentId: string; isAdmin: boolean }) {
  const [record, setRecord] = useState<AssessmentWorkflow | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [sectionId, setSectionId] = useState("personal_details");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportDirty, setReportDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [phone, setPhone] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const dirty = !!record && JSON.stringify(answers) !== JSON.stringify(record.answers);
  const editable = record?.status === "DRAFT";
  const navigationDialog = useDraftNavigationGuard(dirty || reportDirty || reportBusy || contactOpen && !!phone);
  const accept = useCallback((value: AssessmentWorkflow) => { setRecord(value); setAnswers(value.status === "DRAFT" ? clearInactiveAssessmentAnswers(value.manifest, value.answers) : value.answers); setConflict(false); }, []);
  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof AssessmentRequestError && cause.status === 401) {
      setAnswers({}); setRecord(null); window.location.assign("/sign-in"); return;
    }
    if (cause instanceof AssessmentRequestError && cause.status === 409 && /reload|changed|editable/i.test(cause.message)) setConflict(true);
    setError(cause instanceof Error ? cause.message : "Could not save assessment. Your changes are still on this page.");
  }, []);
  const reload = useCallback(async () => { const value = await getAssessment(organizationId, assessmentId); accept(value); }, [organizationId, assessmentId, accept]);
  useEffect(() => {
    let active = true;
    getAssessment(organizationId, assessmentId).then(value => { if (active) accept(value); }).catch(cause => { if (active) handleError(cause); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, assessmentId, accept, handleError]);
  const internalId = record?.id ?? assessmentId;
  async function refreshReports() {
    try {
      const value = await getAssessment(organizationId, assessmentId);
      // A report mutation advances the same revision as answers. Do not silently
      // adopt another editor's answer revision while retaining stale local answers.
      const serverAnswersChanged = !!record && JSON.stringify(value.answers) !== JSON.stringify(record.answers);
      if (dirty && (serverAnswersChanged || value.status !== "DRAFT")) {
        setConflict(true);
        setError("Saved answers changed while updating reports. Your local changes are preserved. Load the saved version before continuing.");
      } else if (!dirty) {
        setAnswers(value.status === "DRAFT" ? clearInactiveAssessmentAnswers(value.manifest, value.answers) : value.answers);
      }
      setRecord(value);
    } catch (cause) { handleError(cause); throw cause; }
  }
  async function persist(): Promise<AssessmentWorkflow | null> {
    if (!record || !editable || conflict || operation.current) return null;
    const invalid = validateAssessmentAnswers(record.manifest, answers);
    setErrors(invalid);
    if (Object.keys(invalid).length) { setError("Correct invalid values before saving. Incomplete fields can be saved in a draft."); return null; }
    if (!dirty) return record;
    operation.current = true; setBusy(true); setError("");
    try {
      const value = await saveAssessment(organizationId, internalId, record.revision, answers);
      accept(value); setNotice("Draft saved"); return value;
    } catch (cause) { handleError(cause); return null; }
    finally { operation.current = false; setBusy(false); }
  }
  async function selectSection(id: string, save = false, fieldId?: string) {
    if (busy || reportBusy) return;
    if (save && editable && dirty && !await persist()) return;
    setSectionId(id); setError("");
    requestAnimationFrame(() => (document.getElementById(fieldId ? `assessment-field-${fieldId}` : "assessment-section-heading") ?? document.getElementById("assessment-section-heading"))?.focus());
  }
  async function submit() {
    if (!record || busy || reportBusy || reportDirty || conflict) return;
    const invalid = validateAssessmentAnswers(record.manifest, answers, { requireComplete: true });
    setErrors(invalid);
    if (Object.keys(invalid).length) { setError("Complete required fields before requesting a score."); return; }
    const saved = await persist(); if (!saved) return;
    operation.current = true; setBusy(true); setError("");
    try { const submitted = await submitAssessment(organizationId, internalId, saved.revision); accept(submitted); setNotice(submitted.status === "DRAFT" ? "Scoring needs corrected answers" : "Assessment submitted"); }
    catch (cause) {
      handleError(cause);
      // Submission can be accepted before the response is lost. Reload the durable state before allowing another action.
      try { await reload(); } catch { setConflict(true); }
    } finally { operation.current = false; setBusy(false); }
  }
  async function retry(reconcile = false) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try { accept(await (reconcile ? reconcileAssessmentScoring : retryAssessmentScoring)(organizationId, internalId)); }
    catch (cause) { handleError(cause); }
    finally { operation.current = false; setBusy(false); }
  }
  async function updateContact() {
    if (!record || !phone.trim() || operation.current) return;
    if (dirty && !await persist()) return;
    setBusy(true); operation.current = true; setError("");
    try { await assessmentRequest(organizationId, `/patients/${record.patientId}/contact`, "PATCH", { phone: phone.trim() }); await reload(); setPhone(""); setContactOpen(false); setNotice("Patient contact updated"); }
    catch (cause) { handleError(cause); }
    finally { operation.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">Loading assessment…</p>;
  if (!record) return <div className="grid gap-4"><h1 className="text-2xl font-semibold">Assessment unavailable</h1><p role="alert">{error || "This assessment could not be found."}</p><Button onPress={() => { setError(""); void reload().catch(handleError); }}>Retry</Button><Link to="/assessments">Back to assessments</Link></div>;
  const progress = getAssessmentCompletion(record.manifest, answers);
  const coverage = getAssessmentAnswerCoverage(record.manifest, answers);
  const tabs = record.manifest.sections.flatMap(section => [{ id: section.id, title: section.title }, ...(section.id === "personal_details" ? [{ id: "face_scan", title: "Face scan" }] : [])]).concat([{ id: "reports", title: "Reports" }, { id: "review", title: "Review & score" }]);
  const sectionCoverage = coverage.sections.find(item => item.id === sectionId);
  const section = record.manifest.sections.find(item => item.id === sectionId);
  const index = tabs.findIndex(tab => tab.id === sectionId);
  const locked = busy || reportBusy || conflict;
  return <div className="assessment-workflow @container">
    <PatientHeader patient={record.patient} assessmentLabel={`${record.reference} · ${record.status === "DRAFT" ? "Draft" : record.status.replaceAll("_", " ").toLowerCase()} assessment`} action={<span className="text-xs text-muted-foreground" role="status">{dirty ? "Unsaved changes" : notice || `Saved ${new Date(record.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span>} />
    <div className="sticky top-0 z-20 rounded-t-xl border border-border bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"><div className="min-w-0 basis-full @min-[36rem]:flex-1 @min-[36rem]:basis-auto"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>Questionnaire <strong>{coverage.percent ?? "—"}% complete</strong></span><span className="text-xs text-muted-foreground">{coverage.answered}/{coverage.total} answered</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Overall questionnaire completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage.percent ?? 0}><div className="h-full bg-primary transition-all" style={{ width: `${coverage.percent ?? 0}%` }} /></div></div><Button variant="ghost" className="h-9 gap-2 text-xs text-muted-foreground" isDisabled={locked} onPress={() => { void selectSection("face_scan"); }}><ScanFace className="size-4" aria-hidden="true"/>Face scan unavailable</Button></div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{record.patient.displayName} · {record.patient.reference} <span className="mx-1">·</span> {progress.answered}/{progress.required} required answers complete</p>
    </div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 p-4"><p>{error}</p>{conflict && <Button className="mt-2" variant="outline" onPress={() => setDiscardOpen(true)}>Load saved version</Button>}</div>}
    {Object.keys(errors).length > 0 && <div className="mb-4 rounded-lg border border-destructive/30 p-4"><strong>Check these fields</strong><ul className="mt-2 list-inside list-disc">{Object.entries(errors).map(([id, message]) => { const owner = record.manifest.sections.find(item => item.fields.some(field => field.id === id)); const field = owner?.fields.find(item => item.id === id); return <li key={id}><button className="text-brand-ink underline" onClick={() => { if (owner) void selectSection(owner.id, false, id); }}>{field?.label ?? "Questionnaire"}: {message}</button></li>; })}</ul></div>}
    {record.submission?.status === "REJECTED" && <div role="alert" className="mb-5 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Review the questionnaire answers</h2><p className="mt-2 text-sm text-muted-foreground">Scoring could not process these responses. Add or correct answers before submitting again. The previous submission has been preserved.</p>{!!record.submission.issues?.length && <ul className="mt-3 grid gap-2">{record.submission.issues.map(issue => {
      const owner = record.manifest.sections.find(item => item.fields.some(field => field.id === issue.fieldId));
      const field = owner?.fields.find(item => item.id === issue.fieldId);
      return owner && field ? <li key={issue.fieldId}><Button variant="link" className="h-auto min-h-11 whitespace-normal text-left" onPress={() => { void selectSection(owner.id, false, field.id); }}>{field.label}: {issue.message}</Button></li> : null;
    })}</ul>}</div>}
    {!editable && !record.result && <div className="mb-5 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">{record.submission?.status === "RECONCILIATION_REQUIRED" ? "Administrator review needed" : record.status === "SCORING_PENDING" ? "Scoring result pending" : "Scoring needs attention"}</h2><p className="my-2 text-sm text-muted-foreground">{record.submission?.status === "RECONCILIATION_REQUIRED" ? "The scoring service has not confirmed this request. An organisation administrator must check it. Your submitted answers and reports remain preserved." : "The submitted assessment is preserved. Retry checks the same scoring request."}</p>{record.submission?.status === "RECONCILIATION_REQUIRED" ? isAdmin && <Button variant="outline" isDisabled={busy} onPress={() => { void retry(true); }}>Check original scoring request</Button> : <Button variant="outline" isDisabled={busy} onPress={() => { void retry(); }}>Retry scoring</Button>}</div>}
    {record.result !== null && <div className="mb-5"><AssessmentResult record={record} onSection={id => { void selectSection(id); }} /></div>}
    <div className="grid min-w-0 border-x border-border bg-card @min-[48rem]:grid-cols-[190px_minmax(0,1fr)]">
      <AssessmentSectionNavigation tabs={tabs} selected={sectionId} coverage={coverage} disabled={locked} onSelect={id => { void selectSection(id); }} />
      <div className="min-w-0 p-4 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 id="assessment-section-heading" tabIndex={-1} className="scroll-mt-40 text-xl font-semibold outline-none">{tabs[index]?.title}</h2>{sectionCoverage && <span className="text-xs text-muted-foreground">{sectionCoverage.answered}/{sectionCoverage.total} answered · {sectionCoverage.percent ?? 0}%</span>}</div>
        {sectionId === "personal_details" && record.heightSource && <p className="mb-4 text-sm text-muted-foreground">Height from assessment on {new Date(record.heightSource.recordedAt).toLocaleDateString()}. Check and edit if needed.</p>}
        {sectionId === "face_scan" && <section className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center"><ScanFace className="mb-4 size-8 text-brand-ink" aria-hidden="true"/><h3 className="font-semibold">Face scan is not available yet</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">You can continue with the questionnaire. Face scanning does not affect its completion.</p><Button variant="outline" className="mt-5" isDisabled={locked} onPress={() => { void selectSection("disease_status"); }}>Continue to disease status<ArrowRight aria-hidden="true"/></Button></section>}
        {section && <section><AssessmentFields section={section} answers={answers} errors={errors} readOnly={!editable || locked} onEditContact={() => { setPhone(typeof answers.contact === "string" ? answers.contact : ""); setContactOpen(true); }} onChange={(id, value) => { setAnswers(current => clearInactiveAssessmentAnswers(record.manifest, { ...current, [id]: value })); setNotice(""); setErrors(current => { const next = { ...current }; delete next[id]; return next; }); }} /></section>}
        <div hidden={sectionId !== "reports"}><AssessmentReports organizationId={organizationId} assessmentId={internalId} revision={record.revision} reports={record.reports} limits={record.reportLimits} readOnly={!editable || busy || conflict} onChanged={refreshReports} onBusyChange={setReportBusy} onDirtyChange={setReportDirty} /></div>
        {sectionId === "review" && <AssessmentReview record={record} answers={answers} onSection={(id, fieldId) => { void selectSection(id, false, fieldId); }} />}
      </div>
    </div>
    <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border border-border bg-card px-4 py-3 sm:px-5">
      <Button variant="outline" className="h-10" isDisabled={index <= 0 || locked} onPress={() => { void selectSection(tabs[index - 1]!.id); }}><ArrowLeft aria-hidden="true"/>Back</Button>
      <div className="flex flex-wrap gap-2">{editable && <Button variant="outline" className="h-10" isDisabled={locked || !dirty} onPress={() => { void persist(); }}>{busy ? "Saving…" : "Save draft"}</Button>}{index < tabs.length - 1 ? <Button className="h-10" isDisabled={locked} onPress={() => { void selectSection(tabs[index + 1]!.id, true); }}>Continue<ArrowRight aria-hidden="true"/></Button> : editable && <Button className="h-10" isDisabled={locked || reportDirty || progress.percent !== 100} onPress={submit}>Submit and request score<ArrowRight aria-hidden="true"/></Button>}</div>
    </footer>
    {contactOpen && <Dialog isOpen isDismissable={!busy} showCloseButton={!busy} ariaLabel="Update patient contact" onOpenChange={open => { if (!busy) setContactOpen(open); }}><DialogTitle>Patient contact</DialogTitle><p className="text-sm text-muted-foreground">This number is saved to the patient's profile.</p><form className="mt-4 grid gap-4" onSubmit={event => { event.preventDefault(); void updateContact(); }}><label className="grid gap-2 text-sm font-medium">Phone number<Input autoFocus type="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy}/></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => setContactOpen(false)}>Cancel</Button><Button type="submit" isDisabled={busy || !phone.trim()}>Save contact</Button></div></form></Dialog>}
    {navigationDialog}
    {discardOpen && <Dialog isOpen ariaLabel="Load saved assessment" onOpenChange={setDiscardOpen}><DialogTitle>Load saved assessment?</DialogTitle><p className="text-sm text-muted-foreground">Your local changes will be replaced with the saved answers.</p><div className="flex justify-end gap-2"><Button variant="outline" onPress={() => setDiscardOpen(false)}>Keep editing</Button><Button variant="destructive" onPress={() => { setDiscardOpen(false); setError(""); void reload().catch(handleError); }}>Load saved answers</Button></div></Dialog>}
  </div>;
}
