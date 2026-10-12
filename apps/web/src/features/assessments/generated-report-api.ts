import { assessmentRequest } from "./workflow-api";
import { reportBrandingPayload, type ReportBrandingSource, type GeneratedReport, type GeneratedNarrative } from "@niq/application-contracts";

export type { GeneratedReport, GeneratedNarrative };

export type GeneratedReportResponse = {
  report: GeneratedReport | null;
  generation: { status: "QUEUED" | "GENERATING" | "FAILED" | "READY"; failureCode?: string | null } | null;
};

const reportPath = (id: string) => `/assessments/${encodeURIComponent(id)}/generated-report`;

export type ReportToxicityOption = {
  id: string;
  classId: string;
  treatmentTypeId: string;
  expectedToxicity: string;
  classLabel?: string;
  treatmentTypeLabel?: string;
};

export const getReportToxicityOptions = (organizationId: string, assessmentId: string, signal?: AbortSignal) =>
  assessmentRequest<{ options: ReportToxicityOption[] }>(organizationId, `${reportPath(assessmentId)}/toxicity-options`, "GET", undefined, signal);

export const getGeneratedReport = (organizationId: string, assessmentId: string, signal?: AbortSignal) =>
  assessmentRequest<GeneratedReportResponse>(organizationId, reportPath(assessmentId), "GET", undefined, signal);

export type ReportGenerationOptions = { productStageChoice?: "surgical" | "treatment_stage"; confirmedToxicityIds?: string[] };
export const generateReport = (organizationId: string, assessmentId: string, requestKey: string, options: ReportGenerationOptions = {}) =>
  assessmentRequest<{ report: GeneratedReport }>(organizationId, `${reportPath(assessmentId)}/generate`, "POST", { requestKey, ...options });

export const saveReportNarrative = (organizationId: string, assessmentId: string, revision: number, narrative: GeneratedNarrative, issueResolution?: { explanation: string }) =>
  assessmentRequest<{ report: GeneratedReport }>(organizationId, `${reportPath(assessmentId)}/narrative`, "PATCH", { revision, narrative, ...(issueResolution ? { issueResolution } : {}) });

export const approveGeneratedReport = (organizationId: string, assessmentId: string, revision: number, reviewedSha256: string) =>
  assessmentRequest<{ report: GeneratedReport }>(organizationId, `${reportPath(assessmentId)}/approve`, "POST", { revision, reviewedSha256 });

async function digestHex(input: BufferSource): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export const reportBrandingFingerprint = (brand: ReportBrandingSource) => digestHex(new TextEncoder().encode(reportBrandingPayload(brand)));
export const pdfSha256 = async (file: Blob) => digestHex(await file.arrayBuffer());

export async function uploadGeneratedReportPdf(organizationId: string, assessmentId: string, revision: number, brandingFingerprint: string, file: Blob): Promise<{ report: GeneratedReport }> {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}${reportPath(assessmentId)}/pdf?revision=${revision}`, {
    method: "POST", credentials: "include", headers: { "content-type": "application/pdf", "x-report-branding-fingerprint": brandingFingerprint }, body: file,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "The PDF could not be saved. Please try again.");
  return data as { report: GeneratedReport };
}

export function generatedReportPdfUrl(organizationId: string, assessmentId: string) {
  return `/api/v1/organizations/${encodeURIComponent(organizationId)}${reportPath(assessmentId)}/pdf`;
}
