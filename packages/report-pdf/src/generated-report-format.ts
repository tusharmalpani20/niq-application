import { assessmentOptionDisplayLabel, type GeneratedReport } from "@niq/application-contracts";

export const reportDate = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  // Saved report evidence and narrative use the ISO calendar date. Keep the
  // displayed date stable across the server and a viewer's local time zone.
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
};

export const reportAge = (birth: string | null, at: string | null) => {
  if (!birth || !at) return null;
  const birthday = new Date(birth);
  const date = new Date(at);
  if (Number.isNaN(birthday.getTime()) || Number.isNaN(date.getTime()) || birthday > date) return null;
  let years = date.getUTCFullYear() - birthday.getUTCFullYear();
  if (date.getUTCMonth() < birthday.getUTCMonth() || date.getUTCMonth() === birthday.getUTCMonth() && date.getUTCDate() < birthday.getUTCDate()) years--;
  return years >= 0 && years <= 130 ? years : null;
};

export const metricText = (metric: GeneratedReport["metrics"][number]) => `${assessmentOptionDisplayLabel(metric.id, metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`;

/** Reviewed conflicts override extraction from legacy matched-rule text. */
export function nutritionTargetValue(report: GeneratedReport, nutrient: "energy" | "protein"): string | null {
  const resolution = report.targetResolutions?.find(row => row.nutrient === nutrient);
  if (resolution) return resolution.decision === "withhold_numeric" ? null : resolution.targetText;
  const source = report.guidance.sections.filter(row => row.kind === "nutrition").map(row => row.text).join("\n");
  const match = new RegExp(`${nutrient}[:\\s]*([0-9]+(?:\\.[0-9]+)?\\s*[–-]\\s*[0-9]+(?:\\.[0-9]+)?\\s*${nutrient === "energy" ? "kcal" : "g"}\\s*\\/\\s*kg\\s*\\/\\s*day)`, "i").exec(source);
  return match?.[1]?.replace(/\s+/g, " ") ?? null;
}

/** Benefits belong to the product catalog, not an individual dosage plan. */
export function productBenefits(report: GeneratedReport, name: string): string[] {
  const product = report.productCatalog?.find(product => [product.name, ...(product.aliases ?? [])]
    .some(alias => alias.trim().toLowerCase() === name.trim().toLowerCase()));
  if (product?.benefits !== undefined) return product.benefits.map(text => text.trim()).filter(Boolean);
  return product?.description ? [product.description] : [];
}

export function cleanWeights(report: GeneratedReport) {
  const byDate = new Map<string, GeneratedReport["weightHistory"][number]>();
  const undated: Array<GeneratedReport["weightHistory"][number]> = [];
  for (const item of report.weightHistory) {
    if (!Number.isFinite(item.kg) || item.kg <= 0) continue;
    const rawLabel = "label" in item ? (item as { label?: string }).label : undefined;
    const label = rawLabel && /^(?:weight 1[–-]2 months ago|reported 1[–-]2 months ago(?: \(exact date unknown\))?)$/i.test(rawLabel.trim()) ? "Weight 1 Month Ago" : rawLabel;
    if (item.date === null) { undated.push({ date: null, kg: item.kg, label: "Weight 1 Month Ago" }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}/.test(item.date)) continue;
    byDate.set(item.assessmentId ?? item.date.slice(0, 10), { ...item, date: item.date.slice(0, 10), label });
  }
  const dated = [...byDate.values()].sort((a, b) => a.date!.localeCompare(b.date!));
  return [...(dated.length <= 1 ? undated.slice(-1) : []), ...dated];
}

export function weightChange(report: GeneratedReport) {
  const items = cleanWeights(report);
  if (items.length < 2) return null;
  const first = items[items.length - 2]!;
  const last = items[items.length - 1]!;
  const percentage = (last.kg - first.kg) / first.kg * 100;
  return { percentage, first, last, basis: first.date === null ? "previously reported weight" : "previous recorded weight" };
}

export const reportGuidance = (report: GeneratedReport, kind: GeneratedReport["guidance"]["sections"][number]["kind"]) =>
  report.guidance.sections.filter(item => item.kind === kind && item.title.trim() && item.text.trim());
