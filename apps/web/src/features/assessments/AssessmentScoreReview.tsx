import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { getAssessmentAnswerCoverage, isAssessmentFieldApplicable, calculateAssessmentBmi, calculateAssessmentWeightChange, type AssessmentWorkflow, type AssessmentScoreReviews } from "@niq/application-contracts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assessmentResultView } from "./AssessmentResult";
import { assessmentRequest } from "./workflow-api";

const points = (value: number | null) => value === null ? "—" : `${value} ${value === 1 ? "pt" : "pts"}`;

export function AssessmentScoreReview({ record, organizationId, renderScan, reportsContent, onSaved, canReview = true, scanStatus = "Face scan unavailable" }: {
  onSaved?: () => Promise<unknown>; canReview?: boolean; scanStatus?: string; record: AssessmentWorkflow; organizationId: string; renderScan: (active: boolean) => ReactNode; reportsContent: ReactNode;
}) {
  const [data, setData] = useState<AssessmentScoreReviews | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retryingRisk, setRetryingRisk] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const inFlight = useRef(false);
  const priorRiskStatus = useRef<string | undefined>(undefined);
  const path = `/assessments/${record.id}/score-reviews`;
  const view = assessmentResultView(record);
  const coverage = getAssessmentAnswerCoverage(record.manifest, record.answers);
  const revised = !!data?.entries.some(entry => entry.targetType !== "scan" || !!view?.result.faceScan);
  useEffect(() => {
    const controller = new AbortController();
    assessmentRequest<AssessmentScoreReviews>(organizationId, path, "GET", undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setError(""); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load score history."); });
    return () => controller.abort();
  }, [organizationId, path, loadKey, scanStatus, view?.result.resultReference]);
  // Pending work can finish in another request/tab; refresh without resubmitting it.
  useEffect(() => {
    if (data?.risk?.status !== "PENDING" || retryingRisk) return;
    const timer = window.setTimeout(() => setLoadKey(key => key + 1), 3000);
    return () => window.clearTimeout(timer);
  }, [data, retryingRisk]);
  useEffect(() => {
    const status = data?.risk?.status;
    if (priorRiskStatus.current === "PENDING" && (status === "CONFIRMED" || status === "ORIGINAL")) void onSaved?.();
    priorRiskStatus.current = status;
  }, [data?.risk?.status, onSaved]);
  async function retryRisk() {
    if (!data?.risk?.canRetry || !view || inFlight.current || !canReview) return;
    inFlight.current = true; setRetryingRisk(true); setError("");
    try {
      setData(await assessmentRequest<AssessmentScoreReviews>(organizationId, `${path}/classification/retry`, "POST", {
        expectedResultReference: view.result.resultReference, expectedRevision: data.revision,
      }));
      await onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Risk assessment could not be refreshed. Retry the saved request.");
    } finally { inFlight.current = false; setRetryingRisk(false); }
  }
  if (!view) return <p role="alert">The saved score could not be verified.</p>;
  const { result, sections } = view;
  const overall = data?.overall;
  const scan = data?.scan;
  const scanSection = <div className="overflow-hidden rounded-xl border border-border">
    <div className={`flex flex-wrap items-center gap-2 p-3 ${expanded === "face_scan" ? "bg-muted/40" : ""}`}>
      <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start text-left" aria-expanded={expanded === "face_scan"} aria-controls="score-section-face_scan" onPress={() => setExpanded(expanded === "face_scan" ? null : "face_scan")}>{expanded === "face_scan" ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}Face scan</Button>
      <div className="text-right text-sm"><p className="text-xs text-muted-foreground">{scanStatus}</p>{scan?.niqPoints !== null && scan?.niqPoints !== undefined && <p>Vital IQ {scan.niqPoints}</p>}{scan?.overridden && <p className="text-brand-ink">Reviewed Vital IQ {scan.reviewedPoints ?? "—"}</p>}</div>
    </div>
    <div id="score-section-face_scan" hidden={expanded !== "face_scan"} className="border-t border-border p-4">
      <p className="mb-3 text-xs text-muted-foreground">Vital IQ points are included in the final NIQ score when this scan was part of the scoring request.</p>
      {renderScan(expanded === "face_scan")}
    </div>
  </div>;
  return <section className="my-5 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6" aria-label="Assessment score review">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="assessment-summary-heading" tabIndex={-1} className="scroll-mt-40 text-xl font-semibold outline-none">Assessment summary</h2><span className="text-sm text-muted-foreground">{record.progress.answered}/{record.progress.required} required answers complete</span></div>
    <div className="my-5 flex flex-wrap items-center gap-x-8 gap-y-3">
      <div><p className="text-sm text-muted-foreground">Final NIQ score</p><p className="mt-1 text-2xl font-semibold">{points(result.score)}</p>{result.faceScan && <p className="text-xs text-muted-foreground">Questionnaire {points(result.questionnaireScore ?? null)} + Vital IQ {result.faceScan.points}</p>}{result.classification && <p className="text-sm text-muted-foreground">{result.classification.label} · NIQ</p>}</div>
      {revised && overall && <div><p className="text-sm text-muted-foreground">Reviewed score</p><p className="mt-1 text-2xl font-semibold text-brand-ink">{points(overall.reviewedPoints)}</p><p className="text-xs text-muted-foreground">{overall.overridden ? "Total override" : "From section scores"}</p>
        <p className="mt-1 text-sm" role="status">{data?.risk?.classification && ["ORIGINAL", "CONFIRMED"].includes(data.risk.status)
          ? `${data.risk.classification.label} · NIQ${data.risk.status === "ORIGINAL" ? " (original restored)" : ""}`
          : data?.risk?.status === "UNAVAILABLE" ? "Risk assessment unavailable" : "Risk assessment pending"}</p>
      </div>}
    </div>
    <p className="mb-5 text-sm text-muted-foreground">Answers and original NIQ scores stay unchanged.</p>
    {revised && !["ORIGINAL", "CONFIRMED"].includes(data?.risk?.status ?? "") && <div className="mb-4 rounded-lg border border-border p-3 text-sm">
      <p>{data?.risk?.failureCode === "UNMATCHED_CLASSIFICATION" ? "No NIQ risk category matches this reviewed total. Check the score before continuing." : data?.risk?.status === "UNAVAILABLE" ? "Your score changes are saved. NIQ has not confirmed the risk for this total." : "NIQ is assessing the latest reviewed total."} Clinical review can be completed once its risk is confirmed.</p>
      {data?.risk?.canRetry && canReview && <Button variant="outline" className="mt-2" isDisabled={retryingRisk} onPress={() => { void retryRisk(); }}>{retryingRisk ? "Checking risk…" : "Retry risk assessment"}</Button>}
    </div>}
    {!result.clinicalUsePermitted && <p className="mb-4 text-sm" role="note">This NIQ result is not approved for clinical use.</p>}
    {error && <div className="mb-4 text-sm text-destructive" role="alert">{error}<Button variant="link" onPress={() => setLoadKey(key => key + 1)}>Reload scores</Button></div>}
    {!data && !error && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading scores…</p>}
    <div className="space-y-3">{sections.map(section => {
      const effective = data?.sections.find(item => item.id === section.id);
      const open = expanded === section.id;
      const completion = coverage.sections.find(item => item.id === section.id);
      return <Fragment key={section.id}><div className="overflow-hidden rounded-xl border border-border">
        <div className={`flex flex-wrap items-center gap-2 p-3 ${open ? "bg-muted/40" : ""}`}>
          <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start whitespace-normal text-left" aria-expanded={open} aria-controls={`score-section-${section.id}`} onPress={() => setExpanded(open ? null : section.id)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}{section.title}</Button>
          <div className="text-right text-sm"><p className="text-xs text-muted-foreground">{completion?.answered ?? 0}/{completion?.total ?? 0} answered</p><p>{revised ? "NIQ " : ""}{points(section.points)}</p>{revised && effective?.reviewedPoints !== null && effective?.reviewedPoints !== undefined && <p className="text-brand-ink">Reviewed {points(effective.reviewedPoints)}{effective.overridden ? " · Override" : ""}</p>}</div>
        </div>
        <div id={`score-section-${section.id}`} hidden={!open} className="border-t border-border px-4 pb-4">
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
              </div>}
            </div>;
          })}</div>
        </div>
      </div>{section.id === "personal_details" && scanSection}</Fragment>;
    })}{!sections.some(section => section.id === "personal_details") && scanSection}</div>
    {[{id: "reports", title: "Attachments", status: `${record.reports.length} reports`}].map(section => {
      const open = expanded === section.id;
      return <div key={section.id} className="mt-3 overflow-hidden rounded-xl border border-border">
        <div className={`flex flex-wrap items-center gap-2 p-3 ${open ? "bg-muted/40" : ""}`}>
          <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start text-left" aria-expanded={open} aria-controls={`score-section-${section.id}`} onPress={() => setExpanded(open ? null : section.id)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}{section.title}</Button>
          <span className="text-sm text-muted-foreground">{section.status}</span>
        </div>
        <div id={`score-section-${section.id}`} hidden={!open} className="border-t border-border p-4">{record.reports.length ? reportsContent : <p className="text-sm text-muted-foreground">No reports attached.</p>}</div>
      </div>;
    })}
    {!!data?.entries.length && data && <details className="mt-4 border-t border-border pt-4"><summary className="min-h-11 cursor-pointer font-medium">Score history</summary><ol className="divide-y divide-border">{[...data.entries].reverse().map(entry => <li key={entry.id} className="py-3 text-sm"><p className="font-medium">{entry.targetType === "scan" ? "Face scan score" : entry.targetType === "overall" ? "Overall score" : entry.targetType === "section" ? sections.find(section => section.id === entry.targetId)?.title : result.components.find(item => item.id === entry.targetId)?.label} · {points(entry.previousPoints)} → {entry.points === null ? "Restored" : points(entry.points)}</p><p>{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.reason || "Reason not provided"}</p></li>)}</ol></details>}
  </section>;
}
