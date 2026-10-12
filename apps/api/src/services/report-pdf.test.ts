import { expect, test } from "bun:test";
import type { GeneratedReport } from "@niq/application-contracts";
import sharp from "sharp";
import { renderGeneratedReportPdf } from "./report-pdf";

const report = {
  assessment: { id: "assessment-1", reference: "A-1", completedAt: "2026-10-12T12:00:00Z" },
  patient: { displayName: "Example Patient", reference: "P-1", dateOfBirth: "1980-01-01", gender: "FEMALE" },
  classification: { id: "moderate", label: "Moderate risk", score: 25 },
  metrics: [],
  weightHistory: [],
  narrative: { overview: "Verified assessment overview.", keyFindings: "", actionSummary: "", monitoringSummary: "" },
  guidance: { sections: [] },
} as unknown as GeneratedReport;

test("server renders a branded PDF with or without a valid logo", async () => {
  const sourceLogo = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#00a1a8" } }).webp().toBuffer();
  const brand = { name: "Example Clinic", primaryColor: "#138f94", secondaryColor: "#294e7d" };
  const [withWebp, withoutLogo, withDamagedLogo] = await Promise.all([
    renderGeneratedReportPdf(report, { ...brand, logo: { data: sourceLogo, mimeType: "image/webp" } }),
    renderGeneratedReportPdf(report, brand),
    renderGeneratedReportPdf(report, { ...brand, logo: { data: new Uint8Array([1, 2, 3]), mimeType: "image/png" } }),
  ]);
  for (const bytes of [withWebp, withoutLogo, withDamagedLogo]) {
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  }
});
