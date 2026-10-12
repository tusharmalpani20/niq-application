import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileCheck2, FilePenLine, LoaderCircle, RotateCcw } from "lucide-react";
import { hasPermission, type AuthenticatedUser } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { getOrganization } from "@/lib/api";
import { brandingFromOrganization, type TenantBranding } from "@/lib/branding";
import { useBranding } from "@/lib/branding-context";
import { GeneratedReportPreview } from "./GeneratedReportPreview";
import { approveGeneratedReport, generateReport, generatedReportPdfUrl, getGeneratedReport, getReportToxicityOptions, pdfSha256, reportBrandingFingerprint, saveReportNarrative, uploadGeneratedReportPdf, type GeneratedNarrative, type GeneratedReport, type ReportToxicityOption } from "./generated-report-api";
import { reportDate } from "./generated-report-format";
import { ReportToxicityPicker } from "./ReportToxicityPicker";
import { useDraftNavigationGuard } from "./useDraftNavigationGuard";

const narrativeFields: Array<{ id: keyof GeneratedNarrative; label: string; help: string }> = [
  { id: "overview", label: "Clinical overview", help: "A short summary of the verified assessment and treatment context." },
  { id: "keyFindings", label: "Key findings", help: "Plain-language interpretation of confirmed findings only." },
  { id: "actionSummary", label: "Action plan", help: "Prioritised actions supported by the saved guidance." },
  { id: "monitoringSummary", label: "Monitoring", help: "What the treating team should follow up." },
];

function reportBrandKey(branding: Required<TenantBranding>): string {
  return JSON.stringify([branding.displayName, branding.logoUrl, branding.primaryColor, branding.secondaryColor]);
}

