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

  test("requires a separate 32-byte encryption key for production scoring", () => {
    const production = {
      NODE_ENV: "production", DATABASE_URL: "postgres://localhost/niq",
      SESSION_SECRET: "a-production-secret-with-32-chars", BOOTSTRAP_TOKEN: "b".repeat(32),
      AUTH_MODE: "local", SCORING_API_URL: "https://scoring.example.com",
      PATIENT_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    };
    expect(() => loadApplicationConfig(production)).toThrow("A credential encryption key is required");
    expect(loadApplicationConfig({ ...production, SCORING_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") }).SCORING_CREDENTIAL_KEY_VERSION).toBe("local-v1");
  });

  test("requires a dedicated patient data encryption key in production", () => {
    const production = {
      NODE_ENV: "production", DATABASE_URL: "postgres://localhost/niq",
      SESSION_SECRET: "a-production-secret-with-32-chars", BOOTSTRAP_TOKEN: "b".repeat(32),
      AUTH_MODE: "local",
    };
    expect(() => loadApplicationConfig(production)).toThrow("A patient data encryption key is required in production");
    expect(loadApplicationConfig({ ...production, PATIENT_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") }).PATIENT_DATA_KEY_VERSION).toBe("local-v1");
  });
});


test("employee override is optional, bounded and development-only", () => {
  const base = { DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "a-development-secret-with-32-chars" };
  expect(loadApplicationConfig(base).FACE_SCAN_EMPLOYEE_ID_OVERRIDE).toBeUndefined();
  expect(loadApplicationConfig({ ...base, FACE_SCAN_EMPLOYEE_ID_OVERRIDE: " " }).FACE_SCAN_EMPLOYEE_ID_OVERRIDE).toBeUndefined();
  expect(loadApplicationConfig({ ...base, FACE_SCAN_EMPLOYEE_ID_OVERRIDE: " spoke-operator-001 " }).FACE_SCAN_EMPLOYEE_ID_OVERRIDE).toBe("spoke-operator-001");
  expect(() => loadApplicationConfig({ ...base, FACE_SCAN_EMPLOYEE_ID_OVERRIDE: "x".repeat(129) })).toThrow();
  for (const NODE_ENV of ["production", "test"])
    expect(() => loadApplicationConfig({ ...base, NODE_ENV, PATIENT_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"), FACE_SCAN_EMPLOYEE_ID_OVERRIDE: "spoke-operator-001" })).toThrow("allowed only in development");
});
