import { Hono } from "hono";
import { BoundedBodyError, readBoundedJson } from "./http/bounded-json";
import { byocSetupRequestSchema } from "@niq/application-contracts";
import type { ByocSetupService } from "./services/byoc-setup";
import { errorBody } from "./http/errors";

export function byocSetupRoutes(setup: ByocSetupService, allowedOrigin: string) {
  const routes = new Hono<{ Variables: { requestId: string } }>();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    setup.authorize(c.req.header("x-setup-token") ?? "");
    if (c.req.method !== "GET" && c.req.header("origin") !== allowedOrigin) return c.json(errorBody("FORBIDDEN", "Use the configured application origin.", c.get("requestId")), 403);
    await next();
  });
  routes.get("/status", async c => c.json(await setup.status(c.req.header("x-setup-token")!)));
  routes.post("/complete", async c => {
    let body: unknown;
    try { body = await readBoundedJson(c.req.raw, 16384, 10_000); }
    catch (error) {
      if (error instanceof BoundedBodyError) return c.json(errorBody("VALIDATION_ERROR", error.message, c.get("requestId")), error.status);
      return c.json(errorBody("VALIDATION_ERROR", "Provide valid JSON.", c.get("requestId")), 400);
    }
    const input = byocSetupRequestSchema.safeParse(body);
    if (!input.success) return c.json(errorBody("VALIDATION_ERROR", "Provide valid organization and administrator details.", c.get("requestId")), 400);
    return c.json(await setup.complete(c.req.header("x-setup-token")!, input.data, c.get("requestId")), 201);
  });
  return routes;
}
