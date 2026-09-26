import { and, eq, inArray, sql } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { hasPermission, type MembershipRole } from "@niq/application-contracts";
import { clinicalReviewActionSchema, type ClinicalReviewAction, type ClinicalReview, type ClinicalReviewer, type ClinicalReviewQueue, type ClinicalReviewQueueItem } from "../../../../packages/contracts/src/clinical-review";
import { assessments, assessmentHistory, assessmentSubmissions, assessmentScoreReviews, assessmentFaceScans, organizationMemberships, users, patients } from "../db/schema";
import { ServiceError, type Principal, type RequestContext } from "./application";
import type { AssessmentWorkflowService, WorkflowExecutor, WorkflowRow, StoredWorkflow } from "./assessment-workflow";
import { facilityAccessCondition } from "./facility-access";
import { reviewState, canAdjustClinicalScore, appendAssessmentHistory } from "./clinical-review-state";
import { AssessmentScoreReviewService } from "./assessment-score-reviews";
const clinicalRoles:MembershipRole[]=["DOCTOR","NUTRITIONIST","OTHER_MEDICAL"];
export class ClinicalReviewService {
 constructor(private service:AssessmentWorkflowService){}
 private async actor(actor:Principal,org:string,tx:WorkflowExecutor=this.service.db) {
  this.service.clinicalActor(actor,org);
  const [current]=await tx.select({role:organizationMemberships.role}).from(organizationMemberships).innerJoin(users,eq(users.id,organizationMemberships.userId)).where(and(eq(organizationMemberships.id,actor.membershipId),eq(organizationMemberships.organizationId,org),eq(organizationMemberships.userId,actor.userId),eq(organizationMemberships.isActive,true),eq(users.status,"ACTIVE"),eq(users.platformRole,"USER"))).for("share");
  if(!current || current.role!==actor.role)throw new ServiceError("FORBIDDEN","Your access has changed. Reload and sign in again.");
 }
 async eligible(actor:Principal,org:string,id:string,tx:WorkflowExecutor=this.service.db,row?:WorkflowRow):Promise<ClinicalReviewer[]> {
  await this.actor(actor,org,tx); const assessment=row??await this.service.authorize(actor,org,id,tx);
  const [patient]=await tx.select().from(patients).where(and(eq(patients.organizationId,org),eq(patients.id,assessment.patientId),facilityAccessCondition(actor,org,patients.homeFacilityId))).for("share");
  if(!patient)throw new ServiceError("NOT_FOUND","Patient not found.");
  const rows=await tx.select({membershipId:organizationMemberships.id,displayName:users.displayName,role:organizationMemberships.role}).from(organizationMemberships).innerJoin(users,eq(users.id,organizationMemberships.userId)).where(and(eq(organizationMemberships.organizationId,org),eq(organizationMemberships.isActive,true),eq(users.status,"ACTIVE"),eq(users.platformRole,"USER"),inArray(organizationMemberships.role,clinicalRoles),sql`(not exists(select 1 from facility_memberships fm where fm.organization_id=${org} and fm.organization_membership_id=${organizationMemberships.id}) or (exists(select 1 from facility_memberships fm where fm.organization_id=${org} and fm.organization_membership_id=${organizationMemberships.id} and fm.facility_id=${assessment.facilityId}) and exists(select 1 from facility_memberships fm where fm.organization_id=${org} and fm.organization_membership_id=${organizationMemberships.id} and fm.facility_id=${patient.homeFacilityId})))`)).for("share");
  return rows;
 }
 private async scoreRevision(tx:WorkflowExecutor,row:WorkflowRow) {
  if(!row.currentSubmissionId)return 0;
  const rows=await tx.select({revision:assessmentScoreReviews.revision}).from(assessmentScoreReviews).where(and(eq(assessmentScoreReviews.organizationId,row.organizationId),eq(assessmentScoreReviews.assessmentId,row.id),eq(assessmentScoreReviews.submissionId,row.currentSubmissionId)));
  return Math.max(0,...rows.map(r=>r.revision));
 }
 async projection(actor:Principal,row:WorkflowRow,tx:WorkflowExecutor=this.service.db,history=true):Promise<ClinicalReview> {
  const s=reviewState(this.service,row), admin=hasPermission(actor.role,"reviews.assign"), clinician=clinicalRoles.includes(actor.role as MembershipRole), own=s.assignee?.membershipId===actor.membershipId, correction=s.correctionPerson?.membershipId===actor.membershipId;
  const actions:ClinicalReviewAction["action"][]=[];
  if(row.status==="SCORED") {
   if(s.correctionPerson) {if(correction){actions.push("RESEND","RETURN_TO_DRAFT");} if(admin)actions.push("REASSIGN_CORRECTION");}
   else {if(row.createdByMembershipId===actor.membershipId && hasPermission(actor.role,"assessments.submit"))actions.push("SEND");if(clinician)actions.push("RETURN_TO_DRAFT");}
  }
  if(row.status==="DRAFT" && s.correctionPerson && admin)actions.push("REASSIGN_CORRECTION");
  if(row.status==="UNDER_REVIEW") {
   if(!s.assignee&&clinician)actions.push("CLAIM");
   if(own||admin){actions.push("TRANSFER","RETURN_TO_DRAFT");if(s.assignee)actions.push("RELEASE");}
   if(own&&clinician)actions.push("COMPLETE");
  }
  const riskClassificationPending=row.status==="UNDER_REVIEW"&&!!row.currentSubmissionId&&!["ORIGINAL","CONFIRMED"].includes((await new AssessmentScoreReviewService(this.service).readProjection(actor,row,tx)).risk?.status??"");
  const eligible=history?await this.eligible(actor,row.organizationId,row.id,tx,row):[];
  return {riskClassificationPending,assessmentId:row.id,revision:s.revision,scoreRevision:await this.scoreRevision(tx,row),cycle:row.cycle,state:row.status==="COMPLETED"?"COMPLETED":s.correctionPerson?(row.status==="SCORED"?"AWAITING_RESUBMISSION":"RETURNED"):row.status==="UNDER_REVIEW"?(s.assignee?"IN_REVIEW":"QUEUED"):"NOT_SUBMITTED",assignee:s.assignee,correctionPerson:s.correctionPerson,previousReviewer:s.previousReviewer,defaultCorrectionPersonId:eligible.find(r=>r.membershipId===row.createdByMembershipId)?.membershipId??null,returnReason:history?s.returnReason:null,finalRemark:history?s.finalRemark:null,submittedAt:s.submittedAt,completedAt:s.completedAt,history:history?s.history:[],allowedActions:actions,canAdjustScores:canAdjustClinicalScore(this.service,row,actor),canEditDraft:row.status==="DRAFT"&&(!s.correctionPerson||correction)&&hasPermission(actor.role,"assessments.edit")};
 }
 async read(actor:Principal,org:string,id:string){await this.actor(actor,org);return this.projection(actor,await this.service.authorize(actor,org,id));}
 async queue(actor:Principal,org:string,query:{page:number;pageSize:number;search?:string;state?:string;mine?:boolean}):Promise<ClinicalReviewQueue>{
  await this.actor(actor,org);await this.service.applicationService.getOrganization(actor,org);
  const rows=await this.service.db.select({row:assessments}).from(assessments).innerJoin(patients,and(eq(patients.id,assessments.patientId),eq(patients.organizationId,org))).where(and(eq(assessments.organizationId,org),sql`${assessments.clinicalReview} is not null`,facilityAccessCondition(actor,org,assessments.facilityId),facilityAccessCondition(actor,org,patients.homeFacilityId)));
  const listed=await this.service.applicationService.listAssessments(actor,org) as Array<{id:string;reference:string;patient:ClinicalReviewQueueItem["patient"];facility:ClinicalReviewQueueItem["facility"]}>;
  const items=[];for(const {row} of rows){const item=listed.find(i=>i.id===row.id);if(!item)continue;const review=await this.projection(actor,row,this.service.db,false);if(query.state&&query.state!==review.state)continue;if(query.mine&&review.assignee?.membershipId!==actor.membershipId&&review.correctionPerson?.membershipId!==actor.membershipId)continue;const search=query.search?.trim().toLowerCase();if(search&&!`${item.reference} ${item.patient.reference} ${item.patient.displayName} ${item.facility?.name??""}`.toLowerCase().includes(search))continue;items.push({assessmentId:row.id,reference:item.reference,patient:item.patient,facility:item.facility,review});}
  items.sort((a,b)=>(b.review.submittedAt??"").localeCompare(a.review.submittedAt??""));return {items:items.slice((query.page-1)*query.pageSize,query.page*query.pageSize),total:items.length,page:query.page,pageSize:query.pageSize};
 }
 async command(actor:Principal,org:string,id:string,raw:ClinicalReviewAction,context:RequestContext){
  const parsed=clinicalReviewActionSchema.safeParse(raw);if(!parsed.success)throw new ServiceError("VALIDATION_ERROR","Complete the required clinical review fields.");const input=parsed.data;
  if(input.action==="SEND"||input.action==="RESEND") {
   const current=await this.read(actor,org,id);
   if(current.allowedActions.includes(input.action)&&current.revision===input.expectedRevision&&current.scoreRevision===input.expectedScoreRevision) {
    const [openScan]=await this.service.db.select({id:assessmentFaceScans.id}).from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId,org),eq(assessmentFaceScans.assessmentId,id),eq(assessmentFaceScans.isCurrent,true),eq(assessmentFaceScans.active,true)));
    if(openScan) {
     const { AssessmentFaceScanService }=await import("./assessment-face-scan");
     const cancelled=await new AssessmentFaceScanService(this.service).mutate(actor,org,id,openScan.id,"cancel");
     if(cancelled.state!=="CANCELLED")throw new ServiceError("CONFLICT","The face scan is still open. Automatic cancellation was not confirmed; try again when its status updates.");
    }
   }
  }
  return this.service.db.transaction(async tx=>{
   const row=await this.service.authorize(actor,org,id,tx,true);await this.actor(actor,org,tx);
   // Scope may have changed while waiting for the membership lock.
   await this.service.authorize(actor,org,id,tx);
   if("assigneeId"in input) await tx.select().from(organizationMemberships).innerJoin(users,eq(users.id,organizationMemberships.userId)).where(and(eq(organizationMemberships.id,input.assigneeId),eq(organizationMemberships.organizationId,org))).for("share");
   const [replay]=await tx.select().from(assessmentHistory).where(and(eq(assessmentHistory.organizationId,org),eq(assessmentHistory.assessmentId,id),eq(assessmentHistory.actorId,actor.membershipId),eq(assessmentHistory.requestKey,input.requestKey)));
   if(replay){const payload=this.service.unseal<{command:ClinicalReviewAction}>(replay.payload);if(JSON.stringify(payload.command)!==JSON.stringify(input))throw new ServiceError("CONFLICT","This request key belongs to a different clinical review action.");return this.projection(actor,row,tx);}
   const projection=await this.projection(actor,row,tx);if(!projection.allowedActions.includes(input.action))throw new ServiceError("FORBIDDEN","This action is not permitted for the current clinical review.");
   if(projection.revision!==input.expectedRevision||projection.scoreRevision!==input.expectedScoreRevision)throw new ServiceError("CONFLICT","The review or score has changed. Reload before continuing.");
   const s=reviewState(this.service,row), now=new Date(), eligible=await this.eligible(actor,org,id,tx,row);
   const recipient="assigneeId"in input?eligible.find(r=>r.membershipId===input.assigneeId):null;
   if("assigneeId"in input&&!recipient)throw new ServiceError("VALIDATION_ERROR","Choose an active clinician with access to this assessment and patient.");
   const scans=await tx.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId,org),eq(assessmentFaceScans.assessmentId,id),eq(assessmentFaceScans.isCurrent,true)));
   if(scans.some(scan=>scan.cycle===row.cycle&&(scan.active||(scan.leaseExpiresAt&&scan.leaseExpiresAt>now)||scan.state==="RECONCILIATION_REQUIRED"||scan.failureCode==="RECONCILIATION_REQUIRED")))throw new ServiceError("CONFLICT","Resolve the pending face scan before changing the review workflow.");
   let score:unknown=null;
   if(row.status==="SCORED"||row.status==="UNDER_REVIEW"){
    const [submission]=row.currentSubmissionId?await tx.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.id,row.currentSubmissionId),eq(assessmentSubmissions.organizationId,org),eq(assessmentSubmissions.assessmentId,id))):[];
    if(submission?.status!=="SUCCEEDED"||!submission.result)throw new ServiceError("CONFLICT","A confirmed current score is required.");
    score=await new AssessmentScoreReviewService(this.service).readProjection(actor,row,tx);
   }
   let status=row.status,cycle=row.cycle,currentSubmissionId=row.currentSubmissionId,workflow=row.workflow,completedAt=row.completedAt;
   const from={status:row.status,assignee:s.assignee,correctionPerson:s.correctionPerson};
   switch(input.action){
    case "SEND":s.assignee=null;s.submittedAt=now.toISOString();status="UNDER_REVIEW";break;
    case "CLAIM":s.assignee=eligible.find(r=>r.membershipId===actor.membershipId)??null;if(!s.assignee)throw new ServiceError("FORBIDDEN","Only an eligible clinician can claim this review.");break;
    case "TRANSFER":if(s.assignee?.membershipId===recipient!.membershipId)throw new ServiceError("VALIDATION_ERROR","Choose a different reviewer.");s.assignee=recipient!;break;
    case "RELEASE":s.assignee=null;break;
    case "RETURN_TO_DRAFT":{
     s.previousReviewer=row.status==="UNDER_REVIEW"?s.assignee:s.previousReviewer;
     s.assignee=null;s.correctionPerson=recipient!;s.returnReason=input.reason;status="DRAFT";cycle++;
     // Keep completed evidence selected across corrections without changing its capture cycle.
     await tx.update(assessmentFaceScans).set({isCurrent:false}).where(and(eq(assessmentFaceScans.organizationId,org),eq(assessmentFaceScans.assessmentId,id),eq(assessmentFaceScans.isCurrent,true),sql`(${assessmentFaceScans.state} <> 'COMPLETED' or ${assessmentFaceScans.projection} is null)`));
     const [submission]=await tx.select().from(assessmentSubmissions).where(eq(assessmentSubmissions.id,row.currentSubmissionId!));
     const frozen=this.service.unseal<StoredWorkflow>(submission!.snapshot);workflow=this.service.seal(frozen);currentSubmissionId=null;completedAt=null;break;
    }
    case "REASSIGN_CORRECTION":if(s.correctionPerson?.membershipId===recipient!.membershipId)throw new ServiceError("VALIDATION_ERROR","Choose a different correction person.");s.correctionPerson=recipient!;s.returnReason=input.reason;break;
    case "RESEND":s.assignee=eligible.find(r=>r.membershipId===s.previousReviewer?.membershipId)??null;s.correctionPerson=null;s.submittedAt=now.toISOString();status="UNDER_REVIEW";break;
    case "COMPLETE":if(!["ORIGINAL","CONFIRMED"].includes((score as {risk?:{status:string}})?.risk?.status??""))throw new ServiceError("CONFLICT","Confirm the reviewed risk classification before completing the review.");s.finalRemark=input.remark;s.completedAt=now.toISOString();s.finalSnapshot={score,scans,submissionId:row.currentSubmissionId,scoreRevision:projection.scoreRevision};completedAt=now;status="COMPLETED";break;
   }
   s.revision++;s.history.push({id:createEntityId(),action:input.action,revision:s.revision,cycle,actor:{membershipId:actor.membershipId,displayName:actor.displayName,role:actor.role as MembershipRole},assignee:s.correctionPerson??s.assignee,createdAt:now.toISOString(),...("reason"in input?{reason:input.reason}:{}),...("remark"in input?{remark:input.remark}:{})});
   await appendAssessmentHistory(this.service,tx,row,actor,input.action,{command:input,from,to:{status,assignee:s.assignee,correctionPerson:s.correctionPerson},workflow:this.service.unseal(row.workflow),score,scans},input.requestKey);
   const [updated]=await tx.update(assessments).set({status,cycle,currentSubmissionId,workflow,clinicalReview:this.service.seal(s),assignedToMembershipId:s.assignee?.membershipId??null,revision:row.revision+1,completedAt,updatedAt:now}).where(and(eq(assessments.id,id),eq(assessments.organizationId,org))).returning();
   await this.service.audit(tx,actor,context,id,`CLINICAL_REVIEW_${input.action}`,{cycle,revision:s.revision,assigneeId:s.assignee?.membershipId??null,correctionPersonId:s.correctionPerson?.membershipId??null});
   return this.projection(actor,updated!,tx);
  });
 }
}
