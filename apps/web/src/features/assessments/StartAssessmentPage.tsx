import { hasPermission, registerPatientSchema, type AssessmentInitialization, type AuthenticatedUser, type Facility, type FormAnswer, type Patient } from "@niq/application-contracts";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchCombobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientGenderIcon } from "@/components/PatientGenderIcon";
import { useUnsavedFormClose } from "@/components/useUnsavedFormClose";
import { getPatient, listFacilities, listPatients, registerPatient } from "@/lib/api";
import { patientAgeLabel, todayDate } from "@/lib/patient-display";
import { AssessmentBmiCard } from "./AssessmentBmiCard";
import { AssessmentMeasurementInput, AssessmentMeasurementUnitControl } from "./AssessmentMeasurementInput";
import { assessmentSectionIcons } from "./AssessmentSectionNavigation";
import { metricUnits, type MeasurementUnits } from "./measurement-units";
import { assessmentRequest, getAssessment, initializeAssessment, retryInitialization, saveAssessment } from "./workflow-api";

const steps = [
  ["personal_details", "Personal details"], ["face_scan", "Face scan"], ["disease_status", "Disease status"],
  ["treatment", "Treatment"], ["health_history", "Health history"], ["clinical_gut_health", "Clinical & gut"],
  ["dietary_details", "Diet"], ["reports", "Attachments"], ["review", "Review & score"],
] as const;

type NewPatientDetails = { name: string; medicalRecordNumber: string; homeFacilityId: string; dateOfBirth: string; gender: Patient["gender"] | null; phone: string; email: string };
const emptyPatient: NewPatientDetails = { name: "", medicalRecordNumber: "", homeFacilityId: "", dateOfBirth: "", gender: null, phone: "", email: "" };
type FieldErrorKey = keyof NewPatientDetails | "patient" | "height_cm" | "current_weight_kg";

function preparationMessage(value: AssessmentInitialization): string {
  if (value.failureCode === "SCORING_NOT_CONFIGURED") return "Connect NIQ Scoring before starting this assessment.";
  if (value.failureCode === "UNSUPPORTED_QUESTIONNAIRE" || value.failureCode === "QUESTIONNAIRE_UNSUPPORTED") return "The scoring questionnaire is not supported. Ask your administrator to check the assigned questionnaire.";
  if (value.failureCode) return `Questionnaire preparation failed (${value.failureCode}). Retry uses the same assessment request.`;
  return "The questionnaire is not ready yet. Retry uses this same assessment request.";
}

