import { zValidator } from "@hono/zod-validator";
import { signInRequestSchema } from "@niq/application-contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { errorBody } from "./http/errors";

export type AppDependencies = {
  allowedOrigin: string;
  authMode: "disabled" | "local" | "oidc";
  checkDatabase: () => Promise<boolean>;
};

type AppEnvironment = { Variables: { requestId: string } };

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("/v1/*", cors({ origin: dependencies.allowedOrigin, credentials: true }));

  app.get("/health", (context) =>
    context.json({ status: "ok", service: "niq-application-api", timestamp: new Date().toISOString() } as const),
  );

  app.get("/ready", async (context) => {
    const ready = await dependencies.checkDatabase().catch(() => false);
    const body = {
      status: ready ? "ok" : "not_ready",
      service: "niq-application-api",
      timestamp: new Date().toISOString(),
    } as const;
    return context.json(body, ready ? 200 : 503);
  });

  app.post(
    "/v1/auth/sign-in",
    zValidator("json", signInRequestSchema, (result, context) => {
      if (!result.success) {
        return context.json(
          errorBody("VALIDATION_ERROR", "The sign-in request is invalid.", context.get("requestId")),
          400,
        );
      }
    }),
    (context) => {
      if (dependencies.authMode === "disabled") {
        return context.json(
          errorBody(
            "AUTH_NOT_CONFIGURED",
            "Authentication has not been configured for this deployment.",
            context.get("requestId"),
          ),
          503,
        );
      }

      // Authentication adapters (local or OIDC) must be implemented and security-reviewed before this branch is enabled.
      return context.json(
        errorBody("AUTH_NOT_CONFIGURED", "The selected authentication adapter is not implemented.", context.get("requestId")),
        503,
      );
    },
  );

  app.notFound((context) =>
    context.json(errorBody("NOT_FOUND", "The requested resource was not found.", context.get("requestId")), 404),
  );

  app.onError((error, context) => {
    // Do not emit request bodies or patient data to operational logs.
    console.error(JSON.stringify({ level: "error", requestId: context.get("requestId"), message: error.message }));
    return context.json(errorBody("INTERNAL_ERROR", "An unexpected error occurred.", context.get("requestId")), 500);
  });

  return app;
}
