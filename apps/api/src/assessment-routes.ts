import { ClinicalReviewService } from "./services/clinical-review";
import { clinicalReviewActionSchema } from "../../../packages/contracts/src/clinical-review";
import { AssessmentScoreReviewService } from "./services/assessment-score-reviews";
import { scoreReviewInputSchema } from "../../../packages/contracts/src/assessment-score-reviews";
import type { Hono } from "hono";
import { z } from "zod";
import { initializeAssessmentSchema, saveAssessmentSchema, assessmentRevisionSchema, assessmentSubmitSchema, reportInputSchema } from "../../../packages/contracts/src/assessment-workflow";
import { ServiceError } from "./services/application";
import type { AssessmentWorkflowService } from "./services/assessment-workflow";
const json=async(c:any)=>{try{return await c.req.json();}catch(error){if(!(error instanceof SyntaxError))throw error;throw new ServiceError("VALIDATION_ERROR","Invalid JSON request.");}};
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const result=schema.safeParse(value);if(!result.success)throw new ServiceError("VALIDATION_ERROR","The request is invalid.");return result.data;};
/** Register after session and origin/CSRF middleware; all response data is private. */
export function mountAssessmentRoutes(app:Hono<any>,service:AssessmentWorkflowService) {
  const clinicalReviews = new ClinicalReviewService(service);
  const scoreReviews = new AssessmentScoreReviewService(service);
  const base="/v1/organizations/:organizationId";
  const parts=(c:any)=>({actor:c.get("principal"),org:parse(id,c.req.param("organizationId")),assessment:parse(id,c.req.param("assessmentId")),context:{requestId:c.get("requestId")}});
  app.use(`${base}/assessment-initializations*`,async(c,next)=>{c.header("Cache-Control","private, no-store");await next();});
  app.use(`${base}/assessments/*`,async(c,next)=>{c.header("Cache-Control","private, no-store");await next();});
  app.post(`${base}/assessment-recovery`,async c=>c.json(await service.recover(c.get("principal"),parse(id,c.req.param("organizationId")),{requestId:c.get("requestId")})));
  app.post(`${base}/assessment-initializations`,async c=>c.json(await service.initialize(c.get("principal"),parse(id,c.req.param("organizationId")),parse(initializeAssessmentSchema,await json(c)),{requestId:c.get("requestId")}),201));
  app.get(`${base}/assessment-initializations/:initializationId`,async c=>{const row=await service.getInitialization(c.get("principal"),parse(id,c.req.param("organizationId")),parse(id,c.req.param("initializationId")));return c.json(await service.initializationDto(row));});
  app.post(`${base}/assessment-initializations/:initializationId/retry`,async c=>c.json(await service.retryInitialization(c.get("principal"),parse(id,c.req.param("organizationId")),parse(id,c.req.param("initializationId")),{requestId:c.get("requestId")})));
  app.get(`${base}/assessments/:assessmentId`,async c=>{return c.json(await service.read(c.get("principal"),parse(id,c.req.param("organizationId")),parse(z.union([id,z.string().regex(/^ASM-[0-9]{6,10}$/)]),c.req.param("assessmentId"))));});
  app.get(`${base}/assessments/:assessmentId/score-reviews`,async c=>{const p=parts(c);return c.json(await scoreReviews.read(p.actor,p.org,p.assessment));});
  app.post(`${base}/assessments/:assessmentId/score-reviews`,async c=>{const p=parts(c);return c.json(await scoreReviews.add(p.actor,p.org,p.assessment,parse(scoreReviewInputSchema,await json(c)),p.context));});
  app.post(`${base}/assessments/:assessmentId/score-reviews/classification/retry`,async c=>{const p=parts(c);return c.json(await scoreReviews.retryRisk(p.actor,p.org,p.assessment,await json(c),p.context));});
  app.get(`${base}/clinical-reviews`,async c=>{c.header("Cache-Control","private, no-store");return c.json(await clinicalReviews.queue(c.get("principal"),parse(id,c.req.param("organizationId")),parse(z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),search:z.string().max(200).optional(),mine:z.enum(["true","false"]).transform(v=>v==="true").optional(),state:z.enum(["QUEUED","IN_REVIEW","RETURNED","AWAITING_RESUBMISSION","COMPLETED"]).optional()}),c.req.query())));});
  app.get(`${base}/assessments/:assessmentId/clinical-review`,async c=>{const p=parts(c);return c.json(await clinicalReviews.read(p.actor,p.org,p.assessment));});
  app.get(`${base}/assessments/:assessmentId/clinical-review/eligible-reviewers`,async c=>{const p=parts(c);return c.json(await clinicalReviews.eligible(p.actor,p.org,p.assessment));});
  app.post(`${base}/assessments/:assessmentId/clinical-review`,async c=>{const p=parts(c);return c.json(await clinicalReviews.command(p.actor,p.org,p.assessment,parse(clinicalReviewActionSchema,await json(c)),p.context));});
  app.patch(`${base}/assessments/:assessmentId`,async c=>{const p=parts(c);return c.json(await service.save(p.actor,p.org,p.assessment,parse(saveAssessmentSchema,await json(c)),p.context));});
  app.post(`${base}/assessments/:assessmentId/submit`,async c=>{const p=parts(c);return c.json(await service.submit(p.actor,p.org,p.assessment,parse(assessmentSubmitSchema,await json(c)),p.context));});
  app.post(`${base}/assessments/:assessmentId/submission/retry`,async c=>{const p=parts(c);return c.json(await service.retrySubmission(p.actor,p.org,p.assessment,p.context));});
  app.post(`${base}/assessments/:assessmentId/submission/reconcile`,async c=>{const p=parts(c);return c.json(await service.retrySubmission(p.actor,p.org,p.assessment,p.context,true));});
  app.patch(`${base}/patients/:patientId/contact`,async c=>{const input=parse(z.object({phone:z.string().trim().min(3).max(32).regex(/^[+\d ()-]+$/),assessmentId:id.optional(),revision:z.number().int().nonnegative().optional()}).refine(v=>(v.assessmentId===undefined)===(v.revision===undefined)).strict(),await json(c));return c.json(await service.updateContact(c.get("principal"),parse(id,c.req.param("organizationId")),parse(id,c.req.param("patientId")),input.phone,{requestId:c.get("requestId")},input.assessmentId?{assessmentId:input.assessmentId,revision:input.revision!}:undefined) as any);});
  const reports=`${base}/assessments/:assessmentId/reports`;
  app.post(reports,async c=>{const p=parts(c);return c.json(await service.reports.edit(p.actor,p.org,p.assessment,parse(reportInputSchema,await json(c)),p.context));});
  app.patch(`${reports}/:reportId`,async c=>{const p=parts(c);return c.json(await service.reports.edit(p.actor,p.org,p.assessment,parse(reportInputSchema,await json(c)),p.context,parse(id,c.req.param("reportId"))));});
  const revision=(c:any)=>parse(z.string().regex(/^\d+$/).transform(Number),c.req.query("revision"));
  app.delete(`${reports}/:reportId`,async c=>{const p=parts(c);return c.json(await service.reports.remove(p.actor,p.org,p.assessment,parse(id,c.req.param("reportId")),revision(c),p.context));});
  app.delete(`${reports}/:reportId/files/:fileId`,async c=>{const p=parts(c);return c.json(await service.reports.remove(p.actor,p.org,p.assessment,parse(id,c.req.param("reportId")),revision(c),p.context,parse(id,c.req.param("fileId"))));});
  app.post(`${reports}/:reportId/files`,async c=>{
    const p=parts(c);const body=c.req.raw.body;if(!body)throw new ServiceError("VALIDATION_ERROR","Choose a file.");
    let filename:string;try{filename=decodeURIComponent(c.req.header("x-file-name")??"");}catch{throw new ServiceError("VALIDATION_ERROR","Invalid filename.");}
    const input=parse(z.object({revision:z.string().regex(/^\d+$/).transform(Number),uploadKey:z.string().min(16).max(128),filename:z.string().min(1).max(255).regex(/^[^\x00-\x1f\x7f/\\]+$/),mediaType:z.enum(["application/pdf","image/jpeg","image/png"]),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.coerce.number().int().positive().max(service.config.REPORT_MAX_FILE_BYTES)}),{revision:c.req.header("x-assessment-revision"),uploadKey:c.req.header("x-upload-key"),filename,mediaType:c.req.header("content-type"),sha256:c.req.header("x-file-sha256"),size:c.req.header("content-length")});
    return c.json(await service.reports.upload(p.actor,p.org,p.assessment,parse(id,c.req.param("reportId")),{...input,body,signal:c.req.raw.signal},p.context));
  });
  app.get(`${reports}/:reportId/files/:fileId`,async c=>{const p=parts(c);const file=await service.reports.download(p.actor,p.org,p.assessment,parse(id,c.req.param("reportId")),parse(id,c.req.param("fileId")));return new Response(file.stream,{headers:{"Content-Type":file.mediaType,"Content-Length":String(file.size),"Content-Disposition":`attachment; filename="report"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g,ch=>`%${ch.charCodeAt(0).toString(16)}`)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});});
}
