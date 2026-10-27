import { describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "./index";

describe("configuration", () => {
  test("BYOC setup is opt-in, paired and cannot enable platform bootstrap", () => {
    const base={DATABASE_URL:"postgres://localhost/test",SESSION_SECRET:"a-session-secret-with-more-than-32-characters"};
    expect(loadApplicationConfig(base).BYOC_SETUP_TOKEN).toBeUndefined();
    const setup={...base,DEPLOYMENT_MODE:"client-cloud",AUTH_MODE:"local",BYOC_SETUP_TOKEN:"a-private-installation-token-at-least-32-characters",BYOC_SETUP_EXPIRES_AT:"2026-10-28T00:00:00.000Z"};
    expect(loadApplicationConfig(setup).DEPLOYMENT_MODE).toBe("client-cloud");
    expect(()=>loadApplicationConfig({...setup,BYOC_SETUP_EXPIRES_AT:""})).toThrow();
    expect(()=>loadApplicationConfig({...setup,AUTH_MODE:"disabled"})).toThrow();
    expect(()=>loadApplicationConfig({...setup,DEPLOYMENT_MODE:"niq-hosted"})).toThrow();
    expect(()=>loadApplicationConfig({...setup,BOOTSTRAP_TOKEN:"a-different-bootstrap-token-at-least-32-characters"})).toThrow();
  });
  test("production starts with bootstrap disabled after initial setup", () => {
    const production = {
      NODE_ENV: "production", AUTH_MODE: "local", DATABASE_URL: "postgres://localhost/niq",
      SESSION_SECRET: "a-production-secret-with-32-chars",
      PATIENT_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    };
    expect(loadApplicationConfig(production).BOOTSTRAP_TOKEN).toBeUndefined();
    expect(loadApplicationConfig({ ...production, BOOTSTRAP_TOKEN: "" }).BOOTSTRAP_TOKEN).toBeUndefined();
    expect(() => loadApplicationConfig({ ...production, BOOTSTRAP_TOKEN: "short" })).toThrow();
  });
  test("production BYOC requires HTTPS and cannot enable platform bootstrap", () => {
    const base={DATABASE_URL:"postgres://localhost/test",SESSION_SECRET:"a-session-secret-with-more-than-32-characters",NODE_ENV:"production",DEPLOYMENT_MODE:"client-cloud",AUTH_MODE:"local",WEB_ORIGIN:"https://hospital.example.test",PATIENT_DATA_ENCRYPTION_KEY:Buffer.alloc(32,1).toString("base64")};
    expect(loadApplicationConfig(base).AUTH_MODE).toBe("local");
    for(const change of [{WEB_ORIGIN:"http://hospital.example.test"},{AUTH_MODE:"disabled"},{BOOTSTRAP_TOKEN:"a-private-platform-token-with-more-than32characters"},{SCORING_API_URL:"http://scoring.example.test",SCORING_CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,2).toString("base64")}]) expect(()=>loadApplicationConfig({...base,...change})).toThrow();
  });

  test("secure cookies can be enabled for HTTPS development deployments", () => {
    const base = { DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "a-development-secret-with-32-chars" };
    expect(loadApplicationConfig(base).SECURE_COOKIES).toBe(false);
    expect(loadApplicationConfig({ ...base, SECURE_COOKIES: "true" }).SECURE_COOKIES).toBe(true);
    expect(loadApplicationConfig({ ...base, SECURE_COOKIES: "false" }).SECURE_COOKIES).toBe(false);
    expect(() => loadApplicationConfig({ ...base, SECURE_COOKIES: "yes" })).toThrow();
  });

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
    expect(config.REPORT_GENERATION_TIMEOUT_MS).toBe(720_000);
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

test("fixed OTP defaults off and is rejected outside development", () => {
  const base = { DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "a-development-secret-with-32-chars", PATIENT_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") };
  expect(loadApplicationConfig(base).DEV_FIXED_OTP).toBe(false);
  expect(loadApplicationConfig({ ...base, DEV_FIXED_OTP: "true" }).DEV_FIXED_OTP).toBe(true);
  for (const NODE_ENV of ["production", "test"])
    expect(() => loadApplicationConfig({ ...base, NODE_ENV, DEV_FIXED_OTP: "true" })).toThrow("Fixed OTP is allowed only in development");
});

test("browser push keys must be configured together", () => {
  const base = { DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "a-development-secret-with-32-chars" };
  expect(loadApplicationConfig(base).VAPID_PUBLIC_KEY).toBeUndefined();
  expect(() => loadApplicationConfig({ ...base, VAPID_PUBLIC_KEY: "A".repeat(87) })).toThrow("Configure all VAPID values together");
  expect(loadApplicationConfig({ ...base, VAPID_PUBLIC_KEY: "A".repeat(87), VAPID_PRIVATE_KEY: "B".repeat(43), VAPID_SUBJECT: "mailto:ops@example.com" }).VAPID_SUBJECT).toBe("mailto:ops@example.com");
});

for (const NODE_ENV of ["development", "test", "production"]) {
  test(`report diagnostics opt-in is independent of ${NODE_ENV}`, () => {
    const base = { NODE_ENV, DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "a-development-secret-with-32-chars",
      PATIENT_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") };
    expect(loadApplicationConfig(base).REPORT_DIAGNOSTICS_ENABLED).toBe(false);
    expect(loadApplicationConfig({ ...base, REPORT_DIAGNOSTICS_ENABLED: "false" }).REPORT_DIAGNOSTICS_ENABLED).toBe(false);
    expect(loadApplicationConfig({ ...base, REPORT_DIAGNOSTICS_ENABLED: "true" }).REPORT_DIAGNOSTICS_ENABLED).toBe(true);
    expect(() => loadApplicationConfig({ ...base, REPORT_DIAGNOSTICS_ENABLED: "yes" })).toThrow();
  });
}
