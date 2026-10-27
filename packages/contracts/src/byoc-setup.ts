import { z } from "zod";

// Roles and entitlements are deployment-controlled, never supplied by setup callers.
export const byocSetupRequestSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  organizationSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.email().max(320),
  adminPassword: z.string().min(12).max(256),
}).strict();
export type ByocSetupRequest = z.infer<typeof byocSetupRequestSchema>;
export const byocSetupStatusSchema = z.object({
  state: z.enum(["pending", "completed"]),
  origin: z.url(),
  httpsConfigured: z.boolean(),
  scoringConfigured: z.boolean(),
  otpDeliveryConfigured: z.boolean(),
  expiresAt: z.iso.datetime(),
}).strict();
export type ByocSetupStatus = z.infer<typeof byocSetupStatusSchema>;
