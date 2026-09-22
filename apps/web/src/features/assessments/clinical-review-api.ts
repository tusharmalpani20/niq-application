import type { ClinicalReview, ClinicalReviewAction, ClinicalReviewQueue, ClinicalReviewer } from "@niq/application-contracts";
import { assessmentRequest } from "./workflow-api";

const path = (id: string) => `/assessments/${encodeURIComponent(id)}/clinical-review`;
export const getClinicalReview = (org: string, id: string, signal?: AbortSignal) => assessmentRequest<ClinicalReview>(org, path(id), "GET", undefined, signal);
export const getClinicalReviewers = (org: string, id: string, signal?: AbortSignal) => assessmentRequest<ClinicalReviewer[]>(org, `${path(id)}/eligible-reviewers`, "GET", undefined, signal);
export const changeClinicalReview = (org: string, id: string, command: ClinicalReviewAction) => assessmentRequest<ClinicalReview>(org, path(id), "POST", command);
export const listClinicalReviews = (org: string, params: URLSearchParams, signal?: AbortSignal) => assessmentRequest<ClinicalReviewQueue>(org, `/clinical-reviews?${params}`, "GET", undefined, signal);

export const clinicalReviewLabels: Record<ClinicalReview["state"], string> = {
  NOT_SUBMITTED: "Not sent for clinical review", QUEUED: "Awaiting reviewer", IN_REVIEW: "In review",
  RETURNED: "Returned for correction", AWAITING_RESUBMISSION: "Awaiting resubmission", COMPLETED: "Completed",
};
export const clinicalActionLabels: Record<ClinicalReviewAction["action"], string> = {
  SEND: "Send for clinical review", CLAIM: "Claim review", TRANSFER: "Transfer review", RELEASE: "Release to queue",
  RETURN_TO_DRAFT: "Return to draft", REASSIGN_CORRECTION: "Reassign correction", RESEND: "Resend for clinical review", COMPLETE: "Complete review",
};
