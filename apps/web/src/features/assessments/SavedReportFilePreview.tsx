import { useCallback, useEffect, useRef, useState } from "react";
import { FileImage, FileText, X } from "lucide-react";
import type { AssessmentReportFile } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { ReportFilePreview } from "./ReportFilePreview";

type Props = { file: AssessmentReportFile; url: string; busy?: boolean; onRemove?: () => void };

export function SavedReportFilePreview({ file, url, busy = false, onRemove }: Props) {
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [openOnLoad, setOpenOnLoad] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const controller = useRef<AbortController | null>(null);
  const requested = useRef(false);
  const openRequested = useRef(false);
  const ready = file.status === "READY";

  const load = useCallback(async () => {
    if (!ready || requested.current) return;
    requested.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(url, { credentials: "include", signal: abort.signal });
      if (!response.ok) throw new Error("Download failed");
      const content = await response.blob();
      if (abort.signal.aborted) return;
      setOpenOnLoad(openRequested.current);
      setPreviewFile(new File([content], file.originalFilename, { type: file.mediaType }));
    } catch {
      if (!abort.signal.aborted) { requested.current = false; openRequested.current = false; setError(true); }
    } finally {
      if (!abort.signal.aborted) setLoading(false);
      controller.current = null;
    }
  }, [file.mediaType, file.originalFilename, ready, url]);

  useEffect(() => {
    const element = row.current;
    if (!element || !ready || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [load, ready]);
  useEffect(() => () => controller.current?.abort(), []);

  function openPreview() {
    openRequested.current = true;
    void load();
  }

  if (previewFile) return <ReportFilePreview file={previewFile} saved={{ url, status: "Saved" }} busy={busy} onRemove={onRemove} initiallyOpen={openOnLoad} />;
  const isImage = file.mediaType === "image/png" || file.mediaType === "image/jpeg";
  return <li ref={row} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-2 text-sm">
    <button type="button" className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed" aria-label={`Preview ${file.originalFilename}`} disabled={!ready} onClick={openPreview}>
      {isImage ? <FileImage className="size-6 text-muted-foreground" aria-hidden="true" /> : <FileText className="size-6 text-muted-foreground" aria-hidden="true" />}
    </button>
    <div className="min-w-0 flex-1">{ready ? <a className="break-all font-medium text-brand-ink underline underline-offset-2" href={url} download>{file.originalFilename}</a> : <span className="break-all font-medium">{file.originalFilename}</span>}<p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {ready ? "Saved" : file.status}</p>{ready && <button type="button" className="mt-1 text-xs font-medium text-brand-ink underline underline-offset-2" onClick={openPreview}>{loading ? "Loading preview…" : "Preview file"}</button>}{error && <p className="mt-1 text-xs text-destructive" role="alert">Preview unavailable. Try again.</p>}</div>
    {onRemove && <Button variant="ghost" size="icon" className="size-11 shrink-0" isDisabled={busy} aria-label={`Remove ${file.originalFilename}`} onPress={onRemove}><X aria-hidden="true" /></Button>}
  </li>;
}
