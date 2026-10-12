import { assessmentRequest } from "./workflow-api";
import type { GeneratedReport, GeneratedNarrative } from "@niq/application-contracts";

export type { GeneratedReport, GeneratedNarrative };

const reportPath = (id: string) => `/assessments/${encodeURIComponent(id)}/generated-report`;

export const getGeneratedReport = (organizationId: string, assessmentId: string, signal?: AbortSignal) =>
  assessmentRequest<{ report: GeneratedReport | null }>(organizationId, reportPath(assessmentId), "GET", undefined, signal);

export type ReportGenerationOptions = { productStageChoice?: "surgical" | "treatment_stage"; plannedTreatmentStartDate?: string };
export const generateReport = (organizationId: string, assessmentId: string, requestKey: string, options: ReportGenerationOptions = {}) =>
  assessmentRequest<{ report: GeneratedReport }>(organizationId, `${reportPath(assessmentId)}/generate`, "POST", { requestKey, ...options });

export const saveReportNarrative = (organizationId: string, assessmentId: string, revision: number, narrative: GeneratedNarrative, issueResolution?: { explanation: string }) =>
  assessmentRequest<{ report: GeneratedReport }>(organizationId, `${reportPath(assessmentId)}/narrative`, "PATCH", { revision, narrative, ...(issueResolution ? { issueResolution } : {}) });

export const approveGeneratedReport = (organizationId: string, assessmentId: string, revision: number) =>
  assessmentRequest<{ report: GeneratedReport }>(organizationId, `${reportPath(assessmentId)}/approve`, "POST", { revision });

export async function uploadGeneratedReportPdf(organizationId: string, assessmentId: string, revision: number, file: Blob): Promise<{ report: GeneratedReport }> {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}${reportPath(assessmentId)}/pdf?revision=${revision}`, {
    method: "POST", credentials: "include", headers: { "content-type": "application/pdf" }, body: file,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "The PDF could not be saved. Please try again.");
  return data as { report: GeneratedReport };
}

export function generatedReportPdfUrl(organizationId: string, assessmentId: string) {
  return `/api/v1/organizations/${encodeURIComponent(organizationId)}${reportPath(assessmentId)}/pdf`;
}
