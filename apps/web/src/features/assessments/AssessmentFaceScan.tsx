import { useCallback, useEffect, useRef, useState } from "react";
import type { AssessmentWorkflow, FaceScanList, FaceScanSession, FaceScanSignal } from "@niq/application-contracts";
import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCaptureController } from "./careplix-capture";
import { cancelFaceScan, listFaceScans, startFaceScan, uploadFaceScan } from "./face-scan-api";
import { FaceScanResults } from "./FaceScanResults";

type Phase = "idle" | "preparing" | "capturing" | "uploading" | "upload_failed";
const labels: Record<FaceScanSession["state"], string> = {
  REQUESTED: "Ready to capture", UPLOAD_ACCEPTED: "Scan processing", PROCESSING: "Scan processing",
  COMPLETED: "Scan complete", RECONCILIATION_REQUIRED: "Scan needs review", FAILED: "Scan failed",
  EXPIRED: "Scan expired", CANCELLED: "Scan cancelled", PAUSED: "Scan paused",
};
const terminal = new Set(["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"]);
const cancellable = new Set(["REQUESTED", "UPLOAD_ACCEPTED", "PAUSED"]);
export function AssessmentFaceScan({ organizationId, record, active, disabled, beforeStart, onBusyChange, onStatusChange, captureFactory = createCaptureController }: {
  organizationId: string; record: AssessmentWorkflow; active: boolean; disabled: boolean;
  beforeStart: () => Promise<AssessmentWorkflow | null>; onBusyChange: (value: boolean) => void; onStatusChange: (value: string) => void;
  captureFactory?: typeof createCaptureController;
}) {
  const [data, setData] = useState<FaceScanList | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [guidance, setGuidance] = useState("Keep your face in view and remain still.");
  const [progress, setProgress] = useState(0);
  const [lowPerformance, setLowPerformance] = useState(false);
  const [consented, setConsented] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef(captureFactory());
  const alive = useRef(true);
  const inFlight = useRef(false);
  const pendingSignal = useRef<{ sessionId: string; signal: FaceScanSignal } | null>(null);
  const startKey = useRef<string | null>(null);
  const captureId = useRef<string | null>(null);
  const session = data?.sessions.find(item => item.id === data.currentSessionId) ?? null;
  const blocked = phase !== "idle";
  const updateSession = useCallback((value: FaceScanSession) => {
    if (!alive.current) return;
    setData(current => current ? { ...current, currentSessionId: value.id, sessions: [value, ...current.sessions.filter(item => item.id !== value.id)] } : null);
  }, []);
  const refresh = useCallback(async () => {
    const value = await listFaceScans(organizationId, record.id);
    if (alive.current) { setData(value); setStale(false); }
    return value;
  }, [organizationId, record.id]);
  useEffect(() => {
    alive.current = true;
    let stopped = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      let delay = 15_000;
      if (document.visibilityState !== "hidden") {
        try {
          const value = await refresh(); failures = 0;
          const current = value.sessions.find(item => item.id === value.currentSessionId);
          delay = current && !terminal.has(current.state) ? 5_000 : 30_000;
        } catch { failures++; if (alive.current) setStale(true); delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4)); }
      }
      if (!stopped) timer = setTimeout(() => { void poll(); }, delay);
    }
    void poll();
    return () => { stopped = true; alive.current = false; clearTimeout(timer); controller.current.cancel(); pendingSignal.current = null; };
  }, [refresh]);
  useEffect(() => { onBusyChange(blocked); return () => onBusyChange(false); }, [blocked, onBusyChange]);
  useEffect(() => { onStatusChange(session ? labels[session.state] : data?.enabled ? "Face scan ready" : "Face scan unavailable"); }, [session, data?.enabled, onStatusChange]);
  useEffect(() => {
    if (phase !== "capturing") return;
    function hidden() {
      if (document.visibilityState === "hidden") { controller.current.cancel(); setPhase("idle"); setError("Capture was interrupted. Keep this page visible during the scan."); }
    }
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [phase]);

  async function upload(id: string, signal: FaceScanSignal) {
    if (!alive.current) return;
    pendingSignal.current = { sessionId: id, signal }; setPhase("uploading"); setError("");
    try {
      const value = await uploadFaceScan(organizationId, record.id, id, signal);
      if (!alive.current) return;
      updateSession(value); pendingSignal.current = null; setPhase("idle"); startKey.current = null;
    } catch {
      if (!alive.current) return;
      // The server may have accepted the upload before the connection failed.
      try {
        const found = (await refresh()).sessions.find(item => item.id === id);
        if (found && found.state !== "REQUESTED") { pendingSignal.current = null; setPhase("idle"); return; }
      } catch { /* Keep the same payload for an idempotent upload retry. */ }
      setPhase("upload_failed"); setError("Upload could not be confirmed. Retry this upload without capturing another scan, or discard the local capture.");
    }
  }
  async function start() {
    if (inFlight.current || blocked || disabled || !data?.enabled || !consented || record.status !== "DRAFT") return;
    inFlight.current = true; setPhase("preparing"); setError(""); setProgress(0); setLowPerformance(false);
    try {
      if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture needs a supported browser on HTTPS (or localhost).");
      const saved = await beforeStart();
      if (!saved || !alive.current) { if (alive.current) setPhase("idle"); return; }
      // A terminal attempt is history. Only an explicit new start gets a new key;
      // uncertain setup retries retain their original intent identity.
      if (session && terminal.has(session.state)) startKey.current = null;
      startKey.current ??= crypto.randomUUID();
      const value = session?.state === "REQUESTED" ? session : await startFaceScan(organizationId, record.id, saved.revision, startKey.current);
      if (!alive.current) return;
      updateSession(value);
      if (value.state !== "REQUESTED") { setPhase("idle"); return; }
      captureId.current = value.id;
      if (!video.current || !canvas.current) throw new Error("Camera preview is not ready. Please try again.");
      setPhase("capturing"); setGuidance("Preparing camera and scan files…");
      void controller.current.start({ video: video.current, canvas: canvas.current }, {
        frame: frame => { if (alive.current) { setProgress(frame.progress); setGuidance(frame.message || "Keep your face in view and remain still."); setLowPerformance(frame.isLiteMode || frame.isThrottling); } },
        finish: signal => { void upload(value.id, signal); },
        error: message => { if (alive.current) { setError(message); setPhase("idle"); } },
      });
    } catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : "Could not prepare the scan."); setPhase("idle"); } }
    finally { inFlight.current = false; }
  }
  async function cancel() {
    if (inFlight.current || phase === "uploading") return;
    controller.current.cancel(); pendingSignal.current = null; setPhase("preparing"); inFlight.current = true;
    try {
      const id = captureId.current ?? session?.id;
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
    {session && <p role="status" className="font-medium">{labels[session.state]}{stale ? " · Last known status" : ""}</p>}
    {session?.state === "RECONCILIATION_REQUIRED" && <p className="text-sm text-muted-foreground">The service could not confirm this attempt. An administrator needs to check it before another scan is started.</p>}
    {session?.state === "PAUSED" && <p className="text-sm text-muted-foreground">The service has paused this scan. Its saved status will update when processing can continue.</p>}
    {(session?.state === "PROCESSING" || session?.state === "UPLOAD_ACCEPTED") && <p className="text-sm text-muted-foreground">Your scan has been uploaded. You can continue the questionnaire or leave and return later.</p>}
    {session?.state === "FAILED" && <p className="text-sm text-muted-foreground">This attempt did not complete. You can start a new scan when the service is available.</p>}
    {session && <FaceScanResults session={session}/>}
    <div hidden={phase !== "capturing" && phase !== "preparing"} className="relative aspect-[4/3] max-h-96 overflow-hidden rounded-lg bg-muted">
      <video ref={video} autoPlay muted playsInline className="absolute size-px opacity-0" aria-hidden="true"/>
      <canvas ref={canvas} className="h-full w-full -scale-x-100 object-contain" aria-label="Camera scan preview"/>
    </div>
    {phase === "capturing" && <div className="space-y-3"><p role="status">{guidance}</p><progress className="h-2 w-full accent-primary" aria-label="Face scan capture progress" max={100} value={progress}/>{lowPerformance && <p className="text-sm text-muted-foreground">Device performance is limited. Keep other applications closed during capture.</p>}<Button variant="outline" onPress={() => { void cancel(); }}>Cancel capture</Button></div>}
    {phase === "preparing" && <p role="status">Preparing scan…</p>}
    {phase === "uploading" && <p role="status">Uploading scan. Keep this page open until the upload is confirmed.</p>}
    {phase === "upload_failed" && <div className="flex flex-wrap gap-3"><Button onPress={() => { const pending = pendingSignal.current; if (pending) void upload(pending.sessionId, pending.signal); }}>Retry upload</Button><Button variant="outline" onPress={() => { void cancel(); }}>Discard local capture</Button></div>}
    {data?.enabled && canStart && phase === "idle" && record.status === "DRAFT" && <div className="space-y-4 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Sit comfortably in good lighting. Keep your face in view for about 60 seconds. The scan uses your saved date of birth, gender, height and weight.</p>
      {session?.state === "REQUESTED" && <p className="text-sm">This attempt uses {session.context.heightCm} cm and {session.context.weightKg} kg. Cancel it to use changed details.</p>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-1 accent-primary"/>The patient agrees to camera capture and sending scan signal and required patient details for processing.</label>
      <div className="flex flex-wrap gap-3"><Button isDisabled={disabled || !consented || stale} onPress={() => { void start(); }}><ScanFace aria-hidden="true"/>{session?.state === "REQUESTED" ? "Resume capture" : session ? "Start another scan" : "Start face scan"}</Button>{session?.state === "REQUESTED" && <Button variant="outline" isDisabled={disabled} onPress={() => { void cancel(); }}>Cancel attempt</Button>}</div>
    </div>}
    {data?.enabled && session && cancellable.has(session.state) && session.state !== "REQUESTED" && phase === "idle" && record.status === "DRAFT" && <Button variant="outline" isDisabled={disabled} onPress={() => { void cancel(); }}>Cancel queued scan</Button>}
    {(data?.sessions.length ?? 0) > 1 && <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm">Previous attempts</summary><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{data!.sessions.filter(item => item.id !== data!.currentSessionId).map(item => <li key={item.id}>{new Date(item.createdAt).toLocaleString()} · {labels[item.state]}</li>)}</ul></details>}
  </div>;
}
