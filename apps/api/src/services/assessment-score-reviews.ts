import { and, desc, eq } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { assessmentScoreResultSchema } from "../../../../packages/contracts/src/assessment-workflow";
import { projectScoreReviews, scoreReviewInputSchema, type ScoreReviewInput, type ScoreReviewEntry } from "../../../../packages/contracts/src/assessment-score-reviews";
import { assessmentScoreReviews as reviews, assessmentSubmissions } from "../db/schema";
import { ServiceError, type Principal, type RequestContext } from "./application";
import type { AssessmentWorkflowService, WorkflowExecutor } from "./assessment-workflow";

export class AssessmentScoreReviewService {
  constructor(private service: AssessmentWorkflowService) {}
  private async load(executor: WorkflowExecutor, organizationId: string, assessmentId: string) {
    const [submission] = await executor.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId, organizationId), eq(assessmentSubmissions.assessmentId, assessmentId))).orderBy(desc(assessmentSubmissions.createdAt)).limit(1);
    if (submission?.status !== "SUCCEEDED" || !submission.result) throw new ServiceError("CONFLICT", "A completed NIQ score is required before reviewing points.");
    const parsed = assessmentScoreResultSchema.safeParse(this.service.unseal(submission.result));
    if (!parsed.success) throw new ServiceError("CONFLICT", "The NIQ result could not be read.");
    const rows = await executor.select().from(reviews).where(and(eq(reviews.organizationId, organizationId), eq(reviews.assessmentId, assessmentId))).orderBy(reviews.revision);
    if (rows.some(row => row.submissionId !== submission.id)) throw new ServiceError("CONFLICT", "The NIQ result has changed. Contact support to review its history.");
    const entries = rows.map(row => this.service.unseal<ScoreReviewEntry>(row.event));
    return { submission, result: parsed.data, rows, projection: projectScoreReviews(parsed.data, entries) };
  }
  async read(actor: Principal, organizationId: string, assessmentId: string) {
    await this.service.authorize(actor, organizationId, assessmentId);
    return (await this.load(this.service.db, organizationId, assessmentId)).projection;
  }
  async add(actor: Principal, organizationId: string, assessmentId: string, raw: ScoreReviewInput, context: RequestContext) {
    const parsed = scoreReviewInputSchema.safeParse(raw);
    if (!parsed.success) throw new ServiceError("VALIDATION_ERROR", "Enter a valid score and a reason for the change.");
    const input = parsed.data;
    return this.service.db.transaction(async tx => {
      const assessment = await this.service.authorize(actor, organizationId, assessmentId, tx, true);
      if (assessment.status !== "SCORED") throw new ServiceError("CONFLICT", "A completed NIQ score is required before reviewing points.");
      const { submission, result, rows, projection } = await this.load(tx, organizationId, assessmentId);
      const replay = rows.find(row => row.actorId === actor.membershipId && row.requestKey === input.requestKey);
      if (replay) {
        const entry = this.service.unseal<ScoreReviewEntry>(replay.event);
        if (entry.targetType !== input.targetType || entry.targetId !== input.targetId || entry.points !== input.points || entry.reason !== (input.reason || null) || entry.revision !== input.expectedRevision + 1)
          throw new ServiceError("CONFLICT", "This request key belongs to a different adjustment.");
        return projection;
      }
      if (projection.revision !== input.expectedRevision) throw new ServiceError("CONFLICT", "Another person updated the reviewed score. Reload before saving.");
      const target = input.targetType === "overall" ? projection.overall : input.targetType === "section" ? projection.sections.find(s => s.id === input.targetId) : projection.sections.flatMap(s => s.items).find(i => i.id === input.targetId);
      const component = result.components.find(c => c.id === input.targetId);
      if (!target || target.niqPoints === null || (input.targetType === "item" && component?.status !== "answered")) throw new ServiceError("VALIDATION_ERROR", "Only scored answers and sections can be adjusted.");
      if (input.points === null ? !target.overridden : input.points === target.reviewedPoints) throw new ServiceError("VALIDATION_ERROR", "The score has not changed.");
      const entry: ScoreReviewEntry = { id: createEntityId(), revision: projection.revision + 1, targetType: input.targetType, targetId: input.targetId, previousPoints: target.reviewedPoints, points: input.points, reason: input.reason || null, actorId: actor.membershipId, actorName: actor.displayName, createdAt: new Date().toISOString(), resultReference: result.resultReference };
      const updated = projectScoreReviews(result, [...projection.entries, entry]);
      if ([updated.overall, ...updated.sections].some(s => s.reviewedPoints !== null && (!Number.isFinite(s.reviewedPoints) || s.reviewedPoints > Number.MAX_SAFE_INTEGER))) throw new ServiceError("VALIDATION_ERROR", "The reviewed total is too large.");
      await tx.insert(reviews).values({id:entry.id, organizationId, assessmentId, submissionId:submission.id, actorId:actor.membershipId, revision:entry.revision, requestKey:input.requestKey, event:this.service.seal(entry), createdAt:new Date(entry.createdAt)});
      // Point values and free-text reasons stay in the encrypted event, not general logs.
      await this.service.audit(tx, actor, context, assessmentId, "ASSESSMENT_SCORE_REVIEWED", {reviewId:entry.id, revision:entry.revision, submissionId:submission.id, targetType:entry.targetType, targetId:entry.targetId});
      return updated;
    });
  }
}
