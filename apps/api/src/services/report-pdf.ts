import { paginateReportSheets } from "./report-pdf-pagination";
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
  return `<!doctype html><html lang="en" style="--brand-primary:${brand.primaryColor};--brand-secondary:${branding.secondaryColor};--brand-ink:${ink}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Medical Nutrition Therapy Report</title><style>${css}</style></head><body class="cr-print-document">${markup}</body></html>`;
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
    await page.evaluate(paginateReportSheets);
    // Chromium numbers physical pages, including continuations. Section counts
    // must not serve as page numbers when a report flows across page boundaries.
    const bytes = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true,
      displayHeaderFooter: false, margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    if (bytes.length < 8 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
      throw new Error("Report PDF rendering did not produce a valid document");
    }
    return bytes;
  } finally {
    await browser.close();
  }
}
