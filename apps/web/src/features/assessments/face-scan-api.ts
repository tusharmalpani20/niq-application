import { faceScanListSchema, faceScanSessionSchema, faceScanSignalSchema, FACE_SCAN_MAX_BYTES, type FaceScanSignal } from "@niq/application-contracts";
import { assessmentRequest } from "./workflow-api";

const base = (id: string) => `/assessments/${encodeURIComponent(id)}/face-scans`;
// A stalled connection must reach recovery rather than locking capture/navigation indefinitely.
const request = (org: string, path: string, method = "GET", body?: unknown) =>
  assessmentRequest(org, path, method, body, AbortSignal.timeout(60_000));
export const listFaceScans = async (org: string, id: string) => faceScanListSchema.parse(await request(org, base(id)));
export const startFaceScan = async (org: string, id: string, revision: number, requestKey: string) => faceScanSessionSchema.parse(await request(org, base(id), "POST", { revision, posture: "resting", requestKey }));
export const cancelFaceScan = async (org: string, id: string, sessionId: string) => faceScanSessionSchema.parse(await request(org, `${base(id)}/${encodeURIComponent(sessionId)}/cancel`, "POST"));
export async function uploadFaceScan(org: string, id: string, sessionId: string, signal: FaceScanSignal) {
  const payload = faceScanSignalSchema.parse(signal);
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > FACE_SCAN_MAX_BYTES) throw new Error("The scan is too large to upload. Please cancel and try again.");
  return faceScanSessionSchema.parse(await request(org, `${base(id)}/${encodeURIComponent(sessionId)}/signal`, "POST", payload));
}
