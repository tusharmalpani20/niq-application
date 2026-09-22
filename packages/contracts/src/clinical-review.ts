import { z } from "zod";
import type { MembershipRole } from "./roles";
const base = { expectedRevision:z.number().int().nonnegative(), expectedScoreRevision:z.number().int().nonnegative(), requestKey:z.string().min(16).max(128) };
const recipient = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const reason = z.string().trim().min(1).max(4000);
export const clinicalReviewActionSchema = z.discriminatedUnion("action", [
 z.object({...base,action:z.literal("SEND")}).strict(),
 z.object({...base,action:z.literal("CLAIM")}).strict(),
 z.object({...base,action:z.literal("TRANSFER"),assigneeId:recipient,reason}).strict(),
 z.object({...base,action:z.literal("RELEASE"),reason}).strict(),
 z.object({...base,action:z.literal("RETURN_TO_DRAFT"),assigneeId:recipient,reason}).strict(),
 z.object({...base,action:z.literal("REASSIGN_CORRECTION"),assigneeId:recipient,reason}).strict(),
 z.object({...base,action:z.literal("RESEND")}).strict(),
 z.object({...base,action:z.literal("COMPLETE"),remark:reason}).strict(),
]);
export type ClinicalReviewAction = z.infer<typeof clinicalReviewActionSchema>;
export type ClinicalReviewer = {membershipId:string;displayName:string;role:MembershipRole};
export type ClinicalReviewEvent = {id:string;action:ClinicalReviewAction["action"];revision:number;cycle:number;actor:ClinicalReviewer;assignee:ClinicalReviewer|null;createdAt:string;reason?:string;remark?:string};
export type ClinicalReview = {
 assessmentId:string;revision:number;scoreRevision:number;cycle:number;
 state:"NOT_SUBMITTED"|"QUEUED"|"IN_REVIEW"|"RETURNED"|"AWAITING_RESUBMISSION"|"COMPLETED";
 assignee:ClinicalReviewer|null;correctionPerson:ClinicalReviewer|null;previousReviewer:ClinicalReviewer|null;
 defaultCorrectionPersonId:string|null;returnReason:string|null;finalRemark:string|null;
 submittedAt:string|null;completedAt:string|null;history:ClinicalReviewEvent[];
 allowedActions:ClinicalReviewAction["action"][];canAdjustScores:boolean;canEditDraft:boolean;
};
export type ClinicalReviewQueueItem = {assessmentId:string;reference:string;patient:{id:string;reference:string;displayName:string};facility:{id:string;name:string}|null;review:ClinicalReview};
export type ClinicalReviewQueue = {items:ClinicalReviewQueueItem[];total:number;page:number;pageSize:number};
