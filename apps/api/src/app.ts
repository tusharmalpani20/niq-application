import { zValidator } from "@hono/zod-validator";
import { acceptInvitationSchema, activateScoringSchema, bootstrapAdminSchema, createFacilitySchema, createInvitationSchema, createOrganizationSchema, idSchema, onboardOrganizationSchema, resendMfaRequestSchema, signInRequestSchema, updateFacilitySchema, updateOrganizationSchema, updateUserStatusSchema, verifyMfaRequestSchema } from "@niq/application-contracts";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { errorBody } from "./http/errors";
import { secureEqual } from "./security/tokens";
import type { ApplicationService, Principal, RequestContext } from "./services/application";
import { ServiceError } from "./services/application";

export type AppDependencies = {
  allowedOrigin: string;
  authMode: "disabled" | "local" | "oidc";
  checkDatabase: () => Promise<boolean>;
  service?: ApplicationService;
  sessionCookieName?: string;
  secureCookies?: boolean;
  bootstrapToken?: string;
  exposeDevelopmentTokens?: boolean;
};
type AppEnvironment = { Variables: { requestId: string; principal: Principal } };
const idParamsSchema = z.object({ organizationId: idSchema, facilityId: idSchema.optional(), membershipId: idSchema.optional() });
function requestContext(context: { get(name: "requestId"): string; req: { header(name: string): string | undefined } }): RequestContext {
  return { requestId: context.get("requestId"), userAgent: context.req.header("user-agent") };
}
function validationFailure(result: { success: boolean }, context: any) {
  if (!result.success) return context.json(errorBody("VALIDATION_ERROR", "The request is invalid.", context.get("requestId")), 400);
}
const jsonValue = (value: unknown): any => value;

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();
  const cookieName = dependencies.sessionCookieName ?? "niq_session";
  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("/v1/*", cors({ origin: dependencies.allowedOrigin, credentials: true }));
  app.get("/health", (context) => context.json({ status: "ok", service: "niq-application-api", timestamp: new Date().toISOString() } as const));
  app.get("/ready", async (context) => {
    const ready = await dependencies.checkDatabase().catch(() => false);
    return context.json({ status: ready ? "ok" : "not_ready", service: "niq-application-api", timestamp: new Date().toISOString() } as const, ready ? 200 : 503);
  });
  const localService = (context: any): ApplicationService | Response => {
    if (dependencies.authMode !== "local" || !dependencies.service) return context.json(errorBody("AUTH_NOT_CONFIGURED", "Local authentication is not configured.", context.get("requestId")), 503);
    return dependencies.service;
  };
  const issueCookie = (context: any, token: string, expiresAt: Date) => setCookie(context, cookieName, token, { httpOnly: true, secure: dependencies.secureCookies ?? false, sameSite: "Strict", path: "/", expires: expiresAt });

  app.post("/v1/auth/sign-in", zValidator("json", signInRequestSchema, validationFailure), async (context) => {
    const service = localService(context); if (service instanceof Response) return service;
    const result = await service.signIn(context.req.valid("json"), requestContext(context));
    if (result.kind === "mfa_required") return context.json({
      mfaRequired: true,
      challengeToken: result.challengeToken,
      expiresAt: result.expiresAt.toISOString(),
      resendAvailableAt: result.resendAvailableAt.toISOString(),
      attemptsRemaining: result.attemptsRemaining,
      resendsRemaining: result.resendsRemaining,
    }, 202);
    issueCookie(context, result.session.token, result.session.expiresAt);
    return context.json({ user: result.session.principal });
  });
  app.post("/v1/auth/mfa/verify", zValidator("json", verifyMfaRequestSchema, validationFailure), async (context) => {
    const service = localService(context); if (service instanceof Response) return service;
    const session = await service.verifyMfa(context.req.valid("json"), requestContext(context)); issueCookie(context, session.token, session.expiresAt);
    return context.json({ user: session.principal });
  });
  app.post("/v1/auth/mfa/resend", zValidator("json", resendMfaRequestSchema, validationFailure), async (context) => {
    const service = localService(context); if (service instanceof Response) return service;
    const result = await service.resendMfa(context.req.valid("json"), requestContext(context));
    return context.json({
      challengeToken: result.challengeToken,
      expiresAt: result.expiresAt.toISOString(),
      resendAvailableAt: result.resendAvailableAt.toISOString(),
      attemptsRemaining: result.attemptsRemaining,
      resendsRemaining: result.resendsRemaining,
    });
  });
  app.post("/v1/auth/invitations/accept", zValidator("json", acceptInvitationSchema, validationFailure), async (context) => {
    const service = localService(context); if (service instanceof Response) return service;
    const user = await service.acceptInvitation(context.req.valid("json"), requestContext(context));
    return context.json({ user, signInRequired: true }, 201);
  });
  app.post("/v1/bootstrap", zValidator("json", bootstrapAdminSchema, validationFailure), async (context) => {
    const service = localService(context); if (service instanceof Response) return service;
    const supplied = context.req.header("x-bootstrap-token") ?? "";
    if (!dependencies.bootstrapToken || !secureEqual(supplied, dependencies.bootstrapToken)) return context.json(errorBody("FORBIDDEN", "Bootstrap authorization failed.", context.get("requestId")), 403);
    const user = await service.bootstrap(context.req.valid("json"), requestContext(context));
    return context.json({ user, signInRequired: true }, 201);
  });
  const requireSession = async (context: any, next: () => Promise<void>) => {
    const service = localService(context); if (service instanceof Response) return service;
    const token = getCookie(context, cookieName); const principal = token ? await service.authenticate(token) : null;
    if (!principal) return context.json(errorBody("AUTHENTICATION_REQUIRED", "Sign in is required.", context.get("requestId")), 401);
    context.set("principal", principal); await next();
  };
  app.use("/v1/auth/me", requireSession);
  app.use("/v1/auth/sign-out", requireSession);
  app.use("/v1/organizations", requireSession);
  app.use("/v1/organizations/*", requireSession);
  app.get("/v1/auth/me", (context) => context.json({ user: context.get("principal") }));
  app.post("/v1/auth/sign-out", async (context) => {
    const token = getCookie(context, cookieName); if (token) await dependencies.service!.signOut(token, requestContext(context));
    deleteCookie(context, cookieName, { path: "/", secure: dependencies.secureCookies ?? false }); return context.body(null, 204);
  });
  app.get("/v1/organizations", async (context) => context.json({ items: await dependencies.service!.listOrganizations(context.get("principal")) }));
  app.post("/v1/organizations/onboard", zValidator("json", onboardOrganizationSchema, validationFailure), async (context) => {
    const result = await dependencies.service!.onboardOrganization(context.get("principal"), context.req.valid("json"), requestContext(context));
    return context.json({ organization: result.organization, invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens ? { activationToken: result.token } : {}) }, 201);
  });
  app.post("/v1/organizations", zValidator("json", createOrganizationSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.createOrganization(context.get("principal"), context.req.valid("json"), requestContext(context))), 201));
  app.get("/v1/organizations/:organizationId/logo", zValidator("param", idParamsSchema, validationFailure), async (context) => {
    const asset = await dependencies.service!.getOrganizationLogo(context.get("principal"), context.req.valid("param").organizationId);
    const body = asset.data.buffer.slice(asset.data.byteOffset, asset.data.byteOffset + asset.data.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { "content-type": asset.mimeType, "cache-control": "private, max-age=300", etag: `\"${asset.etag}\"`, "x-content-type-options": "nosniff" } });
  });
  app.get("/v1/organizations/:organizationId", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.getOrganization(context.get("principal"), context.req.valid("param").organizationId))));
  app.patch("/v1/organizations/:organizationId", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateOrganizationSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.updateOrganization(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context)))));
  app.post("/v1/organizations/:organizationId/scoring/activate", zValidator("param", idParamsSchema, validationFailure), zValidator("json", activateScoringSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.activateScoring(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context))), 201));
  app.get("/v1/organizations/:organizationId/facilities", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json({ items: await dependencies.service!.listFacilities(context.get("principal"), context.req.valid("param").organizationId) }));
  app.post("/v1/organizations/:organizationId/facilities", zValidator("param", idParamsSchema, validationFailure), zValidator("json", createFacilitySchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.createFacility(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context))), 201));
  app.patch("/v1/organizations/:organizationId/facilities/:facilityId", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateFacilitySchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.updateFacility(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").facilityId!, context.req.valid("json"), requestContext(context)))));
  app.get("/v1/organizations/:organizationId/users", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json({ items: await dependencies.service!.listUsers(context.get("principal"), context.req.valid("param").organizationId) }));
  app.post("/v1/organizations/:organizationId/invitations", zValidator("param", idParamsSchema, validationFailure), zValidator("json", createInvitationSchema, validationFailure), async (context) => {
    const result = await dependencies.service!.inviteUser(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context));
    return context.json({ invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens ? { activationToken: result.token } : {}) }, 201);
  });
  app.patch("/v1/organizations/:organizationId/users/:membershipId", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateUserStatusSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.setUserActive(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").membershipId!, context.req.valid("json").active, requestContext(context)))));
  app.notFound((context) => context.json(errorBody("NOT_FOUND", "The requested resource was not found.", context.get("requestId")), 404));
  app.onError((error, context) => {
    if (error instanceof ServiceError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : error.code === "USER_LIMIT_REACHED" ? 409 : error.code === "ACCOUNT_LOCKED" ? 423 : error.code === "RATE_LIMITED" ? 429 : error.code === "INVALID_CREDENTIALS" ? 401 : 409;
      return context.json(errorBody(error.code, error.message, context.get("requestId"), error.details), error.code === "SCORING_UNAVAILABLE" ? 503 : status);
    }
    console.error(JSON.stringify({ level: "error", requestId: context.get("requestId"), message: error.message }));
    return context.json(errorBody("INTERNAL_ERROR", "An unexpected error occurred.", context.get("requestId")), 500);
  });
  return app;
}
