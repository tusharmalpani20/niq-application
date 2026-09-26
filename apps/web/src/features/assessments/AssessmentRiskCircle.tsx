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
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  // Bands get equal arcs because the upper category may have no numeric maximum.
  const arcLength = bands ? circumference / bands.length - 8 : circumference;
  return <div className={`grid min-w-0 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8 ${bands ? "" : "mx-auto max-w-xl"}`}>
    <div data-risk-circle className="relative mx-auto grid size-40 place-items-center sm:size-44" role="img" aria-label={`${score ?? "No"} points, ${classification?.label ?? "no risk category"}${bands ? `, ${bands.length} risk bands` : ""}`}>
      <svg className="absolute inset-0 size-full -rotate-90 overflow-visible" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--border)" strokeWidth="9" />
        {bands ? bands.map((band, index) => <circle key={band.id} cx="80" cy="80" r={radius} fill="none"
          stroke={categoryColor(band.color)} strokeWidth={band.id === classification?.id ? 15 : 10} strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`} strokeDashoffset={-index * circumference / bands.length} />)
          : <circle cx="80" cy="80" r={radius} fill="none" stroke={selectedColor} strokeWidth="11" />}
      </svg>
      <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card text-center">
        <span className="text-4xl font-semibold tabular-nums text-foreground">{score ?? "—"}</span>
        <span className="text-sm text-muted-foreground">points</span>
      </div>
    </div>
    <div className="min-w-0 text-center sm:text-left">
      <p className="text-sm text-muted-foreground">Final NIQ score</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{classification?.label ?? "No risk category"}</p>
      {classification?.interpretation && <p className="mt-2 max-w-prose text-sm text-muted-foreground">{classification.interpretation}</p>}
      {bands && <div className="mt-4 border-t border-border pt-3" aria-label="Risk categories used for this score">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Score ranges used for this assessment</p>
        <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">{bands.map(band => <li key={band.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${band.id === classification?.id ? "bg-card font-semibold text-foreground" : "border-border bg-card text-muted-foreground"}`} style={band.id === classification?.id ? { borderColor: categoryColor(band.color) } : undefined}>
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(band.color) }} aria-hidden="true" />
          <span>{band.label}</span><span className="text-xs tabular-nums">{scoreRange(band)}</span>
        </li>)}</ul>
      </div>}
    </div>
  </div>;
}
