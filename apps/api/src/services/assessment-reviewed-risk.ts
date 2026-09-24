import { and, eq } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import type { AssessmentScoreResult } from "../../../../packages/contracts/src/assessment-workflow";
import type { AssessmentScoreReviews, ReviewedRisk } from "../../../../packages/contracts/src/assessment-score-reviews";
import { assessmentReviewedRisks, assessments, assessmentSubmissions, assessmentScoreReviews } from "../db/schema";
import type { AssessmentWorkflowService, WorkflowExecutor, WorkflowRow, StoredWorkflow } from "./assessment-workflow";
import { appendAssessmentHistory } from "./clinical-review-state";
import { requestReviewedClassification, AssessmentScoringRequestError, type ReviewedClassification } from "./assessment-scoring";
import type { Principal, RequestContext } from "./application";

type Task = typeof assessmentReviewedRisks.$inferSelect;
type Request = {score:number; snapshot:StoredWorkflow};
export function hasQuestionnaireOverrides(projection:AssessmentScoreReviews){
 return projection.overall.overridden||Boolean(projection.scanIncluded && projection.scan?.overridden)||projection.sections.some(s=>s.overridden||s.items.some(i=>i.overridden));
}
/** A separate request log prevents recalculation from overwriting questionnaire or review history. */
export class AssessmentReviewedRiskService {
 constructor(private service:AssessmentWorkflowService){}
 async task(tx:WorkflowExecutor,row:WorkflowRow,revision:number){
  if(!row.currentSubmissionId)return null;
  const [task]=await tx.select().from(assessmentReviewedRisks).where(and(eq(assessmentReviewedRisks.submissionId,row.currentSubmissionId),eq(assessmentReviewedRisks.organizationId,row.organizationId),eq(assessmentReviewedRisks.revision,revision)));
  return task??null;
 }
 async projection(tx:WorkflowExecutor,row:WorkflowRow,result:AssessmentScoreResult,projection:AssessmentScoreReviews,canRetry:boolean):Promise<ReviewedRisk>{
  if(!hasQuestionnaireOverrides(projection))return {status:"ORIGINAL",classification:result.classification,resultReference:result.resultReference,failureCode:null,canRetry:false};
  const task=await this.task(tx,row,projection.revision);
  if(task?.status==="SUCCEEDED"&&task.result){const confirmed=this.service.unseal<ReviewedClassification>(task.result);return {status:"CONFIRMED",classification:confirmed.classification,resultReference:confirmed.resultReference,failureCode:null,canRetry:false};}
  return {status:task?.status==="PENDING"?"PENDING":"UNAVAILABLE",classification:null,resultReference:null,failureCode:task?.failureCode??(task?null:"CLASSIFICATION_REQUIRED"),canRetry:canRetry&&(!task?.leaseExpiresAt||task.leaseExpiresAt<=new Date())};
 }
 async prepare(tx:WorkflowExecutor,row:WorkflowRow,projection:AssessmentScoreReviews):Promise<Task|null>{
  if(!hasQuestionnaireOverrides(projection))return null;
  const existing=await this.task(tx,row,projection.revision);if(existing)return existing;
  const [submission]=await tx.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.id,row.currentSubmissionId!),eq(assessmentSubmissions.organizationId,row.organizationId)));
  if(!submission)throw new Error("Current scoring submission is missing");
  const previous=await this.task(tx,row,projection.revision-1);
  const request:Request={score:projection.overall.reviewedPoints!,snapshot:this.service.unseal<StoredWorkflow>(submission.snapshot)};
  const equivalent=previous&&this.service.unseal<Request>(previous.request).score===request.score;
  // Changes that keep the same total reuse the upstream classification request.
  const [task]=await tx.insert(assessmentReviewedRisks).values({id:createEntityId(),organizationId:row.organizationId,assessmentId:row.id,submissionId:submission.id,revision:projection.revision,requestKey:equivalent?previous.requestKey:createEntityId(),request:this.service.seal(request),status:equivalent&&previous.status==="SUCCEEDED"?"SUCCEEDED":"PENDING",result:equivalent&&previous.status==="SUCCEEDED"?previous.result:null}).returning();
  return task!;
 }
 async process(actor:Principal,row:WorkflowRow,task:Task,context:RequestContext):Promise<void>{
  if(task.status==="SUCCEEDED")return;
  const leaseToken=createEntityId();
  const leased=await this.service.db.transaction(async tx=>{
   const [assessment]=await tx.select().from(assessments).where(eq(assessments.id,row.id)).for("update");
   if(!assessment||assessment.currentSubmissionId!==task.submissionId||!["SCORED","UNDER_REVIEW"].includes(assessment.status))return false;
   const revisions=await tx.select({revision:assessmentScoreReviews.revision}).from(assessmentScoreReviews).where(eq(assessmentScoreReviews.submissionId,task.submissionId));
   if(Math.max(0,...revisions.map(r=>r.revision))!==task.revision)return false;
   const [current]=await tx.select().from(assessmentReviewedRisks).where(eq(assessmentReviewedRisks.id,task.id)).for("update");
   if(!current||current.status==="SUCCEEDED"||current.leaseExpiresAt&&current.leaseExpiresAt>new Date())return false;
   await tx.update(assessmentReviewedRisks).set({status:"PENDING",leaseToken,leaseExpiresAt:new Date(Date.now()+this.service.config.SCORING_TIMEOUT_MS+5000),failureCode:null,updatedAt:new Date()}).where(eq(assessmentReviewedRisks.id,task.id));
   await appendAssessmentHistory(this.service,tx,assessment,actor,"REVIEWED_RISK_REQUESTED",{submissionId:task.submissionId,scoreRevision:task.revision,requestId:task.id,idempotencyKey:task.requestKey,request:this.service.unseal(task.request)});
   return true;
  });
  if(!leased)return;
  let result:ReviewedClassification|null=null,failureCode:string|null=null;
  try{
   const request=this.service.unseal<Request>(task.request);
   const transport=await this.service.transport(row.organizationId,context,request.snapshot.connection);
   result=await requestReviewedClassification({...transport,binding:request.snapshot.binding,idempotencyKey:task.requestKey,score:request.score});
  }catch(error){failureCode=error instanceof AssessmentScoringRequestError?error.code:"CLASSIFICATION_UNAVAILABLE";}
  await this.service.db.transaction(async tx=>{
   // Keep the response in its historical request row, never on the mutable assessment.
   const [current]=await tx.select().from(assessments).where(eq(assessments.id,row.id)).for("update");
   const [live]=await tx.select().from(assessmentReviewedRisks).where(eq(assessmentReviewedRisks.id,task.id)).for("update");
   if(!current||live?.leaseToken!==leaseToken)return;
   await tx.update(assessmentReviewedRisks).set({status:result?"SUCCEEDED":"UNAVAILABLE",result:result?this.service.seal(result):null,failureCode,leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(eq(assessmentReviewedRisks.id,task.id));
   await appendAssessmentHistory(this.service,tx,{...current,cycle:row.cycle},actor,result?"REVIEWED_RISK_CONFIRMED":"REVIEWED_RISK_UNAVAILABLE",{submissionId:task.submissionId,scoreRevision:task.revision,requestId:task.id,result,failureCode});
  });
 }
}
