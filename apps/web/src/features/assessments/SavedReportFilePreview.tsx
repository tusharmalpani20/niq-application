import { useEffect, useRef, useState } from "react";
import type { AssessmentReportFile } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { ReportFilePreview } from "./ReportFilePreview";

export function SavedReportFilePreview({ file, url }: { file: AssessmentReportFile; url: string }) {
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function openPreview() {
    if (loading) return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(url, { credentials: "include", signal: abort.signal });
      if (!response.ok) throw new Error("Download failed");
      const content = await response.blob();
      if (abort.signal.aborted) return;
      setPreviewFile(new File([content], file.originalFilename, { type: file.mediaType }));
    } catch { if (!abort.signal.aborted) setError(true); }
    finally { if (!abort.signal.aborted) setLoading(false); controller.current = null; }
  }

  return <>
    <Button variant="link" className="mt-1 h-auto p-0 text-xs text-brand-ink" isDisabled={loading} onPress={() => void openPreview()}>{loading ? "Opening preview…" : "Preview file"}</Button>
    {error && <p className="text-xs text-destructive" role="alert">Preview could not be opened.</p>}
    {previewFile && <ReportFilePreview file={previewFile} previewOnly onClose={() => setPreviewFile(null)} />}
  </>;
}
