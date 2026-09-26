import { zValidator } from "@hono/zod-validator";
import { acceptInvitationSchema, activateScoringSchema, bootstrapAdminSchema, correctPatientDobSchema, correctPatientMrnSchema, createFacilitySchema, createInvitationSchema, createOrganizationSchema, createPlatformAdministratorInvitationSchema, idSchema, onboardOrganizationSchema, organizationSlugSchema, patientReferenceSchema, registerPatientSchema, resendMfaRequestSchema, signInRequestSchema, updateFacilitySchema, updateOrganizationSchema, updateUserStatusSchema, updatePatientSchema, updateOrganizationUserSchema, verifyMfaRequestSchema } from "@niq/application-contracts";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { errorBody } from "./http/errors";
import { secureEqual } from "./security/tokens";
import type { ApplicationService, Principal, RequestContext } from "./services/application";
import { ServiceError } from "./services/application";
import { mountFaceScanRoutes } from "./face-scan-routes";
import { mountFaceScanConsentRoutes } from "./face-scan-consent-routes";
import { AssessmentFaceScanService } from "./services/assessment-face-scan";
import { BoundedBodyError } from "./http/bounded-json";
import { mountAssessmentRoutes } from "./assessment-routes";
import type { AssessmentWorkflowService } from "./services/assessment-workflow";

