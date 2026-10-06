import { and, eq, inArray } from "drizzle-orm";
import { assessmentScoreResultSchema } from "../../../../packages/contracts/src/assessment-workflow";
import { projectScoreReviews, type ScoreReviewEntry } from "../../../../packages/contracts/src/assessment-score-reviews";
import type { Database } from "../db/client";
import { assessmentFaceScans, assessmentReviewedRisks, assessmentScoreReviews, assessmentSubmissions } from "../db/schema";
import { hasQuestionnaireOverrides } from "./assessment-reviewed-risk";
import { riskCategoryFromFinalSnapshot } from "./overview-risk";

export type AssessmentRiskCategory = "low" | "moderate" | "high";
type Candidate = { id: string; status: string; currentSubmissionId: string | null; clinicalReview?: unknown; finalRiskCategory?: AssessmentRiskCategory | null };
type Unseal = <T>(value: unknown) => T;

/** Resolve current scoring risk in bulk, before a list or review queue is paginated. */
export async function loadAssessmentRiskCategories(db: Database, organizationId: string, rows: Candidate[], unseal: Unseal) {
  const categories = new Map<string, AssessmentRiskCategory | null>();
  for (const row of rows) {
    if (row.status === "COMPLETED" && row.finalRiskCategory) {
      categories.set(row.id, row.finalRiskCategory);
    } else if (row.status === "COMPLETED" && row.clinicalReview) {
      const review = unseal<{ finalSnapshot?: unknown }>(row.clinicalReview);
      categories.set(row.id, riskCategoryFromFinalSnapshot(review.finalSnapshot));
    }
  }

  const active = rows.filter(row => ["SCORED", "UNDER_REVIEW"].includes(row.status) && row.currentSubmissionId);
  if (!active.length) return categories;
  const submissionIds = [...new Set(active.map(row => row.currentSubmissionId!))];
  const assessmentIds = [...new Set(active.map(row => row.id))];
  const [submissions, reviews, riskTasks, scans] = await Promise.all([
    db.select({ id: assessmentSubmissions.id, status: assessmentSubmissions.status, result: assessmentSubmissions.result })
      .from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId, organizationId), inArray(assessmentSubmissions.id, submissionIds))),
    db.select({ submissionId: assessmentScoreReviews.submissionId, revision: assessmentScoreReviews.revision, event: assessmentScoreReviews.event })
      .from(assessmentScoreReviews).where(and(eq(assessmentScoreReviews.organizationId, organizationId), inArray(assessmentScoreReviews.submissionId, submissionIds))),
    db.select({ submissionId: assessmentReviewedRisks.submissionId, revision: assessmentReviewedRisks.revision, result: assessmentReviewedRisks.result })
      .from(assessmentReviewedRisks).where(and(eq(assessmentReviewedRisks.organizationId, organizationId), inArray(assessmentReviewedRisks.submissionId, submissionIds), eq(assessmentReviewedRisks.status, "SUCCEEDED"))),
    db.select({ assessmentId: assessmentFaceScans.assessmentId, id: assessmentFaceScans.id, state: assessmentFaceScans.state, projection: assessmentFaceScans.projection, createdAt: assessmentFaceScans.createdAt })
      .from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, organizationId), inArray(assessmentFaceScans.assessmentId, assessmentIds), eq(assessmentFaceScans.isCurrent, true))),
  ]);
  const bySubmission = new Map(submissions.map(submission => [submission.id, submission]));
  const reviewsBySubmission = new Map<string, ScoreReviewEntry[]>();
  for (const row of reviews.sort((a, b) => a.revision - b.revision)) {
    const entries = reviewsBySubmission.get(row.submissionId) ?? [];
    entries.push(unseal<ScoreReviewEntry>(row.event));
    reviewsBySubmission.set(row.submissionId, entries);
  }
  const tasksByRevision = new Map(riskTasks.map(task => [`${task.submissionId}:${task.revision}`, task]));
  const scanByAssessment = new Map<string, (typeof scans)[number]>();
  for (const scan of scans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (scan.state === "COMPLETED" && scan.projection && !scanByAssessment.has(scan.assessmentId)) scanByAssessment.set(scan.assessmentId, scan);
  }

  for (const row of active) {
    const submission = bySubmission.get(row.currentSubmissionId!);
    if (submission?.status !== "SUCCEEDED" || !submission.result) continue;
    const parsed = assessmentScoreResultSchema.safeParse(unseal(submission.result));
    if (!parsed.success) continue;
    const currentScan = scanByAssessment.get(row.id);
    const scanScore = currentScan?.projection ? unseal<{ score?: { status?: string; points?: number | null } }>(currentScan.projection).score : null;
    const scan = currentScan ? { id: currentScan.id, points: scanScore?.status === "SCORED" ? scanScore.points ?? null : null } : undefined;
    const projection = projectScoreReviews(parsed.data, reviewsBySubmission.get(submission.id) ?? [], scan);
    let status = "ORIGINAL";
    let classification = parsed.data.classification;
    if (hasQuestionnaireOverrides(projection)) {
      const task = tasksByRevision.get(`${submission.id}:${projection.revision}`);
      status = "CONFIRMED";
      classification = task?.result ? unseal<{ classification: typeof classification }>(task.result).classification : null;
    }
    categories.set(row.id, riskCategoryFromFinalSnapshot({ score: { risk: { status, classification } } }));
  }
  return categories;
}
