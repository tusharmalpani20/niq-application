import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileCheck2, LoaderCircle, RotateCcw } from "lucide-react";
import { hasPermission, type AuthenticatedUser } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { GeneratedReportPdfPreview } from "./GeneratedReportPdfPreview";
import { generatedReportPdfUrl, getGeneratedReport, type GeneratedReportResponse } from "./generated-report-api";
import { reportDate } from "./generated-report-format";
import "./generated-report.css";

const POLL_INTERVAL_MS = 5_000;

function GeneratedReportWorkspace({ user, assessmentId }: { user: AuthenticatedUser; assessmentId: string }) {
  const [result, setResult] = useState<GeneratedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
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
  const pdfUrl = generatedReportPdfUrl(user.organizationId, assessmentId);
  const statusLabel = loading && !result ? "Loading" : error ? "Status unavailable" : generation?.status === "QUEUED" ? "Queued" : generation?.status === "GENERATING" ? "Preparing" : generation?.status === "FAILED" ? "Generation failed" : ready ? "Ready" : generation?.status === "READY" ? "Report unavailable" : "Not started";
  const refresh = () => setReload(current => current + 1);

  return <div className="cr-workspace">
    <nav className="cr-back"><Link to={assessmentPath}><ArrowLeft size={17} aria-hidden="true"/>Back to assessment</Link></nav>
    <div className="cr-workspace-head"><div><p className="cr-workspace-eyebrow">Clinical reporting</p><h1>Medical nutrition therapy report</h1></div><span className={`cr-status ${ready ? "cr-status-approved" : ""}`}>{statusLabel}</span></div>
    {error && <div className="cr-message cr-error" role="alert"><p>{error}</p><Button variant="outline" onPress={refresh}><RotateCcw size={16} aria-hidden="true"/>Refresh status</Button></div>}
    {loading && !result && <p role="status" className="cr-empty"><LoaderCircle className="cr-spin" size={20} aria-hidden="true"/>Loading report status</p>}
    {!loading && !error && (generation?.status === "QUEUED" || generation?.status === "GENERATING") &&
      <section className="cr-empty" role="status"><LoaderCircle className="cr-spin" size={35} aria-hidden="true"/><h2>{generation.status === "QUEUED" ? "Report queued" : "Preparing report"}</h2><p>The saved assessment is being turned into a clinical report and PDF. This page updates automatically.</p></section>}
    {!loading && !error && generation?.status === "FAILED" &&
      <section className="cr-empty" role="alert"><h2>Report generation could not finish</h2><p>The assessment remains approved. The report is not available yet. Please contact your administrator if this does not resolve.</p><Button variant="outline" onPress={refresh}><RotateCcw size={16} aria-hidden="true"/>Check status again</Button></section>}
    {!loading && !error && !generation &&
      <section className="cr-empty"><FileCheck2 size={35} aria-hidden="true"/><h2>Report not started</h2><p>Complete the final clinical review to start report and PDF generation.</p><Link to={assessmentPath}>Return to assessment</Link></section>}
    {!loading && !error && generation?.status === "READY" && !ready &&
      <div className="cr-message cr-error" role="alert"><p>The report is marked ready, but its saved PDF is unavailable. Refresh the status or contact your administrator.</p><Button variant="outline" onPress={refresh}><RotateCcw size={16} aria-hidden="true"/>Refresh status</Button></div>}
    {!error && ready && report && <>
      <div className="cr-report-meta"><span>Assessment {report.assessment.reference}</span><span>Generated {reportDate(report.generatedAt)}</span></div>
      <div className="cr-approved-bar"><div><FileCheck2 size={24} aria-hidden="true"/><div><strong>Final report ready</strong><p>The PDF was saved after final clinical approval.</p></div></div><a className="cr-download" href={pdfUrl} download={`NIQ-report-${report.assessment.reference}.pdf`}><Download size={18} aria-hidden="true"/>Download PDF</a></div>
      <div className="cr-preview-heading"><h2>Report preview</h2><p>Saved PDF</p></div>
      <GeneratedReportPdfPreview url={pdfUrl}/>
    </>}
  </div>;
}

export function GeneratedReportPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { assessmentId = "" } = useParams();
  if (!hasPermission(user.role, "assessments.read")) return <Navigate to="/assessments" replace />;
  return <GeneratedReportWorkspace key={`${user.organizationId}:${assessmentId}`} user={user} assessmentId={assessmentId}/>;
}
