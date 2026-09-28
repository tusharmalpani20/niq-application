import { membershipRoleLabels, type AssessmentScoreReviews, type AssessmentSummary, type AssessmentWorkflow, type ClinicalReview } from "@niq/application-contracts";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardList, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assessmentResultView } from "../features/assessments/AssessmentResult";
import { changeClinicalReview, getClinicalReview } from "../features/assessments/clinical-review-api";
import { AssessmentRequestError, assessmentRequest, getAssessment } from "../features/assessments/workflow-api";
import { assessmentStatusLabels } from "../lib/patient-display";
import { riskColor } from "../lib/risk-color";
import { DateDisplay } from "./DateDisplay";
import { StatusBadge } from "./StatusBadge";

type ScorePoint = { reference: string; date: Date; score: number; risk: string | null; color?: string; status: AssessmentSummary["status"] };
const scoredStatuses = new Set(["SCORED", "UNDER_REVIEW", "COMPLETED"]);
const assessmentStages = ["Draft", "Scored", "Under review", "Completed"] as const;

function riskBadgeStyle(color: string | undefined): CSSProperties {
  const selected = riskColor(color);
  return { color: selected, borderColor: `color-mix(in srgb, ${selected} 35%, transparent)`, backgroundColor: `color-mix(in srgb, ${selected} 10%, transparent)` };
}

