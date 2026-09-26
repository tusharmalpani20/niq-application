import { REPORT_LIMITS, faceScanConsentSummarySchema, type FaceScanConsentSummary } from "@niq/application-contracts";
import { assessmentRequest } from "./workflow-api";

const path = (assessmentId: string) => `/assessments/${encodeURIComponent(assessmentId)}/face-scan-consent`;
export const faceScanConsentFileUrl = (organizationId: string, assessmentId: string, consentId: string) =>
  `/api/v1/organizations/${encodeURIComponent(organizationId)}${path(assessmentId)}/${encodeURIComponent(consentId)}/file`;
const parse = (value: unknown) => faceScanConsentSummarySchema.parse(value);

export async function getFaceScanConsent(organizationId: string, assessmentId: string): Promise<FaceScanConsentSummary> {
  return parse(await assessmentRequest(organizationId, path(assessmentId)));
}

export async function requestFaceScanConsent(organizationId: string, assessmentId: string, revision: number): Promise<FaceScanConsentSummary> {
  return parse(await assessmentRequest(organizationId, `${path(assessmentId)}/request`, "POST", { revision }));
}

export async function clearFaceScanConsent(organizationId: string, assessmentId: string, revision: number): Promise<FaceScanConsentSummary> {
  return parse(await assessmentRequest(organizationId, `${path(assessmentId)}?revision=${revision}`, "DELETE"));
}

export async function uploadFaceScanConsent(organizationId: string, assessmentId: string, revision: number, file: File, uploadKey: string): Promise<FaceScanConsentSummary> {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || !file.size || file.size > REPORT_LIMITS.fileBytes)
    throw new Error(`Choose a PDF, JPEG or PNG file up to ${Math.round(REPORT_LIMITS.fileBytes / 1024 / 1024)} MB.`);
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}${path(assessmentId)}/upload`, {
    method: "POST", credentials: "include", signal: AbortSignal.timeout(300_000), body: file,
    headers: {
      "content-type": file.type, "x-assessment-revision": String(revision), "x-upload-key": uploadKey,
      "x-file-name": encodeURIComponent(file.name), "x-file-sha256": sha256,
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message ?? "The consent upload could not be confirmed. Refresh its status before retrying.");
  return parse(result);
}
