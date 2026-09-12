import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
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
  SCORING_CLIENT_ID: z.string().optional(),
  SCORING_DEPLOYMENT_ID: z.string().optional(),
  SCORING_CLIENT_SECRET: z.string().optional(),
  SCORING_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
  AUTH_MODE: z.enum(["disabled", "local", "oidc"]).default("disabled"),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("niq_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  MFA_OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(15).default(10),
  MFA_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  AUTH_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  DEV_OTP_DELIVERY: booleanFromString,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.DEV_OTP_DELIVERY) {
    context.addIssue({ code: "custom", path: ["DEV_OTP_DELIVERY"], message: "Development OTP delivery is forbidden in production" });
  }
  if (value.NODE_ENV === "production" && value.AUTH_MODE === "local" && !value.BOOTSTRAP_TOKEN) {
    context.addIssue({ code: "custom", path: ["BOOTSTRAP_TOKEN"], message: "A bootstrap token is required for initial production setup" });
  }
});

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;

export function loadApplicationConfig(environment: Record<string, string | undefined>): ApplicationConfig {
  return applicationConfigSchema.parse(environment);
}
