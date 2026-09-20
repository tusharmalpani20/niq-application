export type AssessmentHeightCandidate = {
  assessmentId: string; measurementId: string; capturedAt: string;
  heightCm: number; status: string;
};
/** Calendar-year age is intentionally distinct from clinical/display age based on birthday. */
export function isAdultForAssessmentHeight(birthYear: number | null | undefined, referenceYear: number): boolean {
  return Number.isSafeInteger(birthYear) && Number.isSafeInteger(referenceYear) && referenceYear >= 1 && birthYear! >= 1 && birthYear! <= referenceYear && referenceYear - birthYear! >= 18;
}
/** Candidates MUST already be scoped to the same patient, organization and current access. */
export function selectAssessmentHeight(input: {
  birthYear: number | null | undefined; referenceYear: number; assessmentStartedAt: string;
  assessmentId?: string; candidates: readonly AssessmentHeightCandidate[];
}): AssessmentHeightCandidate | null {
  if (!isAdultForAssessmentHeight(input.birthYear, input.referenceYear)) return null;
  const started = Date.parse(input.assessmentStartedAt);
  if (!Number.isFinite(started)) return null;
  const eligible = input.candidates.filter(candidate => {
    const captured = Date.parse(candidate.capturedAt);
    return candidate.assessmentId !== input.assessmentId && ["SCORED", "COMPLETED"].includes(candidate.status)
      && Number.isFinite(candidate.heightCm) && candidate.heightCm > 0
      && Number.isFinite(captured) && captured < started;
  });
  eligible.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || b.measurementId.localeCompare(a.measurementId));
  return eligible[0] ? { ...eligible[0] } : null;
}
