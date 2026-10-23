import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { paginateReportSheets } from "./report-pdf-pagination";
import { renderGeneratedReportHtml } from "./report-pdf";
import type { GeneratedReport } from "@niq/application-contracts";

// Real Chromium measurements catch wrapper/overflow regressions that DOM mocks
// cannot: every fragment must fit between the existing branded header/footer.
test("physical pages keep whole cards and split oversized nested advice only at groups or bullets", async () => {
  const browser = await chromium.launch({ executablePath: process.env.REPORT_CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    const report = {
      assessment: { id: "assessment-1", reference: "A-1", completedAt: "2026-10-12T12:00:00Z" },
      patient: { displayName: "Example Patient", reference: "P-1" },
      classification: { label: "Moderate risk", score: 25 }, decision: {}, metrics: [], weightHistory: [],
      narrative: { overview: "", keyFindings: "", actionSummary: "", monitoringSummary: "" }, guidance: {sections: []},
    } as unknown as GeneratedReport;
    await page.setContent(await renderGeneratedReportHtml(report, { name: "Example Clinic", primaryColor: "#138f94" }));
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
    await page.evaluate(() => {
      const report = document.querySelector(".clinical-report")!;
      const source = report.querySelector(".cr-sheet:not(.cr-cover)")!;
      const section = (title: string, content: string) => {
        const sheet = source.cloneNode(true) as HTMLElement;
        sheet.querySelector("h2")!.textContent = title;
        sheet.querySelector(".cr-sheet-content")!.innerHTML = content;
        return sheet;
      };
      const points = (prefix: string, count: number) => Array.from({length: count}, (_, i) => `<li data-point="${prefix}-${i}"><svg width="15" height="15" aria-hidden="true"></svg><span>${prefix} ${i}: ${"Complete advice text with its conditions and practical instructions. ".repeat(7)}</span></li>`).join("");
      const group = (name: string) => `<div class="cr-advice-group"><h4>${name}</h4><ul class="cr-advice-points">${points(name, 5)}</ul></div>`;
      report.replaceChildren(
        report.querySelector(".cr-cover")!,
        section("Nested advice", `<div class="cr-care-stack"><section class="cr-advice-block"><div class="cr-advice-heading"><h3>Condition guidance</h3></div>${group("First")}${group("Second")}</section></div>`),
        section("Products", `<div class="cr-care-stack"><section class="cr-supplement cr-recommendations"><div class="cr-advice-heading"><h3>Nutritional supplement recommendations</h3></div><div class="cr-recommendation-list">${Array.from({length: 3}, (_, i) => `<article class="cr-recommendation-card" data-product="${i}" style="min-height: 450px"><h4>Product ${i}</h4><p>Complete product instructions ${i}</p></article>`).join("")}</div></section></div>`),
        section("Whole cards", `<div class="cr-possible-list">${Array.from({length: 4}, (_, i) => `<section class="cr-possible-effect" data-card="${i}"><h3>Effect ${i}</h3><ul class="cr-advice-points">${points(`Effect${i}`, 2)}</ul></section>`).join("")}</div>`),
      );
    });
    await page.evaluate(paginateReportSheets);
    const result = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".cr-sheet")).map(sheet => {
      const content = sheet.querySelector<HTMLElement>(":scope > .cr-sheet-content");
      const bounds = content?.getBoundingClientRect();
      const points = Array.from(sheet.querySelectorAll<HTMLElement>("[data-point]"));
      return {
        title: sheet.querySelector("h2")?.textContent ?? "Cover",
        footer: sheet.querySelector(".cr-sheet-footer > span:last-child")?.textContent,
        height: sheet.getBoundingClientRect().height,
        overflow: content ? content.scrollHeight > content.clientHeight + 1 : false,
        points: points.map(point => point.dataset.point),
        pointsFit: points.every(point => !bounds || point.getBoundingClientRect().bottom <= bounds.bottom + 1),
        cards: Array.from(sheet.querySelectorAll<HTMLElement>("[data-card]")).map(card => ({id: card.dataset.card, points: card.querySelectorAll("li").length})),
        logos: sheet.querySelectorAll(".cr-sheet-header img").length,
        products: Array.from(sheet.querySelectorAll<HTMLElement>("[data-product]")).map(card => ({id: card.dataset.product, text: card.textContent})),
        productHeading: sheet.querySelector(".cr-recommendations > .cr-advice-heading h3")?.textContent,
      };
    }));
    expect(result.length).toBeGreaterThan(3);
    expect(result.every(sheet => sheet.height >= 1122 && sheet.height <= 1123 && !sheet.overflow && sheet.pointsFit)).toBe(true);
    expect(result.map(sheet => sheet.footer)).toEqual(result.map((_, index) => String(index + 1).padStart(2, "0")));
    expect(result.slice(1).every(sheet => sheet.logos >= 1)).toBe(true);
    expect(result.some(sheet => sheet.title === "Nested advice (continued)")).toBe(true);
    const points = result.flatMap(sheet => sheet.points);
    expect(points).toEqual([
      ...["First", "Second"].flatMap(name => Array.from({length: 5}, (_, i) => `${name}-${i}`)),
      ...Array.from({length: 4}, (_, i) => [`Effect${i}-0`, `Effect${i}-1`]).flat(),
    ]);
    expect(result.flatMap(sheet => sheet.cards)).toEqual(Array.from({length: 4}, (_, i) => ({id: String(i), points: 2})));
    expect(result.flatMap(sheet => sheet.products)).toEqual(Array.from({length: 3}, (_, i) => ({id: String(i), text: `Product ${i}Complete product instructions ${i}`})));
    expect(result.filter(sheet => sheet.products.length).every(sheet => sheet.productHeading === "Nutritional supplement recommendations")).toBe(true);
    const firstWholeCardPage = result.find(sheet => sheet.cards.length)!;
    expect(firstWholeCardPage.title).toBe("Whole cards");
    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, margin: {top: 0, right: 0, bottom: 0, left: 0} });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(result.length);
    // If even one indivisible element exceeds a page, fail instead of silently
    // clipping content and issuing a misleading apparently complete report.
    await page.evaluate(() => {
      const report = document.querySelector(".clinical-report")!;
      const section = report.querySelector(".cr-sheet:not(.cr-cover)")!;
      section.querySelector(".cr-sheet-content")!.innerHTML = '<section style="height: 2000px">Indivisible oversized element</section>';
      report.replaceChildren(section);
    });
    await expect(page.evaluate(paginateReportSheets)).rejects.toThrow("A report card is taller than a PDF page");
  } finally { await browser.close(); }
}, 30_000);

