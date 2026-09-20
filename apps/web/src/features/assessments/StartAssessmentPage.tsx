import type { AuthenticatedUser, Facility, Patient, AssessmentInitialization } from "@niq/application-contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getPatient, listFacilities, listPatients } from "@/lib/api";
import { assessmentRequest, initializeAssessment, retryInitialization } from "./workflow-api";

export function filterAssessmentPatients(patients: Patient[], facility: string, query: string): Patient[] {
  const search = query.trim().toLowerCase();
  return patients.filter(patient => (!facility || patient.homeFacility?.id === facility)
    && `${patient.displayName} ${patient.reference} ${patient.medicalRecordNumber ?? ""}`.toLowerCase().includes(search));
}

function preparationMessage(value: AssessmentInitialization): string {
  if (value.failureCode === "SCORING_NOT_CONFIGURED") return "Connect NIQ Scoring before starting this assessment.";
  if (value.failureCode === "UNSUPPORTED_QUESTIONNAIRE" || value.failureCode === "QUESTIONNAIRE_UNSUPPORTED") return "The scoring questionnaire is not supported. Ask your administrator to check the assigned questionnaire.";
  if (value.failureCode) return `Questionnaire preparation failed (${value.failureCode}). Retry uses the same assessment request.`;
  return "The questionnaire is not ready yet. Retry uses this same assessment request.";
}

export function StartAssessmentPage() {
  const user = useOutletContext<AuthenticatedUser>();
  return <ScopedStartAssessmentPage key={`${user.organizationId}:${user.userId}`} user={user} />;
}

