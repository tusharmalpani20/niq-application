import { assessmentFieldError, getAssessmentAnswerCoverage, getReportSubmissionIssues, isAssessmentFieldApplicable, type AssessmentWorkflow, type FaceScanSession, type FormAnswers } from "@niq/application-contracts";
import { Fragment, useState, type ReactNode } from "react";
import { assessmentResultView, sectionScoreLabel } from "./AssessmentResult";
import { FaceScanResults } from "./FaceScanResults";
import { Button } from "@/components/ui/button";
import { AssessmentReports } from "./AssessmentReports";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, ClipboardList } from "lucide-react";
import { assessmentSectionIcons } from "./AssessmentSectionNavigation";

function ReviewSection({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const Icon = assessmentSectionIcons[id as keyof typeof assessmentSectionIcons] ?? ClipboardList;
  return <div className="overflow-hidden rounded-xl border border-border bg-card">
    <div className={`flex items-center gap-2 px-2 py-1 sm:px-3 ${open ? "bg-muted/40" : ""}`}>
      <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start gap-2 whitespace-normal text-left" aria-expanded={open} aria-controls={`review-section-${id}`} onPress={onToggle}>{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<Icon className="size-4 shrink-0" aria-hidden="true" />{title}</Button>
      <span className="max-w-36 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{summary}</span>
    </div>
    <div id={`review-section-${id}`} hidden={!open} className="border-t border-border p-4">{children}</div>
  </div>;
}

export function AssessmentReview({ record, answers, scanStatus, scanSession, organizationId, assessmentId, onSection }: { record: AssessmentWorkflow; answers: FormAnswers; scanStatus: string; scanSession: FaceScanSession | null; organizationId: string; assessmentId: string; onSection: (id: string, fieldId?: string) => void }) {
  const scored = assessmentResultView(record);
  const completion = getAssessmentAnswerCoverage(record.manifest, answers);
  const missing = record.manifest.sections.flatMap(section => section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers) && assessmentFieldError(field, answers[field.id])).map(field => ({ sectionId: section.id, field, error: assessmentFieldError(field, answers[field.id]) })));
  const readyFiles = record.reports.reduce((total, report) => total + report.files.filter(file => file.status === "READY").length, 0);
  const incompleteReports = record.reports.flatMap((report, index) => {
    const issues = getReportSubmissionIssues(report);
    return issues.length ? [{ index: index + 1, issues }] : [];
  });
  const scanRejected = record.submission?.status === "REJECTED" && record.submission.failureCode === "FACE_SCAN_UNAVAILABLE";
  const blocked = missing.length > 0 || incompleteReports.length > 0 || scanRejected;
  const issueCount = missing.length + incompleteReports.length + (scanRejected ? 1 : 0);
  const [expanded, setExpanded] = useState<string | null>(missing[0]?.sectionId ?? (incompleteReports.length ? "reports" : scanRejected ? "face_scan" : null));
  return <div className="grid min-w-0 gap-4">
    {!scored && <section className={`rounded-xl border p-4 ${blocked ? "border-destructive/40 bg-destructive/5" : "border-primary/25 bg-primary/5"}`}>
      <div className="flex items-center gap-2">{blocked ? <CircleAlert className="size-5 text-destructive" aria-hidden="true"/> : <CheckCircle2 className="size-5 text-primary" aria-hidden="true"/>}<h3 className={`font-semibold ${blocked ? "text-destructive" : ""}`}>{blocked ? `${issueCount} ${issueCount === 1 ? "item needs" : "items need"} attention before submission` : "Ready to submit"}</h3></div>
      {blocked ? <>
        <p className="mt-2 text-sm text-muted-foreground">Select an item below to fix it. You can still save this draft and return later.</p>
        <ul className="mt-3 grid gap-2">
          {missing.map(({ sectionId, field, error }) => <li key={field.id}><Button className="h-auto min-h-14 w-full justify-between gap-3 whitespace-normal border-destructive/25 bg-card px-3 py-2 text-left hover:bg-destructive/5" variant="outline" onPress={() => onSection(sectionId, field.id)}><span className="grid gap-0.5"><span className="text-xs font-normal text-muted-foreground">{record.manifest.sections.find(section => section.id === sectionId)?.title}</span><span className="font-medium text-destructive">{field.label}: {error === "Required" ? "Not answered" : error}</span></span><span className="flex shrink-0 items-center gap-1 text-xs text-destructive">Fix answer <ArrowRight className="size-4" aria-hidden="true"/></span></Button></li>)}
          {incompleteReports.map(({ index, issues }) => <li key={index}><Button className="h-auto min-h-14 w-full justify-between gap-3 whitespace-normal border-destructive/25 bg-card px-3 py-2 text-left hover:bg-destructive/5" variant="outline" onPress={() => onSection("reports")}><span className="font-medium text-destructive">Report {index} needs {issues.map(issue => issue === "name" ? "a report name" : issue === "date" ? "a date" : "an uploaded file").join(" and ")}</span><span className="flex shrink-0 items-center gap-1 text-xs text-destructive">Fix report <ArrowRight className="size-4" aria-hidden="true"/></span></Button></li>)}
          {scanRejected && <li><Button className="h-auto min-h-14 w-full justify-between gap-3 whitespace-normal border-destructive/25 bg-card px-3 py-2 text-left hover:bg-destructive/5" variant="outline" onPress={() => onSection("face_scan")}><span className="font-medium text-destructive">The selected face scan could not be used for scoring.</span><span className="flex shrink-0 items-center gap-1 text-xs text-destructive">Review scan <ArrowRight className="size-4" aria-hidden="true"/></span></Button></li>}
        </ul>
      </> : <p className="mt-2 text-sm text-muted-foreground">Required answers are complete.{!record.reports.length && " Attachments are optional."}</p>}
    </section>}
    <div className="grid gap-2">{record.manifest.sections.map(section => {
      const progress = completion.sections.find(item => item.id === section.id)!;
      const score = scored?.sections.find(item => item.id === section.id);
      const scoreLabel = score && sectionScoreLabel(score);
      return <Fragment key={section.id}><ReviewSection id={section.id} title={section.title} summary={`${progress.answered}/${progress.total} answered${scoreLabel ? ` · ${scoreLabel}` : ""}`} open={expanded === section.id} onToggle={() => setExpanded(expanded === section.id ? null : section.id)}>
        <div className="mb-3 flex justify-end"><Button className="min-h-10" variant="outline" onPress={() => onSection(section.id)} aria-label={`${record.status === "DRAFT" ? "Edit" : "View"} ${section.title}`}>{record.status === "DRAFT" ? "Edit answers" : "View answers"}</Button></div>
        <dl className="grid min-w-0 gap-3">{section.fields.filter(field => field.kind !== "calculated" && isAssessmentFieldApplicable(field, answers)).map(field => {
          const value = answers[field.id];
          const empty = value === null || value === undefined || value === "" || typeof value === "string" && !value.trim();
          const display = empty ? "Not answered" : Array.isArray(value) ? value.length ? value.map(id => field.options?.find(option => option.id === id)?.label ?? id).join(", ") : "None" : field.options?.find(option => option.id === value)?.label ?? String(value);
          const error = assessmentFieldError(field, value);
          return <div key={field.id} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-1 border-b border-border pb-3 last:border-0"><dt className="break-words text-sm text-muted-foreground">{field.label}{field.required && " *"}</dt><dd className={`min-w-0 break-words ${error ? "text-destructive" : ""}`}>{display}{field.unit && !empty && ` ${field.unit}`}{error && error !== "Required" && <p className="mt-1 text-sm">{error}</p>}</dd></div>;
        })}</dl>
      </ReviewSection>
      {section.id === "personal_details" && <ReviewSection id="face_scan" title="Face scan" summary={scanStatus} open={expanded === "face_scan"} onToggle={() => setExpanded(expanded === "face_scan" ? null : "face_scan")}>
        <div className="space-y-4">
          {scanSession?.state === "COMPLETED" && scanSession.result ? <FaceScanResults session={scanSession}/> : <p className="text-sm text-muted-foreground">{scanStatus === "Done" ? "Loading saved scan results…" : "No completed face scan results are available."}</p>}
          <div className="flex justify-end"><Button className="min-h-10" variant="outline" onPress={() => onSection("face_scan")}>Go to Face scan</Button></div>
        </div>
      </ReviewSection>}
      </Fragment>;
    })}
    <ReviewSection id="reports" title="Attachments" summary={`${record.reports.length} reports · ${readyFiles} files ready`} open={expanded === "reports"} onToggle={() => setExpanded(expanded === "reports" ? null : "reports")}>
      <div>
        {record.reports.length ? <AssessmentReports organizationId={organizationId} assessmentId={assessmentId} reports={record.reports} revision={record.revision} readOnly showIntro={false} onChanged={async () => {}} /> : <p className="text-sm text-muted-foreground">No attachments added.</p>}
      </div>
    </ReviewSection>
    </div>
    {record.attestations.length > 0 && <section className="rounded-xl border border-border bg-card p-4" aria-label="Submission verification history">
      <h3 className="font-semibold">Submission verification history</h3>
      <p className="mt-1 text-sm text-muted-foreground">Each confirmation is saved with its scoring request, including requests later returned for correction.</p>
      <ol className="mt-3 divide-y divide-border">{record.attestations.map((item, index) => <li key={item.submissionId} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm"><span><strong>Verification {index + 1}</strong> · {item.actorDisplayName}</span><span className="text-muted-foreground">{new Date(item.confirmedAt).toLocaleString()}</span></li>)}</ol>
    </section>}
  </div>;
}
