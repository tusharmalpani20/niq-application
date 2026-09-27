import type { AssessmentSummary } from "@niq/application-contracts";

export type PatientSort = "registered-newest" | "registered-oldest" | "assessment-newest" | "assessment-oldest";

export function sortPatientRows<T extends { createdAt: Date; lastAssessment: Date | null; reference: string }>(rows: T[], sort: PatientSort): T[] {
  const byAssessment = sort.startsWith("assessment-");
  const direction = sort.endsWith("newest") ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (byAssessment) {
      // Patients without an assessment belong last in either direction.
      if (!a.lastAssessment) return b.lastAssessment ? 1 : 0;
      if (!b.lastAssessment) return -1;
      const assessmentDifference = a.lastAssessment.getTime() - b.lastAssessment.getTime();
      if (assessmentDifference) return assessmentDifference * direction;
    } else {
      const registrationDifference = a.createdAt.getTime() - b.createdAt.getTime();
      if (registrationDifference) return registrationDifference * direction;
    }
    return a.reference.localeCompare(b.reference);
  });
}

export function todayDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function patientAgeLabel(dateOfBirth: string | null, now = new Date()): string {
  if (!dateOfBirth || dateOfBirth > todayDate(now)) return "Age unavailable";
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "Age unavailable";
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  if (years >= 1) return `${years} ${years === 1 ? "year" : "years"}`;
  if (months >= 1) return `${months} ${months === 1 ? "month" : "months"}`;
  // Calendar dates avoid daylight-saving offsets when calculating infant age.
  const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(birth.getFullYear(), birth.getMonth(), birth.getDate())) / 86400000);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function latestAssessmentDates(records: AssessmentSummary[]): Map<string, Date> {
  const dates = new Map<string, Date>();
  for (const record of records) {
    const previous = dates.get(record.patient.id);
    if (!previous || record.createdAt > previous) dates.set(record.patient.id, record.createdAt);
  }
  return dates;
}

export const assessmentStatusLabels = {
  DRAFT: "Draft", READY_FOR_SCORING: "Ready for scoring", SCORING_PENDING: "Pending scoring",
  SCORING_UNAVAILABLE: "Scoring unavailable", SCORED: "Scored", UNDER_REVIEW: "Under review",
  COMPLETED: "Completed", VOIDED: "Voided",
} as const satisfies Record<AssessmentSummary["status"], string>;
