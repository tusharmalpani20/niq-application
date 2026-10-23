import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generatedReportPdfUrl } from "./generated-report-api";

export function AssessmentPdfDownload({ organizationId, assessmentReference }: { organizationId: string; assessmentReference: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Fetch first so an unavailable PDF shows an inline error instead of
      // navigating away from the assessment list to a JSON error response.
      const response = await fetch(generatedReportPdfUrl(organizationId, assessmentReference), { credentials: "include" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error?.message ?? "The PDF could not be downloaded. Please try again.");
      }
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("The saved PDF is unavailable. Open the assessment to check its status.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `NIQ-report-${assessmentReference}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF could not be downloaded. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="min-w-0">
    <Button variant="outline" size="sm" isDisabled={busy} aria-label={`Download PDF for ${assessmentReference}`} onPress={() => { void download(); }}>
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true"/> : <Download className="size-4" aria-hidden="true"/>}{busy ? "Downloading PDF" : "Download PDF"}
    </Button>
    {error && <p role="alert" className="mt-1 max-w-64 whitespace-normal text-xs text-destructive">{error} <Link className="underline" to={`/assessments/${encodeURIComponent(assessmentReference)}`}>Open assessment</Link></p>}
  </div>;
}
