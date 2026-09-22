import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { createEntityId } from "@niq/application-domain";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "../db/schema";
import { PostgresApplicationService } from "./postgres-application";
import { AssessmentWorkflowService } from "./assessment-workflow";
import { AssessmentScoreReviewService } from "./assessment-score-reviews";
import { ClinicalReviewService } from "./clinical-review";
import { clinicalReviewActionSchema, type ClinicalReviewAction } from "../../../../packages/contracts/src/clinical-review";
import type { Principal } from "./application";
const context={requestId:"clinical-review-test"};
const id=createEntityId();
test("clinical command schemas require explicit appropriate notes, recipient and concurrency values",()=>{
 const base={expectedRevision:0,expectedScoreRevision:0,requestKey:"test-request-123456"};
 for(const action of ["SEND","CLAIM","RESEND"] as const){expect(clinicalReviewActionSchema.safeParse({...base,action}).success).toBe(true);expect(clinicalReviewActionSchema.safeParse({...base,action,reason:"surprise"}).success).toBe(false);}
 for(const action of ["TRANSFER","RETURN_TO_DRAFT","REASSIGN_CORRECTION"] as const){expect(clinicalReviewActionSchema.safeParse({...base,action,assigneeId:id,reason:"Reason"}).success).toBe(true);expect(clinicalReviewActionSchema.safeParse({...base,action,assigneeId:id,reason:"  "}).success).toBe(false);}
 expect(clinicalReviewActionSchema.safeParse({...base,action:"COMPLETE",remark:" "}).success).toBe(false);
});
describe.skipIf(!process.env.ASSESSMENT_TEST_DATABASE_URL)("clinical review PostgreSQL",()=>{
 const client=postgres(process.env.ASSESSMENT_TEST_DATABASE_URL!,{max:8});const db=drizzle(client);
 const config=loadApplicationConfig({DATABASE_URL:process.env.ASSESSMENT_TEST_DATABASE_URL??"postgres://localhost/unused",SESSION_SECRET:"clinical-review-test-secret-at-least-32-characters"});
 const app=new PostgresApplicationService(db,config,{deliver:async()=>{}}),workflow=new AssessmentWorkflowService({db,config,applicationService:app}),reviews=new ClinicalReviewService(workflow),scores=new AssessmentScoreReviewService(workflow);
 const org=createEntityId(),facility=createEntityId(),otherFacility=createEntityId(),definition=createEntityId();let patient:string;
 function person(role:Principal["role"],name:string):Principal {return {userId:createEntityId(),membershipId:createEntityId(),organizationId:org,email:`${createEntityId()}@test.example`,displayName:name,role,platformRole:"USER"};}
 const creator=person("DOCTOR","Creator"),colleague=person("NUTRITIONIST","Colleague"),nurse=person("OTHER_MEDICAL","Nurse"),admin=person("ORGANIZATION_ADMIN","Admin"),support=person("SUPPORT","Support");
 const result={formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:true,score:3,classification:{id:"low",label:"Low",interpretation:""},components:[{id:"item",sectionId:"section",label:"Item",points:3,status:"answered"}],version:"v1",checksum:"a".repeat(64),resultReference:"result-1",calculatedAt:new Date().toISOString(),clinicalUsePermitted:true};
 beforeAll(async()=>{
  await db.insert(t.organizations).values({id:org,legalName:"Clinical test",displayName:"Clinical test",slug:`clinical-${org.toLowerCase()}`});
  for(const a of [creator,colleague,nurse,admin,support]){await db.insert(t.users).values({id:a.userId,email:a.email,displayName:a.displayName,status:"ACTIVE"});await db.insert(t.organizationMemberships).values({id:a.membershipId,organizationId:org,userId:a.userId,role:a.role});}
  await db.insert(t.facilities).values([{id:facility,organizationId:org,name:"A",code:"A"},{id:otherFacility,organizationId:org,name:"B",code:"B"}]);
  patient=(await app.createPatient(admin,org,{name:"Synthetic patient",medicalRecordNumber:`MRN-${org}`,homeFacilityId:facility,dateOfBirth:"2000-01-01",gender:"UNKNOWN"},context)).id;
  await db.insert(t.questionnaireDefinitions).values({id:definition,organizationId:org,scopeKey:org,key:"clinical-test",version:"1",schema:{},checksum:"test"});
 });
 afterAll(async()=>{await client.end();});
 async function assessment(owner=creator){const id=createEntityId(),submission=createEntityId(),snapshot=workflow.seal({answers:{item:"original"},patient:{id:patient},binding:{version:"v1"}});await db.insert(t.assessments).values({id,organizationId:org,patientId:patient,facilityId:facility,questionnaireDefinitionId:definition,questionnaireScopeKey:org,createdByMembershipId:owner.membershipId,status:"SCORED",workflow:snapshot});await db.insert(t.assessmentSubmissions).values({id:submission,organizationId:org,assessmentId:id,revision:0,snapshot,idempotencyKey:submission,status:"SUCCEEDED",result:workflow.seal(result)});await db.update(t.assessments).set({currentSubmissionId:submission}).where(eq(t.assessments.id,id));return id;}
 async function command(actor:Principal,id:string,action:ClinicalReviewAction["action"],extra:object={}){const state=await reviews.read(actor,org,id);return reviews.command(actor,org,id,{action,expectedRevision:state.revision,expectedScoreRevision:state.scoreRevision,requestKey:createEntityId(),...extra} as ClinicalReviewAction,context);}
 test("creator sends, concurrent claims have one winner, transfer revokes ownership and completion freezes score",async()=>{
  const id=await assessment();await expect(command(admin,id,"SEND")).rejects.toMatchObject({code:"FORBIDDEN"});
  await command(creator,id,"SEND");await expect(command(admin,id,"CLAIM")).rejects.toMatchObject({code:"FORBIDDEN"});
  const input={action:"CLAIM" as const,expectedRevision:1,expectedScoreRevision:0,requestKey:createEntityId()};
  const claims=await Promise.allSettled([reviews.command(creator,org,id,input,context),reviews.command(colleague,org,id,{...input,requestKey:createEntityId()},context)]);
  expect(claims.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const state=await reviews.read(creator,org,id);const winner=state.assignee!.membershipId===creator.membershipId?creator:colleague;
  await command(winner,id,"TRANSFER",{assigneeId:nurse.membershipId,reason:"Handover"});
  const adjustment={expectedResultReference:"result-1",targetType:"item" as const,targetId:"item",points:4,reason:"Reviewed",expectedRevision:0,requestKey:createEntityId()};
  await expect(scores.add(winner,org,id,adjustment,context)).rejects.toMatchObject({code:"FORBIDDEN"});await scores.add(nurse,org,id,adjustment,context);
  const before=await reviews.read(nurse,org,id);await expect(reviews.command(nurse,org,id,{action:"COMPLETE",remark:"Done",expectedRevision:before.revision,expectedScoreRevision:0,requestKey:createEntityId()},context)).rejects.toMatchObject({code:"CONFLICT"});
  const complete=await command(nurse,id,"COMPLETE",{remark:"Final clinical remark"});expect(complete.state).toBe("COMPLETED");expect(complete.finalRemark).toBe("Final clinical remark");expect((await scores.read(nurse,org,id)).canAdjust).toBe(false);
  await expect(command(admin,id,"RETURN_TO_DRAFT",{assigneeId:creator.membershipId,reason:"Reopen"})).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(scores.add(nurse,org,id,{...adjustment,expectedRevision:1,points:5,requestKey:createEntityId()},context)).rejects.toMatchObject({code:"FORBIDDEN"});
 });
 test("command replay does not duplicate history and altered payload conflicts",async()=>{const id=await assessment();const input={action:"SEND" as const,expectedRevision:0,expectedScoreRevision:0,requestKey:createEntityId()};await reviews.command(creator,org,id,input,context);await reviews.command(creator,org,id,input,context);expect((await reviews.read(creator,org,id)).history).toHaveLength(1);await expect(reviews.command(creator,org,id,{...input,expectedRevision:1},context)).rejects.toMatchObject({code:"CONFLICT"});});
 test("return preserves old result and answers, corrections require owner, resends restore prior reviewer",async()=>{
  const id=await assessment();await command(creator,id,"SEND");await command(nurse,id,"CLAIM");const returned=await command(admin,id,"RETURN_TO_DRAFT",{assigneeId:colleague.membershipId,reason:"Correct answers"});expect(returned.state).toBe("RETURNED");expect(returned.cycle).toBe(1);expect(returned.previousReviewer?.membershipId).toBe(nurse.membershipId);
  const [row]=await db.select().from(t.assessments).where(eq(t.assessments.id,id));expect(row!.currentSubmissionId).toBeNull();expect(workflow.unseal<any>(row!.workflow).answers.item).toBe("original");
  expect(()=>workflow.editable(row!,row!.revision,creator)).toThrow();expect(()=>workflow.editable(row!,row!.revision,colleague)).not.toThrow();
  const submission=createEntityId();await db.insert(t.assessmentSubmissions).values({id:submission,organizationId:org,assessmentId:id,revision:row!.revision,snapshot:row!.workflow!,idempotencyKey:submission,status:"SUCCEEDED",result:workflow.seal({...result,resultReference:"new-result"})});await db.update(t.assessments).set({status:"SCORED",currentSubmissionId:submission}).where(eq(t.assessments.id,id));
  expect((await scores.read(colleague,org,id)).revision).toBe(0);expect((await reviews.read(colleague,org,id)).state).toBe("AWAITING_RESUBMISSION");await expect(command(creator,id,"RESEND")).rejects.toMatchObject({code:"FORBIDDEN"});
  const resent=await command(colleague,id,"RESEND");expect(resent.assignee?.membershipId).toBe(nurse.membershipId);expect(resent.correctionPerson).toBeNull();
  expect(await db.select().from(t.assessmentSubmissions).where(eq(t.assessmentSubmissions.assessmentId,id))).toHaveLength(2);
 });
 test("an adjustment from an earlier result cannot modify a rescored correction even when revisions match",async()=>{
  const id=await assessment();
  const oldAdjustment={expectedResultReference:"result-1",targetType:"item" as const,targetId:"item",points:7,reason:"Old open dialog",expectedRevision:0,requestKey:createEntityId()};
  await command(creator,id,"RETURN_TO_DRAFT",{assigneeId:creator.membershipId,reason:"Correct questionnaire"});
  const [row]=await db.select().from(t.assessments).where(eq(t.assessments.id,id));
  const submission=createEntityId();
  await db.insert(t.assessmentSubmissions).values({id:submission,organizationId:org,assessmentId:id,revision:row!.revision,snapshot:row!.workflow!,idempotencyKey:submission,status:"SUCCEEDED",result:workflow.seal({...result,resultReference:"corrected-result"})});
  await db.update(t.assessments).set({status:"SCORED",currentSubmissionId:submission}).where(eq(t.assessments.id,id));
  expect((await scores.read(creator,org,id)).revision).toBe(0);
  await expect(scores.add(creator,org,id,oldAdjustment,context)).rejects.toMatchObject({code:"CONFLICT"});
  expect(await db.select().from(t.assessmentScoreReviews).where(eq(t.assessmentScoreReviews.assessmentId,id))).toHaveLength(0);
  const fresh=await scores.add(creator,org,id,{...oldAdjustment,expectedResultReference:"corrected-result",requestKey:createEntityId()},context);
  expect(fresh.overall.reviewedPoints).toBe(7);
 });
 test("released owner is not resurrected; inactive and out-of-scope recipients denied",async()=>{
  const id=await assessment();await command(creator,id,"SEND");await command(nurse,id,"CLAIM");await command(nurse,id,"RELEASE",{reason:"Unavailable"});await command(admin,id,"RETURN_TO_DRAFT",{assigneeId:creator.membershipId,reason:"Correction"});expect((await reviews.read(admin,org,id)).previousReviewer).toBeNull();
  await db.insert(t.facilityMemberships).values({id:createEntityId(),organizationId:org,organizationMembershipId:nurse.membershipId,facilityId:otherFacility});
  expect((await reviews.eligible(admin,org,id)).some(r=>r.membershipId===nurse.membershipId)).toBe(false);await expect(command(admin,id,"REASSIGN_CORRECTION",{assigneeId:nurse.membershipId,reason:"Assign"})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await db.delete(t.facilityMemberships).where(eq(t.facilityMemberships.organizationMembershipId,nurse.membershipId));
  await db.update(t.users).set({status:"SUSPENDED"}).where(eq(t.users.id,nurse.userId));await expect(command(admin,id,"REASSIGN_CORRECTION",{assigneeId:nurse.membershipId,reason:"Assign"})).rejects.toMatchObject({code:"VALIDATION_ERROR"});await db.update(t.users).set({status:"ACTIVE"}).where(eq(t.users.id,nurse.userId));
  const changed=await command(admin,id,"REASSIGN_CORRECTION",{assigneeId:colleague.membershipId,reason:"Cover absence"});expect(changed.correctionPerson?.membershipId).toBe(colleague.membershipId);
 });
 test("admin creator sends but cannot score review and support cannot read queue",async()=>{const id=await assessment(admin);await command(admin,id,"SEND");await expect(command(admin,id,"CLAIM")).rejects.toMatchObject({code:"FORBIDDEN"});await expect(reviews.queue(support,org,{page:1,pageSize:25})).rejects.toMatchObject({code:"FORBIDDEN"});expect((await reviews.eligible(admin,org,id)).some(r=>r.membershipId===admin.membershipId)).toBe(false);});
 test("completion versus adjustment serializes to a consistent final result",async()=>{
  const id=await assessment();await command(creator,id,"SEND");await command(nurse,id,"CLAIM");const state=await reviews.read(nurse,org,id);
  const result=await Promise.allSettled([
   reviews.command(nurse,org,id,{action:"COMPLETE",remark:"Concurrent final",expectedRevision:state.revision,expectedScoreRevision:0,requestKey:createEntityId()},context),
   scores.add(nurse,org,id,{expectedResultReference:"result-1",targetType:"item",targetId:"item",points:8,reason:"Concurrent adjustment",expectedRevision:0,requestKey:createEntityId()},context),
  ]);
  expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const latest=await reviews.read(nurse,org,id);if(latest.state==="COMPLETED")expect((await scores.read(nurse,org,id)).overall.reviewedPoints).toBe(3);else expect(latest.scoreRevision).toBe(1);
 });
 test("membership scope changes between initial authorization and its lock reject review mutations",async()=>{
  for(const kind of ["command","adjustment"] as const){
   const id=await assessment();
   await db.update(t.assessments).set({facilityId:otherFacility}).where(eq(t.assessments.id,id));
   const authorize=workflow.authorize.bind(workflow);let first=true;
   workflow.authorize=async(...args)=>{
    const row=await authorize(...args);
    if(first){first=false;await db.insert(t.facilityMemberships).values({id:createEntityId(),organizationId:org,organizationMembershipId:creator.membershipId,facilityId:facility});}
    return row;
   };
   try{
    const pending=kind==="command"?reviews.command(creator,org,id,{action:"SEND",expectedRevision:0,expectedScoreRevision:0,requestKey:createEntityId()},context):scores.add(creator,org,id,{expectedResultReference:"result-1",expectedRevision:0,requestKey:createEntityId(),targetType:"item",targetId:"item",points:4,reason:"Review"},context);
    await expect(pending).rejects.toMatchObject({code:"NOT_FOUND"});
    const [row]=await db.select().from(t.assessments).where(eq(t.assessments.id,id));expect(row!.status).toBe("SCORED");
    expect(await db.select().from(t.assessmentScoreReviews).where(eq(t.assessmentScoreReviews.assessmentId,id))).toHaveLength(0);
   }finally{workflow.authorize=authorize;await db.delete(t.facilityMemberships).where(eq(t.facilityMemberships.organizationMembershipId,creator.membershipId));}
  }
 });
 test("audit failure rolls back assignment and command history",async()=>{
  const id=await assessment();const audit=workflow.audit;workflow.audit=async()=>{throw new Error("test audit failure");};
  try {await expect(command(creator,id,"SEND")).rejects.toThrow("test audit failure");}finally{workflow.audit=audit;}
  expect((await reviews.read(creator,org,id)).state).toBe("NOT_SUBMITTED");expect(await db.select().from(t.assessmentHistory).where(eq(t.assessmentHistory.assessmentId,id))).toHaveLength(0);
 });
 test("history notes are encrypted and queue does not expose notes",async()=>{
  const queue=await reviews.queue(admin,org,{page:1,pageSize:100});expect(queue.items.length).toBeGreaterThan(0);expect(queue.items.every(i=>!i.review.history.length&&i.review.returnReason===null&&i.review.finalRemark===null)).toBe(true);
  const history=await db.select().from(t.assessmentHistory).where(eq(t.assessmentHistory.organizationId,org));expect(history.length).toBeGreaterThan(0);expect(JSON.stringify(history)).not.toContain("Final clinical remark");
  const audits=await db.select().from(t.auditEvents).where(eq(t.auditEvents.organizationId,org));expect(JSON.stringify(audits)).not.toContain("Correct answers");
 });
});
