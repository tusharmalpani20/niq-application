import { faceScanListSchema, faceScanSessionSchema, faceScanSignalSchema, FACE_SCAN_MAX_BYTES, type FaceScanSignal, type FaceScanSession } from "@niq/application-contracts";
import { assessmentRequest } from "./workflow-api";

const base = (id: string) => `/assessments/${encodeURIComponent(id)}/face-scans`;
// A stalled connection must reach recovery rather than locking capture/navigation indefinitely.
const request = (org: string, path: string, method = "GET", body?: unknown) =>
  assessmentRequest(org, path, method, body, AbortSignal.timeout(60_000));
export const listFaceScans = async (org: string, id: string) => faceScanListSchema.parse(await request(org, base(id)));
export async function getFaceScanAvailability(org: string, id: string): Promise<{ available: boolean; reason: string | null }> {
  const value: unknown = await request(org, `${base(id)}/availability`);
  if (!value || typeof value !== "object" || !("available" in value) || typeof value.available !== "boolean" || !("reason" in value) || (value.reason !== null && typeof value.reason !== "string")) throw new Error("Invalid face scan availability response");
  return { available: value.available, reason: value.reason };
}
export const startFaceScan = async (org: string, id: string, revision: number, requestKey: string, posture: FaceScanSession["context"]["posture"]) => faceScanSessionSchema.parse(await request(org, base(id), "POST", { revision, posture, requestKey }));
export const cancelFaceScan = async (org: string, id: string, sessionId: string) => faceScanSessionSchema.parse(await request(org, `${base(id)}/${encodeURIComponent(sessionId)}/cancel`, "POST"));
export async function uploadFaceScan(org: string, id: string, sessionId: string, signal: FaceScanSignal) {
  const payload = faceScanSignalSchema.parse(signal);
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > FACE_SCAN_MAX_BYTES) throw new Error("The scan is too large to upload. Please cancel and try again.");
  return faceScanSessionSchema.parse(await request(org, `${base(id)}/${encodeURIComponent(sessionId)}/signal`, "POST", payload));
}
