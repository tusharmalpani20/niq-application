import { assessmentFieldError, getAssessmentAnswerCoverage, isAssessmentFieldApplicable, type AssessmentWorkflow, type FormAnswers } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";

export function AssessmentReview({ record, answers, onSection }: { record: AssessmentWorkflow; answers: FormAnswers; onSection: (id: string, fieldId?: string) => void }) {
  const completion = getAssessmentAnswerCoverage(record.manifest, answers);
  const missing = record.manifest.sections.flatMap(section => section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers) && assessmentFieldError(field, answers[field.id])).map(field => ({ sectionId: section.id, field, error: assessmentFieldError(field, answers[field.id]) })));
  return <div className="grid min-w-0 gap-4">
    <section className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">Submission readiness</h3>
      {missing.length > 0 ? <><p className="mt-2 text-sm text-muted-foreground">Check these answers before submitting.</p><ul className="mt-3 grid gap-1">{missing.map(({ sectionId, field, error }) => <li key={field.id}><Button className="h-auto min-h-11 whitespace-normal text-left" variant="link" onPress={() => onSection(sectionId, field.id)}>{field.label}: {error === "Required" ? "Not answered" : error}</Button></li>)}</ul></> : <p className="mt-2 text-sm text-muted-foreground">Required answers are complete.</p>}
    </section>
    <div className="overflow-hidden rounded-xl border border-border bg-card">{record.manifest.sections.map(section => {
      const progress = completion.sections.find(item => item.id === section.id)!;
      return <details key={section.id} open={missing.some(item => item.sectionId === section.id)} className="min-w-0 border-b border-border px-4 last:border-0">
        <summary className="min-h-14 cursor-pointer rounded-md py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-semibold">{section.title}</span><span className="ml-2 inline-block text-sm text-muted-foreground">{`${progress.percent}% answered · ${progress.answered}/${progress.total} questions`}</span></summary>
        <div className="mb-4 mt-2 flex justify-end"><Button className="min-h-11" variant="outline" onPress={() => onSection(section.id)} aria-label={`${record.status === "DRAFT" ? "Edit" : "View"} ${section.title}`}>{record.status === "DRAFT" ? "Edit answers" : "View answers"}</Button></div>
        <dl className="mb-4 grid min-w-0 gap-3">{section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers)).map(field => {
          const value = answers[field.id];
          const empty = value === null || value === undefined || value === "" || typeof value === "string" && !value.trim();
          const display = empty ? "Not answered" : Array.isArray(value) ? value.length ? value.map(id => field.options?.find(option => option.id === id)?.label ?? id).join(", ") : "None" : field.options?.find(option => option.id === value)?.label ?? String(value);
          const error = assessmentFieldError(field, value);
          return <div key={field.id} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-1 border-b border-border pb-3 last:border-0"><dt className="break-words text-sm text-muted-foreground">{field.label}{field.required && " *"}</dt><dd className={`min-w-0 break-words ${error ? "text-destructive" : ""}`}>{display}{field.unit && !empty && ` ${field.unit}`}{error && error !== "Required" && <p className="mt-1 text-sm">{error}</p>}</dd></div>;
        })}</dl>
      </details>;
    })}</div>
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><div><h3 className="font-semibold">Reports</h3><p className="mt-1 text-sm text-muted-foreground">{record.reports.length} reports · {record.reports.reduce((total, report) => total + report.files.filter(file => file.status === "READY").length, 0)} files ready</p></div><Button className="min-h-11" variant="link" onPress={() => onSection("reports")}>Review reports</Button></section>
  </div>;
}
