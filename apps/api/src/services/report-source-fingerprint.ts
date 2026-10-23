import { createHash } from "node:crypto";
import type { GeneratedReport } from "../../../../packages/contracts/src/generated-report";
import type { ClinicalReviewStored } from "./clinical-review-state";

type SourceAssessment = { status: string; currentSubmissionId: string | null; completedAt: Date | null };
/** Shared by download and availability so a changed clinical review withdraws both. */
export function reportSourceFingerprint(row: SourceAssessment, review: ClinicalReviewStored, checksum: string, decision?: GeneratedReport["decision"]): string | null {
  const final = review.finalSnapshot as { submissionId?: string | null; scoreRevision?: number; score?: { overall?: { reviewedPoints?: number | null }; risk?: { status?: string; resultReference?: string | null; classification?: { id?: string } | null } } } | undefined;
  if (row.status !== "COMPLETED" || !row.currentSubmissionId || !row.completedAt || !final || final.submissionId !== row.currentSubmissionId
    || !Number.isInteger(final.scoreRevision) || final.scoreRevision! < 0 || !Number.isFinite(final.score?.overall?.reviewedPoints)
    || (final.score?.overall?.reviewedPoints ?? -1) < 0 || !["ORIGINAL", "CONFIRMED"].includes(final.score?.risk?.status ?? "")
    || !final.score?.risk?.classification?.id || !final.score.risk.resultReference) return null;
  return createHash("sha256").update(JSON.stringify({ submissionId: row.currentSubmissionId, scoreRevision: final.scoreRevision,
    completedAt: row.completedAt.toISOString(), reviewedScore: final.score.overall!.reviewedPoints, riskId: final.score.risk.classification.id,
    resultReference: final.score.risk.resultReference, checksum, decision: decision ?? { productStageChoice: null, plannedTreatmentStartDate: null } })).digest("hex");
}
