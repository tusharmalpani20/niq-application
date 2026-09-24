import { appendAssessmentHistory, assertCorrectionOwner, reviewState } from "./clinical-review-state";
import type { ApplicationConfig } from "@niq/application-config";
import { hasPermission, type Permission, formatAssessmentReference, clearInactiveAssessmentAnswers, buildAssessmentForm, getAssessmentCompletion, getScoringAssessmentAnswers, validateAssessmentAnswers, type FormAnswers, type AssessmentFormManifest } from "@niq/application-contracts";
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
export type StoredWorkflow = { cycle?: number; binding: AssessmentScoringStart; connection: ConnectionIdentity; manifest: AssessmentFormManifest; patient: AssessmentPatient; answers: FormAnswers; heightReferenceYear?: number; heightSource: {assessmentId:string;recordedAt:string}|null };
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
  editable(row:WorkflowRow,revision:number,actor?:Principal) {
    if(actor) assertCorrectionOwner(this,row,actor);
    else if(reviewState(this,row).correctionPerson) throw new ServiceError("FORBIDDEN","Correction ownership is required.");
    if(row.status!=="DRAFT") throw new ServiceError("CONFLICT","This assessment is no longer editable.");
    if(row.revision!==revision) throw new ServiceError("CONFLICT","This assessment has changed. Reload before saving.",{revision:row.revision});
  }
  async audit(executor:WorkflowExecutor,actor:Principal,context:RequestContext,assessmentId:string,action:string,metadata:Record<string,unknown>={}) {
    await executor.insert(auditEvents).values({id:createEntityId(),organizationId:actor.organizationId,actorMembershipId:actor.membershipId,assessmentId,actorType:"USER",action,resourceType:"ASSESSMENT",resourceId:assessmentId,requestId:context.requestId,metadata});
  }
  async transport(organizationId:string,context:RequestContext,pinned?:ConnectionIdentity) {
    const [connection]=await this.db.select().from(scoringConnections).where(eq(scoringConnections.organizationId,organizationId));
    if(!connection||!this.config.SCORING_API_URL||!this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY) throw new ServiceError("SCORING_NOT_CONFIGURED","Connect NIQ Scoring before starting an assessment.");
    const identity={origin:new URL(this.config.SCORING_API_URL).origin,deploymentId:connection.deploymentId,scoringOrganizationId:connection.scoringOrganizationId};
    if(pinned&&JSON.stringify(identity)!==JSON.stringify(pinned)) throw new ServiceError("CONFLICT","The scoring connection changed. Restore the original deployment to continue this assessment.");
    return {identity,baseUrl:this.config.SCORING_API_URL,credential:decryptCredential(connection.encryptedCredential,connection.credentialIv,this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY),requestId:context.requestId,timeoutMs:this.config.SCORING_TIMEOUT_MS,fetcher:this.fetcher};
  }
  async initialize(actor:Principal,organizationId:string,input:{patientId:string;requestKey:string},context:RequestContext):Promise<AssessmentInitialization> {
    this.clinicalActor(actor,organizationId,"assessments.edit");
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
  clinicalActor(actor:Principal,organizationId:string,permission:Permission="assessments.read") {
    if(actor.platformRole!=="USER"||actor.organizationId!==organizationId||!hasPermission(actor.role,permission)) throw new ServiceError("FORBIDDEN","A clinical organization membership is required.");
  }
  async getInitialization(actor:Principal,organizationId:string,id:string) {
    this.clinicalActor(actor,organizationId);
    await this.applicationService.getOrganization(actor,organizationId);
    const [row]=await this.db.select().from(assessmentInitializations).where(and(eq(assessmentInitializations.id,id),eq(assessmentInitializations.organizationId,organizationId),facilityAccessCondition(actor,organizationId,assessmentInitializations.facilityId)));
    if(!row) throw new ServiceError("NOT_FOUND","Assessment initialization not found.");
    await this.applicationService.getPatient(actor,organizationId,row.patientId);
    return row;
  }
  async initializationDto(row:typeof assessmentInitializations.$inferSelect):Promise<AssessmentInitialization> {
    const [assessment] = row.assessmentId ? await this.db.select({serialNumber:assessments.serialNumber}).from(assessments).where(and(eq(assessments.id,row.assessmentId),eq(assessments.organizationId,row.organizationId))) : [];
    return {...initializationDto(row),assessmentReference:assessment?formatAssessmentReference(assessment.serialNumber):null};
  }
  async retryInitialization(actor:Principal,organizationId:string,id:string,context:RequestContext):Promise<AssessmentInitialization> {
    this.clinicalActor(actor,organizationId,"assessments.edit");
    const row=await this.getInitialization(actor,organizationId,id);
    if(row.status==="READY") return this.initializationDto(row);
    const token=crypto.randomUUID();const now=new Date();
    const [claimed]=await this.db.update(assessmentInitializations).set({leaseToken:token,leaseExpiresAt:new Date(Date.now()+120_000),status:"PENDING",updatedAt:now}).where(and(eq(assessmentInitializations.id,id),sql`(${assessmentInitializations.leaseExpiresAt} is null or ${assessmentInitializations.leaseExpiresAt} < ${now.toISOString()})`,sql`${assessmentInitializations.status} <> 'READY'`)).returning();
    if(!claimed) return this.initializationDto(row);
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
        await tx.insert(assessments).values({id,organizationId,patientId:patient.id,facilityId:row.facilityId,questionnaireDefinitionId:definition.id,questionnaireScopeKey:organizationId,createdByMembershipId:actor.membershipId,createdAt:row.createdAt,workflow:this.seal({binding,connection:transport.identity,manifest,patient,answers,heightReferenceYear:referenceYear,heightSource:height?{assessmentId:height.assessmentId,recordedAt:height.capturedAt}:null} satisfies StoredWorkflow)});
        await tx.update(assessmentInitializations).set({status:"READY",assessmentId:id,leaseToken:null,leaseExpiresAt:null,failureCode:null,updatedAt:new Date()}).where(eq(assessmentInitializations.id,id));
        const [created] = await tx.select().from(assessments).where(eq(assessments.id,id));
        await appendAssessmentHistory(this,tx,created!,actor,"CREATED",{workflow:this.unseal(created!.workflow)});
        await this.audit(tx,actor,context,id,"ASSESSMENT_CREATED");
      });
    } catch(error) {
      await this.db.update(assessmentInitializations).set({status:"FAILED",failureCode:error instanceof AssessmentScoringRequestError?error.code:error instanceof ServiceError?error.code:"INITIALIZATION_FAILED",leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(and(eq(assessmentInitializations.id,id),eq(assessmentInitializations.leaseToken,token)));
    }
    return this.initializationDto(await this.getInitialization(actor,organizationId,id));
  }
  async read(actor:Principal,organizationId:string,id:string):Promise<AssessmentWorkflow> {
    // Resolve human references only for reads; all writes keep the internal immutable ID.
    if (id.startsWith("ASM-")) {
      const serial = Number(id.slice(4));
      if (!Number.isInteger(serial) || serial < 1 || serial > 2147483647 || formatAssessmentReference(serial) !== id) throw new ServiceError("NOT_FOUND", "Assessment not found.");
      this.clinicalActor(actor, organizationId);
      const [match] = await this.db.select({id: assessments.id}).from(assessments).where(and(eq(assessments.organizationId, organizationId), eq(assessments.serialNumber, serial), facilityAccessCondition(actor,organizationId,assessments.facilityId)));
      if (!match) throw new ServiceError("NOT_FOUND", "Assessment not found.");
      id = match.id;
    }
    const row=await this.authorize(actor,organizationId,id);
    await this.reports.expire(actor,organizationId,id);
    const state=this.unseal<StoredWorkflow>(row.workflow);
    const patient=row.status==="DRAFT"?await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient:state.patient;
    const answers=row.status==="DRAFT"?clearInactiveAssessmentAnswers(state.manifest,{...state.answers,...patientAnswers(patient,row.createdAt)}):state.answers;
    const [submission]=row.currentSubmissionId ? await this.db.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.id,row.currentSubmissionId),eq(assessmentSubmissions.assessmentId,id),eq(assessmentSubmissions.organizationId,organizationId))) : [];
    return {id:row.id,reference:formatAssessmentReference(row.serialNumber),serialNumber:row.serialNumber,organizationId,patientId:row.patientId,facilityId:row.facilityId,status:row.status,revision:row.revision,canEditDraft:row.status === "DRAFT" && hasPermission(actor.role,"assessments.edit") && (!reviewState(this,row).correctionPerson || reviewState(this,row).correctionPerson!.membershipId === actor.membershipId),patient,answers,manifest:state.manifest,progress:getAssessmentCompletion(state.manifest,answers),reports:await this.reports.list(organizationId,id),reportLimits:{fileBytes:this.config.REPORT_MAX_FILE_BYTES,filesPerReport:this.config.REPORT_MAX_FILES_PER_GROUP,reportsPerAssessment:this.config.REPORT_MAX_GROUPS,assessmentBytes:this.config.REPORT_MAX_ASSESSMENT_BYTES},binding:{version:state.binding.version,checksum:state.binding.checksum},result:submission?.result?this.unseal(submission.result):null,submission:submission?{id:submission.id,status:submission.status,failureCode:submission.failureCode,nextRetryAt:submission.nextAttemptAt?.toISOString()??null,issues:submission.failureIssues?this.unseal(submission.failureIssues):[]}:null,heightSource:state.heightSource,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
  }
  async save(actor:Principal,organizationId:string,id:string,input:{revision:number;answers:FormAnswers},context:RequestContext) {
    this.clinicalActor(actor,organizationId,"assessments.edit");
    await this.db.transaction(async tx=>{
      const row=await this.authorize(actor,organizationId,id,tx,true);this.editable(row,input.revision,actor);
      const state=this.unseal<StoredWorkflow>(row.workflow);
      const patient=await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient;
      const answers=clearInactiveAssessmentAnswers(state.manifest,{...input.answers,...patientAnswers(patient,row.createdAt)});
      const errors=validateAssessmentAnswers(state.manifest,answers);
      if(Object.keys(errors).length) throw new ServiceError("VALIDATION_ERROR","Some answers need attention.",{fields:errors});
      await tx.update(assessments).set({workflow:this.seal({...state,answers,patient,heightSource:answers.height_cm===state.answers.height_cm?state.heightSource:null}),revision:row.revision+1,updatedAt:new Date()}).where(eq(assessments.id,id));
      await appendAssessmentHistory(this,tx,{...row,revision:row.revision+1},actor,"DRAFT_SAVED",{before:state,after:{...state,answers,patient,heightSource:answers.height_cm===state.answers.height_cm?state.heightSource:null}});
      await tx.delete(assessmentAnswers).where(and(eq(assessmentAnswers.organizationId,organizationId),eq(assessmentAnswers.assessmentId,id)));
      await this.audit(tx,actor,context,id,"ASSESSMENT_DRAFT_SAVED",{revision:row.revision+1,changedKeys:[...new Set([...Object.keys(state.answers),...Object.keys(answers)])].filter(key=>JSON.stringify(answers[key])!==JSON.stringify(state.answers[key]))});
      for(const [questionKey,answer] of Object.entries(answers)) await tx.insert(assessmentAnswers).values({id:createEntityId(),organizationId,assessmentId:id,questionKey,answer:this.seal(answer),answeredByMembershipId:actor.membershipId}).onConflictDoUpdate({target:[assessmentAnswers.assessmentId,assessmentAnswers.questionKey],set:{answer:this.seal(answer),answeredByMembershipId:actor.membershipId,updatedAt:new Date()}});
    });
    return this.read(actor,organizationId,id);
  }
  async submit(actor:Principal,organizationId:string,id:string,revision:number,context:RequestContext) {
    this.clinicalActor(actor,organizationId,"assessments.submit");
    await this.db.transaction(async tx=>{
      const row=await this.authorize(actor,organizationId,id,tx,true);
      assertCorrectionOwner(this,row,actor);
      if(row.status!=="DRAFT") return; // Response-loss replay uses the already frozen submission.
      this.editable(row,revision,actor);
      const state=this.unseal<StoredWorkflow>(row.workflow);
      const patient=await this.applicationService.getPatient(actor,organizationId,row.patientId) as AssessmentPatient;
      const answers={...state.answers,...patientAnswers(patient,row.createdAt)};
      const errors=validateAssessmentAnswers(state.manifest,answers,{requireComplete:true});
      if(Object.keys(errors).length) throw new ServiceError("VALIDATION_ERROR","Complete the required answers before submitting.",{fields:errors});
      const manifest=await this.reports.submissionManifest(tx,organizationId,id);
      const submissionId=createEntityId();
      const frozen={...state,patient,answers,cycle:row.cycle};
      await tx.insert(assessmentSubmissions).values({id:submissionId,organizationId,assessmentId:id,revision:row.revision,snapshot:this.seal({...frozen,reports:manifest}),idempotencyKey:submissionId});
      await tx.insert(scoringRequests).values({id:submissionId,organizationId,assessmentId:id,idempotencyKey:submissionId,requestedVersion:state.binding.version});
      await tx.update(assessments).set({status:"SCORING_PENDING",currentSubmissionId:submissionId,workflow:this.seal(frozen),revision:row.revision+1,updatedAt:new Date()}).where(eq(assessments.id,id));
      await appendAssessmentHistory(this,tx,{...row,revision:row.revision+1},actor,"SCORING_SUBMITTED",{submissionId,workflow:frozen,reports:manifest});
      await this.audit(tx,actor,context,id,"ASSESSMENT_SUBMITTED",{submissionId});
    });
    return this.retrySubmission(actor,organizationId,id,context);
  }
  async retrySubmission(actor:Principal,organizationId:string,id:string,context:RequestContext,operator=false) {
    this.clinicalActor(actor,organizationId,"assessments.submit");if(operator&&!hasPermission(actor.role,"assessments.reconcile"))throw new ServiceError("FORBIDDEN","An organization administrator must reconcile this request.");const assessment=await this.authorize(actor,organizationId,id);
    if(!operator) assertCorrectionOwner(this,assessment,actor);
    const token=crypto.randomUUID();const now=new Date();
    const [submission]=assessment.currentSubmissionId ? await this.db.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.id,assessment.currentSubmissionId),eq(assessmentSubmissions.organizationId,organizationId),eq(assessmentSubmissions.assessmentId,id))) : [];
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
        const [current]=await tx.select().from(assessments).where(and(eq(assessments.id,id),eq(assessments.organizationId,organizationId))).for("update");
        if(!current || current.currentSubmissionId!==submission.id || current.cycle!==(snapshot.cycle??0) || !["SCORING_PENDING","SCORING_UNAVAILABLE"].includes(current.status)) return;
        const [live]=await tx.select().from(assessmentSubmissions).where(eq(assessmentSubmissions.id,submission.id)).for("update");
        if(live?.leaseToken!==token) return;
        await tx.insert(scoringResults).values({id:createEntityId(),organizationId,assessmentId:id,scoringRequestId:submission.id,scoringVersion:calculated.result.version,ruleChecksum:calculated.result.checksum,result:this.seal(calculated.result),calculatedAt:new Date(calculated.result.calculatedAt)}).onConflictDoNothing();
        await tx.update(assessmentSubmissions).set({status:"SUCCEEDED",result:this.seal(calculated.result),failureCode:null,failureIssues:null,leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(eq(assessmentSubmissions.id,submission.id));
        await tx.update(scoringRequests).set({status:"SUCCEEDED",completedAt:new Date(),updatedAt:new Date()}).where(eq(scoringRequests.id,submission.id));
        await tx.update(assessments).set({status:"SCORED",scoredAt:new Date(),updatedAt:new Date()}).where(eq(assessments.id,id));
        await tx.insert(measurements).values([
          {id:createEntityId(),organizationId,assessmentId:id,provenance:snapshot.heightSource?"REUSED_PREVIOUS":"MANUAL",values:this.seal({height_cm:snapshot.answers.height_cm,...(snapshot.heightSource?{sourceAssessmentId:snapshot.heightSource.assessmentId,sourceRecordedAt:snapshot.heightSource.recordedAt}:{})}),capturedAt:submission.createdAt,recordedByMembershipId:actor.membershipId},
          {id:createEntityId(),organizationId,assessmentId:id,provenance:"MANUAL",values:this.seal({current_weight_kg:snapshot.answers.current_weight_kg}),capturedAt:submission.createdAt,recordedByMembershipId:actor.membershipId},
        ]);
        await appendAssessmentHistory(this,tx,current,actor,"SCORED",{submissionId:submission.id,result:calculated.result});
        await this.audit(tx,actor,context,id,"ASSESSMENT_SCORED",{submissionId:submission.id});
      });
    } catch(error) {
      const rejected=error instanceof AssessmentScoringRequestError&&error.kind==="rejected";
      const code=error instanceof AssessmentScoringRequestError?error.code:error instanceof ServiceError?error.code:"SCORING_UNAVAILABLE";
      await this.db.transaction(async tx=>{
        const [current]=await tx.select().from(assessments).where(and(eq(assessments.id,id),eq(assessments.organizationId,organizationId))).for("update");
        if(!current || current.currentSubmissionId!==submission.id || current.cycle!==(snapshot.cycle??0) || !["SCORING_PENDING","SCORING_UNAVAILABLE"].includes(current.status)) return;
        const [live]=await tx.select().from(assessmentSubmissions).where(eq(assessmentSubmissions.id,submission.id)).for("update");
        if(live?.leaseToken!==token) return;
        await tx.update(assessmentSubmissions).set({status:rejected?"REJECTED":claimed.attemptCount>=3?"RECONCILIATION_REQUIRED":"UNAVAILABLE",failureCode:!rejected&&claimed.attemptCount>=3?"RECONCILIATION_REQUIRED":code,failureIssues:rejected?this.seal(assessmentRejectionIssues(snapshot.manifest,error.issues)):null,leaseToken:null,leaseExpiresAt:null,nextAttemptAt:rejected?null:new Date(Date.now()+(claimed.attemptCount>=3?60_000:5_000)),updatedAt:new Date()}).where(eq(assessmentSubmissions.id,submission.id));
        await tx.update(scoringRequests).set({status:rejected?"FAILED":"UNAVAILABLE",failureCode:code,updatedAt:new Date()}).where(eq(scoringRequests.id,submission.id));
        await tx.update(assessments).set({status:rejected?"DRAFT":"SCORING_UNAVAILABLE",updatedAt:new Date()}).where(eq(assessments.id,id));
        await appendAssessmentHistory(this,tx,current,actor,"SCORING_FAILED",{submissionId:submission.id,code,rejected});
        await this.audit(tx,actor,context,id,"ASSESSMENT_SCORING_FAILED",{submissionId:submission.id,code});
      });
    }
    return this.read(actor,organizationId,id);
  }
  /** Authorized recovery is bounded; remote calls always reuse persisted references and keys. */
  async recover(actor:Principal,organizationId:string,context:RequestContext) {
    this.clinicalActor(actor,organizationId,"assessments.submit");
    await this.applicationService.getOrganization(actor,organizationId);
    const now=new Date().toISOString();
    const pending=await this.db.select().from(assessmentInitializations).where(and(
      eq(assessmentInitializations.organizationId,organizationId),eq(assessmentInitializations.creatorId,actor.membershipId),
      facilityAccessCondition(actor,organizationId,assessmentInitializations.facilityId),
      sql`${assessmentInitializations.status}<>'READY'`,
      sql`(${assessmentInitializations.leaseExpiresAt} is null or ${assessmentInitializations.leaseExpiresAt}<${now})`,
    )).orderBy(assessmentInitializations.updatedAt).limit(10);
    const initializations:AssessmentInitialization[]=[];
    let skippedResources=0;
    // A changed revision, lease, or access assignment affects one item, not the entire batch.
    const attempt=async(work:()=>Promise<unknown>)=>{
      try {await work();} catch(error) {
        if(!(error instanceof ServiceError)||!['CONFLICT','NOT_FOUND','FORBIDDEN'].includes(error.code)) throw error;
        skippedResources++;
      }
    };
    for(const item of pending) await attempt(async()=>{initializations.push(await this.retryInitialization(actor,organizationId,item.id,context));});
    const rows=await this.db.select().from(assessments).where(and(
      eq(assessments.organizationId,organizationId),facilityAccessCondition(actor,organizationId,assessments.facilityId),
      sql`${assessments.workflow} is not null`,
      sql`(${assessments.status}='DRAFT' or (${assessments.status} in ('SCORING_PENDING','SCORING_UNAVAILABLE') and exists (
        select 1 from assessment_submissions s where s.assessment_id=${assessments.id}
          and s.organization_id=${organizationId} and s.status in ('PENDING','UNAVAILABLE')
          and (s.next_attempt_at is null or s.next_attempt_at<=${now})
          and (s.lease_expires_at is null or s.lease_expires_at<${now})
      )))`,
    )).orderBy(sql`case when ${assessments.status}='DRAFT' then 1 else 0 end`,assessments.updatedAt).limit(10);
    for(const row of rows) await attempt(async()=>{
      await this.reports.expire(actor,organizationId,row.id);
      if(row.status!=="DRAFT") await this.retrySubmission(actor,organizationId,row.id,context);
      await this.reports.cleanup(actor,organizationId,row.id);
    });
    return {initializations,checkedAssessments:rows.length,skippedResources};
  }
  async updateContact(actor:Principal,organizationId:string,patientId:string,phone:string,context:RequestContext={requestId:"patient-contact-update"},assessmentContext?:{assessmentId:string;revision:number}) {
    this.clinicalActor(actor,organizationId,"assessments.edit");await this.applicationService.getPatient(actor,organizationId,patientId);
    await this.db.transaction(async tx=>{
      let assessment: WorkflowRow | undefined;
      if(assessmentContext) {
        assessment = await this.authorize(actor,organizationId,assessmentContext.assessmentId,tx,true);
        if(assessment.patientId!==patientId) throw new ServiceError("NOT_FOUND","Patient not found for assessment.");
        this.editable(assessment,assessmentContext.revision,actor);
      }
      const [row]=await tx.select().from(patients).where(and(eq(patients.id,patientId),eq(patients.organizationId,organizationId),facilityAccessCondition(actor,organizationId,patients.homeFacilityId))).for("update");
      if(!row) throw new ServiceError("NOT_FOUND","Patient not found.");
      const key=patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY,this.config.SESSION_SECRET);
      const profile=JSON.parse(decryptPatientData(row.encryptedProfile,key));
      await tx.update(patients).set({encryptedProfile:encryptPatientData(JSON.stringify({...profile,phone}),key),updatedAt:new Date()}).where(eq(patients.id,patientId));
      if(assessment) await appendAssessmentHistory(this,tx,assessment,actor,"PATIENT_CONTACT_UPDATED",{patientId,before:{phone:profile.phone??null},after:{phone}});
      await tx.insert(auditEvents).values({id:createEntityId(),organizationId,actorMembershipId:actor.membershipId,actorType:"USER",action:"PATIENT_CONTACT_UPDATED",resourceType:"PATIENT",resourceId:patientId,requestId:context.requestId,metadata:{changedKeys:["phone"]}});
    });
    return this.applicationService.getPatient(actor,organizationId,patientId);
  }
}
export function patientAnswers(patient:AssessmentPatient,started:Date):FormAnswers {
  const born=new Date(`${patient.dateOfBirth}T00:00:00Z`);let age=started.getUTCFullYear()-born.getUTCFullYear();
  if(started.getUTCMonth()<born.getUTCMonth()||(started.getUTCMonth()===born.getUTCMonth()&&started.getUTCDate()<born.getUTCDate())) age--;
  return {patient_name:patient.displayName,age:Number.isFinite(age)?age:null,gender:patient.gender==="UNKNOWN"?null:patient.gender,contact:patient.phone??""};
}
function initializationDto(row:typeof assessmentInitializations.$inferSelect):AssessmentInitialization {return {id:row.id,status:row.status,assessmentId:row.assessmentId,failureCode:row.failureCode};}

/** Only known field references and local guidance may cross the upstream error boundary. */
export function assessmentRejectionIssues(manifest:AssessmentFormManifest,issues:readonly {path:string;code:string;message:string}[]) {
  const fields=new Set(manifest.sections.flatMap(section=>section.fields.map(field=>field.id)));
  const result=new Map<string,{fieldId:string;message:string}>();
  const messages:Record<string,string>={INVALID_WEIGHT:"Enter a weight greater than zero.",INVALID_COUNT:"Enter a positive whole number.",CONTRADICTORY_ANSWER:"Choose compatible answers for this question.",INACTIVE_DEPENDENCY:"Review this answer and its parent question.",INVALID_ARITHMETIC:"Review the number; its calculated result is outside the supported range."};
  for(const issue of issues.slice(0,128)) {
    const ids=issue.path==="answers.weight"?["previous_weight_kg","current_weight_kg"]:[issue.path.startsWith("answers.")?issue.path.slice(8):""];
    for(const fieldId of ids) if(fields.has(fieldId)&&!result.has(fieldId)) result.set(fieldId,{fieldId,message:messages[issue.code]??"Review this answer before submitting again."});
  }
  return [...result.values()];
}
