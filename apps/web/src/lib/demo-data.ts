export type AssessmentStatus = "Draft" | "Pending scoring" | "Scoring unavailable" | "Under review" | "Completed";
export type PatientSummary = { id: string; reference: string; displayName: string; age: number; gender: string; facility: string; lastAssessment: string; status: AssessmentStatus };
export const patients: PatientSummary[] = [
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FA1", reference: "NIQ-1042", displayName: "Patient NIQ-1042", age: 54, gender: "Female", facility: "Chennai Central", lastAssessment: "12 Sep 2026", status: "Under review" },
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FA2", reference: "NIQ-1038", displayName: "Patient NIQ-1038", age: 61, gender: "Male", facility: "Hyderabad", lastAssessment: "11 Sep 2026", status: "Pending scoring" },
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FA3", reference: "NIQ-1031", displayName: "Patient NIQ-1031", age: 47, gender: "Female", facility: "Chennai Central", lastAssessment: "9 Sep 2026", status: "Completed" },
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FA4", reference: "NIQ-1029", displayName: "Patient NIQ-1029", age: 68, gender: "Male", facility: "Bengaluru", lastAssessment: "8 Sep 2026", status: "Scoring unavailable" },
];
export const facilities = [
  { id: "facility-1", name: "Chennai Central", code: "CHE-C", timezone: "Asia/Kolkata", users: 34, assessments: 128 },
  { id: "facility-2", name: "Hyderabad", code: "HYD", timezone: "Asia/Kolkata", users: 21, assessments: 84 },
  { id: "facility-3", name: "Bengaluru", code: "BLR", timezone: "Asia/Kolkata", users: 15, assessments: 52 },
];
export const users = [
  { name: "Ananya Rao", email: "ananya@example.test", role: "Organization admin", facility: "All facilities", status: "Active" as const, mfa: true },
  { name: "Meera Shah", email: "meera@example.test", role: "Medical user", facility: "Chennai Central", status: "Active" as const, mfa: true },
  { name: "Arjun Nair", email: "arjun@example.test", role: "Medical user", facility: "Hyderabad", status: "Invited" as const, mfa: false },
  { name: "Devika Iyer", email: "devika@example.test", role: "Medical user", facility: "Bengaluru", status: "Active" as const, mfa: false },
];
export const assessments = [
  { id: "ASM-2048", patientId: patients[0]!.id, patient: patients[0]!.displayName, facility: "Chennai Central", date: "12 Sep 2026", status: "Under review" as AssessmentStatus, version: "NIQ-DRAFT-2026-09" },
  { id: "ASM-2047", patientId: patients[1]!.id, patient: patients[1]!.displayName, facility: "Hyderabad", date: "11 Sep 2026", status: "Pending scoring" as AssessmentStatus, version: "Awaiting scoring" },
  { id: "ASM-2046", patientId: patients[2]!.id, patient: patients[2]!.displayName, facility: "Chennai Central", date: "9 Sep 2026", status: "Completed" as AssessmentStatus, version: "NIQ-DRAFT-2026-09" },
  { id: "ASM-2045", patientId: patients[3]!.id, patient: patients[3]!.displayName, facility: "Bengaluru", date: "8 Sep 2026", status: "Scoring unavailable" as AssessmentStatus, version: "Not scored" },
];
