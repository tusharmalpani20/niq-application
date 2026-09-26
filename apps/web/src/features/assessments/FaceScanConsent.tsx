import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Send } from "lucide-react";
import type { FaceScanConsentSummary } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { clearFaceScanConsent, faceScanConsentFileUrl, getFaceScanConsent, requestFaceScanConsent, uploadFaceScanConsent } from "./face-scan-consent-api";

export function FaceScanConsent({ organizationId, assessmentId, revision, disabled, onApprovalChange, embedded = false }: {
  organizationId: string; assessmentId: string; revision: number; disabled: boolean;
  onApprovalChange: (approved: boolean) => void;
  embedded?: boolean;
}) {
  const [summary, setSummary] = useState<FaceScanConsentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploadKey = useRef<string | null>(null);
  const current = summary?.current;
  const approved = current?.status === "APPROVED";
  useEffect(() => { onApprovalChange(approved); }, [approved, onApprovalChange]);
  const refresh = useCallback(async () => {
    const value = await getFaceScanConsent(organizationId, assessmentId);
    setSummary(value);
    if (value.current?.status === "APPROVED") setError("");
    return value;
  }, [organizationId, assessmentId]);
  useEffect(() => {
    let cancelled = false;
    getFaceScanConsent(organizationId, assessmentId).then(value => {
      if (!cancelled) { setSummary(value); setError(""); }
    }).catch(() => { if (!cancelled) setError("Consent status could not be loaded. Retry to continue."); });
    return () => { cancelled = true; };
  }, [organizationId, assessmentId]);
  useEffect(() => {
    if (current?.status !== "REQUESTED") return;
    const elapsed = Date.now() - new Date(current.requestedAt ?? current.createdAt).getTime();
    const timer = window.setTimeout(() => {
      void refresh().catch(() => setError("The consent response could not be checked. Retry to continue."));
    }, Math.max(250, 2_100 - elapsed));
    return () => window.clearTimeout(timer);
  }, [current?.status, current?.requestedAt, refresh]);

  async function request() {
    setBusy(true); setError("");
    try { setSummary(await requestFaceScanConsent(organizationId, assessmentId, revision)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The consent request could not be recorded."); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true); setError("");
    uploadKey.current ??= crypto.randomUUID();
    try { setSummary(await uploadFaceScanConsent(organizationId, assessmentId, revision, file, uploadKey.current)); uploadKey.current = null; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The signed consent could not be uploaded."); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setError("");
    try { setSummary(await clearFaceScanConsent(organizationId, assessmentId, revision)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Consent could not be cleared."); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }

  return <section aria-label="Patient consent" className={embedded ? "space-y-3" : "space-y-3 rounded-xl border border-border bg-muted/30 p-4"}>
    <div><h3 className="text-sm font-semibold">Patient consent</h3><p className="mt-1 text-sm text-muted-foreground">Request consent from the patient or upload a signed form before starting the face scan.</p></div>
    {summary === null && !error && <p role="status" className="text-sm text-muted-foreground">Loading consent status…</p>}
    {current?.status === "REQUESTED" && <p role="status" className="text-sm text-muted-foreground">{summary?.demoEnabled ? "Demo request recorded. No notification was sent. Waiting for consent response…" : "Waiting for consent response…"}</p>}
    {approved && <p role="status" className="text-sm font-medium text-primary">{current.method === "UPLOAD" ? `Signed consent saved: ${current.fileName}` : "Consent response recorded."}</p>}
    {approved && current.respondedAt && <p className="text-xs text-muted-foreground">Recorded {new Date(current.respondedAt).toLocaleString()}</p>}
    {approved && current.method === "UPLOAD" && <a className="text-sm font-medium text-primary underline underline-offset-2" href={faceScanConsentFileUrl(organizationId, assessmentId, current.id)}>Download signed consent</a>}
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => { setError(""); void refresh().catch(() => setError("Consent status could not be loaded. Retry to continue.")); }}>Retry</button></p>}
    {!approved && <div className="grid gap-2 sm:grid-cols-2">
      {summary?.demoEnabled && <Button type="button" className="min-h-11 w-full justify-center font-semibold" isDisabled={disabled || busy || current?.status === "REQUESTED"} onPress={() => { void request(); }}><Send className="size-4" aria-hidden="true"/>Send consent request</Button>}
      <label className="relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/60 bg-background px-3 text-sm font-semibold text-foreground shadow-sm hover:bg-primary/5"><FileUp className="size-4 text-primary" aria-hidden="true"/>Upload signed consent<input type="file" aria-label="Choose signed consent file" accept="application/pdf,image/jpeg,image/png" className="absolute inset-0 w-full cursor-pointer opacity-0" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void upload(file); }}/></label>
    </div>}
    {current && <Button type="button" variant="link" size="sm" className="h-auto p-0" isDisabled={disabled || busy} onPress={() => { void clear(); }}>Use another consent method</Button>}
  </section>;
}
