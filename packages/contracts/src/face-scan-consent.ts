import { z } from "zod";

export const faceScanConsentRecordSchema = z.object({
  id: z.string(),
  method: z.enum(["LINK", "UPLOAD"]),
  provenance: z.enum(["SIMULATED", "SIGNED_UPLOAD"]),
  status: z.enum(["REQUESTED", "APPROVED"]),
  requestedAt: z.iso.datetime().nullable(),
  respondedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  fileName: z.string().nullable(),
  mediaType: z.enum(["application/pdf", "image/jpeg", "image/png"]).nullable(),
  size: z.number().int().positive().nullable(),
}).strict();

export const faceScanConsentSummarySchema = z.object({
  current: faceScanConsentRecordSchema.nullable(),
  demoEnabled: z.boolean(),
}).strict();

export type FaceScanConsentSummary = z.infer<typeof faceScanConsentSummarySchema>;
