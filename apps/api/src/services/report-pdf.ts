import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratedReport } from "@niq/application-contracts";
import { chromium } from "playwright-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { GeneratedReportPreview } from "../../../web/src/features/assessments/GeneratedReportPreview";
import { accessibleBrandInk } from "../../../web/src/lib/colour-contrast";

export type ReportPdfBrand = {
  name: string;
  primaryColor: string;
  secondaryColor?: string;
  logo?: { data: Uint8Array; mimeType: string } | null;
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const assetDirectories = [resolve(moduleDirectory, "../assets"), resolve(moduleDirectory, "../../assets")];
const safeColor = /^#[0-9a-fA-F]{6}$/;
const cssString = (text: string) => JSON.stringify(text).replace(/</g, "\\3c ").replace(/>/g, "\\3e ");

function assetPath(name: string): string {
  const path = assetDirectories.map(directory => resolve(directory, name)).find(existsSync);
  if (!path) throw new Error(`Report asset is missing: ${name}`);
  return path;
}

async function pngDataUrl(name: string): Promise<string> {
  const bytes = await Bun.file(assetPath(name)).arrayBuffer();
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function webpDataUrl(name: string): Promise<string> {
  const bytes = await Bun.file(assetPath(name)).arrayBuffer();
  return `data:image/webp;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function logoDataUrl(logo: ReportPdfBrand["logo"]): Promise<string | null> {
  if (!logo || !["image/png", "image/jpeg", "image/webp"].includes(logo.mimeType)) return null;
  try {
    const png = await sharp(Buffer.from(logo.data), { limitInputPixels: 16_000_000 })
      .rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // A damaged optional logo should not block an otherwise valid report.
    return null;
  }
}

export async function renderGeneratedReportHtml(report: GeneratedReport, brand: ReportPdfBrand): Promise<string> {
  const [css, applicationLogo, partnerLogo, coverPhoto, customLogo] = await Promise.all([
    Bun.file(assetPath("report-print.css")).text(),
    pngDataUrl("nutra-iq-logo.png"),
    pngDataUrl("eioms-logo.png"),
    webpDataUrl("report-cover-food.webp"),
    logoDataUrl(brand.logo),
  ]);
  if (!safeColor.test(brand.primaryColor) || brand.secondaryColor && !safeColor.test(brand.secondaryColor)) {
    throw new Error("Invalid report branding color");
  }
  const branding = {
    displayName: brand.name,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor ?? "#4F5052",
    logoUrl: customLogo,
  };
  // The app's report component is the single layout used by both preview and PDF.
  const markup = renderToStaticMarkup(createElement(GeneratedReportPreview, { report, branding }))
    .replaceAll('"/nutra-iq-logo.png"', `"${applicationLogo}"`)
    .replaceAll('"/eioms-logo.png"', `"${partnerLogo}"`)
    .replaceAll('"/report-cover-food.webp"', `"${coverPhoto}"`);
  const ink = accessibleBrandInk(brand.primaryColor, ["#f6f8fb", "#eef2f6", "#ffffff"]);
  const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="30" viewBox="0 0 180 30">${customLogo
    ? `<image href="${customLogo}" width="180" height="30" preserveAspectRatio="xMinYMid meet"/>`
    : `<image href="${applicationLogo}" width="55" height="30" preserveAspectRatio="xMinYMid meet"/><image href="${partnerLogo}" x="65" width="100" height="30" preserveAspectRatio="xMinYMid meet"/>`}</svg>`;
  const headerImage = `data:image/svg+xml;base64,${Buffer.from(headerSvg).toString("base64")}`;
  // Page margin boxes follow physical pagination and can be disabled on the
  // cover. The standalone HTML and saved PDF therefore print identically.
  const pageFurniture = `@media print {
    html:root { background:#fff !important; }
    @page {
      @top-left { content:url("${headerImage}");margin-left:13mm;margin-bottom:4mm;vertical-align:middle;width:92mm;border-bottom:.5pt solid #dce5e8; }
      @top-right { content:"Clinical nutrition report";margin-right:13mm;margin-bottom:4mm;vertical-align:middle;width:92mm;font:8px Arial;color:#607989;border-bottom:.5pt solid #dce5e8; }
      @bottom-left { content:${cssString(`${brand.name} · ${report.assessment.reference}`)};margin-left:13mm;font:8px Arial;color:#607989; }
      @bottom-right { content:"Page " counter(page) " of " counter(pages);margin-right:13mm;font:8px Arial;color:#607989; }
    }
    @page:first { @top-left {content:none;background-image:none;border:0;} @top-right {content:none;border:0;} @bottom-left {content:none;} @bottom-right {content:none;} }
  }`;
  return `<!doctype html><html lang="en" style="--brand-primary:${brand.primaryColor};--brand-secondary:${branding.secondaryColor};--brand-ink:${ink}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Medical Nutrition Therapy Report</title><style>${css}${pageFurniture}</style></head><body class="cr-print-document">${markup}</body></html>`;
}

/** Render the same HTML report used in the browser to a paginated, selectable-text PDF. */
export async function renderGeneratedReportPdf(report: GeneratedReport, brand: ReportPdfBrand): Promise<Uint8Array> {
  const browser = await chromium.launch({
    executablePath: process.env.REPORT_CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    await page.route("**/*", route => route.abort());
    await page.setContent(await renderGeneratedReportHtml(report, brand), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => {
      const pageHeight = (297 - 20 - 15) / 25.4 * 96;
      for (const sheet of document.querySelectorAll<HTMLElement>(".cr-sheet:not(.cr-cover)")) {
        if (sheet.getBoundingClientRect().height > pageHeight + 1) sheet.classList.add("cr-print-overflow");
      }
      for (const card of document.querySelectorAll<HTMLElement>(".cr-possible-effect")) {
        if (card.getBoundingClientRect().height > pageHeight)
          card.classList.add("cr-print-fragment");
      }
    });
    // Chromium numbers physical pages, including continuations. Section counts
    // must not serve as page numbers when a report flows across page boundaries.
    const bytes = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true,
      displayHeaderFooter: false, margin: { top: "20mm", right: 0, bottom: "15mm", left: 0 },
    });
    if (bytes.length < 8 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
      throw new Error("Report PDF rendering did not produce a valid document");
    }
    return bytes;
  } finally {
    await browser.close();
  }
}
