import type { AssessmentInitialization, AssessmentWorkflow, FormAnswers } from "@niq/application-contracts";

export class AssessmentRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

export async function assessmentRequest<T>(organizationId: string, path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}${path}`, {
    method, signal, credentials: "include", headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new AssessmentRequestError(data?.error?.message ?? "The assessment could not be loaded. Please try again.", response.status, data?.error?.code);
  return data as T;
}
export const initializeAssessment = (org: string, patientId: string, requestKey: string) => assessmentRequest<AssessmentInitialization>(org, "/assessment-initializations", "POST", { patientId, requestKey });
export const retryInitialization = (org: string, id: string) => assessmentRequest<AssessmentInitialization>(org, `/assessment-initializations/${id}/retry`, "POST");
export const getAssessment = (org: string, id: string) => assessmentRequest<AssessmentWorkflow>(org, `/assessments/${id}`);
export const saveAssessment = (org: string, id: string, revision: number, answers: FormAnswers) => assessmentRequest<AssessmentWorkflow>(org, `/assessments/${id}`, "PATCH", { revision, answers });
export const submitAssessment = (org: string, id: string, revision: number) => assessmentRequest<AssessmentWorkflow>(org, `/assessments/${id}/submit`, "POST", { revision });
export const retryAssessmentScoring = (org: string, id: string) => assessmentRequest<AssessmentWorkflow>(org, `/assessments/${id}/submission/retry`, "POST");
export const reconcileAssessmentScoring = (org: string, id: string) => assessmentRequest<AssessmentWorkflow>(org, `/assessments/${id}/submission/reconcile`, "POST");