function validMeasurement(value: FormAnswer | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function StartAssessmentPage() {
  const user = useOutletContext<AuthenticatedUser>();
  if (!hasPermission(user.role, "assessments.create")) return <Navigate to="/assessments" replace />;
  return <ScopedStartAssessmentPage key={`${user.organizationId}:${user.userId}`} user={user} />;
}

function ScopedStartAssessmentPage({ user }: { user: AuthenticatedUser }) {
  const [params, setParams] = useSearchParams();
  const entry = useRef({ patient: params.get("patient"), initialization: params.get("initialization"), requestKey: params.get("requestKey") }).current;
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState<NewPatientDetails>(emptyPatient);
  const [creating, setCreating] = useState(false);
  const [measurements, setMeasurements] = useState<{ height_cm: FormAnswer; current_weight_kg: FormAnswer }>(() => {
    try { return JSON.parse(sessionStorage.getItem(`niq:start-assessment:${entry.requestKey}`) ?? "null") ?? { height_cm: null, current_weight_kg: null }; }
    catch { return { height_cm: null, current_weight_kg: null }; }
  });
  const [units, setUnits] = useState<MeasurementUnits>(metricUnits);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [initialization, setInitialization] = useState<AssessmentInitialization | null>(null);
  const request = useRef({ patientId: entry.patient ?? "", key: entry.requestKey ?? crypto.randomUUID() });
  const inFlight = useRef(false);
  const lifecycle = useRef(0);
  useEffect(() => () => { lifecycle.current += 1; }, []);
  const [loadKey, setLoadKey] = useState(0);
  const { requestClose, confirmation } = useUnsavedFormClose({
    subject: "assessment", onClose: () => navigate("/assessments"), isBusy: () => inFlight.current,
    isDirty: () => Object.values(newPatient).some(Boolean) || measurements.height_cm !== null || measurements.current_weight_kg !== null || !!selected && selected.id !== entry.patient,
  });

  useEffect(() => {
    let active = true;
    setLoaded(false); setLoadFailed(false); setError("");
    const candidate = entry.patient ? getPatient(user.organizationId, entry.patient) : Promise.resolve(null);
    const recovery = entry.initialization
      ? assessmentRequest<AssessmentInitialization>(user.organizationId, `/assessment-initializations/${encodeURIComponent(entry.initialization)}`)
      : Promise.resolve(null);
    Promise.all([listPatients(user.organizationId), listFacilities(user.organizationId), candidate, recovery]).then(([rows, branches, patient, saved]) => {
      if (!active) return;
      setPatients(patient ? [patient, ...rows.filter(item => item.id !== patient.id)] : rows);
      setFacilities(branches);
      setSelected(patient);
      setInitialization(saved);
      if (saved && !saved.assessmentId) setError(preparationMessage(saved));
      setLoaded(true);
    }).catch(() => { if (active) { setError("Patient or assessment information could not be loaded. Check your access and try again."); setLoadFailed(true); setLoaded(true); } });
    return () => { active = false; };
  }, [user.organizationId, entry.patient, entry.initialization, loadKey]);

  const canCreatePatient = hasPermission(user.role, "patients.create");
  const activeFacilities = facilities.filter(item => item.status === "ACTIVE");
  const lockedPatient = !!entry.requestKey && !!entry.patient;
  const patientReady = creating
    ? registerPatientSchema.safeParse({ ...newPatient, email: newPatient.email.trim() || undefined, homeFacilityId: newPatient.homeFacilityId || undefined }).success
    : !!selected;
  const ready = patientReady && validMeasurement(measurements.height_cm) && validMeasurement(measurements.current_weight_kg);
  const updateNewPatient = (key: keyof NewPatientDetails, value: string) => {
    setNewPatient(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: undefined }));
  };
  const updateMeasurement = (key: "height_cm" | "current_weight_kg", value: FormAnswer) => {
    setMeasurements(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: undefined }));
  };
  const clearMeasurements = () => {
    setMeasurements({ height_cm: null, current_weight_kg: null });
    setFieldErrors(current => ({ ...current, height_cm: undefined, current_weight_kg: undefined }));
  };
  const createNewPatient = (name: string) => {
    setNewPatient({ ...emptyPatient, name, homeFacilityId: activeFacilities.length === 1 ? activeFacilities[0]!.id : "" });
    setSelected(null); setCreating(true); setFieldErrors({}); clearMeasurements();
  };

  async function start() {
    if (inFlight.current) return;
    const nextErrors: Partial<Record<FieldErrorKey, string>> = {};
    if (!selected && !creating) nextErrors.patient = "Select a patient or create a new one.";
    let patientInput: ReturnType<typeof registerPatientSchema.safeParse> | null = null;
    if (creating) {
      patientInput = registerPatientSchema.safeParse({ ...newPatient, name: newPatient.name.trim(), medicalRecordNumber: newPatient.medicalRecordNumber.trim(), phone: newPatient.phone.trim(), email: newPatient.email.trim() || undefined, homeFacilityId: newPatient.homeFacilityId || undefined });
      if (!patientInput.success) for (const issue of patientInput.error.issues) {
        const key = issue.path[0] as keyof NewPatientDetails;
        nextErrors[key] = key === "dateOfBirth" ? "Enter a valid date of birth." : key === "phone" ? "Enter a mobile number using digits only." : `Enter ${key === "medicalRecordNumber" ? "a medical record number" : key === "homeFacilityId" ? "a facility" : key === "gender" ? "a gender" : key === "name" ? "a patient name" : "a valid email address"}.`;
      }
    }
    if (!validMeasurement(measurements.height_cm)) nextErrors.height_cm = "Enter a valid height.";
    if (!validMeasurement(measurements.current_weight_kg)) nextErrors.current_weight_kg = "Enter a valid current weight.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const activeLifecycle = lifecycle.current;
    inFlight.current = true; setBusy(true); setError("");
    let patient = selected;
    try {
      if (!patient) {
        // Keep the newly registered patient in state if questionnaire preparation needs a retry.
        patient = await registerPatient(user.organizationId, registerPatientSchema.parse(patientInput!.data));
        if (lifecycle.current !== activeLifecycle) return;
        setSelected(patient); setPatients(current => [patient!, ...current]); setCreating(false);
      }
      if (request.current.patientId !== patient.id) request.current = { patientId: patient.id, key: crypto.randomUUID() };
      const query = new URLSearchParams(params);
      query.set("patient", patient.id); query.set("requestKey", request.current.key);
      try { sessionStorage.setItem(`niq:start-assessment:${request.current.key}`, JSON.stringify(measurements)); } catch { /* Storage may be unavailable in private browsing. */ }
      setParams(query, { replace: true });
      const result = initialization?.assessmentId ? initialization : initialization
        ? await retryInitialization(user.organizationId, initialization.id)
        : await initializeAssessment(user.organizationId, patient.id, request.current.key);
      if (lifecycle.current !== activeLifecycle) return;
      setInitialization(result);
      query.set("initialization", result.id);
      setParams(query, { replace: true });
      if (!result.assessmentId) { setError(preparationMessage(result)); return; }
      const assessment = await getAssessment(user.organizationId, result.assessmentId);
      if (lifecycle.current !== activeLifecycle) return;
      if (assessment.answers.height_cm !== measurements.height_cm || assessment.answers.current_weight_kg !== measurements.current_weight_kg) {
        await saveAssessment(user.organizationId, assessment.id, assessment.revision, { ...assessment.answers, ...measurements });
      }
      if (lifecycle.current !== activeLifecycle) return;
      try { sessionStorage.removeItem(`niq:start-assessment:${request.current.key}`); } catch { /* The assessment is saved already. */ }
      navigate(`/assessments/${result.assessmentReference ?? result.assessmentId}`, { replace: true, state: { startAtFaceScan: true } });
    } catch (cause) {
      if (lifecycle.current === activeLifecycle) setError(cause instanceof Error ? cause.message : "Could not create the assessment. Please try again.");
    } finally {
      if (lifecycle.current === activeLifecycle) { inFlight.current = false; setBusy(false); }
    }
  }

  const patient = creating ? null : selected;
  const age = patient ? patientAgeLabel(patient.dateOfBirth) : newPatient.dateOfBirth ? patientAgeLabel(newPatient.dateOfBirth) : "—";
  const bmiAnswers = { ...measurements, age: Number.parseInt(age, 10) || null };
  const committed = !!initialization || lockedPatient;
  return <div className="assessment-workflow @container">
    <header className="mb-5"><h1 className="text-2xl font-semibold">New assessment</h1><p className="mt-1 text-sm text-muted-foreground">Complete personal details to create the assessment.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-card p-4 text-sm text-destructive">{error}</div>}
    {!loaded || loadFailed ? <section className="rounded-xl border border-border bg-card p-5">{!loaded ? <p role="status">Loading patient information…</p> : <Button variant="outline" onPress={() => setLoadKey(key => key + 1)}>Retry loading</Button>}<Button variant="outline" className="ml-2" onPress={requestClose}>Exit</Button></section> : <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid min-w-0 @min-[48rem]:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Assessment sections" className="min-w-0 border-b border-border bg-muted/20 p-4 @min-[48rem]:border-b-0 @min-[48rem]:border-r">
          {steps.map(([id, label]) => { const Icon = assessmentSectionIcons[id]; return <Button key={id} variant="ghost" className={`mb-1 h-12 w-full justify-start gap-2.5 rounded-lg px-3 text-left text-sm ${id === "personal_details" ? "assessment-active-step text-brand-ink font-semibold" : "text-muted-foreground"}`} aria-current={id === "personal_details" ? "step" : undefined} isDisabled={id !== "personal_details" || busy}><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">{label}</span></Button>; })}
        </nav>
        <section className="min-w-0 p-4 sm:p-6" aria-labelledby="start-personal-heading">
          <h2 id="start-personal-heading" className="mb-5 text-xl font-semibold">Personal details</h2>
          <div className="clinical-form assessment-start-form grid gap-5">
            <Field data-invalid={!!fieldErrors.patient || !!fieldErrors.name || undefined}>
              <FieldLabel htmlFor="assessment-patient" className="required-field-label">Patient name <span aria-hidden="true">*</span></FieldLabel>
              {committed && patient ? <p className="min-h-8 text-base font-medium">{patient.displayName} · {patient.reference}</p>
                : <SearchCombobox key={creating ? "creating" : "searching"} id="assessment-patient" label="Patient name" value={selected?.id ?? null} disabled={busy} placeholder="Search name, patient reference or MRN" inputValue={creating ? newPatient.name : undefined} onInputValueChange={creating ? name => updateNewPatient("name", name.slice(0, 200)) : undefined} options={patients.map(item => ({ id: item.id, label: `${item.displayName} · ${item.reference}${item.medicalRecordNumber ? ` · MRN ${item.medicalRecordNumber}` : ""} · ${item.homeFacility?.name ?? "No facility"}` }))} onChange={id => { if (selected?.id !== id) clearMeasurements(); setSelected(patients.find(item => item.id === id) ?? null); setCreating(false); setNewPatient(emptyPatient); setFieldErrors(current => ({ ...current, patient: undefined, name: undefined })); }} onCreate={canCreatePatient && !creating ? createNewPatient : undefined} createOptionLabel={name => `Create new patient “${name}”`} />}
              {fieldErrors.patient && <FieldError>{fieldErrors.patient}</FieldError>}
              {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
            </Field>
            {creating && <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!fieldErrors.medicalRecordNumber || undefined}><FieldLabel htmlFor="patient-mrn" className="required-field-label">Medical record number <span aria-hidden="true">*</span></FieldLabel><Input id="patient-mrn" value={newPatient.medicalRecordNumber} onChange={event => updateNewPatient("medicalRecordNumber", event.target.value)} maxLength={120} disabled={busy}/>{fieldErrors.medicalRecordNumber && <FieldError>{fieldErrors.medicalRecordNumber}</FieldError>}</Field>
              <Field data-invalid={!!fieldErrors.homeFacilityId || undefined}><FieldLabel className="required-field-label">Facility <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Patient facility" placeholder="Select facility" selectedKey={newPatient.homeFacilityId || null} onSelectionChange={key => updateNewPatient("homeFacilityId", String(key))} isDisabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{activeFacilities.map(item => <SelectItem key={item.id} id={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>{fieldErrors.homeFacilityId && <FieldError>{fieldErrors.homeFacilityId}</FieldError>}</Field>
              <Field data-invalid={!!fieldErrors.dateOfBirth || undefined}><FieldLabel htmlFor="patient-birth" className="required-field-label">Date of birth <span aria-hidden="true">*</span></FieldLabel><DateInput id="patient-birth" label="Date of birth" value={newPatient.dateOfBirth} onChange={value => updateNewPatient("dateOfBirth", value ?? "")} max={todayDate()} disabled={busy} invalid={!!fieldErrors.dateOfBirth}/>{fieldErrors.dateOfBirth && <FieldError>{fieldErrors.dateOfBirth}</FieldError>}</Field>
              <Field data-invalid={!!fieldErrors.gender || undefined}><FieldLabel className="required-field-label">Gender <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Gender" placeholder="Select gender" selectedKey={newPatient.gender} onSelectionChange={key => updateNewPatient("gender", String(key))} isDisabled={busy}><SelectTrigger id="patient-gender"><SelectValue /></SelectTrigger><SelectContent>{(["FEMALE", "MALE", "OTHER", "UNKNOWN"] as const).map(id => <SelectItem key={id} id={id} textValue={id[0] + id.slice(1).toLowerCase()}><span className="flex items-center gap-2"><PatientGenderIcon gender={id}/>{id[0] + id.slice(1).toLowerCase()}</span></SelectItem>)}</SelectContent></Select>{fieldErrors.gender && <FieldError>{fieldErrors.gender}</FieldError>}</Field>
              <Field data-invalid={!!fieldErrors.phone || undefined}><FieldLabel htmlFor="patient-phone" className="required-field-label">Mobile number <span aria-hidden="true">*</span></FieldLabel><Input id="patient-phone" type="tel" inputMode="numeric" value={newPatient.phone} onChange={event => updateNewPatient("phone", event.target.value.replace(/\D/g, ""))} maxLength={40} disabled={busy}/>{fieldErrors.phone && <FieldError>{fieldErrors.phone}</FieldError>}</Field>
              <Field data-invalid={!!fieldErrors.email || undefined}><FieldLabel htmlFor="patient-email">Email address (optional)</FieldLabel><Input id="patient-email" type="email" value={newPatient.email} onChange={event => updateNewPatient("email", event.target.value)} maxLength={320} disabled={busy}/>{fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}</Field>
            </div>}
            {creating && newPatient.dateOfBirth && <div><p className="text-sm text-muted-foreground">Age</p><p className="mt-1 font-medium">{age}</p></div>}
            {creating && !activeFacilities.length && <p role="alert" className="text-sm text-destructive">An active facility is required before registering a patient.</p>}
            {patient && <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2"><div><p className="text-sm text-muted-foreground">Age</p><p className="mt-1 font-medium">{age}</p></div><div><p className="text-sm text-muted-foreground">Gender</p><p className="mt-1 font-medium">{patient.gender ?? "Not provided"}</p></div><div><p className="text-sm text-muted-foreground">Contact number</p><p className="mt-1 font-medium">{patient.phone ?? "Not provided"}</p></div><div><p className="text-sm text-muted-foreground">Facility</p><p className="mt-1 font-medium">{patient.homeFacility?.name ?? "No facility"}</p></div></div>}
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              {([['height_cm', 'Height', 'height'], ['current_weight_kg', 'Current weight', 'weight']] as const).map(([key, label, kind]) => <Field key={key} data-invalid={!!fieldErrors[key] || undefined}><div className="flex min-h-9 flex-wrap items-center justify-between gap-2"><FieldLabel htmlFor={`assessment-field-${key}`} className="required-field-label">{label} <span aria-hidden="true">*</span></FieldLabel><AssessmentMeasurementUnitControl label={label} kind={kind} unit={kind === "height" ? units.height : units.weight} onUnitChange={unit => setUnits(current => ({ ...current, [kind]: unit }))} disabled={busy || !patientReady}/></div><AssessmentMeasurementInput key={`${key}-${kind === "height" ? units.height : units.weight}`} id={`assessment-field-${key}`} label={label} kind={kind} value={measurements[key]} unit={kind === "height" ? units.height : units.weight} onChange={value => updateMeasurement(key, value)} disabled={busy || !patientReady} invalid={!!fieldErrors[key]} required showQuickValues />{fieldErrors[key] && <FieldError>{fieldErrors[key]}</FieldError>}</Field>)}
            </div>
            <AssessmentBmiCard answers={bmiAnswers}/>
          </div>
        </section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5"><Button variant="outline" isDisabled={busy} onPress={requestClose}>Exit</Button><Button isDisabled={busy || !ready} onPress={() => void start()}>{busy ? "Creating assessment…" : "Continue"}<ArrowRight aria-hidden="true"/></Button></footer>
    </div>}
    {confirmation}
  </div>;
}
