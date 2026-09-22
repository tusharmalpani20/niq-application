import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { getAssessmentAnswerCoverage, isAssessmentFieldApplicable, calculateAssessmentBmi, calculateAssessmentWeightChange, type AssessmentWorkflow, type AssessmentScoreReviews, type ScoreReviewInput } from "@niq/application-contracts";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { assessmentResultView } from "./AssessmentResult";
import { assessmentRequest, AssessmentRequestError } from "./workflow-api";

type Target = { targetType: "item" | "section" | "overall" | "scan"; targetId: string | null; label: string; niqPoints: number; reviewedPoints: number; overridden: boolean };
const points = (value: number | null) => value === null ? "—" : `${value} pts`;

export function AssessmentScoreReview({ record, organizationId, renderScan, reportsContent, onDirtyChange, scanStatus = "Face scan unavailable" }: {
  scanStatus?: string; record: AssessmentWorkflow; organizationId: string; renderScan: (active: boolean) => ReactNode; reportsContent: ReactNode; onDirtyChange: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<AssessmentScoreReviews | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const inFlight = useRef(false);
  // Retain this key for an identical retry after a lost response.
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const path = `/assessments/${record.id}/score-reviews`;
  const view = assessmentResultView(record);
  const coverage = getAssessmentAnswerCoverage(record.manifest, record.answers);
  const revised = !!data?.entries.some(entry => entry.targetType !== "scan");
  useEffect(() => {
    const controller = new AbortController();
    assessmentRequest<AssessmentScoreReviews>(organizationId, path, "GET", undefined, controller.signal)
      .then(result => { setData(result); setError(""); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load score history."); });
    return () => controller.abort();
  }, [organizationId, path, loadKey, scanStatus]);
  useEffect(() => { onDirtyChange(!!target); return () => onDirtyChange(false); }, [target, onDirtyChange]);
  function edit(next: Target) {
    if (target || saving) return;
    if (next.targetType === "section") setExpanded(next.targetId);
    if (next.targetType === "scan") setExpanded("face_scan");
    setTarget(next); setValue(String(next.reviewedPoints)); setReason(""); setError(""); setNotice(""); setConflict(false); request.current = null;
  }
  function cancel() { if (saving) return; setTarget(null); setError(""); if (conflict) { setData(null); setLoadKey(key => key + 1); } setConflict(false); }
  async function save(reset = false) {
    if (!target || !data || inFlight.current || conflict) return;
    if (!reason.trim()) { setError("Enter a reason for this score change."); return; }
    const number = reset ? null : Number(value);
    if (!reset && (!value.trim() || !Number.isFinite(number) || number! < 0 || number! > Number.MAX_SAFE_INTEGER)) { setError("Enter a valid, non-negative score."); return; }
    const input: Omit<ScoreReviewInput, "requestKey"> = { expectedRevision: data.revision, targetType: target.targetType, targetId: target.targetId, points: number, reason: reason.trim() };
    const fingerprint = JSON.stringify(input);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    inFlight.current = true; setSaving(true); setError("");
    try {
      setData(await assessmentRequest<AssessmentScoreReviews>(organizationId, path, "POST", { ...input, requestKey: request.current.key }));
      setTarget(null); setNotice("Score change saved."); request.current = null;
    } catch (cause) {
      if (cause instanceof AssessmentRequestError && cause.status === 409) {
        setConflict(true); setError("Someone updated the scores. Cancel this edit and reload scores before making another change.");
      } else setError(cause instanceof Error ? cause.message : "Could not save. Your change is still here. Try saving again.");
    } finally { inFlight.current = false; setSaving(false); }
  }
  const adjust = (next: Target, label: string) => data?.canAdjust && <Button variant="ghost" className="size-11 shrink-0 p-0 text-brand-ink" isDisabled={!!target || saving} aria-label={`Adjust ${next.label}`} onPress={() => edit(next)}><Pencil className="size-3.5" aria-hidden="true"/>{label}</Button>;
  if (!view) return <p role="alert">The saved score could not be verified.</p>;
  const { result, sections } = view;
  const overall = data?.overall;
  const adjustmentForm = target ? <form className="my-4 rounded-xl border border-border bg-card p-4" onSubmit={event => { event.preventDefault(); void save(); }} aria-label={`Adjust ${target.label}`}>
      <h3 className="font-semibold">Adjust {target.label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">Original score: {points(target.niqPoints)}{target.overridden ? ` · Current reviewed: ${points(target.reviewedPoints)}` : ""}</p>
      {(target.targetType === "section" || target.targetType === "overall") && <p className="mt-2 text-sm text-muted-foreground">This overrides the calculated {target.targetType === "overall" ? "total" : "section score"} until you restore it.</p>}
      {target.targetType === "item" && data?.sections.some(section => section.overridden && section.items.some(item => item.id === target.targetId)) && <p className="mt-2 text-sm text-muted-foreground">This section has an override. Changing these points will not change its total until the section score is restored.</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
        <label className="grid content-start gap-2 text-sm font-medium">Your score (points)<Input autoFocus type="number" min={0} max={Number.MAX_SAFE_INTEGER} step="any" required value={value} disabled={saving || conflict} onChange={event => setValue(event.target.value)} className="min-h-11"/></label>
        <label className="grid gap-2 text-sm font-medium">Reason *<Textarea required value={reason} maxLength={1000} disabled={saving || conflict} onChange={event => setReason(event.target.value)} placeholder="Explain why you are changing this score"/></label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Saved with your name and time. Previous changes stay in history.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {target.overridden && <Button variant="link" isDisabled={saving || conflict || !reason.trim()} onPress={() => { void save(true); }}>Restore {target.targetType === "item" ? "NIQ points" : "calculated score"}</Button>}
        <Button variant="outline" isDisabled={saving} onPress={cancel}>Cancel</Button>
        <Button type="submit" isDisabled={saving || conflict || !reason.trim() || !value.trim() || Number(value) === target.reviewedPoints}>{saving ? "Saving…" : "Save change"}</Button>
      </div>
    </form> : null;
  const scan = data?.scan;
  const scanSection = <div className="overflow-hidden rounded-xl border border-border">
    <div className={`flex flex-wrap items-center gap-2 p-3 ${expanded === "face_scan" ? "bg-muted/40" : ""}`}>
      <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start text-left" isDisabled={!!target} aria-expanded={expanded === "face_scan"} aria-controls="score-section-face_scan" onPress={() => setExpanded(expanded === "face_scan" ? null : "face_scan")}>{expanded === "face_scan" ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}Face scan</Button>
      <div className="text-right text-sm"><p className="text-xs text-muted-foreground">{scanStatus}</p><p>{scan?.overridden ? "NIQ " : ""}{points(scan?.niqPoints ?? null)}</p>{scan?.overridden && <p className="text-brand-ink">Reviewed {points(scan.reviewedPoints)}</p>}</div>
      <div className="w-11 shrink-0">{scan && scan.niqPoints !== null && scan.reviewedPoints !== null && adjust({ targetType: "scan", targetId: scan.id, label: "face scan score", niqPoints: scan.niqPoints, reviewedPoints: scan.reviewedPoints, overridden: scan.overridden }, "")}</div>
    </div>
    <div id="score-section-face_scan" hidden={expanded !== "face_scan"} className="border-t border-border p-4">
      {target?.targetType === "scan" && adjustmentForm}
      <p className="mb-3 text-xs text-muted-foreground">Face-scan points are separate from the questionnaire total.</p>
      {renderScan(expanded === "face_scan")}
    </div>
  </div>;
  return <section className="my-5 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6" aria-label="Assessment score review">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="assessment-summary-heading" tabIndex={-1} className="scroll-mt-40 text-xl font-semibold outline-none">Assessment summary</h2><span className="text-sm text-muted-foreground">{record.progress.answered}/{record.progress.required} required answers complete</span></div>
    <div className="my-5 flex flex-wrap items-center gap-x-8 gap-y-3">
      <div><p className="text-sm text-muted-foreground">NIQ score</p><p className="mt-1 text-2xl font-semibold">{points(result.score)}</p><p className="text-sm text-muted-foreground">{result.classification.label} · NIQ</p></div>
      {revised && overall && <div><p className="text-sm text-muted-foreground">Reviewed score</p><p className="mt-1 text-2xl font-semibold text-brand-ink">{points(overall.reviewedPoints)}</p><p className="text-xs text-muted-foreground">{overall.overridden ? "Total override" : "From section scores"}</p></div>}
      {overall && overall.reviewedPoints !== null && adjust({targetType:"overall",targetId:null,label:"total score",niqPoints:result.score,reviewedPoints:overall.reviewedPoints,overridden:overall.overridden}, "")}
    </div>
    <p className="mb-5 text-sm text-muted-foreground">Answers and original NIQ scores stay unchanged.</p>
    {!result.clinicalUsePermitted && <p className="mb-4 text-sm" role="note">This NIQ result is not approved for clinical use.</p>}
    {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
    {error && <div className="mb-4 text-sm text-destructive" role="alert">{error}{!target && <Button variant="link" onPress={() => setLoadKey(key => key + 1)}>Reload scores</Button>}</div>}
    {!data && !error && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading scores…</p>}
    {target?.targetType === "overall" && adjustmentForm}
    <div className="space-y-3">{sections.map(section => {
      const effective = data?.sections.find(item => item.id === section.id);
      const open = expanded === section.id;
      const completion = coverage.sections.find(item => item.id === section.id);
      return <Fragment key={section.id}><div className="overflow-hidden rounded-xl border border-border">
        <div className={`flex flex-wrap items-center gap-2 p-3 ${open ? "bg-muted/40" : ""}`}>
          <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start whitespace-normal text-left" isDisabled={!!target} aria-expanded={open} aria-controls={`score-section-${section.id}`} onPress={() => setExpanded(open ? null : section.id)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}{section.title}</Button>
          <div className="text-right text-sm"><p className="text-xs text-muted-foreground">{completion?.answered ?? 0}/{completion?.total ?? 0} answered</p><p>{revised ? "NIQ " : ""}{points(section.points)}</p>{revised && effective?.reviewedPoints !== null && effective?.reviewedPoints !== undefined && <p className="text-brand-ink">Reviewed {points(effective.reviewedPoints)}{effective.overridden ? " · Override" : ""}</p>}</div>
      <div className="w-11 shrink-0">{effective && section.points !== null && effective.reviewedPoints !== null && adjust({targetType:"section",targetId:section.id,label:section.title,niqPoints:section.points,reviewedPoints:effective.reviewedPoints,overridden:effective.overridden},"")}</div>
        </div>
        <div id={`score-section-${section.id}`} hidden={!open} className="border-t border-border px-4 pb-4">
          {target?.targetType === "section" && target.targetId === section.id && adjustmentForm}
          <div className="divide-y divide-border">{section.fields.filter(field => isAssessmentFieldApplicable(field, record.answers)).map(field => {
            const item = result.components.find(item => item.id === field.id);
            const raw = record.answers[field.id];
            const label = (value: string | number) => field?.options?.find(option => option.id === value)?.label ?? String(value);
            let answer = raw === undefined || raw === null || raw === "" ? "Not answered" : Array.isArray(raw) ? raw.length ? raw.map(label).join(", ") : "None" : label(raw);
            if (field.kind === "calculated") {
              const a = record.answers;
              if (field.id === "bmi") { const n = typeof a.height_cm === "number" && typeof a.current_weight_kg === "number" ? calculateAssessmentBmi(a.height_cm, a.current_weight_kg) : null; answer = n === null ? "Not available" : n.toFixed(1); }
              else if (field.id === "weight_loss") { const n = typeof a.previous_weight_kg === "number" && typeof a.current_weight_kg === "number" ? calculateAssessmentWeightChange(a.previous_weight_kg, a.current_weight_kg) : null; answer = n === null ? "Not available" : n === 0 ? "No change" : `${Math.abs(n).toFixed(1)}% ${n > 0 ? "loss" : "gain"}`; }
              else answer = item?.status === "answered" ? "Calculated from assessment answers" : "Not available";
            } else if (field.unit && answer !== "Not answered") answer += ` ${field.unit}`;
            const reviewed = effective?.items.find(row => row.id === field.id);
            return <div key={field.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div><p className="text-sm font-medium">{field.label}</p><p className="break-words text-sm text-muted-foreground">{answer}</p>{item?.status === "pending" && <p className="mt-1 text-xs text-muted-foreground">{item.reason || "More information needed"}</p>}</div>
              {item && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{revised ? "NIQ " : ""}{points(item.points)}</span>{revised && reviewed?.reviewedPoints !== null && reviewed?.reviewedPoints !== undefined && <span className="text-brand-ink">Reviewed {points(reviewed.reviewedPoints)}{reviewed.overridden ? " · Adjusted" : ""}</span>}
                {item.status === "answered" && item.points !== null && reviewed?.reviewedPoints !== null && reviewed?.reviewedPoints !== undefined && adjust({targetType:"item",targetId:item.id,label:item.label,niqPoints:item.points,reviewedPoints:reviewed.reviewedPoints,overridden:reviewed.overridden},"")}
              </div>}
              {target?.targetType === "item" && target.targetId === field.id && <div className="sm:col-span-2">{adjustmentForm}</div>}
            </div>;
          })}</div>
        </div>
      </div>{section.id === "personal_details" && scanSection}</Fragment>;
    })}{!sections.some(section => section.id === "personal_details") && scanSection}</div>
    {[{id: "reports", title: "Reports", status: `${record.reports.length} reports`}].map(section => {
      const open = expanded === section.id;
      return <div key={section.id} className="mt-3 overflow-hidden rounded-xl border border-border">
        <div className={`flex flex-wrap items-center gap-2 p-3 ${open ? "bg-muted/40" : ""}`}>
          <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start text-left" isDisabled={!!target} aria-expanded={open} aria-controls={`score-section-${section.id}`} onPress={() => setExpanded(open ? null : section.id)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}{section.title}</Button>
          <span className="text-sm text-muted-foreground">{section.status}</span><div className="w-11 shrink-0" aria-hidden="true" />
        </div>
        <div id={`score-section-${section.id}`} hidden={!open} className="border-t border-border p-4">{record.reports.length ? reportsContent : <p className="text-sm text-muted-foreground">No reports attached.</p>}</div>
      </div>;
    })}
    {!!data?.entries.length && data && <details className="mt-4 border-t border-border pt-4"><summary className="min-h-11 cursor-pointer font-medium">Score history</summary><ol className="divide-y divide-border">{[...data.entries].reverse().map(entry => <li key={entry.id} className="py-3 text-sm"><p className="font-medium">{entry.targetType === "scan" ? "Face scan score" : entry.targetType === "overall" ? "Overall score" : entry.targetType === "section" ? sections.find(section => section.id === entry.targetId)?.title : result.components.find(item => item.id === entry.targetId)?.label} · {points(entry.previousPoints)} → {entry.points === null ? "Restored" : points(entry.points)}</p><p>{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.reason || "Reason not provided"}</p></li>)}</ol></details>}
  </section>;
}
