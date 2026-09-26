import { expect, test } from "bun:test";
import { uploadFaceScanConsent } from "./face-scan-consent-api";

test("signed consent upload sends the file to its own consent endpoint with integrity headers", async () => {
  const original = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init: init! });
    return Response.json({ current: { id: "consent", method: "UPLOAD", provenance: "SIGNED_UPLOAD", status: "APPROVED", requestedAt: null, respondedAt: new Date().toISOString(), createdAt: new Date().toISOString(), fileName: "signed.pdf", mediaType: "application/pdf", size: 11 }, demoEnabled: true });
  };
  try {
    const file = new File(["%PDF-1.7\nX"], "signed.pdf", { type: "application/pdf" });
    const result = await uploadFaceScanConsent("org", "assessment", 4, file, "upload-key-at-least-16");
    expect(result.current?.status).toBe("APPROVED");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toEndWith("/assessments/assessment/face-scan-consent/upload");
    expect(requests[0]?.init.body).toBe(file);
    expect(requests[0]?.init.headers).toMatchObject({ "x-assessment-revision": "4", "x-upload-key": "upload-key-at-least-16", "x-file-name": "signed.pdf", "content-type": "application/pdf" });
    expect((requests[0]?.init.headers as Record<string, string>)["x-file-sha256"]).toMatch(/^[a-f0-9]{64}$/);
  } finally { globalThis.fetch = original; }
});