test("full historical Vital IQ measurements fit one A4 page without losing metrics or references", async () => {
  const { reportFaceScanAdditionalMetricGroups } = await import("@niq/application-contracts");
  const provenance = { sessionId: "historical-source", assessmentReference: "ASM-003545", capturedAt: "2026-10-21T08:00:00Z" };
  const metric = (id: string, label: string, value: string, unit?: string) => ({ id, label, value, unit, source: "face_scan" as const, measuredAt: provenance.capturedAt, historicalSource: provenance });
  const report = {
    assessment: { id: "assessment", reference: "ASM-003546", completedAt: "2026-10-23T12:00:00Z" },
    patient: { displayName: "Example Patient", reference: "P-1" }, classification: { label: "Moderate risk", score: 25 }, decision: {}, weightHistory: [],
    narrative: { overview: "", keyFindings: "", actionSummary: "", monitoringSummary: "" }, guidance: { sections: [] },
    metrics: [
      metric("vital_iq_points", "Vital IQ points", "3"), metric("wellness_score", "Wellness score", "84", "/100"), metric("health_risk_score", "Health risk score", "16", "/100"),
      metric("heart_rate", "Heart rate", "59", "bpm"), metric("oxygen_saturation", "Oxygen saturation", "96", "%"), metric("respiratory_rate", "Breathing rate", "12", "/min"),
      metric("systolic", "Systolic blood pressure", "128", "mmHg"), metric("diastolic", "Diastolic blood pressure", "78", "mmHg"),
      ...reportFaceScanAdditionalMetricGroups.flatMap(group => group.metrics.map(item => ({ ...metric(item.id, item.label, "25.77", item.unit), ...(item.id === "sdnn" ? { outsideReferenceRange: true, referenceRange: "60–100 ms" } : item.id === "scan_bmi" ? { outsideReferenceRange: true, referenceRange: "18.5–24.9 kg/m²" } : {}) }))),
      metric("physiological_score", "Physiological health score", "70", "/100"), metric("mental_wellbeing_score", "Mental wellbeing score", "87.04", "/100"), metric("stress_band", "Stress band", "good"),
    ],
  } as unknown as GeneratedReport;
  const browser = await chromium.launch({ executablePath: process.env.REPORT_CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(await renderGeneratedReportHtml(report, { name: "Example Clinic", primaryColor: "#138f94" }));
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
    await page.evaluate(paginateReportSheets);
    const vital = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".cr-sheet-vital")).map(sheet => {
      const content = sheet.querySelector<HTMLElement>(".cr-sheet-content")!;
      const bounds = content.getBoundingClientRect();
      const cards = Array.from(content.querySelectorAll<HTMLElement>(".cr-vital-score-card, .cr-vital-highlight, .cr-vital-detail"));
      return { text: content.textContent, detailRows: content.querySelectorAll(".cr-vital-detail dl > div").length, overflow: content.scrollHeight > content.clientHeight + 1,
        cardsFit: cards.every(card => card.getBoundingClientRect().bottom <= bounds.bottom + 1), logos: sheet.querySelectorAll(".cr-sheet-header img").length,
        smallestRowFont: Math.min(...Array.from(content.querySelectorAll(".cr-vital-detail dl > div"), row => parseFloat(getComputedStyle(row).fontSize))) };
    }));
    expect(vital).toHaveLength(1);
    expect(vital[0]).toMatchObject({ detailRows: 23, overflow: false, cardsFit: true });
    expect(vital[0]!.smallestRowFont).toBeGreaterThanOrEqual(12);
    expect(vital[0]!.logos).toBeGreaterThanOrEqual(1);
    for (const text of ["Historical measurement", "Recorded 21 Oct 2026", "reused from ASM-003545", "60–100 ms", "18.5–24.9 kg/m²", "Blood volume", "Stress band"]) expect(vital[0]!.text).toContain(text);
    await page.pdf({ path: "/tmp/niq-vital-iq-layout.pdf", format: "A4", preferCSSPageSize: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    // Truly long groups can continue without treating the entire grid as one
    // unbreakable card or clipping its measurements at the footer.
    await page.evaluate(() => {
      for (const group of document.querySelectorAll<HTMLElement>(".cr-vital-detail")) group.style.minHeight = "450px";
    });
    await page.evaluate(paginateReportSheets);
    const continued = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".cr-sheet-vital")).map(sheet => {
      const content = sheet.querySelector<HTMLElement>(".cr-sheet-content")!;
      return { rows: content.querySelectorAll(".cr-vital-detail dl > div").length, groups: content.querySelectorAll(".cr-vital-detail").length, fits: content.scrollHeight <= content.clientHeight + 1 };
    }));
    expect(continued.length).toBeGreaterThan(1);
    expect(continued.every(sheet => sheet.fits)).toBe(true);
    expect(continued.reduce((count, sheet) => count + sheet.rows, 0)).toBe(23);
    expect(continued.reduce((count, sheet) => count + sheet.groups, 0)).toBe(3);
  } finally { await browser.close(); }
}, 30_000);
