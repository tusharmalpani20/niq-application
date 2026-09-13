import { describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "./index";

describe("configuration", () => {
  test("rejects a weak session secret", () => {
    expect(() => loadApplicationConfig({ DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "short" })).toThrow();
  });

  test("defaults to India-first hosted deployment", () => {
    const config = loadApplicationConfig({
      DATABASE_URL: "postgres://localhost/niq",
      SESSION_SECRET: "a-development-secret-with-32-chars",
    });
    expect(config.APP_REGION).toBe("india");
    expect(config.DEPLOYMENT_MODE).toBe("niq-hosted");
    expect(config.MFA_RESEND_COOLDOWN_SECONDS).toBe(30);
    expect(config.MFA_MAX_RESENDS).toBe(3);
  });

  test("refuses development OTP disclosure in production", () => {
    expect(() => loadApplicationConfig({
      NODE_ENV: "production", DATABASE_URL: "postgres://localhost/niq",
      SESSION_SECRET: "a-production-secret-with-32-chars", BOOTSTRAP_TOKEN: "b".repeat(32),
      AUTH_MODE: "local", DEV_OTP_DELIVERY: "true",
    })).toThrow("Development OTP delivery is forbidden in production");
  });
});
