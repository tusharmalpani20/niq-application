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
