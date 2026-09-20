import { useEffect, useRef, useState } from "react";
import { REPORT_LIMITS, reportInputSchema, type AssessmentReport } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { mutateReport, reportBase, uploadReportFile, type ReportInput } from "./report-api";

type Props = {
  organizationId: string; assessmentId: string; reports: AssessmentReport[]; revision: number; readOnly?: boolean;
  onChanged: () => Promise<void>; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void;
};
type Upload = { key: string; reportId: string; file: File; progress: number; error?: string; state: "queued" | "uploading" | "failed" };
type Editor = { id?: string; label: string; purpose: string; datePrecision: "DAY" | "MONTH"; date: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
const supported = new Set(["application/pdf", "image/jpeg", "image/png"]);
function dateValue(report: AssessmentReport) {
  if (!report.year || !report.month) return "";
  const month = `${report.year}-${String(report.month).padStart(2, "0")}`;
  return report.datePrecision === "DAY" ? report.day ? `${month}-${String(report.day).padStart(2, "0")}` : "" : month;
}

export function AssessmentReports({ organizationId, assessmentId, reports, revision, readOnly = false, onChanged, onBusyChange, onDirtyChange }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
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
    const [year, month, day] = editor.date.split("-").map(Number);
    const input: ReportInput = { revision, label: editor.label, purpose: editor.purpose, datePrecision: editor.datePrecision, year: year || null, month: month || null, day: editor.datePrecision === "DAY" ? day || null : null };
    const parsed = reportInputSchema.safeParse(input);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the report details."); return; }
    setBusy(true); setMessage("");
    try {
      await mutateReport(editor.id ? `${base}/${editor.id}` : base, editor.id ? "PATCH" : "POST", parsed.data);
      setEditor(null); setDirty(false); await refresh();
    } catch (error) { setMessage(errorMessage(error)); await refresh(); }
    finally { setBusy(false); }
  }
  function selectFiles(report: AssessmentReport, files: FileList | null) {
    if (!files || busy) return;
    const next = Array.from(files);
    const queued = uploads.filter(upload => upload.reportId === report.id);
    if (report.files.length + queued.length + next.length > REPORT_LIMITS.filesPerReport) { setMessage("Each report can contain up to 10 files."); return; }
    if (next.some(file => !supported.has(file.type) || file.size === 0 || file.size > REPORT_LIMITS.fileBytes)) { setMessage("Choose PDF, JPEG or PNG files up to 10 MB each."); return; }
    if (currentBytes + uploads.reduce((sum, upload) => sum + upload.file.size, 0) + next.reduce((sum, file) => sum + file.size, 0) > REPORT_LIMITS.assessmentBytes) { setMessage("This assessment can contain up to 100 MB of reports."); return; }
    setMessage("");
    setUploads(previous => [...previous, ...next.map(file => ({ key: crypto.randomUUID(), reportId: report.id, file, progress: 0, state: "queued" as const }))]);
  }
  async function uploadFile(upload: Upload) {
    if (busy) return;
    setBusy(true); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    setUploads(previous => previous.map(item => item.key === upload.key ? { ...item, state: "uploading", error: undefined } : item));
    try {
      await uploadReportFile({ url: `${base}/${upload.reportId}/files`, file: upload.file, revision, requestKey: upload.key, signal: abort.signal,
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
  return <section className="flex min-w-0 flex-col gap-5" aria-label="Reports">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Reports</h2>{!readOnly && <Button isDisabled={busy || reports.length >= REPORT_LIMITS.reportsPerAssessment} onPress={() => { setMessage(""); setEditor({ label: "", purpose: "", datePrecision: "DAY", date: "" }); }}>Add report</Button>}</div>
    <p className="text-sm text-muted-foreground">PDF, JPEG or PNG · Up to 10 MB per file</p>
    {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    {!reports.length && <p className="text-sm text-muted-foreground">No reports attached.</p>}
    {reports.map(report => <article key={report.id} className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{report.label || "Untitled report"}</h3>{report.purpose && <p className="break-words text-sm text-muted-foreground">{report.purpose}</p>}<p className="text-sm text-muted-foreground">{dateValue(report) || "Date not entered"}{report.datePrecision === "MONTH" && report.year ? " (month/year)" : ""}</p></div>
        {!readOnly && <div className="flex gap-2"><Button variant="outline" isDisabled={busy} onPress={() => { setMessage(""); setEditor({ id: report.id, label: report.label, purpose: report.purpose, datePrecision: report.datePrecision, date: dateValue(report) }); }}>Edit</Button><Button variant="destructive-outline" isDisabled={busy} onPress={() => setRemove({ reportId: report.id, label: report.label || "this report" })}>Remove</Button></div>}
      </div>
      <ul className="mt-3 flex flex-col gap-3">{report.files.map(file => <li key={file.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <div className="min-w-0">{file.status === "READY" ? <a className="break-all text-sm text-primary underline underline-offset-2" href={`${base}/${report.id}/files/${file.id}`} download>{file.originalFilename}</a> : <span className="break-all text-sm">{file.originalFilename}</span>}<p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · {file.status === "READY" ? "Saved" : file.status}</p></div>
        {!readOnly && <Button variant="ghost" isDisabled={busy} aria-label={`Remove ${file.originalFilename}`} onPress={() => setRemove({ reportId: report.id, fileId: file.id, label: file.originalFilename })}>Remove</Button>}
      </li>)}</ul>
      {!readOnly && <div className="mt-4"><Field><FieldLabel htmlFor={`report-files-${report.id}`}>Add files</FieldLabel><Input id={`report-files-${report.id}`} type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={event => { selectFiles(report, event.target.files); event.target.value = ""; }}/></Field></div>}
      {uploads.filter(upload => upload.reportId === report.id).map(upload => <div className="mt-3 rounded-lg border border-border p-3" key={upload.key}>
        <p className="break-all text-sm font-medium">{upload.file.name}</p>
        {upload.state === "uploading" ? <><progress className="mt-2 w-full accent-primary" max={100} value={upload.progress} aria-label={`Uploading ${upload.file.name}`}/><p className="text-xs text-muted-foreground" role="status">{upload.progress >= 99 ? "Finishing upload…" : `${upload.progress}% uploaded`}</p><Button variant="outline" onPress={() => controller.current?.abort()}>Cancel upload</Button></> : <div className="mt-2 flex flex-wrap gap-2"><Button isDisabled={busy || readOnly} onPress={() => void uploadFile(upload)}>{upload.state === "failed" ? "Retry upload" : "Upload"}</Button><Button variant="outline" isDisabled={busy} onPress={() => setUploads(previous => previous.filter(item => item.key !== upload.key))}>Remove from queue</Button></div>}
        {upload.error && <p role="alert" className="mt-2 text-sm text-destructive">{upload.error}</p>}
      </div>)}
    </article>)}
    {editor && <Dialog ariaLabel={editor.id ? "Edit report" : "Add report"} isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) { setEditor(null); setDirty(false); } }}><DialogTitle>{editor.id ? "Edit report" : "Add report"}</DialogTitle>
      <form className="flex flex-col gap-4" onSubmit={saveReport}>
        <Field><FieldLabel htmlFor="report-label">Label</FieldLabel><Input id="report-label" value={editor.label} maxLength={120} disabled={busy} autoFocus onChange={event => { setEditor({ ...editor, label: event.target.value }); setDirty(true); }}/></Field>
        <Field><FieldLabel htmlFor="report-purpose">Report for</FieldLabel><Input id="report-purpose" value={editor.purpose} maxLength={300} disabled={busy} onChange={event => { setEditor({ ...editor, purpose: event.target.value }); setDirty(true); }}/></Field>
        <Field><FieldLabel htmlFor="report-date-precision">Date format</FieldLabel><NativeSelect id="report-date-precision" value={editor.datePrecision} disabled={busy} onChange={event => { const datePrecision = event.target.value as "DAY" | "MONTH"; setEditor({ ...editor, datePrecision, date: datePrecision === "MONTH" ? editor.date.slice(0, 7) : "" }); setDirty(true); }}><option value="DAY">Exact date</option><option value="MONTH">Month and year</option></NativeSelect></Field>
        <Field><FieldLabel htmlFor="report-date">Report date</FieldLabel><Input id="report-date" type={editor.datePrecision === "DAY" ? "date" : "month"} value={editor.date} min={editor.datePrecision === "DAY" ? "1900-01-01" : "1900-01"} max={editor.datePrecision === "DAY" ? "9999-12-31" : "9999-12"} disabled={busy} onChange={event => { setEditor({ ...editor, date: event.target.value }); setDirty(true); }}/></Field>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => { setEditor(null); setDirty(false); }}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Saving…" : "Save report"}</Button></div>
      </form>
    </Dialog>}
    {remove && <Dialog ariaLabel="Remove report attachment" isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) setRemove(null); }}><DialogTitle>Remove {remove.fileId ? "file" : "report"}?</DialogTitle><p className="break-words">{remove.fileId ? `Remove ${remove.label}?` : `Remove ${remove.label} and all its files?`}</p><div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => setRemove(null)}>Cancel</Button><Button variant="destructive" isDisabled={busy} onPress={() => void removeItem()}>Remove</Button></div></Dialog>}
  </section>;
}
