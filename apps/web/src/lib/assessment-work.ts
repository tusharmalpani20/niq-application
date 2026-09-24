import type { AssessmentSummary } from "@niq/application-contracts";

export const openAssessmentStatuses = new Set<AssessmentSummary["status"]>(["DRAFT", "READY_FOR_SCORING"]);
export const facilityWorkStatuses = new Set<AssessmentSummary["status"]>([
  ...openAssessmentStatuses, "UNDER_REVIEW", "SCORING_UNAVAILABLE",
]);
