import { and, eq, isNull, sql } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import type { z } from "zod";
import type { AssessmentReport, reportInputSchema } from "../../../../packages/contracts/src/assessment-workflow";
import { assessmentReports as reports, assessmentFiles as files, assessments, assessmentSubmissions } from "../db/schema";
import type { Principal, RequestContext } from "./application";
import { ServiceError } from "./application";
import type { AssessmentWorkflowService, WorkflowExecutor, WorkflowRow } from "./assessment-workflow";
import type { ReportMediaType, StagedReport } from "../storage/report-storage";
export class AssessmentReportWorkflow {
  constructor(private readonly service:AssessmentWorkflowService) {}
  async list(organizationId:string,assessmentId:string):Promise<AssessmentReport[]> {
    const groups=await this.service.db.select().from(reports).where(and(eq(reports.organizationId,organizationId),eq(reports.assessmentId,assessmentId),isNull(reports.removedAt))).orderBy(reports.createdAt);
    const attachments=await this.service.db.select().from(files).where(and(eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId),sql`${files.status} in ('READY','PENDING')`)).orderBy(files.createdAt);
    return groups.map(group=>({id:group.id,label:group.label,purpose:group.purpose,datePrecision:group.datePrecision as "DAY"|"MONTH",year:group.year,month:group.month,day:group.day,files:attachments.filter(file=>file.reportId===group.id).map(file=>({id:file.id,reportId:file.reportId,originalFilename:file.originalFilename,mediaType:file.mediaType,size:file.size,status:file.status,createdAt:file.createdAt.toISOString()}))}));
  }
  async edit(actor:Principal,organizationId:string,assessmentId:string,input:z.infer<typeof reportInputSchema>,context:RequestContext,reportId?:string) {
    this.service.clinicalActor(actor,organizationId);
    await this.service.db.transaction(async tx=>{
      const row=await this.service.authorize(actor,organizationId,assessmentId,tx,true);this.service.editable(row,input.revision);
      const {revision,...data}=input;
      if(reportId) {
        const [updated]=await tx.update(reports).set({...data,updatedAt:new Date()}).where(and(eq(reports.id,reportId),eq(reports.organizationId,organizationId),eq(reports.assessmentId,assessmentId),isNull(reports.removedAt))).returning();
        if(!updated) throw new ServiceError("NOT_FOUND","Report not found.");
      } else {
        const groups=await tx.select({id:reports.id}).from(reports).where(and(eq(reports.organizationId,organizationId),eq(reports.assessmentId,assessmentId),isNull(reports.removedAt)));
        if(groups.length>=this.service.config.REPORT_MAX_GROUPS) throw new ServiceError("VALIDATION_ERROR","This assessment has reached its report limit.");
        reportId=createEntityId();
        await tx.insert(reports).values({id:reportId,organizationId,assessmentId,creatorId:actor.membershipId,...data});
      }
      await this.bump(tx,row);await this.service.audit(tx,actor,context,assessmentId,"ASSESSMENT_REPORT_SAVED",{reportId});
    });
    return this.service.read(actor,organizationId,assessmentId);
  }
  private async bump(tx:WorkflowExecutor,row:WorkflowRow) {await tx.update(assessments).set({revision:row.revision+1,updatedAt:new Date()}).where(eq(assessments.id,row.id));}
  async remove(actor:Principal,organizationId:string,assessmentId:string,reportId:string,revision:number,context:RequestContext,fileId?:string) {
    this.service.clinicalActor(actor,organizationId);
    const removed=await this.service.db.transaction(async tx=>{
      const row=await this.service.authorize(actor,organizationId,assessmentId,tx,true);this.service.editable(row,revision);
      const [group]=await tx.select().from(reports).where(and(eq(reports.id,reportId),eq(reports.organizationId,organizationId),eq(reports.assessmentId,assessmentId),isNull(reports.removedAt)));
      if(!group) throw new ServiceError("NOT_FOUND","Report not found.");
      const candidates=await tx.update(files).set({status:"REMOVED",leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(and(eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId),eq(files.reportId,reportId),fileId?eq(files.id,fileId):undefined,sql`${files.status} in ('READY','PENDING','FAILED')`)).returning();
      if(fileId&&!candidates.length) throw new ServiceError("NOT_FOUND","File not found.");
      if(!fileId) await tx.update(reports).set({removedAt:new Date(),updatedAt:new Date()}).where(eq(reports.id,reportId));
      await this.bump(tx,row);await this.service.audit(tx,actor,context,assessmentId,"ASSESSMENT_REPORT_REMOVED",{reportId,...(fileId?{fileId}:{})});
      return candidates;
    });
    for(const file of removed) await this.cleanFile(file);
    return this.service.read(actor,organizationId,assessmentId);
  }
  private async cleanFile(file:typeof files.$inferSelect) {
    if(!this.service.storage) return;
    const snapshots=await this.service.db.select({snapshot:assessmentSubmissions.snapshot}).from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,file.organizationId),eq(assessmentSubmissions.assessmentId,file.assessmentId)));
    if(snapshots.some(s=>JSON.stringify(this.service.unseal(s.snapshot)).includes(`"${file.id}"`))) return;
    const scope={organizationId:file.organizationId,patientId:file.patientId,assessmentId:file.assessmentId};
    if(file.objectKey) await this.service.storage.remove(scope,file.objectKey).catch(()=>{});
    if(file.stagingKey) await this.service.storage.discard({scope,stagingKey:file.stagingKey} as StagedReport).catch(()=>{});
  }
  async upload(actor:Principal,organizationId:string,assessmentId:string,reportId:string,input:{revision:number;uploadKey:string;filename:string;mediaType:ReportMediaType;size:number;sha256:string;body:ReadableStream<Uint8Array>;signal?:AbortSignal},context:RequestContext) {
    this.service.clinicalActor(actor,organizationId);
    const storage=this.service.storage;if(!storage) throw new ServiceError("VALIDATION_ERROR","Report storage is not configured.");
    const reserved=await this.service.db.transaction(async tx=>{
      const row=await this.service.authorize(actor,organizationId,assessmentId,tx,true);
      const [existing]=await tx.select().from(files).where(and(eq(files.assessmentId,assessmentId),eq(files.organizationId,organizationId),eq(files.uploadKey,input.uploadKey)));
      if(existing) {
        if(existing.reportId!==reportId||existing.originalFilename!==input.filename||existing.mediaType!==input.mediaType||existing.size!==input.size||existing.sha256!==input.sha256) throw new ServiceError("CONFLICT","This upload key belongs to a different file.");
        // Return successful replays even after submission froze the draft. Never repeat bytes.
        if(existing.status==="READY") return {file:existing,replay:true};
        if(existing.status==="PENDING") throw new ServiceError("CONFLICT","This upload is still processing. Retry shortly.");
        if(existing.status==="REMOVED") throw new ServiceError("CONFLICT","This upload was removed. Choose the file again.");
      }
      this.service.editable(row,input.revision);
      const [group]=await tx.select().from(reports).where(and(eq(reports.id,reportId),eq(reports.organizationId,organizationId),eq(reports.assessmentId,assessmentId),isNull(reports.removedAt)));
      if(!group) throw new ServiceError("NOT_FOUND","Report not found.");
      if(input.size<1||input.size>this.service.config.REPORT_MAX_FILE_BYTES) throw new ServiceError("VALIDATION_ERROR","The report file is too large or empty.");
      const active=await tx.select().from(files).where(and(eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId),sql`${files.status} in ('READY','PENDING')`));
      if(active.filter(x=>x.reportId===reportId).length>=this.service.config.REPORT_MAX_FILES_PER_GROUP||active.reduce((sum,x)=>sum+x.size,0)+input.size>this.service.config.REPORT_MAX_ASSESSMENT_BYTES) throw new ServiceError("VALIDATION_ERROR","This assessment has reached its file limit.");
      const leaseToken=crypto.randomUUID();const values={status:"PENDING",leaseToken,leaseExpiresAt:new Date(Date.now()+300_000),updatedAt:new Date()};
      const [file]=existing?await tx.update(files).set(values).where(eq(files.id,existing.id)).returning():await tx.insert(files).values({id:createEntityId(),organizationId,assessmentId,patientId:row.patientId,reportId,uploadKey:input.uploadKey,originalFilename:input.filename,mediaType:input.mediaType,size:input.size,sha256:input.sha256,uploaderId:actor.membershipId,...values}).returning();
      if(!file) throw new Error("File reservation was not saved");
      return {file,replay:false};
    });
    if(reserved.replay) {await input.body.cancel().catch(()=>{});return this.service.read(actor,organizationId,assessmentId);}
    const file=reserved.file;const scope={organizationId,patientId:file.patientId,assessmentId};let staged:StagedReport|undefined;
    const controller=new AbortController();const abort=()=>controller.abort();input.signal?.addEventListener("abort",abort,{once:true});if(input.signal?.aborted)controller.abort();
    // Bounded lease also bounds transfer time. No late writer can finalize after expiry/cancel.
    const timer=setTimeout(()=>controller.abort(),290_000);
    try {
      staged=await storage.stage(scope,`${file.id}-${file.leaseToken}`,input.body,{expectedMediaType:input.mediaType,signal:controller.signal});
      if(staged.size!==input.size||staged.sha256!==input.sha256) throw new ServiceError("VALIDATION_ERROR","The uploaded file size changed.");
      const receipt=staged;
      await this.service.db.transaction(async tx=>{
        const row=await this.service.authorize(actor,organizationId,assessmentId,tx,true);
        const [live]=await tx.select().from(files).where(eq(files.id,file.id)).for("update");
        if(row.status!=="DRAFT"||live?.status!=="PENDING"||live.leaseToken!==file.leaseToken||!live.leaseExpiresAt||live.leaseExpiresAt.getTime()<=Date.now()) throw new ServiceError("CONFLICT","This upload was cancelled or the assessment changed.");
        await tx.update(files).set({stagingKey:receipt.stagingKey,objectKey:receipt.objectKey,sha256:receipt.sha256}).where(eq(files.id,file.id));
        await storage.promote(receipt);
        await tx.update(files).set({status:"READY",stagingKey:null,leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(eq(files.id,file.id));
        await this.bump(tx,row);await this.service.audit(tx,actor,context,assessmentId,"ASSESSMENT_FILE_READY",{fileId:file.id,reportId});
      });
    } catch(error) {
      await this.service.db.update(files).set({status:"FAILED",leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(and(eq(files.id,file.id),eq(files.leaseToken,file.leaseToken!),eq(files.status,"PENDING")));
      if(staged) {
        // Commit response loss is ambiguous: never delete an object now referenced as ready.
        const [current]=await this.service.db.select().from(files).where(eq(files.id,file.id));
        if(current?.status!=="READY"||current.objectKey!==staged.objectKey) {await storage.discard(staged).catch(()=>{});await storage.remove(scope,staged.objectKey).catch(()=>{});}
      }
      throw error;
    } finally {clearTimeout(timer);input.signal?.removeEventListener("abort",abort);}
    return this.service.read(actor,organizationId,assessmentId);
  }
  async download(actor:Principal,organizationId:string,assessmentId:string,reportId:string,fileId:string) {
    await this.service.authorize(actor,organizationId,assessmentId);
    const [file]=await this.service.db.select().from(files).where(and(eq(files.id,fileId),eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId),eq(files.reportId,reportId),eq(files.status,"READY")));
    if(!file?.objectKey||!this.service.storage) throw new ServiceError("NOT_FOUND","Report file not found.");
    const data=await this.service.storage.open({organizationId,patientId:file.patientId,assessmentId},file.objectKey);
    return {...data,filename:file.originalFilename,mediaType:file.mediaType};
  }
  async submissionManifest(tx:WorkflowExecutor,organizationId:string,assessmentId:string) {
    const groups=await tx.select().from(reports).where(and(eq(reports.organizationId,organizationId),eq(reports.assessmentId,assessmentId),isNull(reports.removedAt)));
    const attachments=await tx.select().from(files).where(and(eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId),sql`${files.status} in ('READY','PENDING')`));
    if(attachments.some(x=>x.status==="PENDING")) throw new ServiceError("CONFLICT","Wait for uploads to finish or cancel them before submitting.");
    for(const group of groups) if(!group.label.trim()||!group.year||!group.month||(group.datePrecision==="DAY"&&!group.day)||!attachments.some(x=>x.reportId===group.id)) throw new ServiceError("VALIDATION_ERROR","Complete each report's details and add a file, or remove the empty report.");
    return groups.map(group=>({...group,files:attachments.filter(x=>x.reportId===group.id).map(({id,objectKey,sha256,size,mediaType,originalFilename})=>({id,objectKey,sha256,size,mediaType,originalFilename}))}));
  }
  async cleanup(actor:Principal,organizationId:string,assessmentId:string) {
    if(!this.service.storage) return [];
    await this.expire(actor,organizationId,assessmentId);
    return this.service.db.transaction(async tx=>{
      const row=await this.service.authorize(actor,organizationId,assessmentId,tx,true);
      const all=await tx.select().from(files).where(and(eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId)));
      // Holding the assessment lock fences publication while bounded deletion checks references.
      if(all.some(file=>file.status==="PENDING")) return [];
      const snapshots=await tx.select({snapshot:assessmentSubmissions.snapshot}).from(assessmentSubmissions).where(and(eq(assessmentSubmissions.organizationId,organizationId),eq(assessmentSubmissions.assessmentId,assessmentId)));
      const manifests=snapshots.map(s=>JSON.stringify(this.service.unseal(s.snapshot)));
      const protectedKeys=new Set(all.filter(file=>file.status==="READY"||manifests.some(s=>s.includes(`"${file.id}"`))).flatMap(file=>[file.objectKey,file.stagingKey].filter((key):key is string=>!!key)));
      return this.service.storage!.cleanup({organizationId,patientId:row.patientId,assessmentId},{olderThan:new Date(Date.now()-24*60*60*1000),limit:200,isProtected:async key=>protectedKeys.has(key)});
    });
  }
  async expire(actor:Principal,organizationId:string,assessmentId:string) {
    // Runs on authorized reads; pending metadata can recover even when staging bytes disappeared.
    const expired=await this.service.db.transaction(async tx=>{
      await this.service.authorize(actor,organizationId,assessmentId,tx,true);
      return tx.update(files).set({status:"FAILED",leaseToken:null,leaseExpiresAt:null,updatedAt:new Date()}).where(and(eq(files.organizationId,organizationId),eq(files.assessmentId,assessmentId),eq(files.status,"PENDING"),sql`${files.leaseExpiresAt}<${new Date().toISOString()}`)).returning();
    });
    for(const file of expired) await this.cleanFile(file);
  }
}
