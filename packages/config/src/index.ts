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
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;

export function loadApplicationConfig(environment: Record<string, string | undefined>): ApplicationConfig {
  return applicationConfigSchema.parse(environment);
}
