import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const optionalEncryptionKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().refine((value) => {
    try { return Buffer.from(value, "base64").length === 32; } catch { return false; }
  }, "Must be a base64-encoded 32-byte key").optional(),
);

export const applicationConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_REGION: z.enum(["india", "us", "eu"]).default("india"),
  DEPLOYMENT_MODE: z.enum(["niq-hosted", "client-cloud", "on-prem"]).default("niq-hosted"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanFromString,
  SCORING_API_URL: optionalUrl,
  FACE_SCAN_ENABLED: booleanFromString,
  FACE_SCAN_EMPLOYEE_ID_OVERRIDE: z.preprocess(
    value => typeof value === "string" && !value.trim() ? undefined : value,
    z.string().trim().min(1).max(128).optional(),
  ),
  FACE_SCAN_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
  SCORING_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
  SCORING_CREDENTIAL_ENCRYPTION_KEY: optionalEncryptionKey,
  SCORING_CREDENTIAL_KEY_VERSION: z.string().trim().min(1).max(64).default("local-v1"),
  PATIENT_DATA_ENCRYPTION_KEY: optionalEncryptionKey,
  PATIENT_DATA_KEY_VERSION: z.string().trim().min(1).max(64).default("local-v1"),
  AUTH_MODE: z.enum(["disabled", "local", "oidc"]).default("disabled"),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("niq_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  MFA_OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(15).default(10),
  MFA_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  MFA_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(300).default(30),
  MFA_MAX_RESENDS: z.coerce.number().int().min(1).max(5).default(3),
  AUTH_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  DEV_OTP_DELIVERY: booleanFromString,
  DEV_FIXED_OTP: booleanFromString,
  REPORT_UPLOAD_ROOT: z.preprocess(value => value === "" ? undefined : value, z.string().startsWith("/").optional()),
  REPORT_MAX_FILE_BYTES: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(10 * 1024 * 1024),
  REPORT_MAX_FILES_PER_GROUP: z.coerce.number().int().positive().default(10),
  REPORT_MAX_GROUPS: z.coerce.number().int().positive().default(20),
  REPORT_MAX_ASSESSMENT_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).superRefine((value, context) => {
  if (value.DEV_FIXED_OTP && value.NODE_ENV !== "development") {
    context.addIssue({ code: "custom", path: ["DEV_FIXED_OTP"], message: "Fixed OTP is allowed only in development" });
  }
  if (value.NODE_ENV !== "development" && value.FACE_SCAN_EMPLOYEE_ID_OVERRIDE) {
    context.addIssue({ code: "custom", path: ["FACE_SCAN_EMPLOYEE_ID_OVERRIDE"], message: "Face scan employee override is allowed only in development" });
  }
  if (value.NODE_ENV === "production" && value.DEV_OTP_DELIVERY) {
    context.addIssue({ code: "custom", path: ["DEV_OTP_DELIVERY"], message: "Development OTP delivery is forbidden in production" });
  }
  if (value.NODE_ENV === "production" && value.AUTH_MODE === "local" && !value.BOOTSTRAP_TOKEN) {
    context.addIssue({ code: "custom", path: ["BOOTSTRAP_TOKEN"], message: "A bootstrap token is required for initial production setup" });
  }
  if (value.NODE_ENV === "production" && value.SCORING_API_URL && !value.SCORING_CREDENTIAL_ENCRYPTION_KEY) {
    context.addIssue({ code: "custom", path: ["SCORING_CREDENTIAL_ENCRYPTION_KEY"], message: "A credential encryption key is required when scoring is configured" });
  }
  if (value.NODE_ENV === "production" && !value.PATIENT_DATA_ENCRYPTION_KEY) {
    context.addIssue({ code: "custom", path: ["PATIENT_DATA_ENCRYPTION_KEY"], message: "A patient data encryption key is required in production" });
  }
});

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;

export function loadApplicationConfig(environment: Record<string, string | undefined>): ApplicationConfig {
  return applicationConfigSchema.parse(environment);
}
