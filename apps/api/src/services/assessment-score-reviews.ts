import { AssessmentReviewedRiskService } from "./assessment-reviewed-risk";
import { hasPermission } from "@niq/application-contracts";
import { facilityAccessCondition } from "./facility-access";
import { canAdjustClinicalScore, reviewState } from "./clinical-review-state";
import { and, desc, eq } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { assessmentScoreResultSchema } from "../../../../packages/contracts/src/assessment-workflow";
import { projectScoreReviews, scoreReviewInputSchema, type ScoreReviewInput, type ScoreReviewEntry, retryReviewedRiskSchema } from "../../../../packages/contracts/src/assessment-score-reviews";
import { assessmentScoreReviews as reviews, assessmentSubmissions, assessmentFaceScans, organizationMemberships, users, patients } from "../db/schema";
import type { FaceScanSession } from "../../../../packages/contracts/src/face-scan";
import { ServiceError, type Principal, type RequestContext } from "./application";
import type { AssessmentWorkflowService, WorkflowExecutor, WorkflowRow } from "./assessment-workflow";

export class AssessmentScoreReviewService {
  constructor(private service: AssessmentWorkflowService, private risk: Pick<AssessmentReviewedRiskService,"prepare"|"process"|"projection"> = new AssessmentReviewedRiskService(service)) {}
  private async load(executor: WorkflowExecutor, organizationId: string, assessmentId: string, currentSubmissionId:string) {
    const [submission] = await executor.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId, organizationId), eq(assessmentSubmissions.assessmentId, assessmentId), eq(assessmentSubmissions.id,currentSubmissionId))).orderBy(desc(assessmentSubmissions.createdAt)).limit(1);
    if (submission?.status !== "SUCCEEDED" || !submission.result) throw new ServiceError("CONFLICT", "A completed NIQ score is required before reviewing points.");
    const parsed = assessmentScoreResultSchema.safeParse(this.service.unseal(submission.result));
    if (!parsed.success) throw new ServiceError("CONFLICT", "The NIQ result could not be read.");
    const rows = await executor.select().from(reviews).where(and(eq(reviews.organizationId, organizationId), eq(reviews.assessmentId, assessmentId),eq(reviews.submissionId,submission.id))).orderBy(reviews.revision);
    if (rows.some(row => row.submissionId !== submission.id)) throw new ServiceError("CONFLICT", "The NIQ result has changed. Contact support to review its history.");
    const entries = rows.map(row => this.service.unseal<ScoreReviewEntry>(row.event));
    const scanRows = await executor.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, organizationId), eq(assessmentFaceScans.assessmentId, assessmentId), eq(assessmentFaceScans.isCurrent, true))).orderBy(desc(assessmentFaceScans.createdAt));
    const current = scanRows.find(row => row.isCurrent && row.state === "COMPLETED" && row.projection);
    const session = current?.projection ? this.service.unseal<FaceScanSession>(current.projection) : null;
    const scan = current && session ? { id: current.id, points: session.score?.status === "SCORED" ? session.score.points ?? null : null } : undefined;
    return { submission, result: parsed.data, rows, scan, projection: projectScoreReviews(parsed.data, entries, scan) };
  }
  async readProjection(actor:Principal,row:WorkflowRow,executor:WorkflowExecutor=this.service.db) {
    const state=reviewState(this.service,row);
    if(row.status==="COMPLETED" && state.finalSnapshot) return {...(state.finalSnapshot as {score:object}).score,canAdjust:false} as Awaited<ReturnType<typeof this.load>>["projection"];
    if(!row.currentSubmissionId) throw new ServiceError("CONFLICT","This assessment has no current calculated result.");
    const {projection,result}=await this.load(executor,row.organizationId,row.id,row.currentSubmissionId);
    const canAdjust=projection.canAdjust&&canAdjustClinicalScore(this.service,row,actor);
    return {...projection,canAdjust,risk:await this.risk.projection(executor,row,result,projection,canAdjust)};
  }
  async read(actor: Principal, organizationId: string, assessmentId: string) {
    const row=await this.service.authorize(actor,organizationId,assessmentId);
    return this.readProjection(actor,row);
  }
  async add(actor: Principal, organizationId: string, assessmentId: string, raw: ScoreReviewInput, context: RequestContext) {
    this.service.clinicalActor(actor, organizationId, "scores.review");
    const parsed = scoreReviewInputSchema.safeParse(raw);
    if (!parsed.success) throw new ServiceError("VALIDATION_ERROR", "Enter a valid score and a reason for the change.");
    const input = parsed.data;
    const saved=await this.service.db.transaction(async tx => {
      const assessment = await this.service.authorize(actor, organizationId, assessmentId, tx, true);
      // Hold membership and patient scope stable while the adjustment is committed.
      const [member]=await tx.select({role:organizationMemberships.role}).from(organizationMemberships).innerJoin(users,eq(users.id,organizationMemberships.userId)).where(and(eq(organizationMemberships.id,actor.membershipId),eq(organizationMemberships.organizationId,organizationId),eq(organizationMemberships.userId,actor.userId),eq(organizationMemberships.isActive,true),eq(users.status,"ACTIVE"),eq(users.platformRole,"USER"))).for("share");
      if(!member || !hasPermission(member.role,"scores.review"))throw new ServiceError("FORBIDDEN","Your clinical review access has changed.");
      // Recheck assessment scope after holding membership stable against access edits.
      await this.service.authorize(actor,organizationId,assessmentId,tx);
      const [patient]=await tx.select({id:patients.id}).from(patients).where(and(eq(patients.organizationId,organizationId),eq(patients.id,assessment.patientId),facilityAccessCondition(actor,organizationId,patients.homeFacilityId))).for("share");
      if(!patient)throw new ServiceError("NOT_FOUND","Patient not found.");


      if (!assessment.currentSubmissionId) throw new ServiceError("CONFLICT","This assessment has no current calculated result.");
      if (!canAdjustClinicalScore(this.service,assessment,actor)) throw new ServiceError("FORBIDDEN", "Only the responsible clinician can adjust the current score.");
      const { submission, result, rows, projection, scan } = await this.load(tx, organizationId, assessmentId,assessment.currentSubmissionId);
      // Adjustment revisions restart for each scoring cycle; fence stale tabs by result too.
      if (result.resultReference !== input.expectedResultReference) throw new ServiceError("CONFLICT", "The calculated result has changed. Reload before adjusting the score.");
      const replay = rows.find(row => row.actorId === actor.membershipId && row.requestKey === input.requestKey);
      if (replay) {
        const entry = this.service.unseal<ScoreReviewEntry>(replay.event);
        if (entry.targetType !== input.targetType || entry.targetId !== input.targetId || entry.points !== input.points || entry.reason !== (input.reason || null) || entry.revision !== input.expectedRevision + 1)
          throw new ServiceError("CONFLICT", "This request key belongs to a different adjustment.");
        return {assessment,projection,task:await this.risk.prepare(tx,assessment,projection)};
      }
      if (projection.revision !== input.expectedRevision) throw new ServiceError("CONFLICT", "Another person updated the reviewed score. Reload before saving.");
      const target = input.targetType === "scan" ? (projection.scan?.id === input.targetId ? projection.scan : undefined) : input.targetType === "overall" ? projection.overall : input.targetType === "section" ? projection.sections.find(s => s.id === input.targetId) : projection.sections.flatMap(s => s.items).find(i => i.id === input.targetId);
      const component = result.components.find(c => c.id === input.targetId);
      if (!target || target.niqPoints === null || (input.targetType === "item" && component?.status !== "answered")) throw new ServiceError("VALIDATION_ERROR", "Only scored answers and sections can be adjusted.");
      if (input.points === null ? !target.overridden : input.points === target.reviewedPoints) throw new ServiceError("VALIDATION_ERROR", "The score has not changed.");
      const entry: ScoreReviewEntry = { id: createEntityId(), revision: projection.revision + 1, targetType: input.targetType, targetId: input.targetId, previousPoints: target.reviewedPoints, points: input.points, reason: input.reason || null, actorId: actor.membershipId, actorName: actor.displayName, createdAt: new Date().toISOString(), resultReference: result.resultReference };
      const updated = projectScoreReviews(result, [...projection.entries, entry], scan);
      if ([updated.overall, ...updated.sections].some(s => s.reviewedPoints !== null && (!Number.isFinite(s.reviewedPoints) || s.reviewedPoints > Number.MAX_SAFE_INTEGER))) throw new ServiceError("VALIDATION_ERROR", "The reviewed total is too large.");
      await tx.insert(reviews).values({id:entry.id, organizationId, assessmentId, submissionId:submission.id, actorId:actor.membershipId, revision:entry.revision, requestKey:input.requestKey, event:this.service.seal(entry), createdAt:new Date(entry.createdAt)});
      // Point values and free-text reasons stay in the encrypted event, not general logs.
      await this.service.audit(tx, actor, context, assessmentId, "ASSESSMENT_SCORE_REVIEWED", {reviewId:entry.id, revision:entry.revision, submissionId:submission.id, targetType:entry.targetType, targetId:entry.targetId});
      return {assessment,projection:updated,task:await this.risk.prepare(tx,assessment,updated)};
    });
    if(saved.task)await this.risk.process(actor,saved.assessment,saved.task,context);
    return this.read(actor,organizationId,assessmentId);
  }
  async retryRisk(actor:Principal,organizationId:string,assessmentId:string,raw:unknown,context:RequestContext){
    const parsed=retryReviewedRiskSchema.safeParse(raw);if(!parsed.success)throw new ServiceError("VALIDATION_ERROR","Reload the current reviewed score.");
    const risk=this.risk;
    const saved=await this.service.db.transaction(async tx=>{
      const row=await this.service.authorize(actor,organizationId,assessmentId,tx,true);
      const [member]=await tx.select({role:organizationMemberships.role}).from(organizationMemberships).innerJoin(users,eq(users.id,organizationMemberships.userId)).where(and(eq(organizationMemberships.id,actor.membershipId),eq(organizationMemberships.organizationId,organizationId),eq(organizationMemberships.userId,actor.userId),eq(organizationMemberships.isActive,true),eq(users.status,"ACTIVE"),eq(users.platformRole,"USER"))).for("share");
      if(!member||!hasPermission(member.role,"scores.review")||!canAdjustClinicalScore(this.service,row,actor))throw new ServiceError("FORBIDDEN","Only the responsible clinician can retry reviewed risk.");
      await this.service.authorize(actor,organizationId,assessmentId,tx);
      const [patient]=await tx.select({id:patients.id}).from(patients).where(and(eq(patients.id,row.patientId),eq(patients.organizationId,organizationId),facilityAccessCondition(actor,organizationId,patients.homeFacilityId))).for("share");
      if(!patient)throw new ServiceError("NOT_FOUND","Patient not found.");
      if(!row.currentSubmissionId)throw new ServiceError("CONFLICT","There is no current score.");
      const {result,projection}=await this.load(tx,organizationId,assessmentId,row.currentSubmissionId);
      if(result.resultReference!==parsed.data.expectedResultReference||projection.revision!==parsed.data.expectedRevision)throw new ServiceError("CONFLICT","The reviewed score has changed. Reload before retrying.");
      return {row,task:await risk.prepare(tx,row,projection)};
    });
    if(saved.task)await risk.process(actor,saved.row,saved.task,context);
    return this.read(actor,organizationId,assessmentId);
  }

}
