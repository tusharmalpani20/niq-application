import type { Hono } from "hono";
import { z } from "zod";
import { faceScanSignalSchema, startFaceScanSchema } from "../../../packages/contracts/src/face-scan";
import { ServiceError } from "./services/application";
import type { AssessmentFaceScanService } from "./services/assessment-face-scan";
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ServiceError("VALIDATION_ERROR","The face scan request is invalid.");return result.data;}
async function json(c:any){try{return await c.req.json();}catch{throw new ServiceError("VALIDATION_ERROR","Invalid JSON request.");}}
export function mountFaceScanRoutes(app:Hono<any>,service:AssessmentFaceScanService){
 const base="/v1/organizations/:organizationId/assessments/:assessmentId/face-scans";
 const parts=(c:any)=>[c.get("principal"),parse(id,c.req.param("organizationId")),parse(id,c.req.param("assessmentId"))] as const;
 app.use(`${base}*`,async(c,next)=>{c.header("Cache-Control","private, no-store");await next();});
 app.get(base,async c=>c.json(await service.list(...parts(c))));
 app.post(base,async c=>c.json(await service.start(...parts(c),parse(startFaceScanSchema,await json(c)),{requestId:c.get("requestId")}),201));
 app.get(`${base}/:sessionId`,async c=>c.json(await service.get(...parts(c),parse(id,c.req.param("sessionId")))));
 app.post(`${base}/:sessionId/signal`,async c=>c.json(await service.mutate(...parts(c),parse(id,c.req.param("sessionId")),"signal",parse(faceScanSignalSchema,await json(c))),202));
 app.post(`${base}/:sessionId/cancel`,async c=>c.json(await service.mutate(...parts(c),parse(id,c.req.param("sessionId")),"cancel")));
}