function ScopedStartAssessmentPage({ user }: { user: AuthenticatedUser }) {
  const [params, setParams] = useSearchParams();
  // A URL patient is only a candidate; the server authorizes it before creating a draft.
  const requestedPatient = params.get("patient");
  const recoveryId = params.get("initialization");
  const recoveryKey = params.get("requestKey");
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [facility, setFacility] = useState("");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [initialization, setInitialization] = useState<AssessmentInitialization | null>(null);
  const request = useRef({ patientId: requestedPatient ?? "", key: recoveryKey ?? crypto.randomUUID() });
  const inFlight = useRef(false);
  const lifecycle = useRef(0);
  useEffect(() => () => { lifecycle.current += 1; }, []);
  const autoAttempted = useRef(false);
  const [loadKey, setLoadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(false); setError(""); setSelected(null); setInitialization(null);
    const load = requestedPatient
      ? getPatient(user.organizationId, requestedPatient).then(patient => { if (active) setSelected(patient); })
      : Promise.all([listPatients(user.organizationId), listFacilities(user.organizationId)]).then(([rows, branches]) => { if (active) { setPatients(rows); setFacilities(branches); } });
    const recovery = recoveryId
      ? assessmentRequest<AssessmentInitialization>(user.organizationId, `/assessment-initializations/${encodeURIComponent(recoveryId)}`).then(value => {
        if (!active) return;
        setInitialization(value);
        if (!value.assessmentId) setError(preparationMessage(value));
        if (value.assessmentId) navigate(`/assessments/${value.assessmentReference ?? value.assessmentId}`, { replace: true });
      })
      : Promise.resolve();
    Promise.all([load, recovery]).then(() => { if (active) setLoaded(true); }).catch(() => { if (active) setError("The patient or assessment request could not be loaded. Check your access and try again."); });
    return () => { active = false; };
  }, [user.organizationId, requestedPatient, recoveryId, loadKey, navigate]);
  const filtered = useMemo(() => filterAssessmentPatients(patients, facility, query), [patients, facility, query]);
  async function start() {
    if (!selected || inFlight.current) return;
    const activeLifecycle = lifecycle.current;
    autoAttempted.current = true;
    inFlight.current = true; setBusy(true); setError("");
    if (request.current.patientId !== selected.id) request.current = { patientId: selected.id, key: crypto.randomUUID() };
    // Store opaque recovery identifiers before I/O. A refresh/lost response must replay the same creation key.
    const query = new URLSearchParams(params);
    query.set("patient", selected.id); query.set("requestKey", request.current.key);
    setParams(query, { replace: true });
    try {
      const result = initialization
        ? await retryInitialization(user.organizationId, initialization.id)
        : await initializeAssessment(user.organizationId, selected.id, request.current.key);
      // The server may have completed after cancellation, navigation or a scope switch.
      // Keep that persisted request recoverable without moving the user back into it.
      if (lifecycle.current !== activeLifecycle) return;
      setInitialization(result);
      query.set("initialization", result.id);
      setParams(query, { replace: true });
      if (result.assessmentId) navigate(`/assessments/${result.assessmentReference ?? result.assessmentId}`, { replace: true });
      else setError(preparationMessage(result));
    } catch (cause) {
      if (lifecycle.current === activeLifecycle) setError(cause instanceof Error ? cause.message : "Could not start assessment.");
    } finally {
      if (lifecycle.current === activeLifecycle) { inFlight.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    // The patient-page action already expressed intent. Only the first authorized load
    // starts automatically; a failed/pending request always requires an explicit retry.
    if (requestedPatient && loaded && selected && !recoveryId && !autoAttempted.current && !inFlight.current) {
      autoAttempted.current = true;
      void start();
    }
  }, [requestedPatient, loaded, selected, recoveryId]);
  const content = <>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">{error}</div>}
    {!loaded ? <div className="grid gap-3"><p>Loading patient information…</p>{error && <Button variant="outline" onPress={() => setLoadKey(key => key + 1)}>Retry</Button>}</div> : <>
      {!requestedPatient && <><label className="grid gap-2">Facility<select className="h-10 rounded-lg border border-input bg-background px-3" value={facility} disabled={busy || !!initialization} onChange={event => { setFacility(event.target.value); setSelected(null); }}><option value="">All accessible facilities</option>{facilities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2">Find patient<Input className="h-10" value={query} disabled={busy || !!initialization} onChange={event => setQuery(event.target.value)} placeholder="Name, patient reference or MRN" /></label>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border" role="radiogroup" aria-label="Patient">{filtered.length ? filtered.map(patient => <label key={patient.id} className="flex cursor-pointer items-center gap-3 border-b border-border p-3 last:border-b-0 has-checked:bg-primary/10"><input type="radio" name="assessment-patient" checked={selected?.id === patient.id} disabled={busy || !!initialization} onChange={() => setSelected(patient)} className="accent-primary" /><span><strong className="block">{patient.displayName}</strong><span className="text-sm text-muted-foreground">{patient.reference}{patient.medicalRecordNumber ? ` · MRN ${patient.medicalRecordNumber}` : ""} · {patient.homeFacility?.name ?? "No facility"}</span></span></label>) : <p className="p-4 text-muted-foreground">No matching patients.</p>}</div></>}
      {requestedPatient && selected && <div><h2 className="font-semibold">{selected.displayName}</h2><p className="text-muted-foreground">{selected.reference} · {selected.homeFacility?.name}</p></div>}
      <div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => navigate(requestedPatient && selected ? `/patients/${selected.reference}` : "/assessments", { replace: true })}>Cancel</Button><Button isDisabled={!selected || busy} onPress={start}>{busy ? "Preparing questionnaire…" : initialization ? "Retry preparation" : "Start assessment"}</Button></div>
    </>}
  </>;
  if (requestedPatient) return <section className="mx-auto grid max-w-xl gap-5 rounded-xl border border-border bg-card p-6"><h1 className="text-2xl font-semibold">New assessment</h1>{content}</section>;
  return <><h1 className="patient-page-title">New assessment</h1><Dialog isOpen isDismissable={!busy} onOpenChange={open => { if (!open && !busy) navigate("/assessments", { replace: true }); }} className="sm:max-w-xl max-h-[90dvh] overflow-y-auto" ariaLabel="Select patient"><DialogTitle>Select patient</DialogTitle>{content}</Dialog></>;
}