async function assetDataUrl(url: string | null, imageOnly = false): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (imageOnly && !blob.type.startsWith("image/")) return null;
    if (imageOnly && blob.type === "image/webp") {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(bitmap, 0, 0);
        return canvas.toDataURL("image/png");
      } finally { bitmap.close(); }
    }
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function GeneratedReportWorkspace({ user, assessmentId }: { user: AuthenticatedUser; assessmentId: string }) {
  const { branding, updateBranding } = useBranding();
  const brandKey = reportBrandKey(branding);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [narrative, setNarrative] = useState<GeneratedNarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "save" | "pdf" | "approve" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidateUrl, setCandidateUrl] = useState<string | null>(null);
  const [candidateBrandKey, setCandidateBrandKey] = useState<string | null>(null);
  const [candidateSha256, setCandidateSha256] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [issueExplanation, setIssueExplanation] = useState("");
  const [productStageChoice, setProductStageChoice] = useState<"" | "surgical" | "treatment_stage">("");
  const [toxicityOptions, setToxicityOptions] = useState<ReportToxicityOption[]>([]);
  const [confirmedToxicityIds, setConfirmedToxicityIds] = useState<string[]>([]);
  const [toxicityOptionsLoading, setToxicityOptionsLoading] = useState(true);
  const [toxicityOptionsError, setToxicityOptionsError] = useState("");
  const generationKey = useRef<string | null>(null);
  const candidateRef = useRef<string | null>(null);
  const currentBrandKey = useRef(brandKey);
  const path = `/assessments/${encodeURIComponent(assessmentId)}`;
  const dirty = !!report && !!narrative && JSON.stringify(report.narrative) !== JSON.stringify(narrative);
  const editable = report?.status === "DRAFT";
  const canConfirmEffects = hasPermission(user.role, "reviews.complete");
  const savedEffectIds = report?.decision.confirmedToxicityIds ?? [];
  const generationInputsChanged = !!report && (
    (productStageChoice || null) !== report.decision.productStageChoice ||
    confirmedToxicityIds.length !== savedEffectIds.length ||
    confirmedToxicityIds.some(id => !savedEffectIds.includes(id))
  );
  const navigationDialog = useDraftNavigationGuard(dirty, "Your unsaved report text will be lost. Save it before leaving.");

  const accept = useCallback((next: GeneratedReport | null, preserveGenerationInputs = false) => {
    setReport(next);
    setNarrative(next?.narrative ?? null);
    setConfirmed(false);
    setIssueExplanation("");
    if (!preserveGenerationInputs) {
      setProductStageChoice(next?.decision.productStageChoice ?? "");
      setConfirmedToxicityIds(next?.decision.confirmedToxicityIds ?? []);
    }
    if (candidateRef.current) URL.revokeObjectURL(candidateRef.current);
    candidateRef.current = null;
    setCandidateUrl(null);
    setCandidateBrandKey(null);
    setCandidateSha256(null);
  }, []);

  useEffect(() => {
    if (currentBrandKey.current === brandKey) return;
    currentBrandKey.current = brandKey;
    if (candidateRef.current) URL.revokeObjectURL(candidateRef.current);
    candidateRef.current = null;
    setCandidateUrl(null);
    setCandidateBrandKey(null);
    setCandidateSha256(null);
    setConfirmed(false);
  }, [brandKey]);

  useEffect(() => {
    const controller = new AbortController();
    getGeneratedReport(user.organizationId, assessmentId, controller.signal)
      .then(value => { if (!controller.signal.aborted) { accept(value.report); setError(""); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the report."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (candidateRef.current) URL.revokeObjectURL(candidateRef.current); };
  }, [user.organizationId, assessmentId, accept]);

  const loadToxicityOptions = useCallback(async (signal?: AbortSignal) => {
    setToxicityOptionsLoading(true);
    setToxicityOptionsError("");
    try {
      const result = await getReportToxicityOptions(user.organizationId, assessmentId, signal);
      if (!signal?.aborted) setToxicityOptions(result.options);
    } catch (cause) {
      if (!signal?.aborted) setToxicityOptionsError(cause instanceof Error ? cause.message : "Could not load available effects.");
    } finally {
      if (!signal?.aborted) setToxicityOptionsLoading(false);
    }
  }, [user.organizationId, assessmentId]);

  useEffect(() => {
    if (!canConfirmEffects) { setToxicityOptionsLoading(false); return; }
    const controller = new AbortController();
    void loadToxicityOptions(controller.signal);
    return () => controller.abort();
  }, [canConfirmEffects, loadToxicityOptions]);

  async function refresh() {
    setLoading(true); setError("");
    try { accept((await getGeneratedReport(user.organizationId, assessmentId)).report); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reload the report."); }
    finally { setLoading(false); }
  }

  async function generate() {
    if (busy || dirty || (canConfirmEffects && (toxicityOptionsLoading || toxicityOptionsError))) return;
    setBusy("generate"); setError(""); setNotice("");
    const previousRunId = report?.runId;
    const previousRevision = report?.revision ?? -1;
    generationKey.current ??= crypto.randomUUID();
    try {
      const result = await generateReport(user.organizationId, assessmentId, generationKey.current, {
        ...(productStageChoice ? { productStageChoice } : {}),
        confirmedToxicityIds: canConfirmEffects ? confirmedToxicityIds.filter(id => toxicityOptions.some(option => option.id === id)) : [],
      });
      generationKey.current = null;
      accept(result.report);
      setNotice("Draft created. Review the text and the complete preview before approval.");
    } catch (cause) {
      // A lost response can follow a committed generation. Read the saved result before offering a retry.
      try { const saved = await getGeneratedReport(user.organizationId, assessmentId); if (saved.report && (!previousRunId || saved.report.runId !== previousRunId || saved.report.revision > previousRevision)) { accept(saved.report); generationKey.current = null; setNotice("Saved report loaded after the generation request."); return; } }
      catch { /* Keep the original error and request key for a safe retry. */ }
      setError(cause instanceof Error ? cause.message : "Report generation failed. Try again.");
    } finally { setBusy(null); }
  }

  async function saveNarrative() {
    if (!report || !narrative || !dirty || busy || !editable) return;
    setBusy("save"); setError(""); setNotice("");
    try { accept((await saveReportNarrative(user.organizationId, assessmentId, report.revision, narrative)).report, true); setNotice("Clinical text saved. Prepare a new PDF before approval."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the clinical text."); }
    finally { setBusy(null); }
  }

  async function resolveIssues() {
    if (!report || !narrative || !editable || !report.issues.length || issueExplanation.trim().length < 10 || busy) return;
    setBusy("save"); setError(""); setNotice("");
    try {
      accept((await saveReportNarrative(user.organizationId, assessmentId, report.revision, narrative, { explanation: issueExplanation.trim() })).report, true);
      setNotice("The clinician's resolution was saved with the report. Prepare a new PDF before approval.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resolve the report issues."); }
    finally { setBusy(null); }
  }

  async function preparePdf() {
    if (!report || busy || dirty || generationInputsChanged || !editable) return;
    const preparingBrandKey = brandKey;
    if (candidateRef.current) URL.revokeObjectURL(candidateRef.current);
    candidateRef.current = null;
    setCandidateUrl(null);
    setCandidateBrandKey(null);
    setCandidateSha256(null);
    setConfirmed(false);
    setBusy("pdf"); setError(""); setNotice("");
    try {
      const latestOrganization = (await getOrganization(user.organizationId, { includeInvitations: false })).organization;
      const latestBranding = brandingFromOrganization(latestOrganization);
      if (reportBrandKey(latestBranding) !== preparingBrandKey) {
        updateBranding(latestBranding);
        throw new Error("The organisation theme changed. Prepare the PDF with the current theme.");
      }
      const [regularFont, boldFont, logoDataUrl] = await Promise.all([
        assetDataUrl("/pdfjs/standard_fonts/LiberationSans-Regular.ttf"),
        assetDataUrl("/pdfjs/standard_fonts/LiberationSans-Bold.ttf"),
        assetDataUrl(branding.logoUrl, true),
      ]);
      if (!regularFont || !boldFont) throw new Error("The report fonts could not be loaded. Try again when the application is online.");
      if (branding.logoUrl && !logoDataUrl) throw new Error("The organisation logo could not be loaded. Prepare the PDF again when the logo is available.");
      const [{ pdf }, { GeneratedReportPdf, registerReportPdfFonts }] = await Promise.all([
        import("@react-pdf/renderer"), import("./GeneratedReportPdf"),
      ]);
      registerReportPdfFonts(regularFont, boldFont);
      // Approval status is kept in Application so the reviewed bytes can be released unchanged.
      const blob = await pdf(<GeneratedReportPdf report={report} brand={{ name: branding.displayName, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, logoDataUrl }}/>).toBlob();
      if (!blob.size) throw new Error("The PDF was empty. Try preparing it again.");
      const [brandingFingerprint, preparedSha256] = await Promise.all([reportBrandingFingerprint(latestOrganization), pdfSha256(blob)]);
      const uploaded = await uploadGeneratedReportPdf(user.organizationId, assessmentId, report.revision, brandingFingerprint, blob);
      setReport(uploaded.report);
      if (uploaded.report.artifact?.sha256 !== preparedSha256 || uploaded.report.artifact.brandingFingerprint !== brandingFingerprint)
        throw new Error("The saved PDF changed while being prepared. Prepare and review it again.");
      if (currentBrandKey.current !== preparingBrandKey) {
        setNotice("The organisation theme changed while this PDF was prepared. Prepare it again before approval.");
        return;
      }
      const url = URL.createObjectURL(blob);
      if (candidateRef.current) URL.revokeObjectURL(candidateRef.current);
      candidateRef.current = url;
      setCandidateUrl(url);
      setCandidateBrandKey(preparingBrandKey);
      setCandidateSha256(preparedSha256);
      setNotice("Final PDF candidate saved. Open and inspect it, then approve the report.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The PDF could not be prepared."); }
    finally { setBusy(null); }
  }

  async function approve() {
    if (!report || report.issues.length || !report.artifact || !candidateUrl || !candidateSha256 || report.artifact.sha256 !== candidateSha256 || candidateBrandKey !== brandKey || !confirmed || dirty || generationInputsChanged || busy || !editable) return;
    setBusy("approve"); setError(""); setNotice("");
    try {
      const latestBranding = brandingFromOrganization((await getOrganization(user.organizationId, { includeInvitations: false })).organization);
      if (reportBrandKey(latestBranding) !== candidateBrandKey) {
        updateBranding(latestBranding);
        throw new Error("The organisation theme changed. Prepare and review a new PDF before approval.");
      }
      accept((await approveGeneratedReport(user.organizationId, assessmentId, report.revision, candidateSha256)).report);
      setNotice("Clinical report approved. The saved PDF is now available to download.");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve the report."); }
    finally { setBusy(null); }
  }

  const statusLabel = report?.status === "APPROVED" ? "Approved" : report?.status === "STALE" ? "Needs regeneration" : report ? "Draft · clinical review required" : "No report yet";
  const currentCandidateUrl = candidateBrandKey === brandKey ? candidateUrl : null;
  const omittedLabels = report ? narrativeFields
    .filter(field => report.omittedNarrativeFields?.includes(field.id) && !report.narrative[field.id].trim())
    .map(field => field.label) : [];
  const canGenerate = !busy && !dirty && (!canConfirmEffects || (!toxicityOptionsLoading && !toxicityOptionsError));
  const generationControls = () => <>
    <div className="cr-generation-options">
      <label>Product plan if both surgical and treatment plans apply
        <select value={productStageChoice} onChange={event => { setProductStageChoice(event.target.value as typeof productStageChoice); generationKey.current = null; }}>
          <option value="">Use saved rule or request clinician choice</option>
          <option value="surgical">Surgical plan</option>
          <option value="treatment_stage">Treatment-stage plan</option>
        </select>
      </label>
    </div>
    {canConfirmEffects && <ReportToxicityPicker
      options={toxicityOptions}
      selectedIds={confirmedToxicityIds}
      loading={toxicityOptionsLoading}
      error={toxicityOptionsError}
      disabled={!!busy}
      onToggle={(id, selected) => {
        setConfirmedToxicityIds(current => selected ? [...current, id] : current.filter(value => value !== id));
        generationKey.current = null;
      }}
      onRetry={() => { void loadToxicityOptions(); }}
    />}
  </>;
  return <div className="cr-workspace">
    <nav className="cr-back"><Link to={path}><ArrowLeft size={17} aria-hidden="true"/>Back to assessment</Link></nav>
    <div className="cr-workspace-head"><div><p className="cr-workspace-eyebrow">Clinical reporting</p><h1>Medical nutrition therapy report</h1><p>Verified facts and rule guidance are placed in a fixed visual report. The generated text is editable before approval.</p></div><span className={`cr-status ${report?.status === "APPROVED" ? "cr-status-approved" : ""}`}>{statusLabel}</span></div>
    {error && <div className="cr-message cr-error" role="alert"><p>{error}</p><Button variant="outline" isDisabled={!!busy} onPress={() => { void refresh(); }}>Reload saved report</Button></div>}
    {notice && <p className="cr-message" role="status">{notice}</p>}
    {loading ? <p role="status" className="cr-empty"><LoaderCircle className="cr-spin" size={20} aria-hidden="true"/>Loading report…</p> : !report ? <section className="cr-empty"><FilePenLine size={35} aria-hidden="true"/><h2>No generated report yet</h2><p>Create a draft from the completed assessment and saved NIQ rules. A clinician will review it before the PDF is released.</p>{generationControls()}<Button isDisabled={!canGenerate} onPress={() => { void generate(); }}>{busy === "generate" ? "Generating…" : "Generate report draft"}</Button></section> : <>
      {report.status === "STALE" && <div className="cr-message cr-stale" role="status"><strong>This draft is out of date.</strong><p>The assessment or reviewed score changed. Generate a new draft before approval or export.</p>{generationControls()}<Button isDisabled={!canGenerate} onPress={() => { void generate(); }}><RotateCcw size={16} aria-hidden="true"/>Generate fresh draft</Button></div>}
      <div className="cr-report-meta"><span>Assessment {report.assessment.reference}</span><span>Generated {reportDate(report.generatedAt)}</span><span>Rule version {report.assessment.ruleVersionId}</span><span>Model {report.model}</span>{report.approvedAt && <span>Approved {reportDate(report.approvedAt)}</span>}</div>
      {omittedLabels.length > 0 && <p className="cr-message" role="status">The AI left these passages out because the available evidence did not support them: {omittedLabels.join(", ")}. They do not appear in the report unless a clinician adds supported text.</p>}
      {report.issues.length > 0 && <div className="cr-message cr-issues"><strong>Action required before approval</strong><ul>{report.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul><p>Correct confirmed facts and generate a fresh draft, or document a clinician resolution below. Approval remains unavailable while these issues are open.</p>{report.status !== "STALE" && <>{generationControls()}<Button variant="outline" isDisabled={!canGenerate} onPress={() => { void generate(); }}><RotateCcw size={16} aria-hidden="true"/>Generate with updated facts</Button></>}{editable && narrative && <div className="cr-issue-resolution"><label htmlFor="report-issue-resolution">Clinician resolution explanation</label><textarea id="report-issue-resolution" value={issueExplanation} minLength={10} maxLength={1000} rows={3} placeholder="Explain how each issue was checked or why the approved report wording is clinically appropriate." onChange={event => setIssueExplanation(event.target.value)}/><Button isDisabled={!!busy || issueExplanation.trim().length < 10} onPress={() => { void resolveIssues(); }}>Save documented resolution</Button></div>}</div>}
      {editable && report.issues.length === 0 && <section className="cr-regenerate" aria-label="Update confirmed effects and regenerate">
        <h2>Update report inputs</h2>
        <p>Change the confirmed effects or plan details, then regenerate. This replaces the current draft text and PDF candidate. Save or discard any unsaved text edits first.</p>
        {generationControls()}
        <Button variant="outline" isDisabled={!canGenerate} onPress={() => { void generate(); }}><RotateCcw size={16} aria-hidden="true"/>Regenerate draft</Button>
      </section>}
      {generationInputsChanged && <p className="cr-message" role="status">Report inputs have changed. Regenerate the draft to apply them. The current preview and PDF candidate still use the saved inputs.</p>}
      {editable && narrative && <section className="cr-review-editor" aria-label="Review generated text"><div className="cr-review-heading"><div><h2>Review generated text</h2><p>These four passages are the only model-written parts. Check them against the confirmed facts and guidance in the preview.</p></div><span>{dirty ? "Unsaved edits" : "Saved"}</span></div><div className="cr-narrative-grid">{narrativeFields.map(field => <label key={field.id}><strong>{field.label}</strong><small>{field.help}</small><textarea value={narrative[field.id]} maxLength={1800} rows={5} disabled={!!busy} onChange={event => { setNarrative(current => current ? { ...current, [field.id]: event.target.value } : current); setConfirmed(false); }} /></label>)}</div><div className="cr-review-actions"><Button variant="outline" isDisabled={!dirty || !!busy} onPress={() => accept(report, true)}>Discard edits</Button><Button isDisabled={!dirty || !!busy} onPress={() => { void saveNarrative(); }}>{busy === "save" ? "Saving…" : "Save text"}</Button></div></section>}
      {editable && <section className="cr-approval-bar" aria-label="Final PDF and approval"><div><h2>Final PDF</h2><p>Prepare the exact PDF, inspect it, and then approve. Any later text edit or theme change requires a new PDF.</p></div><div className="cr-approval-actions"><Button variant="outline" isDisabled={dirty || generationInputsChanged || !!busy || report.issues.length > 0} onPress={() => { void preparePdf(); }}><FileCheck2 size={17} aria-hidden="true"/>{busy === "pdf" ? "Preparing PDF…" : report.artifact ? "Prepare PDF again" : "Prepare PDF"}</Button>{currentCandidateUrl && <a className="cr-pdf-link" href={currentCandidateUrl} target="_blank" rel="noopener noreferrer">Open PDF candidate</a>}</div>{currentCandidateUrl && <label className="cr-approval-confirm"><input type="checkbox" checked={confirmed} disabled={!!busy || generationInputsChanged} onChange={event => setConfirmed(event.target.checked)}/><span>I reviewed the complete report and PDF candidate and approve this content for clinical use.</span></label>}<Button isDisabled={report.issues.length > 0 || !report.artifact || !currentCandidateUrl || !candidateSha256 || report.artifact.sha256 !== candidateSha256 || !confirmed || dirty || generationInputsChanged || !!busy} onPress={() => { void approve(); }}><CheckCircle2 size={17} aria-hidden="true"/>{busy === "approve" ? "Approving…" : "Approve report"}</Button><p className="cr-private-note">The PDF candidate stays private until approval.</p></section>}
      {report.status === "APPROVED" && <div className="cr-approved-bar"><div><CheckCircle2 size={24} aria-hidden="true"/><div><strong>Clinician approved</strong><p>The final PDF is stored with this report.</p></div></div><a className="cr-download" href={generatedReportPdfUrl(user.organizationId, assessmentId)} download={`NIQ-report-${report.assessment.reference}.pdf`}><Download size={18} aria-hidden="true"/>Download final PDF</a></div>}
      {report.status === "APPROVED" ? <p className="cr-message">The approved layout is preserved in the saved PDF. Download the final PDF above to view the exact approved report.</p> : <><div className="cr-preview-heading"><h2>Report preview</h2><p>Draft preview · not approved for clinical use</p></div><GeneratedReportPreview report={report}/></>}
    </>}
    {navigationDialog}
  </div>;
}

export function GeneratedReportPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { assessmentId = "" } = useParams();
  if (!hasPermission(user.role, "assessments.read")) return <Navigate to="/assessments" replace />;
  return <GeneratedReportWorkspace key={`${user.organizationId}:${assessmentId}`} user={user} assessmentId={assessmentId}/>;
}
