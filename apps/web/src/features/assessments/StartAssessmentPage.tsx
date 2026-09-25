import { hasPermission } from "@niq/application-contracts";
import type { AuthenticatedUser, Facility, Patient, AssessmentInitialization } from "@niq/application-contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchCombobox } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientForm, type PatientFormHandle } from "@/components/PatientForm";
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
  if (!hasPermission(user.role, "assessments.edit")) return <Navigate to="/assessments" replace />;
  return <ScopedStartAssessmentPage key={`${user.organizationId}:${user.userId}`} user={user} />;
}

function ScopedStartAssessmentPage({ user }: { user: AuthenticatedUser }) {
  const [params, setParams] = useSearchParams();
  // URL changes during preparation must not reset the on-page selection or form.
  const entry = useRef({ patient: params.get("patient"), initialization: params.get("initialization"), requestKey: params.get("requestKey") }).current;
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [facility, setFacility] = useState("");
  const [mode, setMode] = useState<"select" | "create">("select");
  const [committed, setCommitted] = useState(Boolean(entry.patient && (entry.requestKey || entry.initialization)));
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState("");
  const [initialization, setInitialization] = useState<AssessmentInitialization | null>(null);
  const request = useRef({ patientId: entry.patient ?? "", key: entry.requestKey ?? crypto.randomUUID() });
  const inFlight = useRef(false);
  const patientForm = useRef<PatientFormHandle>(null);
  const lifecycle = useRef(0);
  useEffect(() => () => { lifecycle.current += 1; }, []);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoaded(false); setLoadFailed(false); setError("");
    const candidate = entry.patient ? getPatient(user.organizationId, entry.patient) : Promise.resolve(null);
    const recovery = entry.initialization
      ? assessmentRequest<AssessmentInitialization>(user.organizationId, `/assessment-initializations/${encodeURIComponent(entry.initialization)}`)
      : Promise.resolve(null);
    Promise.all([listPatients(user.organizationId), listFacilities(user.organizationId), candidate, recovery]).then(([rows, branches, patient, saved]) => {
      if (!active) return;
      setPatients(patient && !rows.some(item => item.id === patient.id) ? [patient, ...rows] : rows);
      setFacilities(branches);
      if (branches.length <= 1) setFacility("");
      setSelected(patient);
      setInitialization(saved);
      if (saved?.assessmentId) { navigate(`/assessments/${saved.assessmentReference ?? saved.assessmentId}`, { replace: true }); return; }
      if (saved) setError(preparationMessage(saved));
      setLoaded(true);
    }).catch(() => { if (active) { setError("The patient or assessment request could not be loaded. Check your access and try again."); setLoadFailed(true); setLoaded(true); } });
    return () => { active = false; };
  }, [user.organizationId, entry.patient, entry.initialization, loadKey, navigate]);

  const filtered = useMemo(() => filterAssessmentPatients(patients, facility, ""), [patients, facility]);
  const onlyFacility = facilities.length === 1 ? facilities[0] : null;
  async function start(patient: Patient) {
    if (inFlight.current) return;
    const activeLifecycle = lifecycle.current;
    inFlight.current = true;
    setBusy(true); setError(""); setCommitted(true); setSelected(patient); setMode("select");
    if (request.current.patientId !== patient.id) request.current = { patientId: patient.id, key: crypto.randomUUID() };
    // Save the patient and idempotency key before I/O, so an uncertain response
    // can be retried without creating a second assessment.
    const query = new URLSearchParams(params);
    query.set("patient", patient.id); query.set("requestKey", request.current.key);
    setParams(query, { replace: true });
    try {
      const result = initialization
        ? await retryInitialization(user.organizationId, initialization.id)
        : await initializeAssessment(user.organizationId, patient.id, request.current.key);
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

  const canCreatePatient = hasPermission(user.role, "patients.create");
  const exitPath = entry.patient && selected ? `/patients/${selected.reference}` : "/assessments";
  function exit() {
    if (mode === "create") patientForm.current?.requestExit();
    else navigate(exitPath, { replace: true });
  }
  return <div className="assessment-workflow @container">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">New assessment</h1><p className="mt-1 text-sm text-muted-foreground">Select a patient and press Continue, or create one to open the questionnaire.</p></div><Button variant="outline" isDisabled={busy || formBusy} onPress={exit}>Exit</Button></header>
    <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Patient selection">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">{mode === "create" ? "Create patient" : "Select patient"}</h2></div>
      {error && <div role="alert" className="m-5 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div>}
      {!loaded ? <div className="p-5 text-sm text-muted-foreground">Loading patient information…</div> : loadFailed ? <div className="p-5"><Button variant="outline" onPress={() => setLoadKey(key => key + 1)}>Retry loading</Button></div> : mode === "create" ?
        <PatientForm ref={patientForm} organizationId={user.organizationId} facilities={facilities} submitLabel="Create patient & continue" cancelLabel="Choose existing patient" onCancel={() => setMode("select")} onExit={() => navigate(exitPath, { replace: true })} onBusyChange={setFormBusy} onSaved={patient => { setFormBusy(false); setPatients(current => [patient, ...current]); void start(patient); }} />
        : <>
          <div className="clinical-form grid gap-5 p-5">
            {committed && selected ? <div><p className="text-sm text-muted-foreground">Patient for this assessment</p><p className="mt-1 font-medium">{selected.displayName} · {selected.reference}</p><p className="text-sm text-muted-foreground">{selected.homeFacility?.name ?? "No facility"}</p></div> : <>
              {onlyFacility ? <Field><FieldLabel>Facility</FieldLabel><p className="rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">{onlyFacility.name}</p></Field> : <Field><FieldLabel>Facility</FieldLabel><Select aria-label="Facility" selectedKey={facility || "all"} isDisabled={busy} onSelectionChange={key => { setFacility(key === "all" ? "" : String(key)); setSelected(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All accessible facilities</SelectItem>{facilities.map(item => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>}
              <Field><FieldLabel htmlFor="assessment-patient">Patient</FieldLabel><SearchCombobox id="assessment-patient" label="Patient" value={selected?.id ?? null} disabled={busy} placeholder="Search name, patient reference or MRN" options={filtered.map(patient => ({ id: patient.id, label: `${patient.displayName} · ${patient.reference}${patient.medicalRecordNumber ? ` · MRN ${patient.medicalRecordNumber}` : ""} · ${patient.homeFacility?.name ?? "No facility"}` }))} onChange={id => setSelected(filtered.find(patient => patient.id === id) ?? null)} /></Field>
              {canCreatePatient && <Button variant="outline" className="w-fit" onPress={() => setMode("create")}>Create new patient</Button>}
            </>}
          </div>
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3">
            <Button isDisabled={!selected || busy} onPress={() => { if (selected) void start(selected); }}>{busy ? "Preparing questionnaire…" : committed ? "Retry preparation" : "Continue"}<ArrowRight aria-hidden="true"/></Button>
          </footer>
        </>}
    </section>
  </div>;
}
