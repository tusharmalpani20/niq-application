import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pdf } from "@react-pdf/renderer";
import { GeneratedReportPdf, registerReportPdfFonts } from "@niq/application-report-pdf";
import type { GeneratedReport } from "@niq/application-contracts";
import { createElement } from "react";
import sharp from "sharp";

export type ReportPdfBrand = {
  name: string;
  primaryColor: string;
  secondaryColor?: string;
  logo?: { data: Uint8Array; mimeType: string } | null;
};

let fontsReady: Promise<void> | null = null;

function fontPath(name: string): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  // Source files and the deployed bundle have different paths relative to assets.
  const candidates = [resolve(moduleDirectory, "../assets", name), resolve(moduleDirectory, "../../assets", name)];
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) throw new Error(`Report font asset is missing: ${name}`);
  return path;
}

async function fontDataUrl(name: string): Promise<string> {
  const bytes = await Bun.file(fontPath(name)).arrayBuffer();
  return `data:font/ttf;base64,${Buffer.from(bytes).toString("base64")}`;
}

function ensureReportFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all([
      fontDataUrl("LiberationSans-Regular.ttf"),
      fontDataUrl("LiberationSans-Bold.ttf"),
    ]).then(([regular, bold]) => registerReportPdfFonts(regular, bold)).catch(error => {
      fontsReady = null;
      throw error;
    });
  }
  return fontsReady;
}

async function logoDataUrl(logo: ReportPdfBrand["logo"]): Promise<string | null> {
  if (!logo || !["image/png", "image/jpeg", "image/webp"].includes(logo.mimeType)) return null;
  try {
    // Normalise WebP and large source images before passing them to PDFKit.
    const png = await sharp(Buffer.from(logo.data), { limitInputPixels: 16_000_000 })
      .rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // A damaged optional logo should not prevent the clinical report from being issued.
    return null;
  }
}

/** Render final report bytes without a browser, DOM, or network request. */
export async function renderGeneratedReportPdf(report: GeneratedReport, brand: ReportPdfBrand): Promise<Uint8Array> {
  await ensureReportFonts();
  const dataUrl = await logoDataUrl(brand.logo);
  const document = createElement(GeneratedReportPdf, {
    report,
    brand: { name: brand.name, primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor, logoDataUrl: dataUrl },
  });
  const blob = await pdf(document as Parameters<typeof pdf>[0]).toBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 8 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
    throw new Error("Report PDF rendering did not produce a valid document");
  }
  return bytes;
}
