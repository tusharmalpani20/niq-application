import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { ServiceError } from "./services/application";
import type { WebPushService } from "./services/web-push";

const id = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const subscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,200}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/) }).strict(),
}).strict();
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ServiceError("VALIDATION_ERROR", "The request is invalid.");
  return result.data;
};

export function mountWebPushRoutes(app: Hono<any>, push: WebPushService, cookieName: string) {
  const base = "/v1/organizations/:organizationId/push";
  const org = (context: any) => parse(id, context.req.param("organizationId"));
  const sessionToken = (context: any) => getCookie(context, cookieName) ?? "";
  app.get(`${base}/config`, context => {
    context.header("Cache-Control", "private, no-store");
    return context.json(push.publicKey(context.get("principal"), org(context)));
  });
  app.post(`${base}/subscriptions`, async context => {
    const input = parse(subscriptionSchema, await context.req.json());
    await push.subscribe(context.get("principal"), org(context), sessionToken(context), input);
    return context.json({ ok: true }, 201);
  });
  app.post(`${base}/subscriptions/status`, async context => {
    context.header("Cache-Control", "private, no-store");
    const input = parse(subscriptionSchema.pick({ endpoint: true }), await context.req.json());
    return context.json(await push.subscriptionStatus(context.get("principal"), org(context), sessionToken(context), input.endpoint));
  });
  app.delete(`${base}/subscriptions`, async context => {
    const input = parse(subscriptionSchema.pick({ endpoint: true }), await context.req.json());
    await push.unsubscribe(context.get("principal"), org(context), input.endpoint);
    return context.json({ ok: true });
  });
}
