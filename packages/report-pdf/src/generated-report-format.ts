import type { GeneratedReport } from "@niq/application-contracts";

export const reportDate = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
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

export const metricText = (metric: GeneratedReport["metrics"][number]) => `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;

export function cleanWeights(report: GeneratedReport) {
  const byDate = new Map<string, { date: string | null; kg: number; label?: string }>();
  const undated: Array<{ date: string | null; kg: number; label?: string }> = [];
  for (const item of report.weightHistory) {
    if (!Number.isFinite(item.kg) || item.kg <= 0) continue;
    const label = "label" in item ? (item as { label?: string }).label : undefined;
    if (item.date === null) { undated.push({ date: null, kg: item.kg, label: label || "Previously reported (date not recorded)" }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}/.test(item.date)) continue;
    byDate.set(item.date.slice(0, 10), { date: item.date.slice(0, 10), kg: item.kg, label });
  }
  const dated = [...byDate.values()].sort((a, b) => a.date!.localeCompare(b.date!));
  return [...(dated.length <= 1 ? undated.slice(-1) : []), ...dated];
}

export function weightChange(report: GeneratedReport) {
  const items = cleanWeights(report);
  if (items.length < 2) return null;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const percentage = (last.kg - first.kg) / first.kg * 100;
  return { percentage, first, last, basis: first.date === null ? "previously reported weight" : "first recorded weight" };
}

export const reportGuidance = (report: GeneratedReport, kind: GeneratedReport["guidance"]["sections"][number]["kind"]) =>
  report.guidance.sections.filter(item => item.kind === kind && item.title.trim() && item.text.trim());
