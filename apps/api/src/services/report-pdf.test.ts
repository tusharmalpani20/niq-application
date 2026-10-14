import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { GeneratedReport } from "@niq/application-contracts";
import sharp from "sharp";
import { renderGeneratedReportHtml, renderGeneratedReportPdf } from "./report-pdf";

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
  const imageCount = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1").match(/\/Subtype\s*\/Image\b/g)?.length ?? 0;
  expect(imageCount(withoutLogo)).toBeGreaterThan(imageCount(withWebp));
  expect(imageCount(withDamagedLogo)).toBe(imageCount(withoutLogo));
});

test("a new PDF uses the organization's current color theme", async () => {
  const first = await renderGeneratedReportPdf(report, { name: "Example Clinic", primaryColor: "#138f94", secondaryColor: "#294e7d" });
  const second = await renderGeneratedReportPdf(report, { name: "Example Clinic", primaryColor: "#a04362", secondaryColor: "#692a81" });
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  expect(digest(first)).not.toBe(digest(second));
});

test("the PDF document uses the preview layout with embedded assets and omits HbA1c", async () => {
  const withFaceScan = {
    ...report,
    metrics: [
      { id: "heart_rate", label: "Heart rate", value: "66", unit: "bpm", source: "face_scan" },
      { id: "hba1c", label: "HbA1c", value: "7.1", unit: "%", source: "face_scan" },
    ],
  } as GeneratedReport;
  const html = await renderGeneratedReportHtml(withFaceScan, { name: "Example Clinic", primaryColor: "#138f94" });
  expect(html).toContain('class="clinical-report"');
  expect(html).toContain("Vital IQ measurements");
  expect(html).toContain("Heart rate");
  expect(html).not.toContain("HbA1c");
  expect(html).toContain("data:image/png;base64,");
  expect(html).toContain("@page");
});

test("possible effect summaries appear in the PDF layout without raw source advice", async () => {
  const withPossible = { ...report, guidance: { sections: [{
    id: "possible-1", kind: "toxicity", title: "Mouth discomfort", certainty: "possible", drugClass: "Taxanes",
    text: "If mouth discomfort occurs, discuss soft food choices with your care team.",
  }] } } as GeneratedReport;
  const html = await renderGeneratedReportHtml(withPossible, { name: "Example Clinic", primaryColor: "#138f94" });
  expect(html).toContain("Possible treatment effects");
  expect(html).toContain("They have not been reported as symptoms");
  expect(html).toContain("If mouth discomfort occurs");
  expect(html).toContain("cr-possible-effect");
});
