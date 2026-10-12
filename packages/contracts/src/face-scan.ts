import { z } from "zod";
export const FACE_SCAN_MAX_BYTES = 2 * 1024 * 1024;
/** CarePlix rejected a scan when the submitted birth date was less than one year ago. */
export function isUnderOneYearOldForFaceScan(dateOfBirth: string | null | undefined, asOf = new Date()): boolean {
  if (!dateOfBirth || !z.iso.date().safeParse(dateOfBirth).success) return false;
  const cutoff = new Date(asOf);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return dateOfBirth > cutoff.toISOString().slice(0, 10);
}
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
    points: metric.optional(),
    ruleVersionId: z.string().nullable().optional(),
    wellnessScore: metric.optional(),
    wellnessPoints: metric.optional(),
    stressIndex: metric.optional(),
    stressBand: z.string().nullable().optional(),
    stressPoints: metric.optional(),
    scoringVersion: z.string().nullable().optional()
  }).nullable()
});
export const faceScanListSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
  sessions: z.array(faceScanSessionSchema),
  currentSessionId: z.string().nullable()
});
export type FaceScanSession = z.infer<typeof faceScanSessionSchema>;

// Keep the saved Vital IQ detail labels and units consistent across the
// assessment screen and the clinical report. Unknown provider fields stay out.
export const faceScanAdditionalMetricGroups = [
  { id: "circulation", title: "Heart & circulation", metrics: [
    { key: "sdnn", id: "sdnn", label: "SDNN", unit: "ms" },
    { key: "rmssd", id: "rmssd", label: "RMSSD", unit: "ms" },
    { key: "pnn50", id: "pnn50", label: "PNN50", unit: "%" },
    { key: "cardiacOutput", id: "cardiac_output", label: "Cardiac output", unit: "L/min" },
    { key: "meanArterialPressure", id: "mean_arterial_pressure", label: "Mean arterial pressure", unit: "mmHg" },
    { key: "heartUtilisation", id: "heart_utilisation", label: "Heart utilisation", unit: "%" },
    { key: "heartRateMax", id: "heart_rate_max", label: "Maximum heart rate", unit: "bpm" },
    { key: "heartRateReserve", id: "heart_rate_reserve", label: "Heart-rate reserve", unit: "bpm" },
    { key: "targetHeartRateRange", id: "target_heart_rate_range", label: "Target heart-rate range", unit: "bpm" },
    { key: "stressIndex", id: "stress_index", label: "Stress index", unit: "" },
    { key: "prq", id: "prq", label: "Pulse-respiration quotient", unit: "" },
  ] },
  { id: "fitness", title: "Body & fitness", metrics: [
    { key: "bmi", id: "scan_bmi", label: "Scan BMI", unit: "kg/m²" },
    { key: "vo2max", id: "vo2max", label: "VO₂ max", unit: "mL/kg/min" },
    { key: "intensity", id: "intensity", label: "Activity intensity", unit: "" },
    { key: "bodyFat", id: "body_fat", label: "Body fat", unit: "%" },
    { key: "totalBodyWater", id: "total_body_water", label: "Total body water", unit: "" },
    { key: "bodyWaterPercent", id: "body_water_percent", label: "Body water", unit: "%" },
    { key: "bloodVolume", id: "blood_volume", label: "Blood volume", unit: "" },
  ] },
  { id: "other", title: "Other scores", metrics: [
    { key: "heartHealthScore", id: "heart_health_score", label: "Heart health score", unit: "/100" },
    { key: "hba1c", id: "hba1c", label: "HbA1c", unit: "%" },
    { key: "diabetesControlScore", id: "diabetes_control_score", label: "Diabetes control score", unit: "/100" },
  ] },
] as const;

/** A finished capture only satisfies required scanning when it can be used in scoring. */
export function hasUsableFaceScan(session: FaceScanSession | null | undefined): boolean {
  return session?.state === "COMPLETED" && session.failureCode === null && session.result !== null && session.score?.status === "SCORED";
}
export type FaceScanSignal = z.infer<typeof faceScanSignalSchema>;
export type FaceScanContext = z.infer<typeof faceScanContextSchema>;
export type FaceScanList = z.infer<typeof faceScanListSchema>;
