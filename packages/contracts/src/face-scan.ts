import { z } from "zod";
export const FACE_SCAN_MAX_BYTES = 2 * 1024 * 1024;
export const faceScanStateSchema = z.enum(["REQUESTED", "UPLOAD_ACCEPTED", "PROCESSING", "COMPLETED", "RECONCILIATION_REQUIRED", "FAILED", "EXPIRED", "CANCELLED", "PAUSED"]);
export const faceScanContextSchema = z.object({
  dob: z.iso.date().refine(value => value <= new Date().toISOString().slice(0, 10)),
  gender: z.enum(["male", "female"]),
  heightCm: z.number().finite().positive().max(300),
  weightKg: z.number().finite().positive().max(700),
  posture: z.enum(["resting", "standing", "walking", "exercising"]),
  employeeId: z.string().min(1).max(128)
}).strict();
export const startFaceScanSchema = z.object({
  revision: z.number().int().nonnegative(),
  requestKey: z.string().min(16).max(128),
  posture: z.enum(["resting", "standing", "walking", "exercising"])
}).strict();
export const faceScanSignalSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  raw_intensity: z.array(z.object({
    r: z.number().finite().nonnegative(),
    g: z.number().finite().nonnegative(),
    b: z.number().finite().nonnegative()
  }).strict()).min(1).max(12000),
  ppg_time: z.array(z.number().finite().nonnegative()).min(1).max(12000),
  average_fps: z.number().finite().positive().max(240),
  device: z.enum(["RPPG_CAREPLIX_FACE_IOS", "RPPG_CAREPLIX_FACE_ANDROID"]).optional(),
  deviceModel: z.string().min(1).max(200).optional()
}).strict().superRefine((v, c) => {
  if (v.raw_intensity.length !== v.ppg_time.length || v.ppg_time.some((t, i) => i > 0 && t <= v.ppg_time[i - 1]!))
    c.addIssue({
      code: "custom",
      message: "Signal samples and increasing timings must align."
    });
});
const metric = z.number().finite().nullable();
export const faceScanResultSchema = z.object({
  schemaVersion: z.literal(1),
  providerScanId: z.string(),
  providerCompletedAt: z.string().refine(value => Number.isFinite(Date.parse(value))).nullable().optional(),
  wellnessScore: metric,
  healthRiskScore: metric,
  vitals: z.object({
    heartRate: metric,
    oxygenSaturation: metric,
    respiratoryRate: metric,
    systolic: metric,
    diastolic: metric
  }),
  additionalMetrics: z.record(z.string(), z.union([z.number().finite(), z.string(), z.null()])).optional(),
  physiologicalScore: metric,
  mentalWellbeingScore: metric
});
export const faceScanSessionSchema = z.object({
  id: z.string(),
  state: faceScanStateSchema,
  context: faceScanContextSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  failureCode: z.string().nullable(),
  result: faceScanResultSchema.nullable(),
  score: z.object({
    status: z.string(),
    points: metric.optional()
  }).passthrough().nullable()
});
export const faceScanListSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
  sessions: z.array(faceScanSessionSchema),
  currentSessionId: z.string().nullable()
});
export type FaceScanSession = z.infer<typeof faceScanSessionSchema>;
export type FaceScanSignal = z.infer<typeof faceScanSignalSchema>;
export type FaceScanContext = z.infer<typeof faceScanContextSchema>;
export type FaceScanList = z.infer<typeof faceScanListSchema>;
