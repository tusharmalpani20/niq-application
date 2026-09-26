import type { CSSProperties } from "react";
import type { AssessmentScoreResult } from "@niq/application-contracts";

type Classification = AssessmentScoreResult["classification"];
type RiskCategory = NonNullable<AssessmentScoreResult["riskCategories"]>[number];

const presetColors: Record<string, string> = {
  green: "#159f70", amber: "#d97706", red: "#dc3d50",
  neutral: "#64748b", blue: "#3b82f6", purple: "#8b5cf6",
};

function categoryColor(color: string | undefined): string {
  return color?.startsWith("#") ? color : presetColors[color ?? ""] ?? "#64748b";
}

function scoreRange(category: RiskCategory): string {
  const { min, max, minInclusive, maxInclusive } = category;
  if (min === null && max === null) return "All scores";
  if (min === null) return `${maxInclusive ? "≤" : "<"}${max} pts`;
  if (max === null) return `${minInclusive ? "≥" : ">"}${min} pts`;
  if (minInclusive && maxInclusive) return `${min}–${max} pts`;
  return `${minInclusive ? "≥" : ">"}${min} to ${maxInclusive ? "≤" : "<"}${max} pts`;
}

export function AssessmentRiskCircle({ score, classification, categories }: {
  score: number | null;
  classification: Classification;
  categories?: AssessmentScoreResult["riskCategories"];
}) {
  const bands = categories?.length ? categories : null;
  const selectedColor = categoryColor(classification?.color ?? bands?.find(band => band.id === classification?.id)?.color);
  // The last category can be open-ended. Equal arc lengths show categories without implying a numeric maximum.
  const sweep = bands?.length ? 100 / bands.length : 100;
  const background = bands ? `conic-gradient(${bands.map((band, index) => {
    const color = categoryColor(band.color);
    const display = band.id === classification?.id ? color : `color-mix(in srgb, ${color} 38%, var(--card))`;
    return `${display} ${index * sweep}% ${(index + 1) * sweep - 0.8}%, var(--card) ${(index + 1) * sweep - 0.8}% ${(index + 1) * sweep}%`;
  }).join(", ")})` : selectedColor;
  return <div className={`flex min-w-0 flex-wrap items-center gap-5 sm:gap-8 ${bands ? "" : "justify-center"}`}>
    <div className="flex shrink-0 flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">Final NIQ score</p>
      <div data-risk-circle className="grid size-44 place-items-center rounded-full p-3 ring-1 ring-border sm:size-48" style={{ background } as CSSProperties}>
        <div className="flex size-full flex-col items-center justify-center rounded-full bg-card text-center">
          <span className="text-4xl font-semibold tabular-nums text-foreground">{score ?? "—"}</span>
          <span className="text-sm text-muted-foreground">points</span>
        </div>
      </div>
      {classification && <p className="font-semibold text-foreground">{classification.label}</p>}
    </div>
    {bands && <div className="min-w-0 flex-1" aria-label="Risk categories used for this score">
      <p className="mb-3 text-sm font-medium text-foreground">Risk categories</p>
      <ul className="flex flex-wrap gap-2">{bands.map(band => <li key={band.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${band.id === classification?.id ? "bg-card font-semibold text-foreground" : "border-border bg-card text-muted-foreground"}`} style={band.id === classification?.id ? { borderColor: categoryColor(band.color) } : undefined}>
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(band.color) }} aria-hidden="true" />
        <span>{band.label}</span><span className="text-xs tabular-nums">{scoreRange(band)}</span>
      </li>)}</ul>
    </div>}
  </div>;
}
