import type { AssessmentScoreReviews, AssessmentSummary, AssessmentWorkflow } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";
import { assessmentResultView } from "../features/assessments/AssessmentResult";
import { assessmentRequest, getAssessment } from "../features/assessments/workflow-api";
import { assessmentStatusLabels } from "../lib/patient-display";
import { DateDisplay } from "./DateDisplay";
import { StatusBadge } from "./StatusBadge";

type ScorePoint = { reference: string; date: Date; score: number; risk: string | null };
const scoredStatuses = new Set(["SCORED", "COMPLETED"]);

function scorePoint(summary: AssessmentSummary, record: AssessmentWorkflow, reviewed?: AssessmentScoreReviews | null): ScorePoint | null {
  const result = assessmentResultView(record)?.result;
  if (result?.score === null || result?.score === undefined || !result.clinicalUsePermitted) return null;
  if (summary.status === "COMPLETED") {
    if (reviewed?.overall.reviewedPoints === null || reviewed?.overall.reviewedPoints === undefined || !["ORIGINAL", "CONFIRMED"].includes(reviewed.risk?.status ?? "")) return null;
    return { reference: summary.reference, date: summary.completedAt ?? new Date(result.calculatedAt), score: reviewed.overall.reviewedPoints, risk: reviewed.risk?.classification?.label ?? null };
  }
  return { reference: summary.reference, date: new Date(result.calculatedAt), score: result.score, risk: result.classification?.label ?? null };
}

function ScoreTrend({ points }: { points: ScorePoint[] }) {
  const ordered = [...points].reverse();
  const values = ordered.map(point => point.score);
  const min = Math.min(...values), max = Math.max(...values);
  const width = 500, height = 100, inset = 12;
  const coordinates = ordered.map((point, index) => ({
    x: inset + index * (width - inset * 2) / (ordered.length - 1),
    y: height - inset - (max === min ? 0.5 : (point.score - min) / (max - min)) * (height - inset * 2),
  }));
  const latest = points[0]!, previous = points[1]!;
  const change = latest.score - previous.score;
  return <section className="surface mb-5 p-5" aria-label="NIQ score trend">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><h2 className="font-semibold">NIQ score trend</h2><p className="mt-1 text-sm text-muted-foreground">Recent scored assessments</p></div>
      <p className="text-sm font-medium">{change === 0 ? "No change" : `${change > 0 ? "+" : ""}${change} points`} <span className="font-normal text-muted-foreground">since previous score{latest.risk ? ` · ${latest.risk}` : ""}</span></p>
    </div>
    <svg className="mt-5 h-28 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ordered.map(point => `${point.reference}: ${point.score} points${point.risk ? `, ${point.risk}` : ""}`).join("; ")}>
      <line x1={inset} x2={width - inset} y1={height - inset} y2={height - inset} stroke="var(--border)" />
      <polyline points={coordinates.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.map((position, index) => <circle key={ordered[index]!.reference} cx={position.x} cy={position.y} r="5" fill="var(--primary)" stroke="var(--card)" strokeWidth="2" />)}
    </svg>
    <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground"><span><DateDisplay value={ordered[0]!.date} /> · {ordered[0]!.score} pts</span><span><DateDisplay value={latest.date} /> · {latest.score} pts</span></div>
  </section>;
}

export function PatientAssessmentOverview({ history, state, organizationId, canRead, canEdit }: {
  history: AssessmentSummary[]; state: "loading" | "ready" | "error"; organizationId: string; canRead: boolean; canEdit: boolean;
}) {
  const latest = history[0];
  const [details, setDetails] = useState<{ latest: AssessmentWorkflow | null; scores: ScorePoint[]; loading: boolean }>({ latest: null, scores: [], loading: false });
  useEffect(() => {
    if (state !== "ready" || !latest || !canRead) { setDetails({ latest: null, scores: [], loading: false }); return; }
    let active = true;
    setDetails({ latest: null, scores: [], loading: true });
    const scored = history.filter(item => scoredStatuses.has(item.status)).slice(0, 8);
    const candidates = [...new Map([latest, ...scored].map(item => [item.id, item])).values()];
    Promise.allSettled(candidates.map(async summary => {
      const record = await getAssessment(organizationId, summary.id);
      const reviewed = summary.status === "COMPLETED" ? await assessmentRequest<AssessmentScoreReviews>(organizationId, `/assessments/${summary.id}/score-reviews`).catch(() => null) : null;
      return { summary, record, reviewed };
    })).then(results => {
      if (!active) return;
      const loaded = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
      const scores = loaded.flatMap(({ summary, record, reviewed }) => {
        const point = scoredStatuses.has(summary.status) ? scorePoint(summary, record, reviewed) : null;
        return point ? [point] : [];
      });
      setDetails({ latest: loaded.find(item => item.summary.id === latest.id)?.record ?? null, scores, loading: false });
    });
    return () => { active = false; };
  }, [canRead, history, latest, organizationId, state]);
  const latestScore = details.scores.find(point => point.reference === latest?.reference);
  const draft = latest?.status === "DRAFT" || latest?.status === "READY_FOR_SCORING";
  return <>
    <section className="surface mb-5 overflow-hidden" aria-label="Latest assessment">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-primary/5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="size-5" /></span><div className="min-w-0">
          <h2 className="font-semibold">Latest assessment</h2>
          {state === "loading" ? <p className="mt-2 text-sm text-muted-foreground">Loading assessment history…</p>
            : state === "error" ? <p className="mt-2 text-sm text-muted-foreground">Assessment history is unavailable.</p>
            : !latest ? <p className="mt-2 text-sm text-muted-foreground">No assessments yet.</p>
            : <><div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-medium">{latest.reference}</span><StatusBadge status={assessmentStatusLabels[latest.status]} /></div><p className="mt-2 text-sm text-muted-foreground">{latest.facility?.name ?? "No facility"} · Started <DateDisplay value={latest.createdAt} /></p></>}
        </div></div>
        {latest && canRead && <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" to={`/assessments/${latest.reference}`}>{canEdit && draft ? "Continue assessment" : "Open assessment"}<ArrowRight className="size-4" /></Link>}
      </div>
      {latest && canRead && details.latest && draft && <div className="border-t px-5 py-4 sm:px-6"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Questionnaire progress</span><span className="text-muted-foreground">{details.latest.progress.percent === null ? "Unavailable" : `${details.latest.progress.answered}/${details.latest.progress.required} required answers`}</span></div>{details.latest.progress.percent !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Questionnaire progress" aria-valuenow={details.latest.progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${details.latest.progress.percent}%` }} /></div>}</div>}
      {latest && canRead && latestScore && <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t px-5 py-4 sm:px-6"><span className="text-sm text-muted-foreground">NIQ score</span><strong className="text-2xl tabular-nums">{latestScore.score} <span className="text-sm font-normal">points</span></strong>{latestScore.risk && <span className="font-medium">{latestScore.risk}</span>}</div>}
      {latest && canRead && details.loading && <p className="border-t px-5 py-3 text-sm text-muted-foreground">Loading assessment details…</p>}
    </section>
    {canRead && details.scores.length >= 2 && <ScoreTrend points={details.scores} />}
  </>;
}
