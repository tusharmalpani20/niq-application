import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { GeneratedReport } from "@niq/application-contracts";
import sharp from "sharp";
import { renderGeneratedReportHtml, renderGeneratedReportPdf } from "./report-pdf";

const report = {
  assessment: { id: "assessment-1", reference: "A-1", completedAt: "2026-10-12T12:00:00Z" },
  patient: { displayName: "Example Patient", reference: "P-1", dateOfBirth: "1980-01-01", gender: "FEMALE" },
  classification: { id: "moderate", label: "Moderate risk", score: 25 },
  decision: { plannedTreatmentStartDate: null },
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
}, 30_000);

test("a new PDF uses the organization's current color theme", async () => {
  const first = await renderGeneratedReportPdf(report, { name: "Example Clinic", primaryColor: "#138f94", secondaryColor: "#294e7d" });
  const second = await renderGeneratedReportPdf(report, { name: "Example Clinic", primaryColor: "#a04362", secondaryColor: "#692a81" });
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  expect(digest(first)).not.toBe(digest(second));
}, 30_000);

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
  expect(html).toContain("data:image/webp;base64,");
  expect(html).not.toContain('class="cr-section-number"');
  expect(html).toContain("@page");
});

test("possible effect summaries appear in the PDF layout without raw source advice", async () => {
  const withPossible = { ...report, guidance: { sections: [{
    id: "possible-1", kind: "toxicity", title: "Mouth discomfort", certainty: "possible", drugClass: "Taxanes",
    text: "If mouth discomfort occurs, discuss soft food choices with your care team.",
  }] } } as GeneratedReport;
  const html = await renderGeneratedReportHtml(withPossible, { name: "Example Clinic", primaryColor: "#138f94" });
  expect(html).toContain("Possible treatment effects");
  expect(html).toContain("The guidance explains what to do if they occur.");
  expect(html).toContain("Contact your care team about new or worsening symptoms.");
  expect(html).not.toContain("They have not been reported as symptoms");
  expect(html).toContain("If mouth discomfort occurs");
  expect(html).toContain("cr-possible-effect");
});

test("legacy full-sentence emphasis preserves separate warning bullets without bolding whole sentences", async () => {
  const current = { ...report, narrative: { ...report.narrative,
    redFlagsAdvice: "**Contact your doctor for fever.** **Call for breathlessness.**",
  } } as GeneratedReport;
  const html = await renderGeneratedReportHtml(current, { name: "Example Clinic", primaryColor: "#138f94" });
  const warningList = html.match(/When to seek urgent help[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  expect(warningList.match(/<li\b/g)).toHaveLength(2);
  expect(warningList.replace(/<[^>]*>/g, "")).toBe("Contact your doctor for fever.Call for breathlessness.");
  expect(warningList).not.toContain('class="cr-narrative-emphasis">Contact your doctor for fever.</strong>');
});

test("reviewed advice keeps explicit newline points separate without terminal punctuation", async () => {
  const current = { ...report, narrative: { ...report.narrative,
    redFlagsAdvice: "**Contact your doctor for fever.**\nCall for breathlessness\nSeek urgent help for chest pain",
  } } as GeneratedReport;
  const html = await renderGeneratedReportHtml(current, { name: "Example Clinic", primaryColor: "#138f94" });
  const warningList = html.match(/When to seek urgent help[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  expect(warningList.match(/<li\b/g)).toHaveLength(3);
  expect(warningList).toContain('class="cr-narrative-emphasis">Contact your doctor</strong> for fever.');
  expect(warningList).toContain("Call for breathlessness");
  expect(warningList).toContain("Seek urgent help for chest pain");
});

test("print preserves live section borders, headers, logos and footer dividers", async () => {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.REPORT_CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setContent(await renderGeneratedReportHtml(report, { name: "Example Clinic", primaryColor: "#138f94" }));
    await page.emulateMedia({ media: "print" });
    const borders = await page.evaluate(() => ({
      sections: Array.from(document.querySelectorAll(".cr-sheet:not(.cr-cover)")).map(section => getComputedStyle(section).borderTopWidth),
      cards: Array.from(document.querySelectorAll(".cr-overview-hero, .cr-clinical-interpretation")).map(card => getComputedStyle(card).borderTopWidth),
      headers: Array.from(document.querySelectorAll(".cr-sheet:not(.cr-cover) > .cr-sheet-header")).map(header => ({ display: getComputedStyle(header).display, title: header.querySelector("h2")?.textContent, logos: header.querySelectorAll("img").length })),
      footers: Array.from(document.querySelectorAll(".cr-sheet:not(.cr-cover) > .cr-sheet-footer")).map(footer => ({display: getComputedStyle(footer).display, border: getComputedStyle(footer).borderTopWidth})),
    }));
    expect(borders.sections.length).toBeGreaterThan(1);
    expect(borders.sections.every(width => width !== "0px")).toBe(true);
    expect(borders.cards.some(width => width !== "0px")).toBe(true);
    expect(borders.headers.every(header => header.display !== "none" && header.title && header.logos >= 1)).toBe(true);
    expect(borders.footers.every(footer => footer.display !== "none" && footer.border !== "0px")).toBe(true);
  } finally { await browser.close(); }
}, 30_000);


test("PDF omits historical reuse labels while retaining internal measurement provenance", async () => {
  const historical = { ...report, metrics: [{ id: "heart_rate", label: "Heart rate", value: "66", unit: "bpm", source: "face_scan", measuredAt: "2026-10-21T08:00:00Z", historicalSource: { sessionId: "source", assessmentReference: "ASM-003545", capturedAt: "2026-10-21T08:00:00Z" } }] } as GeneratedReport;
  const html = await renderGeneratedReportHtml(historical, { name: "Example Clinic", primaryColor: "#138f94" });
  expect(html).not.toContain("Historical measurement");
  expect(html).not.toContain("Recorded 21 Oct 2026");
  expect(html).not.toContain("reused from ASM-003545");
  expect(historical.metrics[0]!.historicalSource?.assessmentReference).toBe("ASM-003545");
  expect(html).toContain("66");
});
