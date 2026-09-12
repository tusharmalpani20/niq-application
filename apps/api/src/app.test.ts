import { describe, expect, test } from "bun:test";
import { createApp } from "./app";

describe("application API", () => {
  const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "disabled", checkDatabase: async () => true });

  test("reports liveness without exposing internals", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect((await response.json()).service).toBe("niq-application-api");
  });

  test("returns a structured error when auth is not configured", async () => {
    const response = await app.request("/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "not-a-real-password" }),
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("AUTH_NOT_CONFIGURED");
    expect(body.error.requestId).toBeString();
  });

  test("readiness fails closed when PostgreSQL is unavailable", async () => {
    const unavailable = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "disabled",
      checkDatabase: async () => false,
    });
    const response = await unavailable.request("/ready");
    expect(response.status).toBe(503);
  });

  test("unknown routes use the common error envelope", async () => {
    const response = await app.request("/v1/does-not-exist");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeString();
  });
});
