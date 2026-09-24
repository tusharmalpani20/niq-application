import { ClinicalReviewService } from "./clinical-review";
import { AssessmentScoreReviewService } from "./assessment-score-reviews";
import type { ClinicalReviewAction } from "../../../../packages/contracts/src/clinical-review";
import { AssessmentFaceScanService } from "./assessment-face-scan";
import {afterAll,beforeAll,describe,expect,test} from "bun:test";
import {mkdtemp,rm} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";import {createHash} from "node:crypto";
import postgres from "postgres";import {drizzle} from "drizzle-orm/postgres-js";import {and,eq} from "drizzle-orm";
import {buildAssessmentForm} from "@niq/application-contracts";
import {loadApplicationConfig} from "@niq/application-config";import {createEntityId} from "@niq/application-domain";
import {AssessmentWorkflowService,patientAnswers,assessmentRejectionIssues} from "./assessment-workflow";import {PostgresApplicationService} from "./postgres-application";
import {encryptPatientData,patientDataKey} from "../security/patient-data";import {encryptCredential} from "../security/credential-encryption";
import type {Principal} from "./application";import * as tables from "../db/schema";
function questionnaire(){
 const spec:Record<string,string[]>={disease_status:["tumour_type:multi_select","stage:select","relapse_status:select"],treatment:["treatment_status:conditional","cancer_surgical_status:select","current_cancer_treatment:multi_select","current_medications:multi_select","supplements_intake:multi_select"],health_history:["co_morbidities:multi_select","previous_surgeries:count","family_history_cancer:yes_no"],clinical_gut_health:["appetite_status:select","gastrointestinal_symptoms:multi_select"],dietary_details:["weight_loss:calculated","dietary_symptoms:multi_select","functional_capacity:select","stress_level:select","protein_intake:derived","fluid_intake:select"]};
 const sections=Object.entries(spec).map(([id,items])=>({id,title:id,description:"",fields:items.map(item=>{const[id,type]=item.split(":") as [string,string];return{id,type,label:id,help:"",unit:"",options:["calculated","derived"].includes(type)?[]:[{id:`${id}_yes`,label:"Yes",help:""}],dependencies:[] as string[]};})}));
 const fields=sections.flatMap(s=>s.fields);
 for(const[id,values]of Object.entries({stage:["stage_metastatic"],treatment_status:["treatment_status_palliative_care"],cancer_surgical_status:["cancer_surgical_status_done","cancer_surgical_status_planned"]}))fields.find(f=>f.id===id)!.options=values.map(id=>({id,label:id,help:""}));
 for(const[id,dependencies]of Object.entries({treatment_status:["palliative_status","palliative_timing"],previous_surgeries:["previous_surgery_count"],weight_loss:["previous_weight_kg","current_weight_kg"],protein_intake:["dietary_intake"]}))fields.find(f=>f.id===id)!.dependencies=dependencies;
 return{formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",sections,supportingInputs:["palliative_status","palliative_timing","previous_surgery_count","previous_weight_kg","current_weight_kg","dietary_intake"].map(id=>({id,label:id,kind:id.includes("weight")||id.endsWith("count")?"number":"select",required:false,options:[{id:"post_treatment",label:"Post treatment",help:""}]}))};
}
test("missing birth date and contact remain missing",()=>expect(patientAnswers({id:"p",reference:"P",displayName:"Test",dateOfBirth:null as any,gender:"UNKNOWN",homeFacility:null},new Date())).toMatchObject({age:null,gender:null,contact:""}));
test("rejection guidance excludes unknown paths and upstream private text",()=>{
 const manifest=buildAssessmentForm(questionnaire());
 expect(assessmentRejectionIssues(manifest,[{path:"answers.weight",code:"INVALID_WEIGHT",message:"private upstream answer"},{path:"answers.current_weight_kg",code:"INVALID_WEIGHT",message:"duplicate"},{path:"credentials.secret",code:"INVALID",message:"secret"}])).toEqual([
 {fieldId:"previous_weight_kg",message:"Enter a weight greater than zero."},{fieldId:"current_weight_kg",message:"Enter a weight greater than zero."}]);
});
test("scoring contradictions use generic local guidance",()=>{
 const manifest=buildAssessmentForm(questionnaire());
 expect(assessmentRejectionIssues(manifest,[{path:"answers.dietary_symptoms",code:"CONTRADICTORY_ANSWER",message:"private upstream answer"}])).toEqual([
  {fieldId:"dietary_symptoms",message:"Choose compatible answers for this question."}]);
});
// Must point ONLY to an isolated, migrated disposable database.
describe.skipIf(!process.env.ASSESSMENT_TEST_DATABASE_URL)("assessment PostgreSQL lifecycle",()=>{
 const client=postgres(process.env.ASSESSMENT_TEST_DATABASE_URL!,{max:10,prepare:false}),db=drizzle(client);
 const org=createEntityId(),facility=createEntityId(),other=createEntityId(),patient=createEntityId(),user=createEntityId(),membership=createEntityId();
 const actor:Principal={userId:user,membershipId:membership,organizationId:org,email:"fixture@example.test",displayName:"Fixture",role:"OTHER_MEDICAL",platformRole:"USER"};const context={requestId:"test"};let service:AssessmentWorkflowService,root:string,id:string;let starts=0;const keys:string[]=[];let behavior:"uncertain"|"rejected"|"success"="uncertain";let blockCalculate:(()=>Promise<void>)|undefined;
 beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),"niq-workflow-"));const config=loadApplicationConfig({DATABASE_URL:process.env.ASSESSMENT_TEST_DATABASE_URL,SESSION_SECRET:"test-secret-32-characters-long-enough",SCORING_API_URL:"http://scoring.example.test",SCORING_CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,1).toString("base64"),REPORT_UPLOAD_ROOT:root});
 await db.insert(tables.organizations).values({id:org,legalName:"Fixture",displayName:"Fixture",slug:`fixture-${org.toLowerCase()}`});await db.insert(tables.users).values({id:user,email:`${user}@test.example`,displayName:"Fixture",status:"ACTIVE"});await db.insert(tables.organizationMemberships).values({id:membership,organizationId:org,userId:user,role:"OTHER_MEDICAL"});await db.insert(tables.facilities).values([{id:facility,organizationId:org,name:"Allowed",code:"A"},{id:other,organizationId:org,name:"Hidden",code:"B"}]);await db.insert(tables.facilityMemberships).values({id:createEntityId(),organizationId:org,organizationMembershipId:membership,facilityId:facility});
 const key=patientDataKey(undefined,config.SESSION_SECRET);await db.insert(tables.patients).values({id:patient,organizationId:org,homeFacilityId:facility,encryptedExternalReference:encryptPatientData("MRN",key),externalReferenceLookupHash:patient,serialNumber:1,dateOfBirth:"1990-01-01",gender:"FEMALE",encryptedProfile:encryptPatientData(JSON.stringify({name:"Fixture Patient",phone:"1234567890"}),key),encryptionKeyVersion:"v1"});const credential=encryptCredential("mock",config.SCORING_CREDENTIAL_ENCRYPTION_KEY!);await db.insert(tables.scoringConnections).values({id:createEntityId(),organizationId:org,deploymentId:createEntityId(),scoringOrganizationId:createEntityId(),encryptedCredential:credential.ciphertext,credentialIv:credential.iv,keyVersion:"v1"});
 service=new AssessmentWorkflowService({db,config,applicationService:new PostgresApplicationService(db,config,{deliver:async()=>{}}),fetcher:async(url,init)=>{const body=JSON.parse(String(init?.body));if(String(url).endsWith("start")){starts++;expect((await db.select().from(tables.assessmentInitializations).where(eq(tables.assessmentInitializations.id,body.assessmentReference)))[0]).toBeDefined();return Response.json({assessmentReference:body.assessmentReference,bindingId:"binding",ruleVersionId:"rule",checksum:"a".repeat(64),version:"FINAL-1",questionnaire:questionnaire()});}keys.push(body.idempotencyKey);if(blockCalculate){const block=blockCalculate;blockCalculate=undefined;await block();}
 if(behavior!=="uncertain"){
 const result={assessmentReference:body.assessmentReference,bindingId:"binding",ruleVersionId:"rule",checksum:"a".repeat(64),version:"FINAL-1",formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:behavior==="success",score:0,classification:{id:"low",label:"Low",interpretation:""},components:questionnaire().sections.flatMap(section=>section.fields.map(f=>({id:f.id,sectionId:section.id,label:f.label,points:null,status:"unanswered"}))),answerCoverage:{totalEntries:19,answeredEntries:0,unansweredEntries:19,pendingEntries:0,allUnanswered:true},derived:{weightLossPercent:null,proteinAdequacy:null},riskStatus:"CLIENT_CONFIRMED",clinicalUsePermitted:true,interventions:{status:"NOT_APPLICABLE"},issues:behavior==="rejected"?[{path:"answers.height_cm",code:"INVALID",message:"Correct answer"}]:[],calculatedAt:new Date().toISOString()};
 return behavior==="success"?Response.json({result:{...result,resultReference:"test-result"},idempotencyKey:body.idempotencyKey}):Response.json({error:"INVALID_ASSESSMENT_ANSWERS",result},{status:400});
 }throw new Error("uncertain transport");}});
 });
 const submit=async (actor:Principal,organizationId:string,assessmentId:string,revision:number,context:{requestId:string})=>{
   const record=await service.read(actor,organizationId,assessmentId);
   return service.submit(actor,organizationId,assessmentId,{revision,reviewToken:record.reviewToken,attestation:{statementVersion:1,reviewedSectionIds:[...record.manifest.sections.map(section=>section.id),"face-scan","attachments"],confirmed:true}},context);
 };
 afterAll(async()=>{await client.end();if(root)await rm(root,{recursive:true,force:true});});
 test("initialization is durable and idempotent, health snapshots encrypted",async()=>{const a=await service.initialize(actor,org,{patientId:patient,requestKey:"init-request-key-12345"},context);expect(a.status).toBe("READY");id=a.assessmentId!;expect((await service.initialize(actor,org,{patientId:patient,requestKey:"init-request-key-12345"},context)).assessmentId).toBe(id);expect(starts).toBe(1);expect(JSON.stringify((await db.select().from(tables.assessments).where(eq(tables.assessments.id,id)))[0]!.workflow)).not.toContain("Fixture Patient");});
 test("readable references retain tenant and facility authorization",async()=>{
   const record=await service.read(actor,org,id);
   expect(record.reference).toBe("ASM-000001");
   expect(record.serialNumber).toBe(1);
   expect((await service.read(actor,org,record.reference)).id).toBe(id);
   expect((await service.initialize(actor,org,{patientId:patient,requestKey:"init-request-key-12345"},context)).assessmentReference).toBe(record.reference);
   await db.update(tables.facilityMemberships).set({facilityId:other}).where(eq(tables.facilityMemberships.organizationMembershipId,membership));
   await expect(service.read(actor,org,record.reference)).rejects.toMatchObject({code:"NOT_FOUND"});
   await db.update(tables.facilityMemberships).set({facilityId:facility}).where(eq(tables.facilityMemberships.organizationMembershipId,membership));
 });
 test("concurrent assessment numbers share a sequence across branches and remain immutable",async()=>{
   const [base]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,id));
   const rows=await Promise.all(Array.from({length:8},(_,n)=>db.insert(tables.assessments).values({...base!,id:createEntityId(),facilityId:n%2?other:facility}).returning()));
   const serials=rows.flat().map(row=>row.serialNumber);
   expect(new Set(serials).size).toBe(8);
   expect(Math.min(...serials)).toBe(2);
   expect(Math.max(...serials)).toBe(9);
   await expect(db.update(tables.assessments).set({serialNumber:999}).where(eq(tables.assessments.id,id)).execute()).rejects.toMatchObject({cause:{message:"Assessment organization and serial are immutable"}});
   const secondOrg=createEntityId(),secondMember=createEntityId(),secondPatient=createEntityId();
   await db.insert(tables.organizations).values({id:secondOrg,legalName:"Other",displayName:"Other",slug:`other-${secondOrg.toLowerCase()}`});
   await db.insert(tables.organizationMemberships).values({id:secondMember,organizationId:secondOrg,userId:user,role:"OTHER_MEDICAL"});
   const [patientRow]=await db.select().from(tables.patients).where(eq(tables.patients.id,patient));
   await db.insert(tables.patients).values({...patientRow!,id:secondPatient,organizationId:secondOrg,homeFacilityId:null});
   const [definition]=await db.select().from(tables.questionnaireDefinitions).where(eq(tables.questionnaireDefinitions.id,base!.questionnaireDefinitionId));
   const secondDefinition=createEntityId();await db.insert(tables.questionnaireDefinitions).values({...definition!,id:secondDefinition,organizationId:secondOrg,scopeKey:secondOrg});
   const [second]=await db.insert(tables.assessments).values({...base!,id:createEntityId(),organizationId:secondOrg,patientId:secondPatient,facilityId:null,createdByMembershipId:secondMember,questionnaireDefinitionId:secondDefinition,questionnaireScopeKey:secondOrg}).returning();
   expect(second!.serialNumber).toBe(1);
   // Aborted transactions do not consume serials.
   const [before]=await db.select().from(tables.organizations).where(eq(tables.organizations.id,org));
   await expect(db.transaction(async tx=>{await tx.insert(tables.assessments).values({...base!,id:createEntityId()});throw new Error("rollback");})).rejects.toThrow("rollback");
   const [after]=await db.select().from(tables.organizations).where(eq(tables.organizations.id,org));
   expect(after!.nextAssessmentSerial).toBe(before!.nextAssessmentSerial);
 });
 test("delayed binding preserves initialization time and height reference year",async()=>{
 const [connection]=await db.select().from(tables.scoringConnections).where(eq(tables.scoringConnections.organizationId,org));
 const initializationId=createEntityId(),createdAt=new Date("2025-12-31T12:00:00Z");
 await db.insert(tables.assessmentInitializations).values({id:initializationId,organizationId:org,patientId:patient,facilityId:facility,creatorId:membership,requestKey:"delayed-binding-test-1234",createdAt,connection:{origin:"http://scoring.example.test",deploymentId:connection!.deploymentId,scoringOrganizationId:connection!.scoringOrganizationId}});
 expect((await service.retryInitialization(actor,org,initializationId,context)).status).toBe("READY");
 const [row]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,initializationId));
 expect(row!.createdAt).toEqual(createdAt);
 expect(service.unseal<{heightReferenceYear:number}>(row!.workflow).heightReferenceYear).toBe(2025);
 expect((await service.read(actor,org,initializationId)).answers.age).toBe(35);
 });
 test("roles organization and changed facility permissions are enforced",async()=>{for(const denied of [{...actor,role:"SUPPORT" as const},{...actor,platformRole:"NIQ_ADMIN" as const},{...actor,organizationId:createEntityId()}])await expect(service.read(denied,org,id)).rejects.toMatchObject({code:"FORBIDDEN"});await db.update(tables.facilityMemberships).set({facilityId:other}).where(eq(tables.facilityMemberships.organizationMembershipId,membership));await expect(service.read(actor,org,id)).rejects.toMatchObject({code:"NOT_FOUND"});await db.update(tables.facilityMemberships).set({facilityId:facility}).where(eq(tables.facilityMemberships.organizationMembershipId,membership));});
 test("concurrent saves fence stale revisions and forged contact",async()=>{const outcomes=await Promise.allSettled([service.save(actor,org,id,{revision:0,answers:{height_cm:170,current_weight_kg:70,contact:"forged"}},context),service.save(actor,org,id,{revision:0,answers:{height_cm:160,current_weight_kg:65}},context)]);expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((await service.read(actor,org,id)).answers.contact).toBe("1234567890");});
 test("draft reads and saves remove inactive branches without restoring old details",async()=>{
   let record=await service.read(actor,org,id);
   record=await service.save(actor,org,id,{revision:record.revision,answers:{...record.answers,stage:"stage_metastatic",metastasis_site:"others",metastasis_other:"old detail"}},context);
   expect(record.answers.metastasis_other).toBe("old detail");
   // Simulate a legacy draft written by the former retention policy.
   const [row]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,id));
   const state=service["unseal"]<Record<string,unknown>>(row!.workflow);
   await db.update(tables.assessments).set({workflow:service["seal"]({...state,answers:{...record.answers,stage:null}})}).where(eq(tables.assessments.id,id));
   record=await service.read(actor,org,id);
   expect(record.answers.metastasis_site).toBeUndefined();
   expect(record.answers.metastasis_other).toBeUndefined();
   record=await service.save(actor,org,id,{revision:record.revision,answers:{...record.answers,metastasis_site:"others",metastasis_other:"stale client value"}},context);
   expect(record.answers.metastasis_other).toBeUndefined();
   const stored=service["unseal"]<{answers:Record<string,unknown>}>((await db.select().from(tables.assessments).where(eq(tables.assessments.id,id)))[0]!.workflow);
   expect(stored.answers.metastasis_site).toBeUndefined();
   expect((await db.select().from(tables.assessmentAnswers).where(eq(tables.assessmentAnswers.assessmentId,id))).some(answer=>answer.questionKey==="metastasis_other")).toBe(false);
   record=await service.save(actor,org,id,{revision:record.revision,answers:{...record.answers,stage:"stage_metastatic"}},context);
   expect(record.answers.metastasis_site).toBeUndefined();
   expect(record.answers.metastasis_other).toBeUndefined();
   // Restore the optional parent before the submission lifecycle checks below.
   await service.save(actor,org,id,{revision:record.revision,answers:{...record.answers,stage:null}},context);
 });
 test("report digest validation successful replay and download",async()=>{let record=await service.read(actor,org,id);record=await service.reports.edit(actor,org,id,{revision:record.revision,label:"Report",purpose:"Baseline",datePrecision:"MONTH",year:2026,month:9,day:null},context);const report=record.reports[0]!,bytes=new TextEncoder().encode("%PDF-1.7\nfixture");const input={revision:record.revision,uploadKey:"upload-key-at-least-16",filename:"report.pdf",mediaType:"application/pdf" as const,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),body:new Response(bytes).body!};record=await service.reports.upload(actor,org,id,report.id,input,context);expect(record.reports[0]!.files[0]!.status).toBe("READY");expect((await service.reports.upload(actor,org,id,report.id,{...input,body:new Response(bytes).body!},context)).revision).toBe(record.revision);await expect(service.reports.upload(actor,org,id,report.id,{...input,sha256:"0".repeat(64),body:new Response(bytes).body!},context)).rejects.toMatchObject({code:"CONFLICT"});const file=await service.reports.download(actor,org,id,report.id,record.reports[0]!.files[0]!.id);expect(await new Response(file.stream).text()).toContain("fixture");});
 test("pending upload blocks submission; cancellation fences late completion",async()=>{
   let record=await service.read(actor,org,id);const report=record.reports[0]!;const bytes=new TextEncoder().encode("%PDF-1.7\nlate");let controller!:ReadableStreamDefaultController<Uint8Array>;
   const body=new ReadableStream<Uint8Array>({start(c){controller=c;}});
   const pending=service.reports.upload(actor,org,id,report.id,{revision:record.revision,uploadKey:"pending-upload-key-1234",filename:"late.pdf",mediaType:"application/pdf",size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),body},context);
   // Observe reservation before driving the test transfer; attach rejection handler immediately.
   const outcome=pending.then(()=>"ready",()=>"cancelled");let file:typeof tables.assessmentFiles.$inferSelect|undefined;
   for(let n=0;n<100&&!file;n++){file=(await db.select().from(tables.assessmentFiles).where(eq(tables.assessmentFiles.uploadKey,"pending-upload-key-1234"))).find(f=>f.assessmentId===id);if(!file)await Bun.sleep(5);}
   expect(file?.status).toBe("PENDING");
   await expect(submit(actor,org,id,record.revision,context)).rejects.toMatchObject({code:"CONFLICT"});
   record=await service.reports.remove(actor,org,id,report.id,record.revision,context,file!.id);
   controller.enqueue(bytes);controller.close();expect(await outcome).toBe("cancelled");
   expect((await service.read(actor,org,id)).reports[0]!.files).toHaveLength(1);
 });
 test("uncertain scoring freezes edits and preserves retry key",async()=>{let record=await service.read(actor,org,id);
  const sections=[...record.manifest.sections.map(section=>section.id),"face-scan","attachments"];
  await expect(service.submit(actor,org,id,{revision:record.revision,reviewToken:record.reviewToken,attestation:{statementVersion:1,reviewedSectionIds:sections.slice(1),confirmed:true}},context)).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await expect(service.submit(actor,org,id,{revision:record.revision,reviewToken:"0".repeat(64),attestation:{statementVersion:1,reviewedSectionIds:sections,confirmed:true}},context)).rejects.toMatchObject({code:"CONFLICT"});
  expect((await db.select().from(tables.assessmentSubmissions).where(eq(tables.assessmentSubmissions.assessmentId,id)))).toHaveLength(0);
  record=await submit(actor,org,id,record.revision,context);expect(record.status).toBe("SCORING_UNAVAILABLE");
  expect(record.attestations).toMatchObject([{submissionId:record.submission!.id,cycle:0,actorMembershipId:actor.membershipId,statementVersion:1,reviewedSectionIds:sections}]);
  const [storedAttestation]=await db.select({attestation:tables.assessmentSubmissions.attestation}).from(tables.assessmentSubmissions).where(eq(tables.assessmentSubmissions.id,record.submission!.id));
  expect(JSON.stringify(storedAttestation!.attestation)).not.toContain(actor.displayName);
  await expect(db.update(tables.assessmentSubmissions).set({attestation:null}).where(eq(tables.assessmentSubmissions.id,record.submission!.id))).rejects.toThrow("Assessment submission attestation is immutable");
  const firstAttestation=record.attestations[0]!;
  await expect(service.save(actor,org,id,{revision:record.revision,answers:{}},context)).rejects.toMatchObject({code:"CONFLICT"});await expect(service.retrySubmission(actor,org,id,context)).rejects.toMatchObject({code:"CONFLICT"});await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,id));record=await service.retrySubmission(actor,org,id,context);expect(keys).toHaveLength(2);expect(new Set(keys).size).toBe(1);expect(record.attestations).toEqual([firstAttestation]);
 });
 test("connection change preserves frozen answers and requires reconciliation",async()=>{
 const [original]=await db.select().from(tables.scoringConnections).where(eq(tables.scoringConnections.organizationId,org));
 await db.update(tables.scoringConnections).set({deploymentId:createEntityId()}).where(eq(tables.scoringConnections.organizationId,org));
 await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,id));
 const record=await service.retrySubmission(actor,org,id,context);expect(record.status).toBe("SCORING_UNAVAILABLE");expect(record.submission?.status).toBe("RECONCILIATION_REQUIRED");expect(keys).toHaveLength(2);
 await db.update(tables.scoringConnections).set({deploymentId:original!.deploymentId}).where(eq(tables.scoringConnections.organizationId,org));
 await service.retrySubmission(actor,org,id,context);expect(keys).toHaveLength(2);
 });
 test("operator same-key rejection permits resubmission and retains frozen files",async()=>{
 behavior="rejected";await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,id));
 let record=await service.retrySubmission({...actor,role:"ORGANIZATION_ADMIN"},org,id,context,true);expect(record.status).toBe("DRAFT");expect(record.submission?.issues).toEqual([{fieldId:"height_cm",message:"Review this answer before submitting again."}]);expect((await service.read(actor,org,id)).submission?.issues).toEqual(record.submission?.issues ?? []);expect(new Set(keys).size).toBe(1);
 record=await submit(actor,org,id,record.revision,context);expect(record.status).toBe("DRAFT");expect(new Set(keys).size).toBe(2);
 const report=record.reports[0]!,file=report.files[0]!;const [stored]=await db.select().from(tables.assessmentFiles).where(eq(tables.assessmentFiles.id,file.id));
 record=await service.reports.remove(actor,org,id,report.id,record.revision,context);
 const retained=await service.storage!.open({organizationId:org,patientId:patient,assessmentId:id},stored!.objectKey!);expect(await new Response(retained.stream).text()).toContain("fixture");
 record=await service.save(actor,org,id,{revision:record.revision,answers:{...record.answers,height_cm:180}},context);behavior="success";
 record=await submit(actor,org,id,record.revision,context);expect(record.status).toBe("SCORED");expect(new Set(keys).size).toBe(3);
 });

 test("saved versions and scoring evidence are encrypted and completion remains clinical",async()=>{
  const [stored]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,id));
  expect(stored!.currentSubmissionId).toBeTruthy();expect(stored!.scoredAt).toBeInstanceOf(Date);expect(stored!.completedAt).toBeNull();
  const history=await db.select().from(tables.assessmentHistory).where(eq(tables.assessmentHistory.assessmentId,id));
  expect(history.some(event=>event.kind==="CREATED")).toBe(true);
  const saves=history.filter(event=>event.kind==="DRAFT_SAVED");expect(saves.length).toBeGreaterThan(0);
  expect(JSON.stringify(saves)).not.toContain("Fixture Patient");
  const saved=service.unseal<{before:{answers:Record<string,unknown>};after:{answers:Record<string,unknown>}}>(saves.sort((a,b)=>a.revision-b.revision).at(-1)!.payload);
  expect(saved.before.answers).toBeDefined();expect(saved.after.answers.height_cm).toBe(180);
  expect(history.some(event=>event.kind==="SCORED")).toBe(true);
 });

 test("cleared current submission never exposes a previous cycle result",async()=>{
  const initialized=await service.initialize(actor,org,{patientId:patient,requestKey:"current-pointer-isolation-test"},context);
  const copyId=initialized.assessmentId!;let record=await service.read(actor,org,copyId);
  record=await service.save(actor,org,copyId,{revision:record.revision,answers:{height_cm:175,current_weight_kg:70}},context);
  behavior="success";record=await submit(actor,org,copyId,record.revision,context);expect(record.result).not.toBeNull();
  await db.update(tables.assessments).set({status:"DRAFT",cycle:1,currentSubmissionId:null}).where(eq(tables.assessments.id,copyId));
  const returned=await service.read(actor,org,copyId);expect(returned.result).toBeNull();expect(returned.submission).toBeNull();
  expect(await db.select().from(tables.assessmentSubmissions).where(eq(tables.assessmentSubmissions.assessmentId,copyId))).toHaveLength(1);
 });

 test("expired scoring lease fences a late worker from duplicating results",async()=>{
 const initialized=await service.initialize(actor,org,{patientId:patient,requestKey:"lease-fencing-test-1234"},context);const otherId=initialized.assessmentId!;
 let record=await service.read(actor,org,otherId);record=await service.save(actor,org,otherId,{revision:record.revision,answers:{height_cm:175,current_weight_kg:70}},context);
 behavior="success";let release!:()=>void;blockCalculate=()=>new Promise<void>(resolve=>{release=resolve;});
 const late=submit(actor,org,otherId,record.revision,context);
 for(let n=0;n<100&&!release;n++)await Bun.sleep(5);
 expect(release).toBeDefined();await db.update(tables.assessmentSubmissions).set({leaseExpiresAt:new Date(0),nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,otherId));
 const recovered=await service.retrySubmission(actor,org,otherId,context);expect(recovered.status).toBe("SCORED");release();expect((await late).status).toBe("SCORED");
 expect(await db.select().from(tables.scoringResults).where(eq(tables.scoringResults.assessmentId,otherId))).toHaveLength(1);
 const recorded=await db.select().from(tables.measurements).where(eq(tables.measurements.assessmentId,otherId));expect(recorded).toHaveLength(2);
 const weight=recorded.find(row=>service.unseal<Record<string,unknown>>(row.values).current_weight_kg!==undefined);expect(weight?.provenance).toBe("MANUAL");
 });

 test("batch recovery skips inaccessible initialization and scoring cooldown",async()=>{
 const cooldown=(await service.initialize(actor,org,{patientId:patient,requestKey:"recovery-cooldown-12345"},context)).assessmentId!;
 const due=(await service.initialize(actor,org,{patientId:patient,requestKey:"recovery-due-123456789"},context)).assessmentId!;
 behavior="uncertain";
 for(const assessmentId of [cooldown,due]){let record=await service.read(actor,org,assessmentId);record=await service.save(actor,org,assessmentId,{revision:record.revision,answers:{height_cm:170,current_weight_kg:70}},context);await submit(actor,org,assessmentId,record.revision,context);}
 await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,due));
 await db.insert(tables.assessmentInitializations).values({id:createEntityId(),organizationId:org,patientId:patient,facilityId:other,creatorId:membership,requestKey:"inaccessible-recovery-12345",connection:{}});
 const before=keys.length;behavior="success";
 await service.recover(actor,org,context);
 expect(keys.length).toBe(before+1);
 expect((await service.read(actor,org,cooldown)).status).toBe("SCORING_UNAVAILABLE");
 expect((await service.read(actor,org,due)).status).toBe("SCORED");
 });

 test("face scan durable replay, tenant scope, encrypted snapshot and late result isolation",async()=>{
  const scanAssessment=(await service.initialize(actor,org,{patientId:patient,requestKey:"face-scan-assessment-12345"},context)).assessmentId!;
  let draft=await service.read(actor,org,scanAssessment);
  draft=await service.save(actor,org,scanAssessment,{revision:draft.revision,answers:{height_cm:170,current_weight_kg:65}},context);
  const enabled=new AssessmentWorkflowService({db,applicationService:service.applicationService,config:{...service.config,FACE_SCAN_ENABLED:true}});
  let remote:any;let uncertain=true;let calls=0;
  const scans=new AssessmentFaceScanService(enabled,async(url,init)=>{
   calls++;const request=new URL(String(url));
   if(request.pathname==="/v1/face-scans"){
    const body=JSON.parse(String(init?.body));
    const persisted=await db.select().from(tables.assessmentFaceScans).where(and(eq(tables.assessmentFaceScans.organizationId,org),eq(tables.assessmentFaceScans.remoteRequestKey,body.idempotencyKey)));
    expect(persisted).toHaveLength(1);expect(body.idempotencyKey).toBe(`face-scan:${org}:${persisted[0]!.id}`);expect(JSON.stringify(persisted[0]!.snapshot)).not.toContain("1990-01-01");
    remote??={id:"remote-scan",state:"REQUESTED",context:body.context,assessmentReference:body.assessmentReference,organizationReference:body.organizationReference,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),completedAt:null,failureCode:null,result:null,score:null};
    if(uncertain){uncertain=false;throw new Error("lost response");}
   }
   return Response.json({session:remote,providerConfigured:true});
  });
  const input={revision:draft.revision,posture:"resting" as const,requestKey:"face-scan-operation-12345"};
  const first=await scans.start(actor,org,scanAssessment,input,context);expect(first.failureCode).toBe("RECONCILIATION_REQUIRED");expect(first.state).toBe("RECONCILIATION_REQUIRED");
  const replay=await scans.start(actor,org,scanAssessment,input,context);expect(replay.id).toBe(first.id);expect(replay.failureCode).toBeNull();
  await expect(scans.start(actor,org,scanAssessment,{...input,requestKey:"another-tab-operation-12345"},context)).rejects.toMatchObject({code:"CONFLICT",details:{currentSessionId:first.id}});
  expect((await scans.list(actor,org,scanAssessment)).sessions).toHaveLength(1);
  await expect(scans.get({...actor,organizationId:other},org,scanAssessment,first.id)).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(scans.get(actor,org,id,first.id)).rejects.toMatchObject({code:"NOT_FOUND"});
  remote={...remote,state:"EXPIRED",updatedAt:new Date().toISOString()};
  expect((await scans.get(actor,org,scanAssessment,first.id)).state).toBe("EXPIRED");
  expect((await scans.row(org,scanAssessment,first.id)).active).toBe(false);
  // Existing evidence still reconciles after operators disable new scans.
  enabled.config.FACE_SCAN_ENABLED=false;
  remote={...remote,state:"RECONCILIATION_REQUIRED",updatedAt:new Date().toISOString()};
  expect((await scans.get(actor,org,scanAssessment,first.id)).state).toBe("RECONCILIATION_REQUIRED");
  expect((await scans.row(org,scanAssessment,first.id)).active).toBe(false);
  const [before]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,scanAssessment));
  await db.update(tables.assessments).set({status:"COMPLETED"}).where(eq(tables.assessments.id,scanAssessment));
  await expect(scans.mutate(actor,org,scanAssessment,first.id,"signal",{schemaVersion:1,raw_intensity:[{r:1,g:2,b:3}],ppg_time:[0],average_fps:30})).rejects.toMatchObject({code:"CONFLICT"});
  remote={...remote,state:"COMPLETED",updatedAt:new Date().toISOString(),completedAt:new Date().toISOString(),result:null};
  expect((await scans.get(actor,org,scanAssessment,first.id)).state).toBe("RECONCILIATION_REQUIRED");
  remote={...remote,state:"COMPLETED",updatedAt:new Date().toISOString(),completedAt:new Date().toISOString(),failureCode:"SCORE_MAPPING_UNAVAILABLE",result:{schemaVersion:1,providerScanId:"provider-scan",wellnessScore:60,healthRiskScore:null,vitals:{heartRate:70,oxygenSaturation:null,respiratoryRate:null,systolic:null,diastolic:null},physiologicalScore:null,mentalWellbeingScore:null}};
  const callsWhileClosed=calls;
  expect((await scans.get(actor,org,scanAssessment,first.id)).result).toBeNull();
  expect(calls).toBe(callsWhileClosed);
  // Restore the synthetic fixture to exercise still-open draft recovery separately.
  // No application action permits reopening a completed assessment.
  await db.update(tables.assessments).set({status:"SCORING_PENDING"}).where(eq(tables.assessments.id,scanAssessment));
  await db.update(tables.assessmentFaceScans).set({nextAttemptAt:null,leaseExpiresAt:null,updatedAt:new Date(0)}).where(eq(tables.assessmentFaceScans.id,first.id));
  // Recovery takes the oldest ten across tenants; prioritize this isolated fixture.
  await scans.recoverPending();
  expect((await scans.row(org,scanAssessment,first.id)).state).toBe("COMPLETED");
  await db.update(tables.assessments).set({status:"DRAFT"}).where(eq(tables.assessments.id,scanAssessment));
  expect((await scans.get(actor,org,scanAssessment,first.id)).result?.wellnessScore).toBe(60);
  const originalResult=structuredClone(remote.result),originalCompletion=remote.completedAt;
  expect((await scans.get(actor,org,scanAssessment,first.id)).failureCode).toBe("SCORE_MAPPING_UNAVAILABLE");
  remote={...remote,updatedAt:new Date().toISOString(),failureCode:null,score:{status:"SCORED",points:1,ruleVersionId:"pinned-rule"},result:{...remote.result,wellnessScore:99}};
  const conflictingRepair=await scans.get(actor,org,scanAssessment,first.id);
  expect(conflictingRepair.result?.wellnessScore).toBe(60);expect(conflictingRepair.score).toBeNull();
  expect(conflictingRepair.failureCode).toBe("SCORE_MAPPING_UNAVAILABLE");
  remote={...remote,result:originalResult,updatedAt:new Date().toISOString()};
  const repaired=await scans.get(actor,org,scanAssessment,first.id);
  expect(repaired.score?.points).toBe(1);expect(repaired.failureCode).toBeNull();
  expect(repaired.result).toEqual(originalResult);expect(repaired.completedAt).toBe(originalCompletion);
  expect((await scans.list(actor,org,scanAssessment)).currentSessionId).toBe(first.id);
  const callsAfterRepair=calls;
  remote={...remote,score:{status:"SCORED",points:99,ruleVersionId:"changed-rule"}};
  expect((await scans.get(actor,org,scanAssessment,first.id)).score?.points).toBe(1);
  expect(calls).toBe(callsAfterRepair);
  const [after]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,scanAssessment));
  expect(after!.workflow).toEqual(before!.workflow);expect(after!.revision).toBe(before!.revision);
  expect((await scans.start(actor,org,scanAssessment,input,context)).id).toBe(first.id);
  expect(calls).toBeGreaterThan(1);
 });

 test("face scan definitive setup rejection releases slot while unknown outcome retains it",async()=>{
  const assessment=(await service.initialize(actor,org,{patientId:patient,requestKey:"scan-rejection-assessment-12345"},context)).assessmentId!;
  const draft=await service.save(actor,org,assessment,{revision:0,answers:{height_cm:170,current_weight_kg:65}},context);
  const enabled=new AssessmentWorkflowService({db,applicationService:service.applicationService,config:{...service.config,FACE_SCAN_ENABLED:true}});
  let outcome="FACE_SCAN_DISABLED";
  const scans=new AssessmentFaceScanService(enabled,async()=>{if(outcome==="unknown")throw new Error("timeout");return Response.json({error:outcome},{status:outcome==="UNAUTHORIZED"?401:503});});
  const input={revision:draft.revision,posture:"resting" as const,requestKey:"rejected-face-scan-12345"};
  const rejected=await scans.start(actor,org,assessment,input,context);
  expect(rejected.state).toBe("FAILED");expect(rejected.failureCode).toBe("FACE_SCAN_DISABLED");
  expect((await scans.row(org,assessment,rejected.id)).active).toBe(false);
  outcome="unknown";
  const uncertain=await scans.start(actor,org,assessment,{...input,requestKey:"uncertain-face-scan-12345"},context);
  expect(uncertain.id).not.toBe(rejected.id);expect(uncertain.state).toBe("RECONCILIATION_REQUIRED");
  // Creation timestamps can precede older attempts after lock waits or clock changes.
  await db.update(tables.assessmentFaceScans).set({createdAt:new Date("2000-01-01T00:00:00Z")}).where(eq(tables.assessmentFaceScans.id,uncertain.id));
  expect((await scans.list(actor,org,assessment)).currentSessionId).toBe(uncertain.id);
  outcome="UNAUTHORIZED";
  const prior=await scans.row(org,assessment,uncertain.id);
  // A stale caller snapshot must not turn a later rejected replay into a definite first rejection.
  await scans.reconcile({...prior,failureCode:null,leaseToken:null,reconciliationAttempts:0});
  expect((await scans.row(org,assessment,uncertain.id)).active).toBe(true);
  expect((await scans.get(actor,org,assessment,uncertain.id)).state).toBe("RECONCILIATION_REQUIRED");
  expect((await scans.row(org,assessment,uncertain.id)).active).toBe(true);
 });

 test("assessment contact corrections preserve encrypted before and after history",async()=>{
  const assessment=(await service.initialize(actor,org,{patientId:patient,requestKey:"contact-history-audit-12345"},context)).assessmentId!;
  const draft=await service.read(actor,org,assessment);
  const before=await service.applicationService.getPatient(actor,org,patient) as {phone?:string};
  await service.updateContact(actor,org,patient,"9876543210",context,{assessmentId:assessment,revision:draft.revision});
  const events=await db.select().from(tables.assessmentHistory).where(eq(tables.assessmentHistory.assessmentId,assessment));
  const event=events.find(e=>e.kind==="PATIENT_CONTACT_UPDATED")!;
  expect(event).toBeDefined();
  expect(service.unseal<any>(event.payload)).toMatchObject({patientId:patient,before:{phone:before.phone??null},after:{phone:"9876543210"},actor:{membershipId:actor.membershipId}});
  expect(JSON.stringify(event.payload)).not.toContain("9876543210");
 });

 test("real correction saves and rescoring preserve binding, history and explicit clinical resubmission across cycles",async()=>{
  behavior="success";
  const assessment=(await service.initialize(actor,org,{patientId:patient,requestKey:"clinical-full-correction-12345"},context)).assessmentId!;
  const clinical=new ClinicalReviewService(service),scores=new AssessmentScoreReviewService(service);
  const act=async(action:ClinicalReviewAction["action"],extra:object={})=>{
   const state=await clinical.read(actor,org,assessment);
   return clinical.command(actor,org,assessment,{action,expectedRevision:state.revision,expectedScoreRevision:state.scoreRevision,requestKey:createEntityId(),...extra} as ClinicalReviewAction,context);
  };
  let draft=await service.read(actor,org,assessment);
  draft=await service.save(actor,org,assessment,{revision:draft.revision,answers:{...draft.answers,height_cm:170,current_weight_kg:65}},context);
  let scored=await submit(actor,org,assessment,draft.revision,context);expect(scored.status).toBe("SCORED");
  const [original]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,assessment));
  const originalPointer=original!.currentSubmissionId;
  const [originalSubmission]=await db.select().from(tables.assessmentSubmissions).where(eq(tables.assessmentSubmissions.id,originalPointer!));
  const originalSnapshot=structuredClone(originalSubmission!.snapshot),originalResult=structuredClone(originalSubmission!.result);
  const binding=service.unseal<any>(originalSnapshot).binding;
  await act("SEND");await act("CLAIM");
  const seenKeys=[originalSubmission!.idempotencyKey];
  for(let cycle=1;cycle<=2;cycle++){
   const returned=await act("RETURN_TO_DRAFT",{assigneeId:actor.membershipId,reason:`Correction ${cycle}`});expect(returned.cycle).toBe(cycle);
   draft=await service.read(actor,org,assessment);expect(draft.status).toBe("DRAFT");expect(draft.result).toBeNull();expect(draft.canEditDraft).toBe(true);
   draft=await service.save(actor,org,assessment,{revision:draft.revision,answers:{...draft.answers,current_weight_kg:65+cycle}},context);
   scored=await submit(actor,org,assessment,draft.revision,context);expect(scored.status).toBe("SCORED");
   const [row]=await db.select().from(tables.assessments).where(eq(tables.assessments.id,assessment));
   const [submission]=await db.select().from(tables.assessmentSubmissions).where(eq(tables.assessmentSubmissions.id,row!.currentSubmissionId!));
   expect(seenKeys).not.toContain(submission!.idempotencyKey);seenKeys.push(submission!.idempotencyKey);
   const attestations=(await service.read(actor,org,assessment)).attestations;
   expect(attestations).toHaveLength(cycle+1);
   expect(attestations.at(-1)).toMatchObject({submissionId:submission!.id,cycle,actorMembershipId:actor.membershipId,statementVersion:1});
   expect(service.unseal<any>(submission!.snapshot).binding).toEqual(binding);expect(service.unseal<any>(submission!.snapshot).answers.current_weight_kg).toBe(65+cycle);
   expect((await scores.read(actor,org,assessment)).revision).toBe(0);
   expect((await clinical.read(actor,org,assessment)).state).toBe("AWAITING_RESUBMISSION");
   const requests=keys.length;await service.retrySubmission(actor,org,assessment,context);expect(keys.length).toBe(requests);
   const resent=await act("RESEND");expect(resent.state).toBe("IN_REVIEW");expect(resent.assignee?.membershipId).toBe(actor.membershipId);
  }
  const [unchanged]=await db.select().from(tables.assessmentSubmissions).where(eq(tables.assessmentSubmissions.id,originalPointer!));expect(unchanged!.snapshot).toEqual(originalSnapshot);expect(unchanged!.result).toEqual(originalResult);
  const completed=await act("COMPLETE",{remark:"Reviewed both correction cycles"});expect(completed.state).toBe("COMPLETED");
  await expect(service.save(actor,org,assessment,{revision:scored.revision,answers:scored.answers},context)).rejects.toMatchObject({code:"CONFLICT"});
  const history=await db.select().from(tables.assessmentHistory).where(eq(tables.assessmentHistory.assessmentId,assessment));
  expect(history.filter(h=>h.kind==="SCORING_SUBMITTED")).toHaveLength(3);expect(history.filter(h=>h.kind==="DRAFT_SAVED")).toHaveLength(3);
  expect(history.filter(h=>h.kind==="RETURN_TO_DRAFT")).toHaveLength(2);
 });

});
