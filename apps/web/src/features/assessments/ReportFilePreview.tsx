import { useEffect, useState } from "react";
import { FileImage, FileText, X } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";

export function ReportFilePreview({ file, busy = false, onRemove, previewOnly = false, onClose }: { file: File; busy?: boolean; onRemove?: () => void; previewOnly?: boolean; onClose?: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const [renderedPage, setRenderedPage] = useState(0);
  const [pdfError, setPdfError] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const image = file.type === "image/jpeg" || file.type === "image/png";
  const isPdf = file.type === "application/pdf";

  useEffect(() => {
    if (!image || !URL.createObjectURL) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, image]);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const data = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data, standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`, useSystemFonts: false });
        const document = await task.promise;
        if (cancelled) return;
        setPdf(document);
      } catch { if (!cancelled) setPdfError(true); }
    })();
    return () => { cancelled = true; void task?.destroy(); };
  }, [file, isPdf]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const size = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1200 / size.width, 1600 / size.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        if (!cancelled) { setPdfImage(canvas.toDataURL("image/png")); setRenderedPage(pageNumber); }
      } catch { if (!cancelled) setPdfError(true); }
    })();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, pageNumber]);

  const kind = isPdf ? "PDF document" : file.type === "image/png" ? "PNG image" : "JPEG image";
  const thumbnail = isPdf ? pdfImage : previewUrl;
  return <>{!previewOnly && <li className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-2 text-sm">
    <button type="button" className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed" aria-label={`Preview ${file.name}`} disabled={!thumbnail} onClick={() => setPreviewOpen(true)}>
      {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : image ? <FileImage className="size-6 text-muted-foreground" aria-hidden="true"/> : <FileText className="size-6 text-muted-foreground" aria-hidden="true"/>}
    </button>
    <div className="min-w-0 flex-1"><p className="break-all font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{kind} · {(file.size / 1024).toFixed(1)} KB</p>{thumbnail && <button type="button" className="mt-1 text-xs font-medium text-brand-ink underline underline-offset-2" onClick={() => setPreviewOpen(true)}>Preview file</button>}{isPdf && !thumbnail && !pdfError && <p className="mt-1 text-xs text-muted-foreground" role="status">Preparing preview…</p>}{pdfError && <p className="mt-1 text-xs text-destructive" role="alert">PDF preview unavailable.</p>}</div>
    {onRemove && <Button variant="ghost" size="icon" className="size-11 shrink-0" isDisabled={busy} aria-label={`Remove ${file.name} from selection`} onPress={onRemove}><X aria-hidden="true"/></Button>}
  </li>}
    {(previewOnly || previewOpen) && <Dialog ariaLabel={`Preview ${file.name}`} isOpen onOpenChange={open => { if (!open) { if (previewOnly) onClose?.(); else setPreviewOpen(false); } }} className="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-3xl"><DialogTitle className="break-all pr-10">{file.name}</DialogTitle>{pdfError ? <p className="text-sm text-destructive" role="alert">PDF preview unavailable. Check the file before uploading it.</p> : thumbnail && (!isPdf || renderedPage === pageNumber) ? <img src={thumbnail} alt={isPdf ? `Page ${pageNumber} of ${file.name}` : `Preview of ${file.name}`} className="max-h-[70dvh] w-full rounded-lg object-contain" /> : <div className="flex min-h-64 items-center justify-center text-muted-foreground" role="status">Rendering preview…</div>}{isPdf && pdf && <div className="flex items-center justify-center gap-3"><Button variant="outline" isDisabled={pageNumber === 1} onPress={() => setPageNumber(pageNumber - 1)}>Previous</Button><span className="text-sm">Page {pageNumber} of {pdf.numPages}</span><Button variant="outline" isDisabled={pageNumber === pdf.numPages} onPress={() => setPageNumber(pageNumber + 1)}>Next</Button></div>}</Dialog>}
  </>;
}
