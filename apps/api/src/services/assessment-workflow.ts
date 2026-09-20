import type { ApplicationConfig } from "@niq/application-config";
import { buildAssessmentForm, getAssessmentCompletion, getScoringAssessmentAnswers, validateAssessmentAnswers, type FormAnswers, type AssessmentFormManifest } from "@niq/application-contracts";
import type { AssessmentWorkflow, AssessmentPatient, AssessmentInitialization } from "../../../../packages/contracts/src/assessment-workflow";
import { createEntityId, selectAssessmentHeight } from "@niq/application-domain";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { assessments, assessmentInitializations, assessmentSubmissions, assessmentAnswers, assessmentReports, assessmentFiles, questionnaireDefinitions, scoringConnections, scoringRequests, scoringResults, measurements, patients, auditEvents, facilities } from "../db/schema";
import { decryptCredential } from "../security/credential-encryption";
import { decryptPatientData, encryptPatientData, patientDataKey } from "../security/patient-data";
import { LocalReportStorage } from "../storage/local-report-storage";
import type { ApplicationService, Principal, RequestContext } from "./application";
import { ServiceError } from "./application";
import { facilityAccessCondition } from "./facility-access";
import { requestAssessmentScoringStart, requestAssessmentScoringCalculate, AssessmentScoringRequestError, type AssessmentScoringStart } from "./assessment-scoring";
import { AssessmentReportWorkflow } from "./assessment-workflow-reports";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type WorkflowExecutor = Database | Tx;
type Fetcher=(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>Promise<Response>;
type ConnectionIdentity = { origin: string; deploymentId: string; scoringOrganizationId: string };
export type StoredWorkflow = { binding: AssessmentScoringStart; connection: ConnectionIdentity; manifest: AssessmentFormManifest; patient: AssessmentPatient; answers: FormAnswers; heightSource: {assessmentId:string;recordedAt:string}|null };
export type WorkflowRow = typeof assessments.$inferSelect;
export class AssessmentWorkflowService {
  readonly db: Database; readonly applicationService: ApplicationService; readonly config: ApplicationConfig;
  readonly reports: AssessmentReportWorkflow; readonly storage: LocalReportStorage | null;
  private fetcher?: Fetcher;
  seal(value:unknown):{encrypted:string} {const key=patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY,this.config.SESSION_SECRET);return {encrypted:encryptPatientData(JSON.stringify(value),key).toString("base64")};}
  unseal<T>(value:unknown):T {const encrypted=(value as {encrypted?:string})?.encrypted;if(!encrypted) throw new ServiceError("CONFLICT","Assessment data could not be read.");return JSON.parse(decryptPatientData(Buffer.from(encrypted,"base64"),patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY,this.config.SESSION_SECRET))) as T;}
  constructor(input: {db:Database;applicationService:ApplicationService;config:ApplicationConfig;fetcher?:Fetcher}) {
    this.db=input.db;this.applicationService=input.applicationService;this.config=input.config;this.fetcher=input.fetcher;
    this.storage=input.config.REPORT_UPLOAD_ROOT ? new LocalReportStorage({root:input.config.REPORT_UPLOAD_ROOT,maxFileBytes:input.config.REPORT_MAX_FILE_BYTES}) : null;
    this.reports=new AssessmentReportWorkflow(this);
  }
  async authorize(actor:Principal,organizationId:string,assessmentId:string,executor:WorkflowExecutor=this.db,lock=false):Promise<WorkflowRow> {
    this.clinicalActor(actor,organizationId);
    await this.applicationService.getOrganization(actor,organizationId);
    const query=executor.select().from(assessments).where(and(eq(assessments.id,assessmentId),eq(assessments.organizationId,organizationId),facilityAccessCondition(actor,organizationId,assessments.facilityId)));
    const [row]=await (lock?query.for("update"):query);
    if(!row?.workflow) throw new ServiceError("NOT_FOUND","Assessment not found.");
    await this.applicationService.getPatient(actor,organizationId,row.patientId);
    return row;
  }
  editable(row:WorkflowRow,revision:number) {
    if(row.status!=="DRAFT") throw new ServiceError("CONFLICT","This assessment is no longer editable.");
    if(row.revision!==revision) throw new ServiceError("CONFLICT","This assessment has changed. Reload before saving.",{revision:row.revision});
  }
  async audit(executor:WorkflowExecutor,actor:Principal,context:RequestContext,assessmentId:string,action:string,metadata:Record<string,unknown>={}) {
    await executor.insert(auditEvents).values({id:createEntityId(),organizationId:actor.organizationId,actorMembershipId:actor.membershipId,assessmentId,actorType:"USER",action,resourceType:"ASSESSMENT",resourceId:assessmentId,requestId:context.requestId,metadata});
  }
  private async transport(organizationId:string,context:RequestContext,pinned?:ConnectionIdentity) {
    const [connection]=await this.db.select().from(scoringConnections).where(eq(scoringConnections.organizationId,organizationId));
    if(!connection||!this.config.SCORING_API_URL||!this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY) throw new ServiceError("SCORING_NOT_CONFIGURED","Connect NIQ Scoring before starting an assessment.");
    const identity={origin:new URL(this.config.SCORING_API_URL).origin,deploymentId:connection.deploymentId,scoringOrganizationId:connection.scoringOrganizationId};
    if(pinned&&JSON.stringify(identity)!==JSON.stringify(pinned)) throw new ServiceError("CONFLICT","The scoring connection changed. Restore the original deployment to continue this assessment.");
    return {identity,baseUrl:this.config.SCORING_API_URL,credential:decryptCredential(connection.encryptedCredential,connection.credentialIv,this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY),requestId:context.requestId,timeoutMs:this.config.SCORING_TIMEOUT_MS,fetcher:this.fetcher};
  }
  async initialize(actor:Principal,organizationId:string,input:{patientId:string;requestKey:string},context:RequestContext):Promise<AssessmentInitialization> {
    this.clinicalActor(actor,organizationId);
    const patient=await this.applicationService.getPatient(actor,organizationId,input.patientId) as AssessmentPatient;
    if(!patient.homeFacility) throw new ServiceError("VALIDATION_ERROR","The patient needs an active facility.");
    const [facility]=await this.db.select().from(facilities).where(and(eq(facilities.id,patient.homeFacility.id),eq(facilities.organizationId,organizationId),eq(facilities.status,"ACTIVE")));
    if(!facility) throw new ServiceError("VALIDATION_ERROR","The patient's facility is inactive.");
    const existing=await this.db.select().from(assessmentInitializations).where(and(eq(assessmentInitializations.organizationId,organizationId),eq(assessmentInitializations.creatorId,actor.membershipId),eq(assessmentInitializations.requestKey,input.requestKey)));
    if(existing[0]) {if(existing[0].patientId!==patient.id) throw new ServiceError("CONFLICT","This request key belongs to another patient.");return this.retryInitialization(actor,organizationId,existing[0].id,context);}
    const transport=await this.transport(organizationId,context);
    const id=createEntityId();
    await this.db.insert(assessmentInitializations).values({id,organizationId,patientId:patient.id,facilityId:patient.homeFacility.id,creatorId:actor.membershipId,requestKey:input.requestKey,connection:transport.identity}).onConflictDoNothing();
    const [saved]=await this.db.select().from(assessmentInitializations).where(and(eq(assessmentInitializations.organizationId,organizationId),eq(assessmentInitializations.creatorId,actor.membershipId),eq(assessmentInitializations.requestKey,input.requestKey)));
    if(!saved||saved.patientId!==patient.id) throw new ServiceError("CONFLICT","Initialization request conflict.");
    return this.retryInitialization(actor,organizationId,saved.id,context);
  }
  clinicalActor(actor:Principal,organizationId:string) {
    if(actor.platformRole!=="USER"||actor.organizationId!==organizationId||!['ORGANIZATION_ADMIN','MEDICAL'].includes(actor.role)) throw new ServiceError("FORBIDDEN","A clinical organization membership is required.");
  }
  async getInitialization(actor:Principal,organizationId:string,id:string) {
    this.clinicalActor(actor,organizationId);
    await this.applicationService.getOrganization(actor,organizationId);
    const [row]=await this.db.select().from(assessmentInitializations).where(and(eq(assessmentInitializations.id,id),eq(assessmentInitializations.organizationId,organizationId),facilityAccessCondition(actor,organizationId,assessmentInitializations.facilityId)));
    if(!row) throw new ServiceError("NOT_FOUND","Assessment initialization not found.");
    await this.applicationService.getPatient(actor,organizationId,row.patientId);
    return row;
  }
  async retryInitialization(actor:Principal,organizationId:string,id:string,context:RequestContext):Promise<AssessmentInitialization> {
    this.clinicalActor(actor,organizationId);
    const row=await this.getInitialization(actor,organizationId,id);
    if(row.status==="READY") return initializationDto(row);
    const token=crypto.randomUUID();const now=new Date();
    const [claimed]=await this.db.update(assessmentInitializations).set({leaseToken:token,leaseExpiresAt:new Date(Date.now()+120_000),status:"PENDING",updatedAt:now}).where(and(eq(assessmentInitializations.id,id),sql`(${assessmentInitializations.leaseExpiresAt} is null or ${assessmentInitializations.leaseExpiresAt} < ${now.toISOString()})`,sql`${assessmentInitializations.status} <> 'READY'`)).returning();
    if(!claimed) return initializationDto(row);
    try {
      const transport=await this.transport(organizationId,context,row.connection as ConnectionIdentity);
      const binding=await requestAssessmentScoringStart({...transport,assessmentReference:id});
      const manifest=buildAssessmentForm(binding.questionnaire);
      const patient=await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient;
      const previous=await this.db.select({assessmentId:assessments.id,measurementId:measurements.id,capturedAt:measurements.capturedAt,status:assessments.status,values:measurements.values}).from(measurements).innerJoin(assessments,and(eq(assessments.id,measurements.assessmentId),eq(assessments.organizationId,measurements.organizationId))).where(and(eq(assessments.organizationId,organizationId),eq(assessments.patientId,patient.id),facilityAccessCondition(actor,organizationId,assessments.facilityId))).orderBy(desc(measurements.capturedAt));
      const [homeFacility]=await this.db.select().from(facilities).where(eq(facilities.id,row.facilityId));
      const referenceYear=Number(new Intl.DateTimeFormat("en",{year:"numeric",timeZone:homeFacility?.timezone??"UTC"}).format(row.createdAt));
      const height=selectAssessmentHeight({birthYear:patient.dateOfBirth?Number(patient.dateOfBirth.slice(0,4)):null,referenceYear,assessmentStartedAt:row.createdAt.toISOString(),candidates:previous.map(x=>({...x,capturedAt:x.capturedAt.toISOString(),heightCm:Number((x.values as {encrypted?:string})?.encrypted?this.unseal<Record<string,unknown>>(x.values).height_cm:(x.values as Record<string,unknown>).height_cm)}))});
      const answers=patientAnswers(patient,row.createdAt);
      if(height) answers.height_cm=height.heightCm;
      await this.db.transaction(async tx=>{
        const [current]=await tx.select().from(assessmentInitializations).where(eq(assessmentInitializations.id,id)).for("update");
        if(current?.leaseToken!==token||current.status==="READY") return;
        const definitionId=createEntityId();
        await tx.insert(questionnaireDefinitions).values({id:definitionId,organizationId,scopeKey:organizationId,key:binding.ruleVersionId,version:binding.checksum,schema:binding.questionnaire,checksum:binding.checksum,isPublished:true,publishedAt:now}).onConflictDoNothing();
        const [definition]=await tx.select().from(questionnaireDefinitions).where(and(eq(questionnaireDefinitions.scopeKey,organizationId),eq(questionnaireDefinitions.key,binding.ruleVersionId),eq(questionnaireDefinitions.version,binding.checksum)));
        if(!definition) throw new Error("Questionnaire binding was not saved");
        await tx.insert(assessments).values({id,organizationId,patientId:patient.id,facilityId:row.facilityId,questionnaireDefinitionId:definition.id,questionnaireScopeKey:organizationId,createdByMembershipId:actor.membershipId,workflow:this.seal({binding,connection:transport.identity,manifest,patient,answers,heightSource:height?{assessmentId:height.assessmentId,recordedAt:height.capturedAt}:null} satisfies StoredWorkflow)});
        await tx.update(assessmentInitializations).set({status:"READY",assessmentId:id,leaseToken:null,leaseExpiresAt:null,failureCode:null,updatedAt:new Date()}).where(eq(assessmentInitializations.id,id));
        await this.audit(tx,actor,context,id,"ASSESSMENT_CREATED");
      });
    } catch(error) {
      await this.db.update(assessmentInitializations).set({status:"FAILED",failureCode:error instanceof AssessmentScoringRequestError?error.code:error instanceof ServiceError?error.code:"INITIALIZATION_FAILED",leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(and(eq(assessmentInitializations.id,id),eq(assessmentInitializations.leaseToken,token)));
    }
    return initializationDto(await this.getInitialization(actor,organizationId,id));
  }
  async read(actor:Principal,organizationId:string,id:string):Promise<AssessmentWorkflow> {
    const row=await this.authorize(actor,organizationId,id);
    await this.reports.expire(actor,organizationId,id);
    const state=this.unseal<StoredWorkflow>(row.workflow);
    const patient=row.status==="DRAFT"?await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient:state.patient;
    const answers=row.status==="DRAFT"?{...state.answers,...patientAnswers(patient,row.createdAt)}:state.answers;
    const [submission]=await this.db.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.assessmentId,id),eq(assessmentSubmissions.organizationId,organizationId))).orderBy(desc(assessmentSubmissions.createdAt)).limit(1);
    return {id:row.id,organizationId,patientId:row.patientId,facilityId:row.facilityId,status:row.status,revision:row.revision,patient,answers,manifest:state.manifest,progress:getAssessmentCompletion(state.manifest,answers),reports:await this.reports.list(organizationId,id),reportLimits:{fileBytes:this.config.REPORT_MAX_FILE_BYTES,filesPerReport:this.config.REPORT_MAX_FILES_PER_GROUP,reportsPerAssessment:this.config.REPORT_MAX_GROUPS,assessmentBytes:this.config.REPORT_MAX_ASSESSMENT_BYTES},binding:{version:state.binding.version,checksum:state.binding.checksum},result:submission?.result?this.unseal(submission.result):null,submission:submission?{id:submission.id,status:submission.status,failureCode:submission.failureCode,nextRetryAt:submission.nextAttemptAt?.toISOString()??null}:null,heightSource:state.heightSource,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
  }
  async save(actor:Principal,organizationId:string,id:string,input:{revision:number;answers:FormAnswers},context:RequestContext) {
    this.clinicalActor(actor,organizationId);
    await this.db.transaction(async tx=>{
      const row=await this.authorize(actor,organizationId,id,tx,true);this.editable(row,input.revision);
      const state=this.unseal<StoredWorkflow>(row.workflow);
      const patient=await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient;
      const answers={...input.answers,...patientAnswers(patient,row.createdAt)};
      const errors=validateAssessmentAnswers(state.manifest,answers);
      if(Object.keys(errors).length) throw new ServiceError("VALIDATION_ERROR","Some answers need attention.",{fields:errors});
      await tx.update(assessments).set({workflow:this.seal({...state,answers,patient,heightSource:answers.height_cm===state.answers.height_cm?state.heightSource:null}),revision:row.revision+1,updatedAt:new Date()}).where(eq(assessments.id,id));
      await tx.delete(assessmentAnswers).where(and(eq(assessmentAnswers.organizationId,organizationId),eq(assessmentAnswers.assessmentId,id)));
      await this.audit(tx,actor,context,id,"ASSESSMENT_DRAFT_SAVED",{revision:row.revision+1,changedKeys:Object.keys(answers).filter(key=>JSON.stringify(answers[key])!==JSON.stringify(state.answers[key]))});
      for(const [questionKey,answer] of Object.entries(answers)) await tx.insert(assessmentAnswers).values({id:createEntityId(),organizationId,assessmentId:id,questionKey,answer:this.seal(answer),answeredByMembershipId:actor.membershipId}).onConflictDoUpdate({target:[assessmentAnswers.assessmentId,assessmentAnswers.questionKey],set:{answer:this.seal(answer),answeredByMembershipId:actor.membershipId,updatedAt:new Date()}});
    });
    return this.read(actor,organizationId,id);
  }
  async submit(actor:Principal,organizationId:string,id:string,revision:number,context:RequestContext) {
    this.clinicalActor(actor,organizationId);
    await this.db.transaction(async tx=>{
      const row=await this.authorize(actor,organizationId,id,tx,true);
      if(row.status!=="DRAFT") return; // Response-loss replay uses the already frozen submission.
      this.editable(row,revision);
      const state=this.unseal<StoredWorkflow>(row.workflow);
      const patient=await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient;
      const answers={...state.answers,...patientAnswers(patient,row.createdAt)};
      const errors=validateAssessmentAnswers(state.manifest,answers,{requireComplete:true});
      if(Object.keys(errors).length) throw new ServiceError("VALIDATION_ERROR","Complete the required answers before submitting.",{fields:errors});
      const manifest=await this.reports.submissionManifest(tx,organizationId,id);
      const [previous]=await tx.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,organizationId),eq(assessmentSubmissions.assessmentId,id))).orderBy(desc(assessmentSubmissions.createdAt)).limit(1);
      if(previous?.status==="REJECTED"&&JSON.stringify(this.unseal<StoredWorkflow>(previous.snapshot).answers)===JSON.stringify(answers)) throw new ServiceError("CONFLICT","Correct the rejected answers before submitting again.");
      const submissionId=createEntityId();
      const frozen={...state,patient,answers};
      await tx.insert(assessmentSubmissions).values({id:submissionId,organizationId,assessmentId:id,revision:row.revision,snapshot:this.seal({...frozen,reports:manifest}),idempotencyKey:submissionId});
      await tx.insert(scoringRequests).values({id:submissionId,organizationId,assessmentId:id,idempotencyKey:submissionId,requestedVersion:state.binding.version});
      await tx.update(assessments).set({status:"SCORING_PENDING",workflow:this.seal(frozen),revision:row.revision+1,updatedAt:new Date()}).where(eq(assessments.id,id));
      await this.audit(tx,actor,context,id,"ASSESSMENT_SUBMITTED",{submissionId});
    });
    return this.retrySubmission(actor,organizationId,id,context);
  }
  async retrySubmission(actor:Principal,organizationId:string,id:string,context:RequestContext,operator=false) {
    this.clinicalActor(actor,organizationId);if(operator&&actor.role!=="ORGANIZATION_ADMIN")throw new ServiceError("FORBIDDEN","An organization administrator must reconcile this request.");await this.authorize(actor,organizationId,id);
    const token=crypto.randomUUID();const now=new Date();
    const [submission]=await this.db.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,organizationId),eq(assessmentSubmissions.assessmentId,id))).orderBy(desc(assessmentSubmissions.createdAt)).limit(1);
    if(!submission) throw new ServiceError("CONFLICT","Submit the assessment first.");
    if(["SUCCEEDED","REJECTED"].includes(submission.status)||(submission.status==="RECONCILIATION_REQUIRED"&&!operator)) return this.read(actor,organizationId,id);
    if(submission.nextAttemptAt&&submission.nextAttemptAt.getTime()>Date.now()) throw new ServiceError("CONFLICT","Wait before checking this scoring request again.",{retryAt:submission.nextAttemptAt.toISOString()});
    const [claimed]=await this.db.update(assessmentSubmissions).set({leaseToken:token,leaseExpiresAt:new Date(Date.now()+120_000),status:"PENDING",attemptCount:sql`${assessmentSubmissions.attemptCount}+1`,updatedAt:now}).where(and(eq(assessmentSubmissions.id,submission.id),sql`(${assessmentSubmissions.leaseExpiresAt} is null or ${assessmentSubmissions.leaseExpiresAt}<${now.toISOString()})`,sql`${assessmentSubmissions.status} not in ('SUCCEEDED','REJECTED')`,sql`(${assessmentSubmissions.nextAttemptAt} is null or ${assessmentSubmissions.nextAttemptAt} <= ${now.toISOString()})`,operator?undefined:sql`${assessmentSubmissions.status} <> 'RECONCILIATION_REQUIRED'`)).returning();
    if(!claimed) return this.read(actor,organizationId,id);
    const snapshot=this.unseal<StoredWorkflow>(submission.snapshot);
    try {
      const transport=await this.transport(organizationId,context,snapshot.connection);
      const calculated=await requestAssessmentScoringCalculate({...transport,binding:snapshot.binding,idempotencyKey:submission.idempotencyKey,answers:getScoringAssessmentAnswers(snapshot.manifest,snapshot.answers)});
      await this.db.transaction(async tx=>{
        const [live]=await tx.select().from(assessmentSubmissions).where(eq(assessmentSubmissions.id,submission.id)).for("update");
        if(live?.leaseToken!==token) return;
        await tx.insert(scoringResults).values({id:createEntityId(),organizationId,assessmentId:id,scoringRequestId:submission.id,scoringVersion:calculated.result.version,ruleChecksum:calculated.result.checksum,result:this.seal(calculated.result),calculatedAt:new Date(calculated.result.calculatedAt)}).onConflictDoNothing();
        await tx.update(assessmentSubmissions).set({status:"SUCCEEDED",result:this.seal(calculated.result),failureCode:null,leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(eq(assessmentSubmissions.id,submission.id));
        await tx.update(scoringRequests).set({status:"SUCCEEDED",completedAt:new Date(),updatedAt:new Date()}).where(eq(scoringRequests.id,submission.id));
        await tx.update(assessments).set({status:"SCORED",completedAt:new Date(),updatedAt:new Date()}).where(eq(assessments.id,id));
        await tx.insert(measurements).values({id:createEntityId(),organizationId,assessmentId:id,provenance:snapshot.heightSource?"REUSED_PREVIOUS":"MANUAL",values:this.seal({height_cm:snapshot.answers.height_cm,current_weight_kg:snapshot.answers.current_weight_kg}),capturedAt:submission.createdAt,recordedByMembershipId:actor.membershipId});
        await this.audit(tx,actor,context,id,"ASSESSMENT_SCORED",{submissionId:submission.id});
      });
    } catch(error) {
      const rejected=error instanceof AssessmentScoringRequestError&&error.kind==="rejected";
      const code=error instanceof AssessmentScoringRequestError?error.code:error instanceof ServiceError?error.code:"SCORING_UNAVAILABLE";
      await this.db.transaction(async tx=>{
        const [live]=await tx.select().from(assessmentSubmissions).where(eq(assessmentSubmissions.id,submission.id)).for("update");
        if(live?.leaseToken!==token) return;
        await tx.update(assessmentSubmissions).set({status:rejected?"REJECTED":claimed.attemptCount>=3?"RECONCILIATION_REQUIRED":"UNAVAILABLE",failureCode:!rejected&&claimed.attemptCount>=3?"RECONCILIATION_REQUIRED":code,leaseToken:null,leaseExpiresAt:null,nextAttemptAt:rejected?null:new Date(Date.now()+(claimed.attemptCount>=3?60_000:5_000)),updatedAt:new Date()}).where(eq(assessmentSubmissions.id,submission.id));
        await tx.update(scoringRequests).set({status:rejected?"FAILED":"UNAVAILABLE",failureCode:code,updatedAt:new Date()}).where(eq(scoringRequests.id,submission.id));
        await tx.update(assessments).set({status:rejected?"DRAFT":"SCORING_UNAVAILABLE",updatedAt:new Date()}).where(eq(assessments.id,id));
        await this.audit(tx,actor,context,id,"ASSESSMENT_SCORING_FAILED",{submissionId:submission.id,code});
      });
    }
    return this.read(actor,organizationId,id);
  }
  /** Authorized recovery is bounded; remote calls always reuse persisted references and keys. */
  async recover(actor:Principal,organizationId:string,context:RequestContext) {
    this.clinicalActor(actor,organizationId);
    const pending=await this.db.select().from(assessmentInitializations).where(and(eq(assessmentInitializations.organizationId,organizationId),eq(assessmentInitializations.creatorId,actor.membershipId),sql`${assessmentInitializations.status}<>'READY'`)).limit(10);
    const initializations=[];
    for(const item of pending) initializations.push(await this.retryInitialization(actor,organizationId,item.id,context));
    const rows=await this.db.select().from(assessments).where(and(eq(assessments.organizationId,organizationId),facilityAccessCondition(actor,organizationId,assessments.facilityId),sql`${assessments.status} in ('SCORING_PENDING','SCORING_UNAVAILABLE','DRAFT')`)).orderBy(assessments.updatedAt).limit(10);
    for(const row of rows) {
      if(!row.workflow) continue;
      await this.reports.expire(actor,organizationId,row.id);
      if(row.status!=="DRAFT") await this.retrySubmission(actor,organizationId,row.id,context);
      await this.reports.cleanup(actor,organizationId,row.id);
    }
    return {initializations,checkedAssessments:rows.length};
  }
  async updateContact(actor:Principal,organizationId:string,patientId:string,phone:string,context:RequestContext={requestId:"patient-contact-update"}) {
    this.clinicalActor(actor,organizationId);await this.applicationService.getPatient(actor,organizationId,patientId);
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(patients).where(and(eq(patients.id,patientId),eq(patients.organizationId,organizationId),facilityAccessCondition(actor,organizationId,patients.homeFacilityId))).for("update");
      if(!row) throw new ServiceError("NOT_FOUND","Patient not found.");
      const key=patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY,this.config.SESSION_SECRET);
      const profile=JSON.parse(decryptPatientData(row.encryptedProfile,key));
      await tx.update(patients).set({encryptedProfile:encryptPatientData(JSON.stringify({...profile,phone}),key),updatedAt:new Date()}).where(eq(patients.id,patientId));
      await tx.insert(auditEvents).values({id:createEntityId(),organizationId,actorMembershipId:actor.membershipId,actorType:"USER",action:"PATIENT_CONTACT_UPDATED",resourceType:"PATIENT",resourceId:patientId,requestId:context.requestId,metadata:{changedKeys:["phone"]}});
    });
    return this.applicationService.getPatient(actor,organizationId,patientId);
  }
}
export function patientAnswers(patient:AssessmentPatient,started:Date):FormAnswers {
  const born=new Date(`${patient.dateOfBirth}T00:00:00Z`);let age=started.getUTCFullYear()-born.getUTCFullYear();
  if(started.getUTCMonth()<born.getUTCMonth()||(started.getUTCMonth()===born.getUTCMonth()&&started.getUTCDate()<born.getUTCDate())) age--;
  return {patient_name:patient.displayName,age:Number.isFinite(age)?age:null,gender:patient.gender,contact:patient.phone??""};
}
function initializationDto(row:typeof assessmentInitializations.$inferSelect):AssessmentInitialization {return {id:row.id,status:row.status,assessmentId:row.assessmentId,failureCode:row.failureCode};}
