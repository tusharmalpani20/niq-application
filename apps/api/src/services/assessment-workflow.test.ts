import {afterAll,beforeAll,describe,expect,test} from "bun:test";
import {mkdtemp,rm} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";import {createHash} from "node:crypto";
import postgres from "postgres";import {drizzle} from "drizzle-orm/postgres-js";import {eq} from "drizzle-orm";
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
// Must point ONLY to an isolated, migrated disposable database.
describe.skipIf(!process.env.ASSESSMENT_TEST_DATABASE_URL)("assessment PostgreSQL lifecycle",()=>{
 const client=postgres(process.env.ASSESSMENT_TEST_DATABASE_URL!,{max:10,prepare:false}),db=drizzle(client);
 const org=createEntityId(),facility=createEntityId(),other=createEntityId(),patient=createEntityId(),user=createEntityId(),membership=createEntityId();
 const actor:Principal={userId:user,membershipId:membership,organizationId:org,email:"fixture@example.test",displayName:"Fixture",role:"MEDICAL",platformRole:"USER"};const context={requestId:"test"};let service:AssessmentWorkflowService,root:string,id:string;let starts=0;const keys:string[]=[];let behavior:"uncertain"|"rejected"|"success"="uncertain";let blockCalculate:(()=>Promise<void>)|undefined;
 beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),"niq-workflow-"));const config=loadApplicationConfig({DATABASE_URL:process.env.ASSESSMENT_TEST_DATABASE_URL,SESSION_SECRET:"test-secret-32-characters-long-enough",SCORING_API_URL:"http://scoring.example.test",SCORING_CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,1).toString("base64"),REPORT_UPLOAD_ROOT:root});
 await db.insert(tables.organizations).values({id:org,legalName:"Fixture",displayName:"Fixture",slug:`fixture-${org.toLowerCase()}`});await db.insert(tables.users).values({id:user,email:`${user}@test.example`,displayName:"Fixture",status:"ACTIVE"});await db.insert(tables.organizationMemberships).values({id:membership,organizationId:org,userId:user,role:"MEDICAL"});await db.insert(tables.facilities).values([{id:facility,organizationId:org,name:"Allowed",code:"A"},{id:other,organizationId:org,name:"Hidden",code:"B"}]);await db.insert(tables.facilityMemberships).values({id:createEntityId(),organizationId:org,organizationMembershipId:membership,facilityId:facility});
 const key=patientDataKey(undefined,config.SESSION_SECRET);await db.insert(tables.patients).values({id:patient,organizationId:org,homeFacilityId:facility,encryptedExternalReference:encryptPatientData("MRN",key),externalReferenceLookupHash:patient,serialNumber:1,dateOfBirth:"1990-01-01",gender:"FEMALE",encryptedProfile:encryptPatientData(JSON.stringify({name:"Fixture Patient",phone:"1234567890"}),key),encryptionKeyVersion:"v1"});const credential=encryptCredential("mock",config.SCORING_CREDENTIAL_ENCRYPTION_KEY!);await db.insert(tables.scoringConnections).values({id:createEntityId(),organizationId:org,deploymentId:createEntityId(),scoringOrganizationId:createEntityId(),encryptedCredential:credential.ciphertext,credentialIv:credential.iv,keyVersion:"v1"});
 service=new AssessmentWorkflowService({db,config,applicationService:new PostgresApplicationService(db,config,{deliver:async()=>{}}),fetcher:async(url,init)=>{const body=JSON.parse(String(init?.body));if(String(url).endsWith("start")){starts++;expect((await db.select().from(tables.assessmentInitializations).where(eq(tables.assessmentInitializations.id,body.assessmentReference)))[0]).toBeDefined();return Response.json({assessmentReference:body.assessmentReference,bindingId:"binding",ruleVersionId:"rule",checksum:"a".repeat(64),version:"FINAL-1",questionnaire:questionnaire()});}keys.push(body.idempotencyKey);if(blockCalculate){const block=blockCalculate;blockCalculate=undefined;await block();}
 if(behavior!=="uncertain"){
 const result={assessmentReference:body.assessmentReference,bindingId:"binding",ruleVersionId:"rule",checksum:"a".repeat(64),version:"FINAL-1",formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:behavior==="success",score:0,classification:{id:"low",label:"Low",interpretation:""},components:questionnaire().sections.flatMap(section=>section.fields.map(f=>({id:f.id,sectionId:section.id,label:f.label,points:null,status:"unanswered"}))),answerCoverage:{totalEntries:19,answeredEntries:0,unansweredEntries:19,pendingEntries:0,allUnanswered:true},derived:{weightLossPercent:null,proteinAdequacy:null},riskStatus:"CLIENT_CONFIRMED",clinicalUsePermitted:true,interventions:{status:"NOT_APPLICABLE"},issues:behavior==="rejected"?[{path:"answers.height_cm",code:"INVALID",message:"Correct answer"}]:[],calculatedAt:new Date().toISOString()};
 return behavior==="success"?Response.json({result:{...result,resultReference:"test-result"},idempotencyKey:body.idempotencyKey}):Response.json({error:"INVALID_ASSESSMENT_ANSWERS",result},{status:400});
 }throw new Error("uncertain transport");}});
 });
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
   await db.insert(tables.organizationMemberships).values({id:secondMember,organizationId:secondOrg,userId:user,role:"MEDICAL"});
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
 test("report digest validation successful replay and download",async()=>{let record=await service.read(actor,org,id);record=await service.reports.edit(actor,org,id,{revision:record.revision,label:"Report",purpose:"Baseline",datePrecision:"MONTH",year:2026,month:9,day:null},context);const report=record.reports[0]!,bytes=new TextEncoder().encode("%PDF-1.7\nfixture");const input={revision:record.revision,uploadKey:"upload-key-at-least-16",filename:"report.pdf",mediaType:"application/pdf" as const,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),body:new Response(bytes).body!};record=await service.reports.upload(actor,org,id,report.id,input,context);expect(record.reports[0]!.files[0]!.status).toBe("READY");expect((await service.reports.upload(actor,org,id,report.id,{...input,body:new Response(bytes).body!},context)).revision).toBe(record.revision);await expect(service.reports.upload(actor,org,id,report.id,{...input,sha256:"0".repeat(64),body:new Response(bytes).body!},context)).rejects.toMatchObject({code:"CONFLICT"});const file=await service.reports.download(actor,org,id,report.id,record.reports[0]!.files[0]!.id);expect(await new Response(file.stream).text()).toContain("fixture");});
 test("pending upload blocks submission; cancellation fences late completion",async()=>{
   let record=await service.read(actor,org,id);const report=record.reports[0]!;const bytes=new TextEncoder().encode("%PDF-1.7\nlate");let controller!:ReadableStreamDefaultController<Uint8Array>;
   const body=new ReadableStream<Uint8Array>({start(c){controller=c;}});
   const pending=service.reports.upload(actor,org,id,report.id,{revision:record.revision,uploadKey:"pending-upload-key-1234",filename:"late.pdf",mediaType:"application/pdf",size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),body},context);
   // Observe reservation before driving the test transfer; attach rejection handler immediately.
   const outcome=pending.then(()=>"ready",()=>"cancelled");let file:typeof tables.assessmentFiles.$inferSelect|undefined;
   for(let n=0;n<100&&!file;n++){file=(await db.select().from(tables.assessmentFiles).where(eq(tables.assessmentFiles.uploadKey,"pending-upload-key-1234"))).find(f=>f.assessmentId===id);if(!file)await Bun.sleep(5);}
   expect(file?.status).toBe("PENDING");
   await expect(service.submit(actor,org,id,record.revision,context)).rejects.toMatchObject({code:"CONFLICT"});
   record=await service.reports.remove(actor,org,id,report.id,record.revision,context,file!.id);
   controller.enqueue(bytes);controller.close();expect(await outcome).toBe("cancelled");
   expect((await service.read(actor,org,id)).reports[0]!.files).toHaveLength(1);
 });
 test("uncertain scoring freezes edits and preserves retry key",async()=>{let record=await service.read(actor,org,id);record=await service.submit(actor,org,id,record.revision,context);expect(record.status).toBe("SCORING_UNAVAILABLE");await expect(service.save(actor,org,id,{revision:record.revision,answers:{}},context)).rejects.toMatchObject({code:"CONFLICT"});await expect(service.retrySubmission(actor,org,id,context)).rejects.toMatchObject({code:"CONFLICT"});await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,id));await service.retrySubmission(actor,org,id,context);expect(keys).toHaveLength(2);expect(new Set(keys).size).toBe(1);});
 test("connection change preserves frozen answers and requires reconciliation",async()=>{
 const [original]=await db.select().from(tables.scoringConnections).where(eq(tables.scoringConnections.organizationId,org));
 await db.update(tables.scoringConnections).set({deploymentId:createEntityId()}).where(eq(tables.scoringConnections.organizationId,org));
 await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,id));
 const record=await service.retrySubmission(actor,org,id,context);expect(record.status).toBe("SCORING_UNAVAILABLE");expect(record.submission?.status).toBe("RECONCILIATION_REQUIRED");expect(keys).toHaveLength(2);
 await db.update(tables.scoringConnections).set({deploymentId:original!.deploymentId}).where(eq(tables.scoringConnections.organizationId,org));
 await service.retrySubmission(actor,org,id,context);expect(keys).toHaveLength(2);
 });
 test("operator same-key rejection reopens only corrected answers and retains frozen files",async()=>{
 behavior="rejected";await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,id));
 let record=await service.retrySubmission({...actor,role:"ORGANIZATION_ADMIN"},org,id,context,true);expect(record.status).toBe("DRAFT");expect(record.submission?.issues).toEqual([{fieldId:"height_cm",message:"Review this answer before submitting again."}]);expect((await service.read(actor,org,id)).submission?.issues).toEqual(record.submission?.issues ?? []);expect(new Set(keys).size).toBe(1);
 await expect(service.submit(actor,org,id,record.revision,context)).rejects.toMatchObject({code:"CONFLICT"});
 const report=record.reports[0]!,file=report.files[0]!;const [stored]=await db.select().from(tables.assessmentFiles).where(eq(tables.assessmentFiles.id,file.id));
 record=await service.reports.remove(actor,org,id,report.id,record.revision,context);
 const retained=await service.storage!.open({organizationId:org,patientId:patient,assessmentId:id},stored!.objectKey!);expect(await new Response(retained.stream).text()).toContain("fixture");
 record=await service.save(actor,org,id,{revision:record.revision,answers:{...record.answers,height_cm:180}},context);behavior="success";
 record=await service.submit(actor,org,id,record.revision,context);expect(record.status).toBe("SCORED");expect(new Set(keys).size).toBe(2);
 });

 test("expired scoring lease fences a late worker from duplicating results",async()=>{
 const initialized=await service.initialize(actor,org,{patientId:patient,requestKey:"lease-fencing-test-1234"},context);const otherId=initialized.assessmentId!;
 let record=await service.read(actor,org,otherId);record=await service.save(actor,org,otherId,{revision:record.revision,answers:{height_cm:175,current_weight_kg:70}},context);
 behavior="success";let release!:()=>void;blockCalculate=()=>new Promise<void>(resolve=>{release=resolve;});
 const late=service.submit(actor,org,otherId,record.revision,context);
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
 for(const assessmentId of [cooldown,due]){let record=await service.read(actor,org,assessmentId);record=await service.save(actor,org,assessmentId,{revision:record.revision,answers:{height_cm:170,current_weight_kg:70}},context);await service.submit(actor,org,assessmentId,record.revision,context);}
 await db.update(tables.assessmentSubmissions).set({nextAttemptAt:new Date(0)}).where(eq(tables.assessmentSubmissions.assessmentId,due));
 await db.insert(tables.assessmentInitializations).values({id:createEntityId(),organizationId:org,patientId:patient,facilityId:other,creatorId:membership,requestKey:"inaccessible-recovery-12345",connection:{}});
 const before=keys.length;behavior="success";
 await service.recover(actor,org,context);
 expect(keys.length).toBe(before+1);
 expect((await service.read(actor,org,cooldown)).status).toBe("SCORING_UNAVAILABLE");
 expect((await service.read(actor,org,due)).status).toBe("SCORED");
 });

});
