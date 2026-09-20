import { getAssessmentCompletion, validateAssessmentAnswers, type AssessmentWorkflow, type AuthenticatedUser, type FormAnswers } from "@niq/application-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssessmentFields } from "./AssessmentFields";
import { AssessmentSectionNavigation } from "./AssessmentSectionNavigation";
import { AssessmentReview } from "./AssessmentReview";
import { AssessmentResult } from "./AssessmentResult";
import { AssessmentReports } from "./AssessmentReports";
import { useDraftNavigationGuard } from "./useDraftNavigationGuard";
import { assessmentRequest, AssessmentRequestError, getAssessment, retryAssessmentScoring, saveAssessment, submitAssessment } from "./workflow-api";

export function AssessmentEditorPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { assessmentId = "" } = useParams();
  // Remounting prevents a patient/org switch from retaining another patient's in-memory answers.
  return <AssessmentEditor key={`${user.userId}:${user.organizationId}:${assessmentId}`} organizationId={user.organizationId} assessmentId={assessmentId} />;
}
function AssessmentEditor({ organizationId, assessmentId }: { organizationId: string; assessmentId: string }) {
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
  const [notice, setNotice] = useState("");
  const dirty = !!record && JSON.stringify(answers) !== JSON.stringify(record.answers);
  const editable = record?.status === "DRAFT";
  useDraftNavigationGuard(dirty || reportDirty || reportBusy);
  const accept = useCallback((value: AssessmentWorkflow) => { setRecord(value); setAnswers(value.answers); setConflict(false); }, []);
  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof AssessmentRequestError && cause.status === 401) {
      setAnswers({}); setRecord(null); window.location.assign("/sign-in"); return;
    }
    if (cause instanceof AssessmentRequestError && cause.status === 409) setConflict(true);
    setError(cause instanceof Error ? cause.message : "Could not save assessment. Your changes are still on this page.");
  }, []);
  const reload = useCallback(async () => { const value = await getAssessment(organizationId, assessmentId); accept(value); }, [organizationId, assessmentId, accept]);
  useEffect(() => {
    let active = true;
    getAssessment(organizationId, assessmentId).then(value => { if (active) accept(value); }).catch(cause => { if (active) handleError(cause); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, assessmentId, accept, handleError]);
  async function persist(): Promise<AssessmentWorkflow | null> {
    if (!record || !editable || conflict || operation.current) return null;
    const invalid = validateAssessmentAnswers(record.manifest, answers);
    setErrors(invalid);
    if (Object.keys(invalid).length) { setError("Correct invalid values before saving. Incomplete fields can be saved in a draft."); return null; }
    if (!dirty) return record;
    operation.current = true; setBusy(true); setError("");
    try {
      const value = await saveAssessment(organizationId, assessmentId, record.revision, answers);
      accept(value); setNotice("Draft saved"); return value;
    } catch (cause) { handleError(cause); return null; }
    finally { operation.current = false; setBusy(false); }
  }
  async function selectSection(id: string, save = false) {
    if (busy || reportBusy) return;
    if (reportDirty && !window.confirm("Discard unsaved report details?")) return;
    if (save && editable && dirty && !await persist()) return;
    setReportDirty(false); setSectionId(id); setError("");
    requestAnimationFrame(() => document.getElementById("assessment-section-heading")?.focus());
  }
  async function submit() {
    if (!record || busy || reportBusy || reportDirty || conflict) return;
    const invalid = validateAssessmentAnswers(record.manifest, answers, { requireComplete: true });
    setErrors(invalid);
    if (Object.keys(invalid).length) { setError("Complete required fields before requesting a score."); return; }
    const saved = await persist(); if (!saved) return;
    operation.current = true; setBusy(true); setError("");
    try { accept(await submitAssessment(organizationId, assessmentId, saved.revision)); setNotice("Assessment submitted"); }
    catch (cause) {
      handleError(cause);
      // Submission can be accepted before the response is lost. Reload the durable state before allowing another action.
      try { await reload(); } catch { setConflict(true); }
    } finally { operation.current = false; setBusy(false); }
  }
  async function retry() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try { accept(await retryAssessmentScoring(organizationId, assessmentId)); }
    catch (cause) { handleError(cause); }
    finally { operation.current = false; setBusy(false); }
  }
  async function updateContact() {
    if (!record || !phone.trim() || operation.current) return;
    if (dirty && !await persist()) return;
    setBusy(true); operation.current = true; setError("");
    try { await assessmentRequest(organizationId, `/patients/${record.patientId}/contact`, "PATCH", { phone: phone.trim() }); await reload(); setPhone(""); setNotice("Patient contact updated"); }
    catch (cause) { handleError(cause); }
    finally { operation.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">Loading assessment…</p>;
  if (!record) return <div className="grid gap-4"><h1 className="text-2xl font-semibold">Assessment unavailable</h1><p role="alert">{error || "This assessment could not be found."}</p><Button onPress={() => { setError(""); void reload().catch(handleError); }}>Retry</Button><Link to="/assessments">Back to assessments</Link></div>;
  const progress = getAssessmentCompletion(record.manifest, answers);
  const tabs = [...record.manifest.sections.map(section => ({ id: section.id, title: section.title })), { id: "reports", title: "Reports" }, { id: "review", title: "Review & score" }];
  const section = record.manifest.sections.find(item => item.id === sectionId);
  const index = tabs.findIndex(tab => tab.id === sectionId);
  const locked = busy || reportBusy || conflict;
  return <div className="assessment-workflow">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><Link className="text-sm text-primary" to={`/patients/${record.patient.reference}`}>{record.patient.reference}</Link><h1 className="mt-1 text-2xl font-semibold">{record.patient.displayName}</h1><p className="mt-1 text-sm text-muted-foreground">{record.patient.homeFacility?.name} · Assessment · {record.status.replaceAll("_", " ").toLowerCase()}</p></div><Button variant="outline" isDisabled={!editable || locked || !dirty} onPress={() => { void persist(); }}>{busy ? "Saving…" : "Save draft"}</Button></div>
    <div className="sticky top-0 z-10 mb-5 rounded-xl border border-border bg-background p-4 shadow-sm"><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{progress.percent ?? "—"}% complete</strong><span className="text-muted-foreground" role="status">{dirty ? "Unsaved changes" : notice || `Saved ${new Date(record.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} · {progress.answered}/{progress.required} required</span></div><div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Required questionnaire completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent ?? 0}><div className="h-full bg-primary transition-all" style={{ width: `${progress.percent ?? 0}%` }} /></div></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 p-4"><p>{error}</p>{conflict && <Button className="mt-2" variant="outline" onPress={() => { if (window.confirm("Load the saved assessment and discard local changes?")) { setError(""); void reload().catch(handleError); } }}>Load saved version</Button>}</div>}
    {Object.keys(errors).length > 0 && <div className="mb-4 rounded-lg border border-destructive/30 p-4"><strong>Check these fields</strong><ul className="mt-2 list-inside list-disc">{Object.entries(errors).map(([id, message]) => { const owner = record.manifest.sections.find(item => item.fields.some(field => field.id === id)); const field = owner?.fields.find(item => item.id === id); return <li key={id}><button className="text-primary underline" onClick={() => { if (owner) { setSectionId(owner.id); requestAnimationFrame(() => document.getElementById(`assessment-field-${id}`)?.focus()); } }}>{field?.label ?? "Questionnaire"}: {message}</button></li>; })}</ul></div>}
    {!editable && !record.result && <div className="mb-5 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">{record.status === "SCORING_PENDING" ? "Scoring result pending" : "Scoring needs attention"}</h2><p className="my-2 text-sm text-muted-foreground">The submitted assessment is preserved. Retry checks the same scoring request.</p><Button variant="outline" isDisabled={busy} onPress={retry}>Retry scoring</Button></div>}
    {record.result !== null && <div className="mb-5"><AssessmentResult record={record} onSection={id => { void selectSection(id); }} /></div>}
    <div className="grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"><AssessmentSectionNavigation tabs={tabs} selected={sectionId} progress={progress} disabled={locked} onSelect={id => { void selectSection(id); }} />
      <div className="min-w-0"><h2 id="assessment-section-heading" tabIndex={-1} className="mb-4 text-xl font-semibold outline-none">{tabs[index]?.title}</h2>
        {sectionId === "personal_details" && <><div className="mb-4 rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">Face scan</h3><p className="mt-1 text-sm text-muted-foreground">Face scanning is not available yet. Enter height and weight below.</p></div>{record.heightSource && <p className="mb-4 text-sm text-muted-foreground">Height copied from assessment on {new Date(record.heightSource.recordedAt).toLocaleDateString()}. Check and edit it if needed.</p>}{editable && !answers.contact && <div className="mb-4 grid gap-3 rounded-lg border border-border p-4"><p>The patient profile needs a contact number before submission.</p><label className="grid gap-2">Patient phone number<Input type="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={locked} /></label><Button variant="outline" isDisabled={locked || !phone.trim()} onPress={updateContact}>Update patient profile</Button></div>}</>}
        {section && <section className="rounded-xl border border-border bg-card p-5"><AssessmentFields section={section} answers={answers} errors={errors} readOnly={!editable || locked} onChange={(id, value) => { setAnswers(current => ({ ...current, [id]: value })); setNotice(""); setErrors(current => { const next = { ...current }; delete next[id]; return next; }); }} /></section>}
        {sectionId === "reports" && <AssessmentReports organizationId={organizationId} assessmentId={assessmentId} revision={record.revision} reports={record.reports} readOnly={!editable || busy || conflict} onChanged={async () => { const value = await getAssessment(organizationId, assessmentId); setRecord(value); }} onBusyChange={setReportBusy} onDirtyChange={setReportDirty} />}
        {sectionId === "review" && <><AssessmentReview record={record} answers={answers} onSection={id => { void selectSection(id); }} />{editable && <div className="mt-5 rounded-xl border border-border bg-card p-5"><p className="mb-4 text-sm text-muted-foreground">Submitting locks this set of responses and attached reports for scoring.</p><Button isDisabled={locked || reportDirty || progress.percent !== 100} onPress={submit}>Submit and request score</Button></div>}</>}
        <div className="mt-5 flex justify-between gap-3"><Button variant="outline" isDisabled={index <= 0 || locked} onPress={() => { void selectSection(tabs[index - 1]!.id); }}>Back</Button>{index < tabs.length - 1 && <Button isDisabled={locked} onPress={() => { void selectSection(tabs[index + 1]!.id, true); }}>{editable ? "Save & continue" : "Continue"}</Button>}</div>
      </div>
    </div>
  </div>;
}