export type AppDependencies = {
  allowedOrigin: string;
  authMode: "disabled" | "local" | "oidc";
  checkDatabase: () => Promise<boolean>;
  service?: ApplicationService;
  assessmentWorkflow?: AssessmentWorkflowService;
  sessionCookieName?: string;
  secureCookies?: boolean;
  bootstrapToken?: string;
  exposeDevelopmentTokens?: boolean;
};
type AppEnvironment = { Variables: { requestId: string; principal: Principal } };
const idParamsSchema = z.object({ organizationId: idSchema, facilityId: idSchema.optional(), membershipId: idSchema.optional() });
const patientParamsSchema = z.object({ organizationId: idSchema, patientLocator: z.union([idSchema, patientReferenceSchema]) });
const organizationSlugParamsSchema = z.object({ organizationSlug: organizationSlugSchema });
function requestContext(context: { get(name: "requestId"): string; req: { header(name: string): string | undefined } }): RequestContext {
  return { requestId: context.get("requestId"), userAgent: context.req.header("user-agent") };
}
function validationFailure(result: { success: boolean }, context: any) {
  if (!result.success) return context.json(errorBody("VALIDATION_ERROR", "The request is invalid.", context.get("requestId")), 400);
}
function rootError(error: Error): Error {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!(current.cause instanceof Error)) break;
    current = current.cause;
  }
  return current;
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
  app.use("/v1/platform/*", requireSession);
  app.use("/v1/organizations/*", async (context, next) => {
    const path = context.req.path;
    const assessmentMutation = /\/(?:assessment-initializations|assessment-recovery|assessments)(?:\/|$)/.test(path) || /\/patients\/[^/]+\/contact$/.test(path);
    if (!assessmentMutation || ["GET", "HEAD", "OPTIONS"].includes(context.req.method)) return next();
    if (context.req.header("origin") !== dependencies.allowedOrigin) return context.json(errorBody("FORBIDDEN", "The request origin is not allowed.", context.get("requestId")), 403);
    // Files stream through a separately bounded storage adapter; JSON drafts are bounded here.
    if (/\/reports\/[^/]+\/files$/.test(path) && context.req.method === "POST") return next();
    if (/\/face-scan-consent\/upload$/.test(path) && context.req.method === "POST") return next();
    if (/\/face-scans(?:\/|$)/.test(path)) return next(); // Routes count actual bytes and enforce an upload deadline.
    return bodyLimit({ maxSize: 256 * 1024, onError: c => c.json(errorBody("VALIDATION_ERROR", "The request is too large.", c.get("requestId")), 413) })(context, next);
  });
  app.get("/v1/auth/me", (context) => context.json({ user: context.get("principal") }));
  app.post("/v1/auth/sign-out", async (context) => {
    const token = getCookie(context, cookieName); if (token) await dependencies.service!.signOut(token, requestContext(context));
    deleteCookie(context, cookieName, { path: "/", secure: dependencies.secureCookies ?? false }); return context.body(null, 204);
  });
  app.get("/v1/organizations", async (context) => context.json({ items: await dependencies.service!.listOrganizations(context.get("principal")) }));
  app.get("/v1/platform/administrators", async (context) => context.json({ items: await dependencies.service!.listPlatformAdministrators(context.get("principal")) }));
  app.post("/v1/platform/administrators/invitations", zValidator("json", createPlatformAdministratorInvitationSchema, validationFailure), async (context) => {
    const result = await dependencies.service!.invitePlatformAdministrator(context.get("principal"), context.req.valid("json"), requestContext(context));
    return context.json({ invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens ? { activationToken: result.token } : {}) }, 201);
  });
  app.post("/v1/platform/administrators/invitations/:invitationId/revoke", zValidator("param", z.object({ invitationId: idSchema }), validationFailure), async (context) => {
    await dependencies.service!.revokePlatformAdministratorInvitation(context.get("principal"), context.req.valid("param").invitationId, requestContext(context));
    return context.body(null, 204);
  });
  app.post("/v1/platform/administrators/invitations/:invitationId/regenerate", zValidator("param", z.object({ invitationId: idSchema }), validationFailure), async (context) => {
    const result = await dependencies.service!.regeneratePlatformAdministratorInvitation(context.get("principal"), context.req.valid("param").invitationId, requestContext(context));
    return context.json({ invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens ? { activationToken: result.token } : {}) });
  });
  app.patch("/v1/platform/administrators/:membershipId", zValidator("param", z.object({ membershipId: idSchema }), validationFailure), zValidator("json", updateUserStatusSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.setPlatformAdministratorActive(context.get("principal"), context.req.valid("param").membershipId, context.req.valid("json").active, requestContext(context)))));
  app.post("/v1/organizations/onboard", zValidator("json", onboardOrganizationSchema, validationFailure), async (context) => {
    const result = await dependencies.service!.onboardOrganization(context.get("principal"), context.req.valid("json"), requestContext(context));
    return context.json({ organization: result.organization, invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens ? { activationToken: result.token } : {}) }, 201);
  });
  app.post("/v1/organizations", zValidator("json", createOrganizationSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.createOrganization(context.get("principal"), context.req.valid("json"), requestContext(context))), 201));
  app.get("/v1/organizations/by-slug/:organizationSlug", zValidator("param", organizationSlugParamsSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.getOrganizationBySlug(context.get("principal"), context.req.valid("param").organizationSlug))));
  app.get("/v1/organizations/:organizationId/logo", zValidator("param", idParamsSchema, validationFailure), async (context) => {
    const asset = await dependencies.service!.getOrganizationLogo(context.get("principal"), context.req.valid("param").organizationId);
    const body = asset.data.buffer.slice(asset.data.byteOffset, asset.data.byteOffset + asset.data.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { "content-type": asset.mimeType, "cache-control": "private, max-age=300", etag: `\"${asset.etag}\"`, "x-content-type-options": "nosniff" } });
  });
  app.get("/v1/organizations/:organizationId", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.getOrganization(context.get("principal"), context.req.valid("param").organizationId))));
  app.patch("/v1/organizations/:organizationId", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateOrganizationSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.updateOrganization(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context)))));
  app.post("/v1/organizations/:organizationId/scoring/activate", zValidator("param", idParamsSchema, validationFailure), zValidator("json", activateScoringSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.activateScoring(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context))), 201));
  app.delete("/v1/organizations/:organizationId/scoring/connection", zValidator("param", idParamsSchema, validationFailure), async (context) => {
    await dependencies.service!.disconnectScoring(context.get("principal"), context.req.valid("param").organizationId, requestContext(context));
    return context.body(null, 204);
  });
  app.get("/v1/organizations/:organizationId/scoring/organization-info", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.getScoringOrganizationInfo(context.get("principal"), context.req.valid("param").organizationId, requestContext(context)))));
  app.get("/v1/organizations/:organizationId/facilities", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json({ items: await dependencies.service!.listFacilities(context.get("principal"), context.req.valid("param").organizationId) }));
  app.get("/v1/organizations/:organizationId/facilities/:facilityId/performance", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.getFacilityPerformance(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").facilityId!))));
  app.post("/v1/organizations/:organizationId/facilities", zValidator("param", idParamsSchema, validationFailure), zValidator("json", createFacilitySchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.createFacility(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context))), 201));
  app.patch("/v1/organizations/:organizationId/facilities/:facilityId", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateFacilitySchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.updateFacility(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").facilityId!, context.req.valid("json"), requestContext(context)))));
  app.get("/v1/organizations/:organizationId/patients", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json({ items: await dependencies.service!.listPatients(context.get("principal"), context.req.valid("param").organizationId) }));
  app.post("/v1/organizations/:organizationId/patients", zValidator("param", idParamsSchema, validationFailure), zValidator("json", registerPatientSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.createPatient(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context))), 201));
  app.patch("/v1/organizations/:organizationId/patients/:patientLocator", zValidator("param", patientParamsSchema, validationFailure), zValidator("json", updatePatientSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.updatePatient(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").patientLocator, context.req.valid("json"), requestContext(context)))));
  app.post("/v1/organizations/:organizationId/patients/:patientLocator/correct-mrn", zValidator("param", patientParamsSchema, validationFailure), zValidator("json", correctPatientMrnSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.correctPatientMrn(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").patientLocator, context.req.valid("json"), requestContext(context)))));
  app.post("/v1/organizations/:organizationId/patients/:patientLocator/correct-dob", zValidator("param", patientParamsSchema, validationFailure), zValidator("json", correctPatientDobSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.correctPatientDob(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").patientLocator, context.req.valid("json"), requestContext(context)))));
  app.put("/v1/organizations/:organizationId/users/:membershipId/profile", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateOrganizationUserSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.updateOrganizationUser(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").membershipId!, context.req.valid("json"), requestContext(context)))));
  app.get("/v1/organizations/:organizationId/patients/:patientLocator", zValidator("param", patientParamsSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.getPatient(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").patientLocator))));
  app.get("/v1/organizations/:organizationId/assessments", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json({ items: await dependencies.service!.listAssessments(context.get("principal"), context.req.valid("param").organizationId) }));
  app.patch("/v1/organizations/:organizationId/assessments/:assessmentId/priority", zValidator("param", z.object({ organizationId: idSchema, assessmentId: idSchema }), validationFailure), zValidator("json", z.object({ isPriority: z.boolean() }).strict(), validationFailure), async (context) => {
    context.header("Cache-Control", "private, no-store");
    return context.json(await dependencies.service!.setAssessmentPriority(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").assessmentId, context.req.valid("json").isPriority));
  });
  app.get("/v1/organizations/:organizationId/overview-risk", zValidator("param", idParamsSchema, validationFailure), async (context) => {
    context.header("Cache-Control", "private, no-store");
    return context.json(await dependencies.service!.getOverviewRisk(context.get("principal"), context.req.valid("param").organizationId));
  });
  app.get("/v1/organizations/:organizationId/overview-activity", zValidator("param", idParamsSchema, validationFailure), zValidator("query", z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) }), validationFailure), async (context) => {
    const { from, to } = context.req.valid("query");
    const start = new Date(from), end = new Date(to);
    if (end <= start || end.getTime() - start.getTime() > 32 * 24 * 60 * 60 * 1000) throw new ServiceError("VALIDATION_ERROR", "Choose a calendar month to view.");
    context.header("Cache-Control", "private, no-store");
    return context.json(await dependencies.service!.getOverviewActivity(context.get("principal"), context.req.valid("param").organizationId, start, end));
  });
  app.get("/v1/organizations/:organizationId/users", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json({ items: await dependencies.service!.listUsers(context.get("principal"), context.req.valid("param").organizationId) }));
  app.get("/v1/organizations/:organizationId/invitation-access", zValidator("param", idParamsSchema, validationFailure), async (context) => context.json(await dependencies.service!.invitationAccess(context.get("principal"), context.req.valid("param").organizationId)));
  for (const action of ["revoke", "regenerate"] as const) {
    app.post(`/v1/organizations/:organizationId/invitations/:invitationId/${action}`, zValidator("param", z.object({ organizationId: idSchema, invitationId: idSchema }), validationFailure), async (context) => {
      const { organizationId, invitationId } = context.req.valid("param");
      const result = await dependencies.service!.manageUserInvitation(context.get("principal"), organizationId, invitationId, action, requestContext(context));
      return context.json({ invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens && result.token ? { activationToken: result.token } : {}) });
    });
  }
  app.post("/v1/organizations/:organizationId/invitations", zValidator("param", idParamsSchema, validationFailure), zValidator("json", createInvitationSchema, validationFailure), async (context) => {
    const result = await dependencies.service!.inviteUser(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("json"), requestContext(context));
    return context.json({ invitation: result.invitation, ...(dependencies.exposeDevelopmentTokens ? { activationToken: result.token } : {}) }, 201);
  });
  app.patch("/v1/organizations/:organizationId/users/:membershipId", zValidator("param", idParamsSchema, validationFailure), zValidator("json", updateUserStatusSchema, validationFailure), async (context) => context.json(jsonValue(await dependencies.service!.setUserActive(context.get("principal"), context.req.valid("param").organizationId, context.req.valid("param").membershipId!, context.req.valid("json").active, requestContext(context)))));
  if (dependencies.assessmentWorkflow) {
    mountAssessmentRoutes(app, dependencies.assessmentWorkflow);
    mountFaceScanRoutes(app, new AssessmentFaceScanService(dependencies.assessmentWorkflow));
    mountFaceScanConsentRoutes(app, dependencies.assessmentWorkflow);
  }
  app.notFound((context) => context.json(errorBody("NOT_FOUND", "The requested resource was not found.", context.get("requestId")), 404));
  app.onError((error, context) => {
    if (error instanceof BoundedBodyError) return context.json(errorBody("VALIDATION_ERROR", error.message, context.get("requestId")), error.status);
    if (error instanceof ServiceError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : error.code === "USER_LIMIT_REACHED" ? 409 : error.code === "ACCOUNT_LOCKED" ? 423 : error.code === "RATE_LIMITED" ? 429 : error.code === "INVALID_CREDENTIALS" || error.code === "INVALID_OR_EXPIRED_TOKEN" ? 401 : 409;
      return context.json(errorBody(error.code, error.message, context.get("requestId"), error.details), error.code === "SCORING_UNAVAILABLE" || error.code === "SCORING_NOT_CONFIGURED" ? 503 : status);
    }
    const cause = rootError(error);
    const databaseDetails = cause as Error & { code?: string; constraint_name?: string };
    console.error(JSON.stringify({
      level: "error", requestId: context.get("requestId"), message: cause.message,
      ...(databaseDetails.code ? { code: databaseDetails.code } : {}),
      ...(databaseDetails.constraint_name ? { constraint: databaseDetails.constraint_name } : {}),
    }));
    return context.json(errorBody("INTERNAL_ERROR", "An unexpected error occurred.", context.get("requestId")), 500);
  });
  return app;
}
