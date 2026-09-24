import { AssessmentDateInput } from "./AssessmentDateInput";
import { MonthPicker } from "../../components/ui/month-picker";
import { useEffect, useRef, useState } from "react";
import { REPORT_LIMITS, reportInputSchema, type AssessmentReport, type AssessmentReportLimits } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FileText, Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReportMutationError, mutateReport, reportBase, uploadReportFile, type ReportInput } from "./report-api";

type Props = {
  organizationId: string; assessmentId: string; reports: AssessmentReport[]; revision: number; readOnly?: boolean; limits?: AssessmentReportLimits;
  onChanged: () => Promise<void>; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void;
};
type Upload = { key: string; reportId: string; file: File; progress: number; error?: string; state: "queued" | "uploading" | "failed" };
type Editor = { id?: string; label: string; purpose: string; datePrecision: "DAY" | "MONTH"; date: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
export const formatReportMegabytes = (bytes: number) => Number((bytes / 1024 / 1024).toFixed(2)).toString();
const supported = new Set(["application/pdf", "image/jpeg", "image/png"]);
function dateValue(report: AssessmentReport) {
  if (!report.year || !report.month) return "";
  const month = `${report.year}-${String(report.month).padStart(2, "0")}`;
  return report.datePrecision === "DAY" ? report.day ? `${month}-${String(report.day).padStart(2, "0")}` : "" : month;
}

export function AssessmentReports({ organizationId, assessmentId, reports, revision, readOnly = false, limits = REPORT_LIMITS, onChanged, onBusyChange, onDirtyChange }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [remove, setRemove] = useState<{ reportId: string; fileId?: string; label: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const base = reportBase(organizationId, assessmentId);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty || uploads.length > 0); }, [dirty, uploads.length, onDirtyChange]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const currentBytes = reports.flatMap(report => report.files).reduce((sum, file) => sum + file.size, 0);

  async function refresh() {
    try { await onChanged(); } catch { setMessage("Changes may be saved. Refresh this assessment before continuing."); }
  }
  async function saveReport(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    if (editor.date && !(editor.datePrecision === "DAY" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(editor.date)) { setMessage("Enter a complete report date in dd/mm/yyyy format."); return; }
    const [year, month, day] = editor.date.split("-").map(Number);
    const input: ReportInput = { revision, label: editor.label, purpose: editor.purpose, datePrecision: editor.datePrecision, year: year || null, month: month || null, day: editor.datePrecision === "DAY" ? day || null : null };
    const parsed = reportInputSchema.safeParse(input);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the report details."); return; }
    setBusy(true); setMessage("");
    try {
      await mutateReport(editor.id ? `${base}/${editor.id}` : base, editor.id ? "PATCH" : "POST", parsed.data);
      setEditor(null); setDirty(false); await refresh();
    } catch (error) {
      if (!editor.id && error instanceof ReportMutationError && error.uncertain) {
        // A lost response may follow a committed POST. Do not offer the same create form as a retry.
        setUnconfirmed(editor); setEditor(null); setDirty(false);
      }
      setMessage(errorMessage(error)); await refresh();
    }
    finally { setBusy(false); }
  }
  function selectFiles(report: AssessmentReport, files: FileList | null) {
    if (!files || busy) return;
    const next = Array.from(files);
    const queued = uploads.filter(upload => upload.reportId === report.id);
    if (report.files.length + queued.length + next.length > limits.filesPerReport) { setMessage(`Each report can contain up to ${limits.filesPerReport} files.`); return; }
    if (next.some(file => !supported.has(file.type) || file.size === 0 || file.size > limits.fileBytes)) { setMessage(`Choose PDF, JPEG or PNG files up to ${formatReportMegabytes(limits.fileBytes)} MB each.`); return; }
    if (currentBytes + uploads.reduce((sum, upload) => sum + upload.file.size, 0) + next.reduce((sum, file) => sum + file.size, 0) > limits.assessmentBytes) { setMessage(`This assessment can contain up to ${formatReportMegabytes(limits.assessmentBytes)} MB of reports.`); return; }
    setMessage("");
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
      <form onSubmit={saveReport}><div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
        <Field><FieldLabel htmlFor="report-label">Report label</FieldLabel><Input id="report-label" value={editor.label} maxLength={120} disabled={busy} autoFocus onChange={event => { setEditor({ ...editor, label: event.target.value }); setDirty(true); }}/></Field>
        <Field><FieldLabel htmlFor="report-purpose">Report for</FieldLabel><Input id="report-purpose" value={editor.purpose} maxLength={300} disabled={busy} onChange={event => { setEditor({ ...editor, purpose: event.target.value }); setDirty(true); }}/></Field>
        <Field><FieldLabel htmlFor="report-date-precision">Date precision</FieldLabel><Select aria-label="Date precision" className="w-full" value={editor.datePrecision} isDisabled={busy} onChange={value => { const datePrecision = value as "DAY" | "MONTH"; setEditor({ ...editor, datePrecision, date: datePrecision === "MONTH" ? editor.date.slice(0, 7) : "" }); setDirty(true); }}><SelectTrigger id="report-date-precision" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem id="DAY">Exact date</SelectItem><SelectItem id="MONTH">Month and year</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="report-date">Report date</FieldLabel>{editor.datePrecision === "MONTH" ? <MonthPicker id="report-date" value={editor.date} disabled={busy} onChange={date => { setEditor({ ...editor, date }); setDirty(true); }} /> : <AssessmentDateInput id="report-date" label="Report date" value={editor.date} disabled={busy} invalid={false} onChange={date => { setEditor({ ...editor, date: date ?? "" }); setDirty(true); }} />}</Field>
        
        <div className="col-span-full flex flex-wrap justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => { setEditor(null); setDirty(false); }}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Saving…" : "Save report"}</Button></div>
      </div></form>
  );
  return <section className="flex min-w-0 flex-col gap-5" aria-label="Attachments">
    <p className="text-sm text-muted-foreground">Attach reports with a label, purpose and date. PDF, JPEG or PNG · Up to {formatReportMegabytes(limits.fileBytes)} MB per file</p>
    {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    {unconfirmed && <Alert><AlertDescription><p>Check whether this report was saved before adding it again.</p><dl className="mt-2 grid gap-1"><div><dt className="font-medium">Label</dt><dd className="break-words">{unconfirmed.label || "Not entered"}</dd></div><div><dt className="font-medium">Report for</dt><dd className="break-words">{unconfirmed.purpose || "Not entered"}</dd></div><div><dt className="font-medium">Date</dt><dd>{unconfirmed.date || "Not entered"}</dd></div></dl><Button className="mt-2" variant="outline" onPress={() => setUnconfirmed(null)}>Dismiss</Button></AlertDescription></Alert>}
    {!reports.length && !editor && <div className="rounded-xl border border-border bg-card px-5 py-8 text-center"><FileText className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true"/><h3 className="font-semibold">Add supporting reports</h3><p className="mt-2 text-sm text-muted-foreground">Group related files under one report.</p></div>}
    {reports.map((report, index) => <article key={report.id} className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Report {index + 1}</h3>
        {!readOnly && <div className="flex gap-2"><Button variant="ghost" isDisabled={busy || !!editor} onPress={() => { setMessage(""); setEditor({ id: report.id, label: report.label, purpose: report.purpose, datePrecision: report.datePrecision, date: dateValue(report) }); }}>Edit details</Button><Button variant="ghost" className="text-destructive" isDisabled={busy || !!editor} onPress={() => setRemove({ reportId: report.id, label: report.label || "this report" })}><Trash2 aria-hidden="true"/>Remove report</Button></div>}
      </div>
      {editor?.id === report.id ? reportEditor : <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4 text-sm">
        <div><dt className="mb-1 text-muted-foreground">Report label</dt><dd className="break-words font-medium">{report.label || "Untitled report"}</dd></div>
        <div><dt className="mb-1 text-muted-foreground">Report for</dt><dd className="break-words">{report.purpose || "Not specified"}</dd></div>
        <div><dt className="mb-1 text-muted-foreground">Date precision</dt><dd>{report.datePrecision === "DAY" ? "Exact date" : "Month and year"}</dd></div>
        <div><dt className="mb-1 text-muted-foreground">Report date</dt><dd>{dateValue(report) || "Not specified"}</dd></div>
      </dl>}
      <h4 className="mt-5 text-sm font-medium">Files ({report.files.length})</h4>
      <ul className="mt-3 flex flex-col gap-3">{report.files.map(file => <li key={file.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/><div className="min-w-0">{file.status === "READY" ? <a className="break-all text-sm text-brand-ink underline underline-offset-2" href={`${base}/${report.id}/files/${file.id}`} download>{file.originalFilename}</a> : <span className="break-all text-sm">{file.originalFilename}</span>}<p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · {file.status === "READY" ? "Saved" : file.status}</p></div></div>
        {!readOnly && <Button variant="ghost" size="icon" className="size-11" isDisabled={busy || !!editor} aria-label={`Remove ${file.originalFilename}`} onPress={() => setRemove({ reportId: report.id, fileId: file.id, label: file.originalFilename })}><X aria-hidden="true"/></Button>}
      </li>)}</ul>
      {!readOnly && <label className={`relative mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium text-brand-ink hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${busy || editor ? "opacity-50" : ""}`}>
        <Plus className="size-4" aria-hidden="true"/>Add files
        <input className="absolute inset-0 w-full cursor-pointer opacity-0" aria-label={`Add files to report ${index + 1}`} type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={busy || !!editor} onChange={event => { selectFiles(report, event.target.files); event.target.value = ""; }}/>
      </label>}
      {uploads.filter(upload => upload.reportId === report.id).map(upload => <div className="mt-3 rounded-lg border border-border p-3" key={upload.key}>
        <p className="break-all text-sm font-medium">{upload.file.name}</p>
        {upload.state === "uploading" ? <><progress className="mt-2 w-full accent-primary" max={100} value={upload.progress} aria-label={`Uploading ${upload.file.name}`}/><p className="text-xs text-muted-foreground" role="status">{upload.progress >= 99 ? "Finishing upload…" : `${upload.progress}% uploaded`}</p><Button variant="outline" onPress={() => controller.current?.abort()}>Cancel upload</Button></> : <div className="mt-2 flex flex-wrap gap-2"><Button isDisabled={busy || readOnly || !!editor} onPress={() => void uploadFile(upload)}>{upload.state === "failed" ? "Retry upload" : "Upload"}</Button><Button variant="outline" isDisabled={busy} onPress={() => setUploads(previous => previous.filter(item => item.key !== upload.key))}>Remove from queue</Button></div>}
        {upload.error && <p role="alert" className="mt-2 text-sm text-destructive">{upload.error}</p>}
      </div>)}
    </article>)}
    {editor && !editor.id && <article className="rounded-xl border border-border bg-card p-4"><h3 className="mb-4 font-semibold">Report {reports.length + 1}</h3>{reportEditor}<p className="mt-3 text-xs text-muted-foreground">Save report details to attach files.</p></article>}
    {!readOnly && !editor && <Button variant="outline" className="min-h-11 w-full border-primary/30 text-brand-ink" isDisabled={busy || reports.length >= limits.reportsPerAssessment} onPress={() => { setMessage(""); setEditor({ label: "", purpose: "", datePrecision: "DAY", date: "" }); }}><Plus aria-hidden="true"/>{reports.length ? "Add another report" : "Add report"}</Button>}
    {remove && <Dialog ariaLabel="Remove report attachment" isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) setRemove(null); }}><DialogTitle>Remove {remove.fileId ? "file" : "report"}?</DialogTitle><p className="break-words">{remove.fileId ? `Remove ${remove.label}?` : `Remove ${remove.label} and all its files?`}</p><div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => setRemove(null)}>Cancel</Button><Button variant="destructive" isDisabled={busy} onPress={() => void removeItem()}>Remove</Button></div></Dialog>}
  </section>;
}
