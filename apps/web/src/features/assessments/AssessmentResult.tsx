import { assessmentScoreResultSchema, type AssessmentWorkflow } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ScoreRecord = Pick<AssessmentWorkflow, "reference" | "result" | "binding" | "manifest" | "progress" | "reports">;
/** Group only returned points, never questionnaire option values or client-side cutoffs. */
export function assessmentResultView(record: ScoreRecord) {
  const parsed = assessmentScoreResultSchema.safeParse(record.result);
  if (!parsed.success) return null;
  const result = parsed.data;
  if (result.version !== record.binding.version || result.checksum !== record.binding.checksum) return null;
  const expected = record.manifest.sections.flatMap(s => s.fields.filter(f => f.owner === "scoring").map(f => ({ id: f.id, sectionId: s.id })));
  const components = result.components;
  if (components.length !== expected.length || new Set(components.map(c => c.id)).size !== expected.length || components.some(c => !expected.some(f => f.id === c.id && f.sectionId === c.sectionId) || (c.status === "answered") !== (c.points !== null))) return null;
  const total = components.reduce((sum, c) => sum + (c.points ?? 0), 0);
  if (result.score === null) {
    if (components.some(component => component.status !== "unanswered")) return null;
  } else if (!Number.isFinite(total) || Math.abs(total - result.score) > Number.EPSILON * Math.max(1, total, result.score) * expected.length) return null;
  return { result, sections: record.manifest.sections.map(section => {
    const fields = components.filter(c => c.sectionId === section.id);
    const answered = fields.filter(c => c.status === "answered").length;
    const unanswered = fields.filter(c => c.status === "unanswered").length;
    const unresolved = fields.filter(c => c.status === "pending").length;
    const points = answered ? fields.reduce((sum, c) => sum + (c.points ?? 0), 0) : null;
    const label = !fields.length ? "Not scored" : answered === fields.length ? "Section score" : answered ? "Answered subtotal" : unresolved ? "Unresolved answers" : "Not answered";
    return { ...section, points, label, unanswered, unresolved, unresolvedReasons: fields.filter(c => c.status === "pending").map(c => ({ id: c.id, label: c.label, reason: c.reason || "The scoring service could not resolve this answer." })), progress: record.progress.sections.find(p => p.id === section.id) };
  }) };
}

/** Scores come only from the verified server result. Partial totals stay identifiable. */
export function sectionScoreLabel(section: { points: number | null; unanswered: number; unresolved: number }) {
  return section.points === null ? null : `${section.points} pts${section.unanswered || section.unresolved ? " (partial)" : ""}`;
}

export function AssessmentResult({ record, onSection }: { record: ScoreRecord; onSection: (id: string) => void }) {
  const view = assessmentResultView(record);
  if (!view) return <Alert variant="destructive"><AlertDescription>The saved score could not be verified. Refresh the assessment or contact your administrator.</AlertDescription></Alert>;
  const { result, sections } = view;
  return <div className="grid min-w-0 gap-5">
    <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">Assessment Report · {record.reference}</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><p className="text-sm text-muted-foreground">Required answers</p><p className="mt-1 text-3xl font-semibold">{record.progress.percent === 100 ? "Complete" : record.progress.percent === null ? "Unavailable" : `${record.progress.answered}/${record.progress.required}`}</p><p className="mt-1 text-sm text-muted-foreground">{record.progress.answered} of {record.progress.required} required answers</p></div>
        <div><p className="text-sm text-muted-foreground">NIQ questionnaire score</p><p className="mt-1 text-3xl font-semibold">{result.score === null ? "—" : <>{result.score} <span className="text-base font-normal">points</span></>}</p>{result.classification && <p className="mt-1 font-medium">{result.classification.label}</p>}</div></div>
      {result.classification?.interpretation && <p className="mt-4 text-sm text-muted-foreground">{result.classification.interpretation}</p>}
      {!result.clinicalUsePermitted && <Alert className="mt-4"><AlertDescription>This result is not approved for clinical use.</AlertDescription></Alert>}
    </section>
    <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-semibold">Section results</h3><div className="mt-3 divide-y divide-border">{sections.map(section => <div key={section.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div><h4 className="font-medium">{section.title}</h4></div>
      <div className="text-sm"><p>{sectionScoreLabel(section) ?? section.label}</p>{section.unanswered > 0 && <p className="text-muted-foreground">{section.unanswered} unanswered</p>}{section.unresolved > 0 && <p className="text-muted-foreground">{section.unresolved} unresolved</p>}{section.unresolvedReasons.length > 0 && <ul className="mt-1 space-y-1 text-muted-foreground">{section.unresolvedReasons.map(item => <li className="break-words" key={item.id}>{item.label}: {item.reason}</li>)}</ul>}</div><Button variant="outline" onPress={() => onSection(section.id)}>View answers</Button>
    </div>)}</div></section>
    <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Attachments</h3><Button variant="outline" onPress={() => onSection("reports")}>View attachments</Button></div><p className="mt-2 text-sm text-muted-foreground">{record.reports.length} reports · {record.reports.reduce((sum, report) => sum + report.files.filter(file => file.status === "READY").length, 0)} files</p></section>
  </div>;
}
