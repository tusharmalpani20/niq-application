import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileCheck2, LoaderCircle, RotateCcw } from "lucide-react";
import { hasPermission, type AuthenticatedUser } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { GeneratedReportPdfPreview } from "./GeneratedReportPdfPreview";
import { GeneratedReportPreview } from "./GeneratedReportPreview";
import { generatedReportPdfUrl, getGeneratedReport, refreshGeneratedReportPdf, regenerateGeneratedReport, type GeneratedReportResponse } from "./generated-report-api";
import { reportDate } from "./generated-report-format";
import { readMeasurementUnits } from "./measurement-units";
import "./generated-report.css";

const POLL_INTERVAL_MS = 5_000;

function GeneratedReportWorkspace({ user, assessmentId }: { user: AuthenticatedUser; assessmentId: string }) {
  const [result, setResult] = useState<GeneratedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<"html" | "pdf">("html");
  const [updatingPdf, setUpdatingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");
  const assessmentPath = `/assessments/${encodeURIComponent(assessmentId)}`;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    setLoading(true);

    async function load() {
      try {
        const next = await getGeneratedReport(user.organizationId, assessmentId, controller.signal);
        if (controller.signal.aborted) return;
        setResult(next);
        setError("");
        setLoading(false);
        polling = next.generation?.status === "QUEUED" || next.generation?.status === "GENERATING";
        if (polling) {
          timer = setTimeout(() => { void load(); }, POLL_INTERVAL_MS);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not load the report status.");
        setLoading(false);
        if (polling) timer = setTimeout(() => { void load(); }, POLL_INTERVAL_MS);
      }
    }

    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [user.organizationId, assessmentId, reload]);

  const generation = result?.generation;
  const report = result?.report;
  const ready = generation?.status === "READY" && report?.status === "READY" && Boolean(report.artifact);
  const htmlReady = generation?.status === "READY" && report?.status === "DRAFT" && !report.artifact && report.issues.length === 0;
  const reviewRequired = generation?.status === "FAILED" && generation.failureCode === "REVIEW_REQUIRED";
  const pdfUrl = `${generatedReportPdfUrl(user.organizationId, assessmentId)}?revision=${report?.artifact?.sha256 ?? "pending"}`;
  const statusLabel = loading && !result ? "Loading" : error ? "Status unavailable" : generation?.status === "QUEUED" ? "Queued" : generation?.status === "GENERATING" ? "Preparing" : reviewRequired ? "Automatic checks failed" : generation?.status === "FAILED" ? "Generation failed" : htmlReady ? "HTML ready for review" : ready ? "Ready" : generation?.status === "READY" ? "Report unavailable" : "Not started";
  const refresh = () => setReload(current => current + 1);
  const regenerate = async () => {
    setRegenerating(true);
    setRegenerateError("");
    try {
      const next = await regenerateGeneratedReport(user.organizationId, assessmentId);
      setResult(next);
      setPreview("html");
      setReload(current => current + 1);
    } catch (cause) {
      setRegenerateError(cause instanceof Error ? cause.message : "Could not restart report generation.");
    } finally {
      setRegenerating(false);
    }
  };
  const rebuildPdf = async () => {
    setUpdatingPdf(true);
    setPdfError("");
    try {
      const updated = await refreshGeneratedReportPdf(user.organizationId, assessmentId);
      setResult(current => current ? { ...current, report: updated.report } : current);
      setPreview("pdf");
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "Could not rebuild the PDF.");
    } finally {
      setUpdatingPdf(false);
    }
  };

  return <div className="cr-workspace">
    <nav className="cr-back"><Link to={assessmentPath}><ArrowLeft size={17} aria-hidden="true"/>Back to assessment</Link></nav>
    <div className="cr-workspace-head"><div><p className="cr-workspace-eyebrow">Clinical reporting</p><h1>Nutritional Assessment Protocol Report</h1></div><span className={`cr-status ${ready ? "cr-status-approved" : ""}`}>{statusLabel}</span></div>
    {error && <div className="cr-message cr-error" role="alert"><p>{error}</p><Button variant="outline" onPress={refresh}><RotateCcw size={16} aria-hidden="true"/>Refresh status</Button></div>}
    {loading && !result && <p role="status" className="cr-empty"><LoaderCircle className="cr-spin" size={20} aria-hidden="true"/>Loading report status</p>}
    {!loading && !error && (generation?.status === "QUEUED" || generation?.status === "GENERATING") &&
      <section className="cr-empty" role="status"><LoaderCircle className="cr-spin" size={35} aria-hidden="true"/><h2>{generation.status === "QUEUED" ? "Report queued" : "Preparing report"}</h2><p>The saved assessment is being turned into a clinical report. This page updates automatically.</p></section>}
    {!loading && !error && generation?.status === "FAILED" &&
      <section className="cr-empty" role="alert"><h2>{reviewRequired ? "Report did not pass automatic checks" : "Report generation could not finish"}</h2><p>The assessment remains approved. A new report attempt can be started without changing the assessment.</p>{hasPermission(user.role, "reports.manage") && <Button variant="outline" isDisabled={regenerating} onPress={() => { void regenerate(); }}>{regenerating ? <LoaderCircle className="cr-spin" size={16} aria-hidden="true"/> : <RotateCcw size={16} aria-hidden="true"/>}{regenerating ? "Restarting report" : "Regenerate report"}</Button>}{regenerateError && <p className="cr-regenerate-error">{regenerateError}</p>}</section>}
    {!loading && !error && !generation &&
      <section className="cr-empty"><FileCheck2 size={35} aria-hidden="true"/><h2>Report not started</h2><p>Complete the final clinical review to start report and PDF generation.</p><Link to={assessmentPath}>Return to assessment</Link></section>}
    {!loading && !error && generation?.status === "READY" && !ready && !htmlReady &&
      <div className="cr-message cr-error" role="alert"><p>The report content is ready, but its saved PDF is unavailable.</p>{hasPermission(user.role, "reports.manage") && <Button variant="outline" isDisabled={updatingPdf || regenerating} onPress={() => { void rebuildPdf(); }}>{updatingPdf ? <LoaderCircle className="cr-spin" size={16} aria-hidden="true"/> : <RotateCcw size={16} aria-hidden="true"/>}{updatingPdf ? "Rebuilding PDF" : "Rebuild PDF"}</Button>}<Button variant="outline" onPress={refresh}>Refresh status</Button>{pdfError && <p>{pdfError}</p>}</div>}
    {!error && (ready || htmlReady) && report && <>
      <div className="cr-report-meta"><span>Assessment {report.assessment.reference}</span><span>Generated {reportDate(report.generatedAt)}</span></div>
      <div className="cr-approved-bar"><div><FileCheck2 size={24} aria-hidden="true"/><div><strong>{htmlReady ? "HTML ready for review" : "Final report ready"}</strong><p>{htmlReady ? "PDF generation is paused until you request it." : "The PDF was saved after final clinical approval."}</p></div></div><div className="cr-pdf-actions">{hasPermission(user.role, "reports.manage") && <Button variant="outline" isDisabled={regenerating || updatingPdf} onPress={() => { void regenerate(); }}>{regenerating ? <LoaderCircle className="cr-spin" size={16} aria-hidden="true"/> : <RotateCcw size={16} aria-hidden="true"/>}{regenerating ? "Restarting report" : "Regenerate report"}</Button>}{hasPermission(user.role, "reports.manage") && <Button variant="outline" isDisabled={updatingPdf || regenerating} onPress={() => { void rebuildPdf(); }}>{updatingPdf ? <LoaderCircle className="cr-spin" size={16} aria-hidden="true"/> : <RotateCcw size={16} aria-hidden="true"/>}{updatingPdf ? "Generating PDF" : htmlReady ? "Generate PDF" : "Update PDF layout"}</Button>}{ready && <a className="cr-download" href={pdfUrl} download={`NIQ-report-${report.assessment.reference}.pdf`}><Download size={18} aria-hidden="true"/>Download PDF</a>}</div></div>
      {regenerateError && <div className="cr-message cr-error" role="alert"><p>{regenerateError}</p></div>}
      {pdfError && <div className="cr-message cr-error" role="alert"><p>{pdfError}</p></div>}
      <div className="cr-preview-heading"><div><h2>Report preview</h2><p>Review the layout in the browser, or view the saved PDF.</p></div></div>
      <div className="cr-preview-tabs" role="group" aria-label="Report preview format">
        <button type="button" className={`cr-preview-tab ${preview === "html" || !ready ? "cr-preview-tab-active" : ""}`} aria-pressed={preview === "html"} onClick={() => setPreview("html")}>HTML layout</button>
        <button disabled={!ready} type="button" className={`cr-preview-tab ${preview === "pdf" ? "cr-preview-tab-active" : ""}`} aria-pressed={preview === "pdf"} onClick={() => setPreview("pdf")}>Saved PDF</button>
      </div>
      {preview === "html" || !ready ? <div className="cr-html-preview"><p className="cr-preview-note">Layout preview from the saved report content. The downloaded PDF is the issued report.</p><GeneratedReportPreview report={report.weightDisplayUnit ? report : { ...report, weightDisplayUnit: readMeasurementUnits(user.organizationId, user.userId, report.assessment.id).weight }}/></div> : <GeneratedReportPdfPreview url={pdfUrl}/>}
    </>}
  </div>;
}

export function GeneratedReportPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { assessmentId = "" } = useParams();
  if (!hasPermission(user.role, "assessments.read")) return <Navigate to="/assessments" replace />;
  return <GeneratedReportWorkspace key={`${user.organizationId}:${assessmentId}`} user={user} assessmentId={assessmentId}/>;
}
