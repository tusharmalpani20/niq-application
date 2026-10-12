import { useEffect, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";

export function GeneratedReportPdfPreview({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [rendered, setRendered] = useState<{ page: number; image: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    setPdf(null);
    setRendered(null);
    setPageNumber(1);
    setError(false);
    void (async () => {
      try {
        const response = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("PDF unavailable");
        const data = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ data, standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`, useSystemFonts: false });
        const document = await task.promise;
        if (!controller.signal.aborted) setPdf(document);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => { controller.abort(); void task?.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const size = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1200 / size.width, 1600 / size.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) setRendered({ page: pageNumber, image: canvas.toDataURL("image/png") });
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNumber]);

  if (error) return <div className="cr-message cr-error" role="alert"><p>PDF preview unavailable. Use Download PDF to view the saved report.</p></div>;
  return <div className="cr-final-pdf-preview" aria-label="Medical nutrition therapy report PDF preview">
    {rendered?.page === pageNumber
      ? <img src={rendered.image} alt={`Report page ${pageNumber} of ${pdf?.numPages ?? 1}`} />
      : <p className="cr-preview-loading" role="status">Preparing PDF preview</p>}
    {pdf && <div className="cr-preview-controls">
      <Button variant="outline" isDisabled={pageNumber === 1} onPress={() => setPageNumber(pageNumber - 1)}>Previous</Button>
      <span>Page {pageNumber} of {pdf.numPages}</span>
      <Button variant="outline" isDisabled={pageNumber === pdf.numPages} onPress={() => setPageNumber(pageNumber + 1)}>Next</Button>
    </div>}
  </div>;
}
