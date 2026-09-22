import { createEntityId } from "@niq/application-domain";
import { hasPermission } from "@niq/application-contracts";
import type { ClinicalReviewer, ClinicalReviewEvent } from "../../../../packages/contracts/src/clinical-review";
import { assessmentHistory } from "../db/schema";
import { ServiceError, type Principal } from "./application";
import type { AssessmentWorkflowService, WorkflowExecutor, WorkflowRow } from "./assessment-workflow";
export type ClinicalReviewStored = {
 revision:number; assignee:ClinicalReviewer|null; correctionPerson:ClinicalReviewer|null; previousReviewer:ClinicalReviewer|null;
 submittedAt:string|null; completedAt:string|null; returnReason:string|null; finalRemark:string|null;
 history:ClinicalReviewEvent[]; finalSnapshot?:unknown;
};
export const emptyClinicalReview = ():ClinicalReviewStored=>({revision:0,assignee:null,correctionPerson:null,previousReviewer:null,submittedAt:null,completedAt:null,returnReason:null,finalRemark:null,history:[]});
export function reviewState(service:AssessmentWorkflowService,row:WorkflowRow):ClinicalReviewStored { return row.clinicalReview ? service.unseal<ClinicalReviewStored>(row.clinicalReview) : emptyClinicalReview(); }
export function assertCorrectionOwner(service:AssessmentWorkflowService,row:WorkflowRow,actor:Principal) {
 const owner=reviewState(service,row).correctionPerson;
 if(owner && owner.membershipId!==actor.membershipId) throw new ServiceError("FORBIDDEN","Only the assigned correction person can change this assessment.");
}
export function canAdjustClinicalScore(service:AssessmentWorkflowService,row:WorkflowRow,actor:Principal) {
 if(!hasPermission(actor.role,"scores.review"))return false;
 const state=reviewState(service,row);
 return row.status==="SCORED" ? !state.correctionPerson || state.correctionPerson.membershipId===actor.membershipId : row.status==="UNDER_REVIEW" && state.assignee?.membershipId===actor.membershipId;
}
export async function appendAssessmentHistory(service:AssessmentWorkflowService,tx:WorkflowExecutor,row:WorkflowRow,actor:Principal|null,kind:string,payload:unknown,requestKey?:string) {
 await tx.insert(assessmentHistory).values({id:createEntityId(),organizationId:row.organizationId,assessmentId:row.id,actorId:actor?.membershipId??null,cycle:row.cycle,revision:row.revision,kind,requestKey:requestKey??null,payload:service.seal({actor:actor?{membershipId:actor.membershipId,userId:actor.userId,displayName:actor.displayName}:null,...(payload as object)} )});
}