function StageTime({ value, upcoming }: { value: Date | null; upcoming: boolean }) {
  if (!value || Number.isNaN(value.getTime())) return <span className="text-muted-foreground">{upcoming ? "Upcoming" : "Time unavailable"}</span>;
  return <time dateTime={value.toISOString()} className="block text-muted-foreground">
    <span className="block">{value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
    <span className="block">{value.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}</span>
  </time>;
}

function primaryStage(status: AssessmentSummary["status"]): number | null {
  switch (status) {
    case "DRAFT": return 0;
    case "SCORED": return 1;
    case "UNDER_REVIEW": return 2;
    case "COMPLETED": return 3;
    default: return null;
  }
}

function assessmentAction(latest: AssessmentSummary, canEdit: boolean): string {
  if (latest.myAction === "CORRECT_DRAFT" && canEdit) return "Make corrections";
  if (latest.myAction === "SEND_FOR_REVIEW") return "Review & send";
  if (latest.status === "DRAFT" && canEdit) return "Continue assessment";
  if (latest.status === "SCORED") return "View score";
  if (latest.status === "UNDER_REVIEW") return "View review";
  if (latest.status === "COMPLETED") return "View result";
  return "Open assessment";
}

function assessmentNextStep(latest: AssessmentSummary, remaining: number | null, review: ClinicalReview | null): { title: string; detail: string } {
  switch (latest.status) {
    case "DRAFT":
      if (latest.myAction === "CORRECT_DRAFT") return { title: "Corrections requested", detail: "Open the draft to review and update the answers." };
      if (remaining !== null && remaining > 0) return { title: `${remaining} required ${remaining === 1 ? "answer" : "answers"} remaining`, detail: "Continue the questionnaire to complete the required answers." };
      if (remaining === 0) return { title: "Required answers complete", detail: "Review the draft before submitting it for scoring." };
      return { title: "Questionnaire in progress", detail: "Open the draft to continue the assessment." };
    case "SCORED": return latest.myAction === "SEND_FOR_REVIEW"
      ? { title: "Ready for clinical review", detail: "Review the score and send the assessment for clinical review." }
      : { title: "Score available", detail: "Open the assessment to view its score and next steps." };
    case "UNDER_REVIEW": return review?.state === "QUEUED"
      ? { title: "Awaiting reviewer", detail: "This assessment is ready for an eligible clinician to claim." }
      : { title: "Clinical review in progress", detail: "The assessment is with the clinical review team." };
    case "COMPLETED": return { title: "Clinical review complete", detail: "The final assessment result is available to view." };
    default: return { title: assessmentStatusLabels[latest.status], detail: "Open the assessment for its current status and next steps." };
  }
}

function scorePoint(summary: AssessmentSummary, record: AssessmentWorkflow, reviewed?: AssessmentScoreReviews | null): ScorePoint | null {
  const result = assessmentResultView(record)?.result;
  if (result?.score === null || result?.score === undefined || !result.clinicalUsePermitted) return null;
  if (summary.status === "COMPLETED") {
    if (reviewed?.overall.reviewedPoints === null || reviewed?.overall.reviewedPoints === undefined || !["ORIGINAL", "CONFIRMED"].includes(reviewed.risk?.status ?? "")) return null;
    return { reference: summary.reference, date: summary.completedAt ?? new Date(result.calculatedAt), score: reviewed.overall.reviewedPoints, risk: reviewed.risk?.classification?.label ?? null, color: reviewed.risk?.classification?.color, status: summary.status };
  }
  return { reference: summary.reference, date: new Date(result.calculatedAt), score: result.score, risk: result.classification?.label ?? null, color: result.classification?.color, status: summary.status };
}

function scoreReviewLabel(status: ScorePoint["status"]): string {
  return status === "COMPLETED" ? "Clinically reviewed score" : status === "UNDER_REVIEW" ? "Score under clinical review" : "Score awaiting clinical review";
}

function ScoreTrend({ points }: { points: ScorePoint[] }) {
  const ordered = [...points].reverse();
  const values = ordered.map(point => point.score);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max(5, Math.ceil((max - min) * .2));
  const lower = min - padding, upper = max + padding;
  const width = 500, top = 24, bottom = 128, left = 30, right = 470;
  const coordinates = ordered.map((point, index) => ({
    x: left + index * (right - left) / (ordered.length - 1),
    y: top + (upper - point.score) / (upper - lower) * (bottom - top),
  }));
  const latest = points[0]!, previous = points[1]!;
  const change = latest.score - previous.score;
  const changeLabel = change === 0 ? "No change" : `${change > 0 ? "+" : ""}${change} points`;
  const line = coordinates.map(point => `${point.x},${point.y}`).join(" ");
  const area = `M ${left} ${bottom} L ${coordinates.map(point => `${point.x} ${point.y}`).join(" L ")} L ${right} ${bottom} Z`;
  return <section className="surface flex h-full min-w-0 flex-col overflow-hidden p-5 sm:p-6" aria-label="NIQ score trend">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="font-semibold">NIQ score trend</h2><p className="mt-1 text-sm text-muted-foreground">{scoreReviewLabel(latest.status)}</p></div>
      {latest.risk && <span className="rounded-full border px-2.5 py-1 text-xs font-semibold" style={riskBadgeStyle(latest.color)}>{latest.risk}</span>}
    </div>
    <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-2">
      <strong className="text-4xl leading-none font-semibold tabular-nums">{latest.score}<span className="ml-1 text-base font-normal text-muted-foreground">pts</span></strong>
      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{changeLabel} <span className="font-normal">vs previous</span></span>
    </div>
    <div className="mt-auto pt-5">
      <svg className="h-36 w-full text-foreground" viewBox={`0 0 ${width} 150`} role="img" aria-label={ordered.map(point => `${point.reference}: ${point.score} points${point.risk ? `, ${point.risk}` : ""}`).join("; ")}>
        <defs><linearGradient id="patient-score-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".2" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
        {[top, (top + bottom) / 2, bottom].map(y => <line key={y} x1={left} x2={right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 5" />)}
        <text x="0" y={top + 4} fill="var(--muted-foreground)" fontSize="10">{upper}</text>
        <text x="0" y={bottom + 4} fill="var(--muted-foreground)" fontSize="10">{lower}</text>
        <path d={area} fill="url(#patient-score-area)" />
        <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((position, index) => <g key={ordered[index]!.reference}>
          <title>{ordered[index]!.reference}: {ordered[index]!.score} points</title>
          <circle cx={position.x} cy={position.y} r={index === ordered.length - 1 ? 6 : 4.5} fill={index === ordered.length - 1 ? "var(--primary)" : "var(--card)"} stroke="var(--primary)" strokeWidth="2.5" />
          {(ordered.length <= 4 || index === 0 || index === ordered.length - 1) && <text x={position.x} y={position.y - 12} textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="700">{ordered[index]!.score}</text>}
        </g>)}
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <p><span className="block text-muted-foreground">First shown</span><span className="font-medium"><DateDisplay value={ordered[0]!.date} /> · {ordered[0]!.score} pts</span></p>
        <p className="text-right"><span className="block text-muted-foreground">Latest</span><span className="font-medium"><DateDisplay value={latest.date} /> · {latest.score} pts</span></p>
      </div>
    </div>
  </section>;
}

function ScoreTrendPlaceholder({ first, loading }: { first?: ScorePoint; loading: boolean }) {
  if (first && !loading) return <section className="surface flex h-full min-w-0 flex-col overflow-hidden p-5 sm:p-6" aria-label="NIQ score trend">
    <div><h2 className="font-semibold">NIQ score trend</h2><p className="mt-1 text-sm text-muted-foreground">{scoreReviewLabel(first.status)}</p></div>
    <div className="flex flex-1 flex-col justify-center py-6">
      <div className="rounded-2xl border border-border bg-muted/20 p-5">
        <p className="text-sm font-medium text-muted-foreground">First recorded score</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <strong className="text-4xl font-semibold tabular-nums" style={first.risk ? { color: riskColor(first.color) } : undefined}>{first.score}{" "}<span className="text-base font-normal text-muted-foreground">points</span></strong>
          {first.risk && <span className="rounded-full border px-3 py-1 text-sm font-semibold" style={riskBadgeStyle(first.color)}>{first.risk}</span>}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Recorded <DateDisplay value={first.date} /></p>
      </div>
      <div className="mt-5 flex items-center gap-2" aria-hidden="true"><span className="size-3 shrink-0 rounded-full bg-primary" /><span className="h-0 flex-1 border-t border-dashed border-border" /><span className="size-3 shrink-0 rounded-full border-2 border-border bg-card" /></div>
      <div className="mt-2 flex justify-between gap-3 text-xs"><span className="font-medium">First score</span><span className="text-muted-foreground">Next score</span></div>
      <p className="mt-5 text-sm text-muted-foreground">A trend will appear after another assessment is scored and available for clinical use.</p>
    </div>
  </section>;
  return <section className="surface flex h-full min-w-0 flex-col overflow-hidden p-5 sm:p-6" aria-label="NIQ score trend">
    <div><h2 className="font-semibold">NIQ score trend</h2><p className="mt-1 text-sm text-muted-foreground">Scores approved for clinical use</p></div>
    <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
      <svg className="mb-5 h-36 w-full max-w-72 text-primary" viewBox="0 0 280 140" role="img" aria-label="Illustration of a score trend waiting to be drawn">
        <rect x="1" y="1" width="278" height="138" rx="18" fill="var(--primary)" fillOpacity=".04" stroke="var(--border)" />
        <path d="M 30 110 H 252 M 30 72 H 252 M 30 34 H 252" stroke="var(--border)" strokeDasharray="4 6" />
        <path d="M 44 97 C 92 86 105 93 145 68 S 208 65 237 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 7" opacity=".55" />
        <circle cx="44" cy="97" r="6" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
        <circle cx="145" cy="68" r="6" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
        <circle cx="237" cy="40" r="7" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
      </svg>
      <p className="font-semibold">{loading ? "Loading score history…" : "No NIQ scores yet"}</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{loading ? "Checking recent assessments." : "Scores appear here after an assessment is scored and available for clinical use. A trend line needs at least two scores."}</p>
    </div>
  </section>;
}

export function PatientAssessmentOverview({ history, state, organizationId, membershipId, canRead, canEdit }: {
  history: AssessmentSummary[]; state: "loading" | "ready" | "error"; organizationId: string; membershipId: string; canRead: boolean; canEdit: boolean;
}) {
  const latest = history[0];
  const [details, setDetails] = useState<{ latest: AssessmentWorkflow | null; review: ClinicalReview | null; scores: ScorePoint[]; loading: boolean }>({ latest: null, review: null, scores: [], loading: false });
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const claimKey = useRef<string | null>(null);
  useEffect(() => {
    if (state !== "ready" || !latest || !canRead) { setDetails({ latest: null, review: null, scores: [], loading: false }); return; }
    let active = true;
    setClaimError(""); claimKey.current = null;
    setDetails({ latest: null, review: null, scores: [], loading: true });
    const scored = history.filter(item => scoredStatuses.has(item.status)).slice(0, 8);
    const candidates = [...new Map([latest, ...scored].map(item => [item.id, item])).values()];
    const reviewRequest = latest.status === "UNDER_REVIEW" || latest.status === "COMPLETED"
      ? getClinicalReview(organizationId, latest.id).catch(() => null)
      : Promise.resolve(null);
    Promise.all([Promise.allSettled(candidates.map(async summary => {
      const record = await getAssessment(organizationId, summary.id);
      const reviewed = summary.status === "COMPLETED" ? await assessmentRequest<AssessmentScoreReviews>(organizationId, `/assessments/${summary.id}/score-reviews`).catch(() => null) : null;
      return { summary, record, reviewed };
    })), reviewRequest]).then(([results, review]) => {
      if (!active) return;
      const loaded = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
      const scores = loaded.flatMap(({ summary, record, reviewed }) => {
        const point = scoredStatuses.has(summary.status) ? scorePoint(summary, record, reviewed) : null;
        return point ? [point] : [];
      });
      setDetails({ latest: loaded.find(item => item.summary.id === latest.id)?.record ?? null, review, scores, loading: false });
    });
    return () => { active = false; };
  }, [canRead, history, latest, organizationId, state]);
  const canClaim = latest?.status === "UNDER_REVIEW" && details.review?.state === "QUEUED" && details.review.allowedActions.includes("CLAIM");
  const assignedToMe = !!details.review?.assignee && details.review.assignee.membershipId === membershipId;
  async function claimReview() {
    if (!latest || !canClaim || !details.review || claiming) return;
    setClaiming(true); setClaimError("");
    const requestKey = claimKey.current ?? crypto.randomUUID();
    claimKey.current = requestKey;
    try {
      const review = await changeClinicalReview(organizationId, latest.id, {
        action: "CLAIM", expectedRevision: details.review.revision, expectedScoreRevision: details.review.scoreRevision, requestKey,
      });
      claimKey.current = null;
      setDetails(current => ({ ...current, review }));
    } catch (cause) {
      if (cause instanceof AssessmentRequestError && cause.status === 409) claimKey.current = null;
      try {
        const review = await getClinicalReview(organizationId, latest.id);
        setDetails(current => ({ ...current, review }));
        if (review.assignee?.membershipId === membershipId) { claimKey.current = null; return; }
      } catch { /* Keep the last known review so the action can be retried. */ }
      setClaimError(cause instanceof Error ? cause.message : "Could not claim this review. Please try again.");
    } finally { setClaiming(false); }
  }
  const latestScore = details.scores.find(point => point.reference === latest?.reference);
  const draft = latest?.status === "DRAFT" || latest?.status === "READY_FOR_SCORING";
  const remaining = details.latest?.progress.required === undefined ? null : Math.max(0, details.latest.progress.required - details.latest.progress.answered);
  const nextStep = latest ? assessmentNextStep(latest, remaining, details.review) : null;
  const stage = latest ? primaryStage(latest.status) : null;
  const scoredAt = details.latest ? assessmentResultView(details.latest)?.result.calculatedAt : null;
  const stageTimes = latest ? [latest.createdAt, scoredAt ? new Date(scoredAt) : null, details.review?.submittedAt ? new Date(details.review.submittedAt) : null, latest.completedAt] : [];
  const showTrend = canRead && state !== "error";
  return <div className={`mb-5 grid min-w-0 items-stretch gap-5 ${showTrend ? "lg:grid-cols-2" : ""}`}>
    <section className="surface flex h-full min-w-0 flex-col overflow-hidden" aria-label="Latest assessment">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-primary/5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="size-5" /></span><div className="min-w-0">
          <h2 className="font-semibold">Latest assessment</h2>
          {state === "loading" ? <p className="mt-2 text-sm text-muted-foreground">Loading assessment history…</p>
            : state === "error" ? <p className="mt-2 text-sm text-muted-foreground">Assessment history is unavailable.</p>
            : !latest ? <p className="mt-2 text-sm text-muted-foreground">No assessments yet.</p>
            : <><div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-medium">{latest.reference}</span><StatusBadge status={assessmentStatusLabels[latest.status]} /></div><p className="mt-2 text-sm text-muted-foreground">{latest.facility?.name ?? "No facility"} · Started <DateDisplay value={latest.createdAt} /></p></>}
        </div></div>
        {latest && canRead && <div className="flex flex-wrap items-center gap-2">
          {canClaim && <Button className="min-h-10" isDisabled={claiming} onPress={() => { void claimReview(); }}><UserRoundCheck className="size-4" aria-hidden="true" />{claiming ? "Claiming…" : "Claim review"}</Button>}
          <Link className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${canClaim ? "border border-border bg-card text-foreground hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`} to={`/assessments/${latest.reference}`}>{assignedToMe && latest.status === "UNDER_REVIEW" ? "Continue review" : assessmentAction(latest, canEdit)}<ArrowRight className="size-4" /></Link>
        </div>}
      </div>
      {latest && nextStep && <div className="flex flex-1 flex-col justify-center gap-5 px-5 py-5 sm:px-6">
        <div className="rounded-xl border border-primary/15 bg-card/80 p-4">
          <p className="font-semibold text-foreground">{nextStep.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{nextStep.detail}</p>
          {details.review && (latest.status === "UNDER_REVIEW" || latest.status === "COMPLETED") && <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm"><UserRoundCheck className="size-4 text-primary" aria-hidden="true" /><span className="text-muted-foreground">{latest.status === "COMPLETED" ? "Reviewed by" : "Assigned reviewer"}</span><span className="font-medium">{details.review.assignee ? `${details.review.assignee.displayName} · ${membershipRoleLabels[details.review.assignee.role]}` : "Not claimed yet"}</span></p>}
          {!details.loading && !details.review && latest.status === "UNDER_REVIEW" && <p className="mt-3 text-sm text-muted-foreground">Reviewer details are unavailable.</p>}
          {claimError && <p role="alert" className="mt-2 text-sm text-destructive">{claimError}</p>}
          {latest.status === "COMPLETED" && latest.completedAt && <p className="mt-2 text-xs text-muted-foreground">Completed <DateDisplay value={latest.completedAt} /></p>}
        </div>
        {stage !== null && <ol className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-4" aria-label="Assessment stages">
          {assessmentStages.map((label, index) => <li key={label} className={`relative grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 text-xs sm:block ${index <= stage ? "font-semibold text-foreground" : "text-muted-foreground"}`} aria-current={index === stage ? "step" : undefined}>
            {index < assessmentStages.length - 1 && <>
              <span className={`absolute left-3 top-3 h-[calc(100%+1rem)] w-px sm:hidden ${index < stage ? "bg-primary" : "bg-border"}`} aria-hidden="true" />
              <span className={`absolute left-3 top-3 hidden h-px w-[calc(100%+0.75rem)] sm:block ${index < stage ? "bg-primary" : "bg-border"}`} aria-hidden="true" />
            </>}
            <span className={`relative row-span-2 grid size-6 shrink-0 place-items-center rounded-full border sm:row-auto ${index < stage ? "border-primary bg-primary text-primary-foreground" : index === stage ? "border-primary bg-card text-primary" : "border-border bg-card"}`} aria-hidden="true">{index < stage ? <Check className="size-3.5" /> : index + 1}</span>
            <span className="block sm:mt-2">{label}</span>
            <span className="mt-1 block font-normal"><StageTime value={stageTimes[index] ?? null} upcoming={index > stage} /></span>
          </li>)}
        </ol>}
      </div>}
      {latest && canRead && details.latest && draft && <div className="border-t px-5 py-4 sm:px-6"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Questionnaire progress</span><span className="text-muted-foreground">{details.latest.progress.percent === null ? "Unavailable" : `${details.latest.progress.answered}/${details.latest.progress.required} required answers`}</span></div>{details.latest.progress.percent !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Questionnaire progress" aria-valuenow={details.latest.progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${details.latest.progress.percent}%` }} /></div>}</div>}
      {latest && canRead && latestScore && <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t px-5 py-4 sm:px-6"><span className="text-sm text-muted-foreground">NIQ score</span><strong className="text-2xl tabular-nums" style={latestScore.risk ? { color: riskColor(latestScore.color) } : undefined}>{latestScore.score} <span className="text-sm font-normal">points</span></strong>{latestScore.risk && <span data-testid="patient-risk-label" className="rounded-full border px-2.5 py-1 text-sm font-semibold" style={riskBadgeStyle(latestScore.color)}>{latestScore.risk}</span>}</div>}
      {latest && canRead && details.loading && <p className="border-t px-5 py-3 text-sm text-muted-foreground">Loading assessment details…</p>}
    </section>
    {showTrend && (details.scores.length >= 2 ? <ScoreTrend points={details.scores} /> : <ScoreTrendPlaceholder first={details.scores[0]} loading={state === "loading" || details.loading} />)}
  </div>;
}
