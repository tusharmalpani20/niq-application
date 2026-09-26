import { useCallback, useEffect, useRef, useState } from "react";
import { faceScanContextSchema, type AssessmentWorkflow, type FaceScanList, type FaceScanSession, type FaceScanSignal } from "@niq/application-contracts";
import { Armchair, Info, PersonStanding, ScanFace } from "lucide-react";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { createCaptureController } from "./careplix-capture";
import { cancelFaceScan, listFaceScans, startFaceScan, uploadFaceScan } from "./face-scan-api";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { scanPostureLabels, scanPostureOptions, type ScanPosture } from "./face-scan-posture";
import { FaceScanResults } from "./FaceScanResults";

type Phase = "idle" | "preparing" | "capturing" | "uploading" | "upload_failed";
const labels: Record<FaceScanSession["state"], string> = {
  REQUESTED: "Ready to capture", UPLOAD_ACCEPTED: "Scan captured", PROCESSING: "Getting scan results",
  COMPLETED: "Scan complete", RECONCILIATION_REQUIRED: "Scan result unavailable", FAILED: "Scan failed",
  EXPIRED: "No scan result", CANCELLED: "Scan cancelled", PAUSED: "Scan paused",
};
const terminal = new Set(["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"]);
const cancellable = new Set(["REQUESTED", "UPLOAD_ACCEPTED", "PAUSED"]);
export type MissingScanInput = "dob" | "gender" | "heightCm" | "weightKg";
export function missingScanInputs(record: AssessmentWorkflow): MissingScanInput[] {
  const parsed = faceScanContextSchema.safeParse({
    dob: record.patient.dateOfBirth,
    gender: record.patient.gender === "MALE" ? "male" : record.patient.gender === "FEMALE" ? "female" : null,
    heightCm: record.answers.height_cm,
    weightKg: record.answers.current_weight_kg,
    posture: "resting",
    employeeId: "scan"
  });
  return parsed.success ? [] : parsed.error.issues.map(issue => issue.path[0]).filter((field): field is MissingScanInput => field === "dob" || field === "gender" || field === "heightCm" || field === "weightKg");
}
export function AssessmentFaceScan({ organizationId, record, active, disabled, beforeStart, onMissingInputs, onBusyChange, onStatusChange, onSessionChange, captureFactory = createCaptureController }: {
  organizationId: string; record: AssessmentWorkflow; active: boolean; disabled: boolean;
  beforeStart: () => Promise<AssessmentWorkflow | null>; onBusyChange: (value: boolean) => void; onStatusChange: (value: string) => void;
  onMissingInputs?: (fields: MissingScanInput[]) => void;
  onSessionChange?: (session: FaceScanSession | null) => void;
  captureFactory?: typeof createCaptureController;
}) {
  const [data, setData] = useState<FaceScanList | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [guidance, setGuidance] = useState("Keep your face in view and remain still.");
  const [progress, setProgress] = useState(0);
  const [lowPerformance, setLowPerformance] = useState(false);
  const [rescanRequested, setRescanRequested] = useState(false);
  const [consented, setConsented] = useState(false);
  const [posture, setPosture] = useState<ScanPosture | "">("");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef(captureFactory());
  const alive = useRef(true);
  const inFlight = useRef(false);
  const pendingSignal = useRef<{ sessionId: string; signal: FaceScanSignal } | null>(null);
  const startKey = useRef<string | null>(null);
  const captureId = useRef<string | null>(null);
  const statusVersion = useRef(0);
  const session = data?.sessions.find(item => item.id === data.currentSessionId) ?? null;
  const previousSessions = data?.sessions.filter(item => item.id !== data.currentSessionId) ?? [];
  useEffect(() => { onSessionChange?.(session); }, [session, onSessionChange]);
  useEffect(() => { setRescanRequested(false); }, [session?.id]);
  const changedScanInputs = session?.state === "COMPLETED" ? [
    session.context.dob !== record.patient.dateOfBirth ? "date of birth" : null,
    session.context.gender !== record.patient.gender.toLowerCase() ? "gender" : null,
    session.context.heightCm !== record.answers.height_cm ? "height" : null,
    session.context.weightKg !== record.answers.current_weight_kg ? "weight" : null,
  ].filter(Boolean) : [];
  const blocked = phase !== "idle";
  const rejected = session?.state === "RECONCILIATION_REQUIRED" && session.failureCode === "PROVIDER_REJECTED";
  const statusLabel = session ? rejected ? "Scan failed" : labels[session.state] : data?.enabled ? "Face scan ready" : "Face scan unavailable";
  const selectedPosture = session?.state === "REQUESTED" ? session.context.posture : posture;
  const updateSession = useCallback((value: FaceScanSession) => {
    if (!alive.current) return;
    statusVersion.current++;
    setData(current => current ? { ...current, currentSessionId: value.id, sessions: [value, ...current.sessions.filter(item => item.id !== value.id)] } : null);
  }, []);
  const refresh = useCallback(async () => {
    const version = ++statusVersion.current;
    try {
      const value = await listFaceScans(organizationId, record.id);
      if (alive.current && version === statusVersion.current) { setData(value); setStale(false); }
      return value;
    } catch (error) {
      if (alive.current && version === statusVersion.current) setStale(true);
      throw error;
    }
  }, [organizationId, record.id]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; statusVersion.current++; controller.current.cancel(); pendingSignal.current = null; };
  }, []);
  useEffect(() => {
    let stopped = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      let delay = 15_000;
      if (document.visibilityState !== "hidden") {
        try {
          const value = await refresh(); failures = 0;
          const current = value.sessions.find(item => item.id === value.currentSessionId);
          if (!current || terminal.has(current.state)) return;
          delay = 5_000;
        } catch { failures++; delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4)); }
      }
      if (!stopped) timer = setTimeout(() => { void poll(); }, delay);
    }
    function visible() {
      if (document.visibilityState !== "hidden") { clearTimeout(timer); void poll(); }
    }
    document.addEventListener("visibilitychange", visible);
    void poll();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh, session?.state, active]);
  useEffect(() => { onBusyChange(blocked); return () => onBusyChange(false); }, [blocked, onBusyChange]);
  useEffect(() => { onStatusChange(statusLabel); }, [statusLabel, onStatusChange]);
  useEffect(() => {
    if (phase !== "capturing") return;
    function hidden() {
      if (document.visibilityState === "hidden") { controller.current.cancel(); setPhase("idle"); setError("Capture stopped because this page was hidden. Return to this page and click Resume capture. Keep it visible and focused until capture finishes."); }
    }
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [phase]);

  async function upload(id: string, signal: FaceScanSignal) {
    if (!alive.current) return;
    statusVersion.current++;
    pendingSignal.current = { sessionId: id, signal }; setPhase("uploading"); setError("");
    try {
      const value = await uploadFaceScan(organizationId, record.id, id, signal);
      if (!alive.current) return;
      updateSession(value); pendingSignal.current = null; captureId.current = null; setPhase("idle"); startKey.current = null;
    } catch {
      if (!alive.current) return;
      // The server may have accepted the upload before the connection failed.
      try {
        const found = (await refresh()).sessions.find(item => item.id === id);
        if (found && found.state !== "REQUESTED") { pendingSignal.current = null; captureId.current = null; setPhase("idle"); return; }
      } catch { /* Keep the same payload for an idempotent upload retry. */ }
      setPhase("upload_failed"); setError("Upload could not be confirmed. Retry this upload without capturing another scan, or discard the local capture.");
    }
  }
  async function start() {
    if (inFlight.current || blocked || disabled || !data?.enabled || !consented || !selectedPosture || record.status !== "DRAFT") return;
    inFlight.current = true; setPhase("preparing"); setError(""); setProgress(0); setLowPerformance(false);
    statusVersion.current++;
    try {
      if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture needs a supported browser on HTTPS (or localhost).");
      const saved = await beforeStart();
      if (!saved || !alive.current) { if (alive.current) setPhase("idle"); return; }
      if (session?.state !== "REQUESTED") {
        const missing = missingScanInputs(saved);
        if (missing.length) { setPhase("idle"); onMissingInputs?.(missing); return; }
      }
      // A terminal attempt is history. Only an explicit new start gets a new key;
      // uncertain setup retries retain their original intent identity.
      if (session && terminal.has(session.state)) startKey.current = null;
      startKey.current ??= crypto.randomUUID();
      const value = session?.state === "REQUESTED" ? session : await startFaceScan(organizationId, record.id, saved.revision, startKey.current, selectedPosture);
      if (!alive.current) return;
      updateSession(value);
      if (value.state !== "REQUESTED") { setPhase("idle"); return; }
      if (document.visibilityState === "hidden") throw new Error("Keep this page visible before starting the camera.");
      captureId.current = value.id;
      if (!video.current || !canvas.current) throw new Error("Camera preview is not ready. Please try again.");
      setPhase("capturing"); setGuidance("Preparing camera and scan files…");
      void controller.current.start({ video: video.current, canvas: canvas.current }, {
        frame: frame => { if (alive.current) { setProgress(frame.progress); setGuidance(frame.message || "Keep your face in view and remain still."); setLowPerformance(frame.isLiteMode || frame.isThrottling); } },
        finish: signal => { void upload(value.id, signal); },
        error: message => { if (alive.current) { setError(message); setPhase("idle"); } },
      });
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : "Could not prepare the scan."); setPhase("idle");
        // Another tab may own the active attempt, or the create response was lost.
        void refresh().catch(() => {});
      }
    }
    finally { inFlight.current = false; }
  }
  async function cancel() {
    if (inFlight.current || phase === "uploading") return;
    const id = phase === "idle" ? session?.id : captureId.current ?? session?.id;
    statusVersion.current++;
    controller.current.cancel(); pendingSignal.current = null; setPhase("preparing"); inFlight.current = true;
    try {
      if (id) updateSession(await cancelFaceScan(organizationId, record.id, id));
      setError(""); startKey.current = null; captureId.current = null;
    } catch { setError("Cancellation could not be confirmed. Check the saved scan status before starting another attempt."); try { await refresh(); } catch { setStale(true); } }
    finally { if (alive.current) setPhase("idle"); inFlight.current = false; }
  }
  const canStart = !session || terminal.has(session.state) || session.state === "REQUESTED";
  return <div hidden={!active} className="space-y-5">
    {!data && !stale && <p role="status">Loading face scan…</p>}
    {stale && <div role="alert" className="space-y-2"><p>Scan status could not be refreshed. Any accepted scan continues processing.</p><Button variant="outline" onPress={() => { void refresh().catch(() => setStale(true)); }}>Refresh scan status</Button></div>}
    {data && !data.enabled && <div className="py-6 text-center"><ScanFace className="mx-auto mb-3 size-8 text-brand-ink" aria-hidden="true"/><h3 className="font-semibold">Face scan is not available yet</h3><p className="mt-2 text-sm text-muted-foreground">You can continue with the questionnaire. Face scanning does not affect its completion.</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {session && !(session.state === "COMPLETED" && session.result) && <p role="status" className="font-medium">{statusLabel}{stale ? " · Last known status" : ""}</p>}
    {session?.state === "RECONCILIATION_REQUIRED" && <p className="text-sm text-muted-foreground">{rejected ? "The scan could not be processed. Please contact support before trying again. You can continue filling in the form." : "Your scan result is not available. You can continue filling in the form. Please contact support before trying another scan."}</p>}
    {session?.state === "PAUSED" && <p className="text-sm text-muted-foreground">The service has paused this scan. Its saved status will update when processing can continue.</p>}
    {session?.state === "UPLOAD_ACCEPTED" && <p className="text-sm text-muted-foreground">Your capture is saved and waiting to be sent for analysis. You can continue the questionnaire. Results will appear here when available.</p>}
    {session?.state === "PROCESSING" && <p className="text-sm text-muted-foreground">Your scan is being processed. You can continue filling in the form and return here for the result.</p>}
    {session?.state === "FAILED" && <p className="text-sm text-muted-foreground">The scan didn’t finish. Please try again.</p>}
    {session?.state === "EXPIRED" && <p className="text-sm text-muted-foreground">The attempt started on {new Date(session.createdAt).toLocaleString()} ended before analysis, so there is no measurement from that attempt. This record remains in the scan history. A new scan would measure the patient at a new time.</p>}
    {session?.state === "COMPLETED" && record.status === "DRAFT" && <p className="text-sm text-muted-foreground">The saved face scan is retained. Scan again only if a new measurement is needed.</p>}
    {changedScanInputs.length > 0 && <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">The saved scan used different {changedScanInputs.join(", ")}. Its results still reflect the original scan details shown below; changing questionnaire answers does not update those results.</p>}
    {session && <FaceScanResults session={session}/>}
    {previousSessions.length > 0 && <section aria-label="Scan history" className="space-y-2">
      <h3 className="text-sm font-semibold">Scan history</h3>
      {previousSessions.map(previous => <details key={previous.id} className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">{previous.state === "COMPLETED" ? "Completed scan" : labels[previous.state]} · {new Date(previous.completedAt ?? previous.createdAt).toLocaleString()}</summary>
        <div className="pt-3">{previous.state === "COMPLETED" && previous.result
          ? <FaceScanResults session={previous}/>
          : <p className="text-sm text-muted-foreground">This attempt did not produce a measurement.</p>}</div>
      </details>)}
    </section>}
    <div hidden={phase !== "capturing" && phase !== "preparing"} className="overflow-hidden rounded-lg bg-muted">
      <div className="relative aspect-video max-h-96">
        <video ref={video} autoPlay muted playsInline className="absolute size-px opacity-0" aria-hidden="true"/>
        <canvas ref={canvas} className="h-full w-full -scale-x-100 object-contain" aria-label="Camera scan preview"/>
      </div>
      {phase === "capturing" && <div className="flex min-h-14 items-center justify-center px-3 py-2"><div className="flex w-fit max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-center text-sm font-medium leading-snug text-foreground shadow-sm" role="status" aria-live="polite"><ScanFace className="size-4 shrink-0" aria-hidden="true"/><span className="sm:whitespace-nowrap">{/^\d+% Completed$/i.test(guidance) ? "Hold still and keep your face in view." : guidance}</span></div></div>}
    </div>
    {phase === "capturing" && <div className="space-y-3"><Progress aria-label="Face scan capture progress" value={progress} className="[&_[data-slot=progress-track]]:h-2.5 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:duration-300"><ProgressLabel>Capturing scan</ProgressLabel><ProgressValue className="font-semibold text-brand-ink" /></Progress>{lowPerformance && <p className="text-sm text-muted-foreground">Device performance is limited. Keep other applications closed during capture.</p>}<Button variant="outline" onPress={() => { void cancel(); }}>Cancel capture</Button></div>}
    {phase === "preparing" && <p role="status">Preparing scan…</p>}
    {phase === "uploading" && <p role="status">Uploading scan. Keep this page open until the upload is confirmed.</p>}
    {phase === "upload_failed" && <div className="flex flex-wrap gap-3"><Button onPress={() => { const pending = pendingSignal.current; if (pending) void upload(pending.sessionId, pending.signal); }}>Retry upload</Button><Button variant="outline" onPress={() => { void cancel(); }}>Discard local capture</Button></div>}
    {data?.enabled && session?.state === "COMPLETED" && !rescanRequested && phase === "idle" && record.status === "DRAFT" && <Button variant="outline" isDisabled={disabled || stale} onPress={() => { setConsented(false); setPosture(""); setRescanRequested(true); }}>Scan again</Button>}
    {data?.enabled && canStart && (session?.state !== "COMPLETED" || rescanRequested) && phase === "idle" && record.status === "DRAFT" && <div className="space-y-4 border-t border-border pt-4">
      {session?.state === "COMPLETED" && <p className="text-sm text-muted-foreground">A new scan will replace the current result. Previous results stay saved in the assessment history.</p>}
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true"><Info className="size-6" strokeWidth={2.5} /></span>
        <div className="min-w-0 space-y-2 text-sm text-foreground">
          <p className="font-semibold">Before you start</p>
          <p>Keep your face still and well-lit for 30 seconds. Follow the position guidance during capture.</p>
          <p><strong>Stay on this page.</strong> Clicking elsewhere stops the scan.</p>
        </div>
      </div>
      <div className="space-y-2"><p className="text-sm font-medium">Posture <span aria-hidden="true" className="text-destructive">*</span></p><ChoiceGroup id="face-scan-posture" label="Posture" options={scanPostureOptions} value={selectedPosture} onChange={value => { setPosture(value as ScanPosture); }} required disabled={disabled || session?.state === "REQUESTED" || (startKey.current !== null && !terminal.has(session?.state ?? ""))} iconTiles renderIcon={optionId => optionId === "resting" ? <Armchair className="size-6" strokeWidth={2} /> : <PersonStanding className="size-6" strokeWidth={2} />} /></div>
      {session?.state === "REQUESTED" && <p className="text-sm">This attempt uses {session.context.heightCm} cm and {session.context.weightKg} kg, {scanPostureLabels[session.context.posture].toLowerCase()}. Cancel it to use changed details.</p>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-1 accent-primary"/>The patient agrees to a camera scan and sharing scan data, date of birth, gender, height and weight for analysis.</label>
      <div className="flex flex-wrap gap-3"><Button isDisabled={disabled || !consented || !selectedPosture || stale} onPress={() => { void start(); }}><ScanFace aria-hidden="true"/>{session?.state === "REQUESTED" ? "Resume capture" : session?.state === "FAILED" ? "Try again" : session?.state === "EXPIRED" ? "Start a new scan" : session ? "Start another scan" : "Start face scan"}</Button>{session?.state === "COMPLETED" && <Button variant="outline" onPress={() => { setRescanRequested(false); }}>Keep current results</Button>}{session?.state === "REQUESTED" && <Button variant="outline" isDisabled={disabled} onPress={() => { void cancel(); }}>Cancel attempt</Button>}</div>
    </div>}
    {data?.enabled && session && cancellable.has(session.state) && session.state !== "REQUESTED" && phase === "idle" && record.status === "DRAFT" && <div className="space-y-2"><p className="text-xs text-muted-foreground">Cancel is available until processing starts.</p><Button variant="outline" isDisabled={disabled} onPress={() => { void cancel(); }}>Cancel scan</Button></div>}
  </div>;
}
