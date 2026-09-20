import { getAssessmentCompletion, isAssessmentFieldApplicable, type AssessmentWorkflow, type FormAnswers } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";

export function AssessmentReview({ record, answers, onSection }: { record: AssessmentWorkflow; answers: FormAnswers; onSection: (id: string) => void }) {
  const completion = getAssessmentCompletion(record.manifest, answers);
  return <div className="grid gap-5"><div className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">Review assessment</h2><p className="mt-2 text-muted-foreground">{completion.percent ?? "—"}% of required questions complete. Review your responses before requesting a score.</p><p className="mt-1 text-sm text-muted-foreground">Optional questions can remain unanswered. Questionnaire completion and clinical scores measure different things.</p></div>
    {record.manifest.sections.map(section => {
      const progress = completion.sections.find(item => item.id === section.id)!;
      return <section key={section.id} className="rounded-xl border border-border bg-card p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{section.title}</h3><Button variant="outline" onPress={() => onSection(section.id)}>{record.status === "DRAFT" ? "Edit" : "View"}</Button></div><p className="mb-3 text-sm text-muted-foreground">{progress.required ? `${progress.percent}% complete · ${progress.answered}/${progress.required} required` : "No required questions"}</p><dl className="grid gap-3">{section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers)).map(field => {
        const value = answers[field.id];
        const display = value === null || value === undefined || value === "" ? "Not answered" : Array.isArray(value) ? value.length ? value.map(id => field.options?.find(option => option.id === id)?.label ?? id).join(", ") : "None" : field.options?.find(option => option.id === value)?.label ?? String(value);
        return <div key={field.id} className="grid gap-1 border-b border-border pb-3 last:border-0 sm:grid-cols-2"><dt className="text-sm text-muted-foreground">{field.label}{field.required && " *"}</dt><dd className={progress.missingFieldIds.includes(field.id) ? "text-destructive" : ""}>{display}{field.unit && value !== null && value !== undefined && ` ${field.unit}`}</dd></div>;
      })}</dl></section>;
    })}
    <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-semibold">Reports</h3><p className="mt-2 text-muted-foreground">{record.reports.length} reports · {record.reports.reduce((total, report) => total + report.files.filter(file => file.status === "READY").length, 0)} files ready</p><Button variant="link" onPress={() => onSection("reports")}>Review reports</Button></section>
  </div>;
}
