import { AssessmentDateInput } from "./AssessmentDateInput";
import { MonthPicker } from "../../components/ui/month-picker";
import { useEffect, useRef, useState } from "react";
import { getReportSubmissionIssues, REPORT_LIMITS, reportInputSchema, type AssessmentReport, type AssessmentReportLimits } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ChevronRight, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReportMutationError, mutateReport, reportBase, uploadReportFile, type ReportInput } from "./report-api";
import { ReportFilePreview } from "./ReportFilePreview";
import { SavedReportFilePreview } from "./SavedReportFilePreview";

type Props = {
  organizationId: string; assessmentId: string; reports: AssessmentReport[]; revision: number; readOnly?: boolean; limits?: AssessmentReportLimits; showIntro?: boolean;
  onChanged: () => Promise<void>; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void;
};
type Upload = { key: string; reportId: string; file: File; progress: number; error?: string; state: "queued" | "uploading" | "failed" };
type StagedFile = { key: string; file: File };
type Editor = { id?: string; label: string; purpose: string; datePrecision: "DAY" | "MONTH"; date: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
export const formatReportMegabytes = (bytes: number) => Number((bytes / 1024 / 1024).toFixed(2)).toString();
const supported = new Set(["application/pdf", "image/jpeg", "image/png"]);
function dateValue(report: AssessmentReport) {
  if (!report.year || !report.month) return "";
  const month = `${report.year}-${String(report.month).padStart(2, "0")}`;
  return report.datePrecision === "DAY" ? report.day ? `${month}-${String(report.day).padStart(2, "0")}` : "" : month;
}

export function AssessmentReports({ organizationId, assessmentId, reports, revision, readOnly = false, limits = REPORT_LIMITS, showIntro = true, onChanged, onBusyChange, onDirtyChange }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [nameError, setNameError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [remove, setRemove] = useState<{ reportId: string; fileId?: string; label: string } | null>(null);
  const [collapsedReports, setCollapsedReports] = useState<Set<string>>(() => new Set());
  const controller = useRef<AbortController | null>(null);
  const base = reportBase(organizationId, assessmentId);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty || uploads.length > 0 || stagedFiles.length > 0); }, [dirty, uploads.length, stagedFiles.length, onDirtyChange]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const currentBytes = reports.flatMap(report => report.files).reduce((sum, file) => sum + file.size, 0);
  const beginAddReport = () => { setMessage(""); setNameError(false); setStagedFiles([]); setEditor({ label: "", purpose: "", datePrecision: "DAY", date: "" }); };

  async function refresh() {
    try { await onChanged(); } catch { setMessage("Changes may be saved. Refresh this assessment before continuing."); }
  }
  async function saveReport(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    if (!editor.label.trim()) { setNameError(true); return; }
    if (editor.date && !(editor.datePrecision === "DAY" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(editor.date)) { setMessage(editor.datePrecision === "DAY" ? "Enter a complete date in dd/mm/yyyy format." : "Select a month and year."); return; }
    const [year, month, day] = editor.date.split("-").map(Number);
    const input: ReportInput = { revision, label: editor.label, purpose: editor.purpose, datePrecision: editor.datePrecision, year: year || null, month: month || null, day: editor.datePrecision === "DAY" ? day || null : null };
    const parsed = reportInputSchema.safeParse(input);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the report details."); return; }
    setBusy(true); setMessage("");
    let createdReportId: string | undefined;
    try {
      const result = await mutateReport(editor.id ? `${base}/${editor.id}` : base, editor.id ? "PATCH" : "POST", parsed.data);
      if (!editor.id) createdReportId = result.reports.find(report => !reports.some(existing => existing.id === report.id))?.id;
      setEditor(null); setDirty(false);
      if (stagedFiles.length && !editor.id) {
        if (!createdReportId) { setStagedFiles([]); setMessage("Report saved, but its files could not be matched. Refresh before uploading them."); await refresh(); return; }
        const reportId = createdReportId;
        const pending: Upload[] = stagedFiles.map(({ key, file }) => ({ key, file, reportId, progress: 0, state: "queued" }));
        setStagedFiles([]);
        setUploads(previous => [...previous, ...pending]);
        let nextRevision = result.revision;
        for (const upload of pending) {
          const abort = new AbortController(); controller.current = abort;
          setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, state: "uploading" } : item));
          try {
            const updated = await uploadReportFile({ url: `${base}/${reportId}/files`, file: upload.file, revision: nextRevision, requestKey: upload.key, signal: abort.signal, maxFileBytes: limits.fileBytes,
              onProgress: progress => setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, progress } : item)),
            });
            nextRevision = updated.revision;
            setUploads(previous => previous.filter(item => item.key !== upload.key));
          } catch (error) {
            setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, state: "failed", error: errorMessage(error) } : item));
            setMessage("The report was created, but a file did not upload. Check the saved files and retry from the report below.");
            break;
          } finally { controller.current = null; }
        }
      }
      await refresh();
    } catch (error) {
      if (!editor.id && error instanceof ReportMutationError && error.uncertain) {
        // A lost response may follow a committed POST. Do not offer the same create form as a retry.
        setUnconfirmed(editor); setEditor(null); setDirty(false); setStagedFiles([]);
      }
      setMessage(errorMessage(error)); await refresh();
    }
    finally { setBusy(false); }
  }
  function validFiles(files: File[], existingCount: number) {
    if (existingCount + files.length > limits.filesPerReport) { setMessage(`Each report can contain up to ${limits.filesPerReport} files.`); return false; }
    if (files.some(file => !supported.has(file.type) || file.size === 0 || file.size > limits.fileBytes)) { setMessage(`Choose PDF, JPEG or PNG files up to ${formatReportMegabytes(limits.fileBytes)} MB each.`); return false; }
    if (currentBytes + uploads.reduce((sum, upload) => sum + upload.file.size, 0) + stagedFiles.reduce((sum, staged) => sum + staged.file.size, 0) + files.reduce((sum, file) => sum + file.size, 0) > limits.assessmentBytes) { setMessage(`This assessment can contain up to ${formatReportMegabytes(limits.assessmentBytes)} MB of reports.`); return false; }
    setMessage(""); return true;
  }
  function selectStagedFiles(files: FileList | null) {
    if (!files || busy) return;
    const next = Array.from(files);
    if (validFiles(next, stagedFiles.length)) setStagedFiles(previous => [...previous, ...next.map(file => ({ key: crypto.randomUUID(), file }))]);
  }
  function selectFiles(report: AssessmentReport, files: FileList | null) {
    if (!files || busy) return;
    const next = Array.from(files);
    const queued = uploads.filter(upload => upload.reportId === report.id);
    if (!validFiles(next, report.files.length + queued.length)) return;
    setUploads(previous => [...previous, ...next.map(file => ({ key: crypto.randomUUID(), reportId: report.id, file, progress: 0, state: "queued" as const }))]);
  }
  async function uploadFile(upload: Upload) {
    if (busy) return;
    setBusy(true); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, progress: 0, state: "uploading", error: undefined } : item));
    try {
      await uploadReportFile({ url: `${base}/${upload.reportId}/files`, file: upload.file, revision, requestKey: upload.key, signal: abort.signal, maxFileBytes: limits.fileBytes,
        onProgress: progress => setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, progress } : item)),
      });
      setUploads(previous => previous.filter(item => item.key !== upload.key));
    } catch (error) {
      setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, state: "failed", error: errorMessage(error) } : item));
    } finally { await refresh(); controller.current = null; setBusy(false); }
  }
  async function removeItem() {
    if (!remove || busy) return;
    setBusy(true); setMessage("");
    try {
      const url = `${base}/${remove.reportId}${remove.fileId ? `/files/${remove.fileId}` : ""}?revision=${revision}`;
      await mutateReport(url, "DELETE");
      if (!remove.fileId) setUploads(previous => previous.filter(item => item.reportId !== remove.reportId));
      setRemove(null); await refresh();
    } catch (error) { setMessage(errorMessage(error)); await refresh(); }
    finally { setBusy(false); }
  }
  const reportEditor = editor && (
      <form noValidate onSubmit={saveReport}><div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
        <Field data-invalid={nameError || undefined}><FieldLabel htmlFor="report-label">Report name <span aria-hidden="true" className="ml-1 text-destructive">*</span><span className="sr-only"> (required)</span></FieldLabel><Input id="report-label" placeholder="e.g. Blood test results" value={editor.label} maxLength={120} required aria-required="true" aria-invalid={nameError} aria-describedby={nameError ? "report-label-error" : undefined} disabled={busy} autoFocus onChange={event => { setEditor({ ...editor, label: event.target.value }); setDirty(true); setNameError(false); setMessage(""); }}/>{nameError && <p id="report-label-error" className="text-sm text-destructive" role="alert">Required</p>}</Field>
        <Field><FieldLabel htmlFor="report-purpose">Purpose <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="report-purpose" placeholder="e.g. Before treatment" value={editor.purpose} maxLength={300} disabled={busy} onChange={event => { setEditor({ ...editor, purpose: event.target.value }); setDirty(true); }}/></Field>
        <Field><FieldLabel htmlFor="report-date-precision">Date format</FieldLabel><Select aria-label="Date format" className="w-full" value={editor.datePrecision} isDisabled={busy} onChange={value => { const datePrecision = value as "DAY" | "MONTH"; setEditor({ ...editor, datePrecision, date: datePrecision === "MONTH" ? editor.date.slice(0, 7) : "" }); setDirty(true); }}><SelectTrigger id="report-date-precision" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem id="DAY">Exact date</SelectItem><SelectItem id="MONTH">Month and year</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="report-date">Date on report <span aria-hidden="true" className="ml-1 text-destructive">*</span><span className="font-normal text-muted-foreground"> (required to submit)</span></FieldLabel>{editor.datePrecision === "MONTH" ? <MonthPicker id="report-date" value={editor.date} disabled={busy} onChange={date => { setEditor({ ...editor, date }); setDirty(true); }} /> : <AssessmentDateInput id="report-date" label="Date on report" value={editor.date} disabled={busy} invalid={false} onChange={date => { setEditor({ ...editor, date: date ?? "" }); setDirty(true); }} />}</Field>
        
        {!editor.id && <div className="col-span-full">
          <p className="mb-2 text-sm font-medium">Files <span aria-hidden="true" className="ml-1 text-destructive">*</span><span className="font-normal text-muted-foreground"> (at least one required to submit)</span></p>
          <label className="relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium text-brand-ink hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
            <Plus className="size-4" aria-hidden="true"/>Choose PDF, JPEG or PNG files
            <input className="absolute inset-0 w-full cursor-pointer opacity-0" aria-label="Choose files for new report" type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={event => { selectStagedFiles(event.target.files); event.target.value = ""; }}/>
          </label>
          {stagedFiles.length > 0 && <ul className="mt-2 space-y-2">{stagedFiles.map(({ key, file }) => <ReportFilePreview key={key} file={file} busy={busy} onRemove={() => setStagedFiles(previous => previous.filter(item => item.key !== key))}/>)}</ul>}
        </div>}
        <div className="col-span-full flex flex-wrap justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => { setEditor(null); setNameError(false); setDirty(false); setStagedFiles([]); }}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Saving…" : editor.id ? "Save changes" : stagedFiles.length ? "Create and upload" : "Create report"}</Button></div>
      </div></form>
  );
  return <section className="flex min-w-0 flex-col gap-5" aria-label="Attachments">
    {showIntro && <p className="text-sm text-muted-foreground">Add supporting documents to this assessment. PDF, JPEG or PNG · Up to {formatReportMegabytes(limits.fileBytes)} MB per file</p>}
    {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    {unconfirmed && <Alert><AlertDescription><p>Check whether this report was saved before adding it again.</p><dl className="mt-2 grid gap-1"><div><dt className="font-medium">Report name</dt><dd className="break-words">{unconfirmed.label || "Not entered"}</dd></div><div><dt className="font-medium">Purpose</dt><dd className="break-words">{unconfirmed.purpose || "Not entered"}</dd></div><div><dt className="font-medium">Date</dt><dd>{unconfirmed.date || "Not entered"}</dd></div></dl><Button className="mt-2" variant="outline" onPress={() => setUnconfirmed(null)}>Dismiss</Button></AlertDescription></Alert>}
    {!reports.length && !editor && <div className="rounded-xl border border-border bg-card px-5 py-8 text-center"><FileText className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true"/><h3 className="font-semibold">No attachments yet</h3><p className="mt-2 text-sm text-muted-foreground">Create a report and choose its files in one step.</p>{!readOnly && <Button variant="outline" className="mt-5 min-h-11 border-primary/30 text-brand-ink" isDisabled={busy || reports.length >= limits.reportsPerAssessment} onPress={beginAddReport}><Plus aria-hidden="true"/>Add report</Button>}</div>}
    {reports.map((report, index) => {
      const expanded = editor?.id === report.id || !collapsedReports.has(report.id);
      const issues = getReportSubmissionIssues(report);
      const missing = issues.map(issue => issue === "name" ? "report name" : issue === "date" ? "date" : "file").join(" and ");
      return <article key={report.id} className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className={`${expanded ? "mb-4" : ""} flex items-center justify-between gap-2`}><h3 className="min-w-0 flex-1" aria-label={`Report ${index + 1}: ${report.label || "Untitled report"}`}><Button variant="ghost" className="h-auto min-h-10 max-w-full justify-start gap-2 px-2 text-left" aria-label={`${expanded ? "Collapse" : "Expand"} report ${index + 1}: ${report.label || "Untitled report"}`} aria-expanded={expanded} aria-controls={`report-content-${report.id}`} isDisabled={editor?.id === report.id} onPress={() => setCollapsedReports(previous => { const next = new Set(previous); if (next.has(report.id)) next.delete(report.id); else next.add(report.id); return next; })}><ChevronRight className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true"/><span className="shrink-0 font-semibold">Report {index + 1}</span><span className="min-w-0 truncate font-normal text-muted-foreground">{report.label || "Untitled report"}</span>{issues.length > 0 && <span className="text-xs font-medium text-destructive">Needs {missing} to submit</span>}</Button></h3>
        {!readOnly && <div className="flex gap-1"><Button variant="ghost" size="icon" className="size-10" aria-label="Edit report details" isDisabled={busy || !!editor} onPress={() => { setMessage(""); setNameError(false); setCollapsedReports(previous => { const next = new Set(previous); next.delete(report.id); return next; }); setEditor({ id: report.id, label: report.label, purpose: report.purpose, datePrecision: report.datePrecision, date: dateValue(report) }); }}><Pencil aria-hidden="true"/></Button><Button variant="ghost" size="icon" className="size-10 text-destructive" aria-label="Remove report" isDisabled={busy || !!editor} onPress={() => setRemove({ reportId: report.id, label: report.label || "this report" })}><Trash2 aria-hidden="true"/></Button></div>}
      </div>
      <div id={`report-content-${report.id}`} hidden={!expanded}>
      {editor?.id === report.id ? reportEditor : <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4 text-sm">
        <div><dt className="mb-1 text-muted-foreground">Report name</dt><dd className="break-words font-medium">{report.label || "Untitled report"}</dd></div>
        <div><dt className="mb-1 text-muted-foreground">Purpose</dt><dd className="break-words">{report.purpose || "Not specified"}</dd></div>
        <div><dt className="mb-1 text-muted-foreground">Date format</dt><dd>{report.datePrecision === "DAY" ? "Exact date" : "Month and year"}</dd></div>
        <div><dt className="mb-1 text-muted-foreground">Date on report</dt><dd>{dateValue(report) || "Not specified"}</dd></div>
      </dl>}
      <h4 className="mt-5 text-sm font-medium">Files ({report.files.length})</h4>
      {!report.files.length && <p className="mt-2 text-sm text-muted-foreground">{readOnly ? "No files uploaded." : "No files yet. Choose files below, then upload them."}</p>}
      <ul className="mt-3 flex flex-col gap-3">{report.files.map(file => <SavedReportFilePreview key={file.id} file={file} url={`${base}/${report.id}/files/${file.id}`} busy={busy || !!editor} onRemove={readOnly ? undefined : () => setRemove({ reportId: report.id, fileId: file.id, label: file.originalFilename })} />)}</ul>
      {!readOnly && <label className={`relative mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium text-brand-ink hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${busy || editor ? "opacity-50" : ""}`}>
        <Plus className="size-4" aria-hidden="true"/>{report.files.length ? "Add more files" : "Choose files"}
        <input className="absolute inset-0 w-full cursor-pointer opacity-0" aria-label={`Add files to report ${index + 1}`} type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={busy || !!editor} onChange={event => { selectFiles(report, event.target.files); event.target.value = ""; }}/>
      </label>}
      {uploads.filter(upload => upload.reportId === report.id).map(upload => <div className="mt-3 rounded-lg border border-border p-3" key={upload.key}>
        <p className="break-all text-sm font-medium">{upload.file.name}</p>
        {upload.state === "uploading" ? <><progress className="mt-2 w-full accent-primary" max={100} value={upload.progress} aria-label={`Uploading ${upload.file.name}`}/><p className="text-xs text-muted-foreground" role="status">{upload.progress >= 99 ? "Finishing upload…" : `${upload.progress}% uploaded`}</p><Button variant="outline" onPress={() => controller.current?.abort()}>Cancel upload</Button></> : <div className="mt-2 flex flex-wrap gap-2"><Button isDisabled={busy || readOnly || !!editor} onPress={() => void uploadFile(upload)}>{upload.state === "failed" ? "Retry upload" : "Upload"}</Button><Button variant="outline" isDisabled={busy} onPress={() => setUploads(previous => previous.filter(item => item.key !== upload.key))}>Remove from queue</Button></div>}
        {upload.error && <p role="alert" className="mt-2 text-sm text-destructive">{upload.error}</p>}
      </div>)}
      </div>
    </article>;
    })}
    {editor && !editor.id && <article className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">New report</h3><p className="mb-4 mt-1 text-sm text-muted-foreground">Report name is required. Add a date and file before submitting the assessment; purpose is optional. Selected files upload when you create the report.</p>{reportEditor}</article>}
    {!readOnly && !editor && reports.length > 0 && <Button variant="outline" className="min-h-11 w-full border-primary/30 text-brand-ink" isDisabled={busy || reports.length >= limits.reportsPerAssessment} onPress={beginAddReport}><Plus aria-hidden="true"/>Add another report</Button>}
    {remove && <Dialog ariaLabel="Remove report attachment" isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) setRemove(null); }}><DialogTitle>Remove {remove.fileId ? "file" : "report"}?</DialogTitle><p className="break-words">{remove.fileId ? `Remove ${remove.label}?` : `Remove ${remove.label} and all its files?`}</p><div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => setRemove(null)}>Cancel</Button><Button variant="destructive" isDisabled={busy} onPress={() => void removeItem()}>Remove</Button></div></Dialog>}
  </section>;
}
