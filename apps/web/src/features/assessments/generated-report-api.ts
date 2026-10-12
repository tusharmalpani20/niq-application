import { assessmentRequest } from "./workflow-api";
import type { GeneratedReport } from "@niq/application-contracts";

export type { GeneratedReport };

export type GeneratedReportResponse = {
  report: GeneratedReport | null;
  generation: { status: "QUEUED" | "GENERATING" | "FAILED" | "READY"; failureCode?: string | null } | null;
};

const reportPath = (id: string) => `/assessments/${encodeURIComponent(id)}/generated-report`;

export const getGeneratedReport = (organizationId: string, assessmentId: string, signal?: AbortSignal) =>
  assessmentRequest<GeneratedReportResponse>(organizationId, reportPath(assessmentId), "GET", undefined, signal);

export function generatedReportPdfUrl(organizationId: string, assessmentId: string) {
  return `/api/v1/organizations/${encodeURIComponent(organizationId)}${reportPath(assessmentId)}/pdf`;
}
