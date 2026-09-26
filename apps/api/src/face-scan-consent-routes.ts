import type { Hono } from "hono";
import { z } from "zod";
import { ServiceError } from "./services/application";
import type { AssessmentWorkflowService } from "./services/assessment-workflow";
import { FaceScanConsentService } from "./services/face-scan-consent";
import { readBoundedJson } from "./http/bounded-json";

const id = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const revision = z.number().int().nonnegative();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ServiceError("VALIDATION_ERROR", "The consent request is invalid.");
  return result.data;
}

export function mountFaceScanConsentRoutes(app: Hono<any>, workflow: AssessmentWorkflowService) {
  const service = new FaceScanConsentService(workflow);
  const base = "/v1/organizations/:organizationId/assessments/:assessmentId/face-scan-consent";
  const parts = (c: any) => [c.get("principal"), parse(id, c.req.param("organizationId")), parse(id, c.req.param("assessmentId"))] as const;
  const context = (c: any) => ({ requestId: c.get("requestId") });
  app.use(`${base}*`, async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
  app.get(base, async c => c.json(await service.read(...parts(c), context(c))));
  app.post(`${base}/request`, async c => {
    let body: unknown;
    try { body = await readBoundedJson(c.req.raw, 4096); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new ServiceError("VALIDATION_ERROR", "Invalid JSON request."); }
    const input = parse(z.object({ revision }).strict(), body);
    return c.json(await service.request(...parts(c), input.revision, context(c)), 201);
  });
  app.delete(base, async c => c.json(await service.clear(...parts(c), parse(z.string().regex(/^\d+$/).transform(Number), c.req.query("revision")), context(c))));
  app.post(`${base}/upload`, async c => {
    const body = c.req.raw.body;
    if (!body) throw new ServiceError("VALIDATION_ERROR", "Choose a signed consent file.");
    let filename: string;
    try { filename = decodeURIComponent(c.req.header("x-file-name") ?? ""); }
    catch { throw new ServiceError("VALIDATION_ERROR", "Invalid filename."); }
    const input = parse(z.object({
      revision: z.string().regex(/^\d+$/).transform(Number), uploadKey: z.string().min(16).max(128),
      filename: z.string().min(1).max(255).regex(/^[^\x00-\x1f\x7f/\\]+$/),
      mediaType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.coerce.number().int().positive().max(workflow.config.REPORT_MAX_FILE_BYTES),
    }).strict(), {
      revision: c.req.header("x-assessment-revision"), uploadKey: c.req.header("x-upload-key"), filename,
      mediaType: c.req.header("content-type"), sha256: c.req.header("x-file-sha256"), size: c.req.header("content-length"),
    });
    return c.json(await service.upload(...parts(c), { ...input, body, signal: c.req.raw.signal }, context(c)), 201);
  });
  app.get(`${base}/:consentId/file`, async c => {
    const file = await service.download(...parts(c), parse(id, c.req.param("consentId")));
    return new Response(file.stream, { headers: {
      "Content-Type": file.mediaType, "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="consent"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, ch => `%${ch.charCodeAt(0).toString(16)}`)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  });
}
