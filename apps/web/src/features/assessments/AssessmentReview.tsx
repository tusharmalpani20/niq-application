import { assessmentFieldError, getAssessmentAnswerCoverage, isAssessmentFieldApplicable, type AssessmentWorkflow, type FaceScanSession, type FormAnswers } from "@niq/application-contracts";
import { Fragment } from "react";
import { assessmentResultView, sectionScoreLabel } from "./AssessmentResult";
import { FaceScanResults } from "./FaceScanResults";
import { Button } from "@/components/ui/button";

export function AssessmentReview({ record, answers, scanStatus, scanSession, onSection }: { record: AssessmentWorkflow; answers: FormAnswers; scanStatus: string; scanSession: FaceScanSession | null; onSection: (id: string, fieldId?: string) => void }) {
  const scored = assessmentResultView(record);
  const completion = getAssessmentAnswerCoverage(record.manifest, answers);
  const missing = record.manifest.sections.flatMap(section => section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers) && assessmentFieldError(field, answers[field.id])).map(field => ({ sectionId: section.id, field, error: assessmentFieldError(field, answers[field.id]) })));
  const readyFiles = record.reports.reduce((total, report) => total + report.files.filter(file => file.status === "READY").length, 0);
  return <div className="grid min-w-0 gap-4">
    {!scored && <section className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">Submission readiness</h3>
      {missing.length > 0 ? <><p className="mt-2 text-sm text-muted-foreground">Check these answers before submitting.</p><ul className="mt-3 grid gap-1">{missing.map(({ sectionId, field, error }) => <li key={field.id}><Button className="h-auto min-h-11 whitespace-normal text-left" variant="link" onPress={() => onSection(sectionId, field.id)}>{field.label}: {error === "Required" ? "Not answered" : error}</Button></li>)}</ul></> : <p className="mt-2 text-sm text-muted-foreground">Required answers are complete.</p>}
    </section>}
    <div className="overflow-hidden rounded-xl border border-border bg-card">{record.manifest.sections.map(section => {
      const progress = completion.sections.find(item => item.id === section.id)!;
      const score = scored?.sections.find(item => item.id === section.id);
      return <Fragment key={section.id}><details open={missing.some(item => item.sectionId === section.id)} className="min-w-0 border-b border-border px-4 last:border-0">
        <summary className="min-h-14 cursor-pointer rounded-md py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-semibold">{section.title}</span><span className="ml-2 inline-block text-sm text-muted-foreground">{score && sectionScoreLabel(score) ? `${sectionScoreLabel(score)} · ` : ""}{`${progress.answered}/${progress.total} answered`}</span></summary>
        <div className="mb-4 mt-2 flex justify-end"><Button className="min-h-11" variant="outline" onPress={() => onSection(section.id)} aria-label={`${record.status === "DRAFT" ? "Edit" : "View"} ${section.title}`}>{record.status === "DRAFT" ? "Edit answers" : "View answers"}</Button></div>
        <dl className="mb-4 grid min-w-0 gap-3">{section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers)).map(field => {
          const value = answers[field.id];
          const empty = value === null || value === undefined || value === "" || typeof value === "string" && !value.trim();
          const display = empty ? "Not answered" : Array.isArray(value) ? value.length ? value.map(id => field.options?.find(option => option.id === id)?.label ?? id).join(", ") : "None" : field.options?.find(option => option.id === value)?.label ?? String(value);
          const error = assessmentFieldError(field, value);
          return <div key={field.id} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-1 border-b border-border pb-3 last:border-0"><dt className="break-words text-sm text-muted-foreground">{field.label}{field.required && " *"}</dt><dd className={`min-w-0 break-words ${error ? "text-destructive" : ""}`}>{display}{field.unit && !empty && ` ${field.unit}`}{error && error !== "Required" && <p className="mt-1 text-sm">{error}</p>}</dd></div>;
        })}</dl>
      </details>
      {section.id === "personal_details" && <details className="min-w-0 border-b border-border px-4">
        <summary className="min-h-14 cursor-pointer rounded-md py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-semibold">Face scan</span><span className="ml-2 inline-block text-sm text-muted-foreground">{scanStatus}</span></summary>
        <div className="mb-4 mt-2 space-y-4">
          {scanSession?.state === "COMPLETED" && scanSession.result ? <FaceScanResults session={scanSession}/> : <p className="text-sm text-muted-foreground">{scanStatus === "Done" ? "Loading saved scan results…" : "No completed face scan results are available."}</p>}
          <div className="flex justify-end"><Button className="min-h-11" variant="outline" onPress={() => onSection("face_scan")}>Go to Face scan</Button></div>
        </div>
      </details>}
      </Fragment>;
    })}
    <details className="min-w-0 px-4">
      <summary className="min-h-14 cursor-pointer rounded-md py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-semibold">Attachments</span><span className="ml-2 inline-block text-sm text-muted-foreground">{record.reports.length} reports · {readyFiles} files ready</span></summary>
      <div className="mb-4 mt-2 space-y-4">
        {record.reports.length ? <ul className="grid gap-2 text-sm">{record.reports.map((report, index) => <li key={report.id} className="flex flex-wrap justify-between gap-2"><span className="font-medium">{report.label || `Report ${index + 1}`}</span><span className="text-muted-foreground">{report.files.filter(file => file.status === "READY").length}/{report.files.length} files ready</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No attachments added.</p>}
        <div className="flex justify-end"><Button className="min-h-11" variant="outline" onPress={() => onSection("reports")}>Review attachments</Button></div>
      </div>
    </details>
    </div>
  </div>;
}
