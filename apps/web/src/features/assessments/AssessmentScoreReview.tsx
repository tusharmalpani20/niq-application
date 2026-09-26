import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getAssessmentAnswerCoverage, isAssessmentFieldApplicable, calculateAssessmentBmi, calculateAssessmentWeightChange, type AssessmentWorkflow, type AssessmentScoreReviews, type AssessmentScoreResult } from "@niq/application-contracts";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assessmentResultView } from "./AssessmentResult";
import { assessmentSectionIcons } from "./AssessmentSectionNavigation";
import { assessmentRequest } from "./workflow-api";

const points = (value: number | null) => value === null ? "—" : `${value} ${value === 1 ? "pt" : "pts"}`;
const riskColorClasses = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  red: "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  neutral: "border-border bg-background text-foreground",
  blue: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100",
  purple: "border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-100",
} as const;
const riskCardClasses = {
  green: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20",
  amber: "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
  red: "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20",
  neutral: "border-primary/20 bg-primary/5",
  blue: "border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20",
  purple: "border-purple-200 bg-purple-50/40 dark:border-purple-800 dark:bg-purple-950/20",
} as const;
function customRiskColor(color: string | undefined): color is `#${string}` {
  return !!color && /^#[0-9a-f]{6}$/i.test(color);
}
function presetRiskColor(color: string | undefined): color is keyof typeof riskColorClasses {
  return !!color && Object.hasOwn(riskColorClasses, color);
}
function readableTextColor(color: `#${string}`) {
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
function riskBadgeAppearance(classification: AssessmentScoreResult["classification"]): { className: string; style?: CSSProperties } {
  const color = classification?.color;
  const base = "inline-flex rounded-full border px-3 py-1 text-sm font-semibold";
  if (customRiskColor(color)) {
    const foreground = readableTextColor(color);
    return { className: base, style: { backgroundColor: color, borderColor: foreground, color: foreground } };
  }
  return { className: `${base} ${riskColorClasses[presetRiskColor(color) ? color : "neutral"]}` };
}
function riskCardAppearance(classification: AssessmentScoreResult["classification"]): { className: string; style?: CSSProperties } {
  const selected = classification?.color;
  const base = "my-5 flex flex-wrap gap-4 rounded-xl border p-4";
  if (customRiskColor(selected)) {
    return { className: base, style: { borderColor: selected, backgroundColor: `color-mix(in srgb, ${selected} 8%, transparent)` } };
  }
  return { className: `${base} ${riskCardClasses[presetRiskColor(selected) ? selected : "neutral"]}` };
}
const summaryRowClass = "flex items-center gap-2 px-2 py-1 sm:px-3";
const summaryToggleClass = "min-h-11 min-w-0 flex-1 justify-start gap-2 whitespace-normal text-left";

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
  const scanSummaryStatus = scanStatus === "Face scan ready" ? "Not done" : scanStatus;
  const scoreCard = riskCardAppearance(revised ? null : result.classification);
  const originalRiskBadge = riskBadgeAppearance(result.classification);
  const scanSection = <div className="overflow-hidden rounded-xl border border-border">
    <div className={`${summaryRowClass} ${expanded === "face_scan" ? "bg-muted/40" : ""}`}>
      <Button variant="ghost" className={summaryToggleClass} aria-expanded={expanded === "face_scan"} aria-controls="score-section-face_scan" onPress={() => setExpanded(expanded === "face_scan" ? null : "face_scan")}>{expanded === "face_scan" ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}<assessmentSectionIcons.face_scan className="size-4 shrink-0" aria-hidden="true" />Face scan</Button>
      <div className="w-28 shrink-0 text-right text-sm tabular-nums sm:w-36"><p className="text-xs text-muted-foreground">{scanSummaryStatus}</p><p>Vital IQ {scan?.niqPoints ?? "—"}</p>{scan?.overridden && <p className="text-brand-ink">Reviewed Vital IQ {scan.reviewedPoints ?? "—"}</p>}</div>
    </div>
    <div id="score-section-face_scan" hidden={expanded !== "face_scan"} className="border-t border-border p-4">
      <p className="mb-3 text-xs text-muted-foreground">Vital IQ points are included in the final NIQ score when this scan was part of the scoring request.</p>
      {renderScan(expanded === "face_scan")}
    </div>
  </div>;
  return <section className="my-5 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6" aria-label="Assessment score review">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="assessment-summary-heading" tabIndex={-1} className="scroll-mt-40 text-xl font-semibold outline-none">Assessment summary</h2><span className="text-sm text-muted-foreground">{record.progress.answered}/{record.progress.required} required answers complete</span></div>
    {record.progress.answered === record.progress.required && coverage.answered < coverage.total && <p className="mt-2 text-sm text-muted-foreground">Some optional questions remain unanswered.</p>}
    <div {...scoreCard}>
      <div className="min-w-44 flex-1"><p className="text-sm text-muted-foreground">Final NIQ score</p><p className="mt-1 text-3xl font-semibold tabular-nums">{points(result.score)}</p>{result.classification && <p className={`mt-2 ${originalRiskBadge.className}`} style={originalRiskBadge.style}>{result.classification.label}</p>}</div>
      {revised && overall && <div className="min-w-44 flex-1 border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0"><p className="text-sm text-muted-foreground">Reviewed score</p><p className="mt-1 text-3xl font-semibold tabular-nums text-brand-ink">{points(overall.reviewedPoints)}</p><p className="text-xs text-muted-foreground">{overall.overridden ? "Total override" : "From section scores"}</p>
        <p className="mt-1 text-sm" role="status">{data?.risk?.classification && ["ORIGINAL", "CONFIRMED"].includes(data.risk.status)
          ? <span {...riskBadgeAppearance(data.risk.classification)}>{data.risk.classification.label}{data.risk.status === "ORIGINAL" ? " (original restored)" : ""}</span>
          : data?.risk?.status === "UNAVAILABLE" ? "Risk assessment unavailable" : "Risk assessment pending"}</p>
      </div>}
    </div>
    {!!data?.entries.length && <p className="mb-5 text-sm text-muted-foreground">Answers and original NIQ scores stay unchanged.</p>}
    {revised && !["ORIGINAL", "CONFIRMED"].includes(data?.risk?.status ?? "") && <div className="mb-4 rounded-lg border border-border p-3 text-sm">
      <p>{data?.risk?.failureCode === "UNMATCHED_CLASSIFICATION" ? "No NIQ risk category matches this reviewed total. Check the score before continuing." : data?.risk?.status === "UNAVAILABLE" ? "Your score changes are saved. NIQ has not confirmed the risk for this total." : "NIQ is assessing the latest reviewed total."} Clinical review can be completed once its risk is confirmed.</p>
      {data?.risk?.canRetry && canReview && <Button variant="outline" className="mt-2" isDisabled={retryingRisk} onPress={() => { void retryRisk(); }}>{retryingRisk ? "Checking risk…" : "Retry risk assessment"}</Button>}
    </div>}
    {!result.clinicalUsePermitted && <p className="mb-4 text-sm" role="note">This NIQ result is not approved for clinical use.</p>}
    {error && <div className="mb-4 text-sm text-destructive" role="alert">{error}<Button variant="link" onPress={() => setLoadKey(key => key + 1)}>Reload scores</Button></div>}
    {!data && !error && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading scores…</p>}
    <div className="space-y-2">{sections.map(section => {
      const effective = data?.sections.find(item => item.id === section.id);
      const open = expanded === section.id;
      const completion = coverage.sections.find(item => item.id === section.id);
      const Icon = assessmentSectionIcons[section.id as keyof typeof assessmentSectionIcons] ?? ClipboardList;
      return <Fragment key={section.id}><div className="overflow-hidden rounded-xl border border-border">
        <div className={`${summaryRowClass} ${open ? "bg-muted/40" : ""}`}>
          <Button variant="ghost" className={summaryToggleClass} aria-expanded={open} aria-controls={`score-section-${section.id}`} onPress={() => setExpanded(open ? null : section.id)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}<Icon className="size-4 shrink-0" aria-hidden="true" />{section.title}</Button>
          <div className="w-28 shrink-0 text-right text-sm tabular-nums sm:w-36"><p className="text-xs text-muted-foreground">{completion?.answered ?? 0}/{completion?.total ?? 0} questions answered</p><p className="font-medium">{revised ? "NIQ " : ""}{points(section.points)}</p>{revised && effective?.reviewedPoints !== null && effective?.reviewedPoints !== undefined && <p className="text-brand-ink">Reviewed {points(effective.reviewedPoints)}{effective.overridden ? " · Override" : ""}</p>}</div>
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
      return <div key={section.id} className="mt-2 overflow-hidden rounded-xl border border-border">
        <div className={`${summaryRowClass} ${open ? "bg-muted/40" : ""}`}>
          <Button variant="ghost" className={summaryToggleClass} aria-expanded={open} aria-controls={`score-section-${section.id}`} onPress={() => setExpanded(open ? null : section.id)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}<assessmentSectionIcons.reports className="size-4 shrink-0" aria-hidden="true" />{section.title}</Button>
          <span className="w-28 shrink-0 text-right text-sm text-muted-foreground tabular-nums sm:w-36">{section.status}</span>
        </div>
        <div id={`score-section-${section.id}`} hidden={!open} className="border-t border-border p-4">{record.reports.length ? reportsContent : <p className="text-sm text-muted-foreground">No reports attached.</p>}</div>
      </div>;
    })}
    {!!data?.entries.length && data && <details className="mt-4 border-t border-border pt-4"><summary className="min-h-11 cursor-pointer font-medium">Score history</summary><ol className="divide-y divide-border">{[...data.entries].reverse().map(entry => <li key={entry.id} className="py-3 text-sm"><p className="font-medium">{entry.targetType === "scan" ? "Face scan score" : entry.targetType === "overall" ? "Overall score" : entry.targetType === "section" ? sections.find(section => section.id === entry.targetId)?.title : result.components.find(item => item.id === entry.targetId)?.label} · {points(entry.previousPoints)} → {entry.points === null ? "Restored" : points(entry.points)}</p><p>{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.reason || "Reason not provided"}</p></li>)}</ol></details>}
  </section>;
}
