import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { reportBrandingPayload } from "@niq/application-contracts";
import { approveGeneratedReport, pdfSha256, reportBrandingFingerprint, uploadGeneratedReportPdf } from "./generated-report-api";

test("browser report branding and PDF fingerprints match the server digest", async () => {
  const brand = { displayName: " Example Clinic ", logoObjectKey: "database:logo-1", primaryColor: "#112233", secondaryColor: "#445566" };
  const expectedBrand = createHash("sha256").update(reportBrandingPayload(brand)).digest("hex");
  expect(await reportBrandingFingerprint(brand)).toBe(expectedBrand);
  const pdf = new Blob(["%PDF-1.7\nExample\n%%EOF"], { type: "application/pdf" });
  expect(await pdfSha256(pdf)).toBe(createHash("sha256").update(Buffer.from(await pdf.arrayBuffer())).digest("hex"));
});

test("PDF upload and approval transmit the theme and reviewed file identity", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{url: string; init: RequestInit}> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json({ report: {} });
  };
  try {
    await uploadGeneratedReportPdf("org", "assessment", 3, "a".repeat(64), new Blob(["pdf"]));
    await approveGeneratedReport("org", "assessment", 3, "b".repeat(64));
  } finally { globalThis.fetch = originalFetch; }
  expect(calls[0]?.init.headers).toMatchObject({ "x-report-branding-fingerprint": "a".repeat(64) });
  expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ revision: 3, reviewedSha256: "b".repeat(64) });
});
