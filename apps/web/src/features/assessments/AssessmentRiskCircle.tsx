import type { AssessmentScoreResult } from "@niq/application-contracts";

type Classification = AssessmentScoreResult["classification"];

const presetColors: Record<string, string> = {
  green: "#159f70", amber: "#d97706", red: "#dc3d50",
  neutral: "#64748b", blue: "#3b82f6", purple: "#8b5cf6",
};

function categoryColor(color: string | undefined): string {
  return color?.startsWith("#") ? color : presetColors[color ?? ""] ?? "#64748b";
}

export function AssessmentRiskCircle({ score, classification, categories }: {
  score: number | null;
  classification: Classification;
  categories?: AssessmentScoreResult["riskCategories"];
}) {
  const selectedColor = categoryColor(classification?.color ?? categories?.find(band => band.id === classification?.id)?.color);
  const radius = 64;
  return <div className="grid min-w-0 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
    <div data-risk-circle className="relative mx-auto grid size-40 place-items-center sm:size-44" role="img" aria-label={`${score ?? "No"} points, ${classification?.label ?? "no risk category"}`}>
      <svg className="absolute inset-0 size-full -rotate-90 overflow-visible" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle cx="80" cy="80" r={radius} fill="none" stroke={selectedColor} strokeWidth="11" />
      </svg>
      <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card text-center">
        <span className="text-4xl font-semibold tabular-nums" style={{ color: selectedColor }}>{score ?? "—"}</span>
        <span className="text-sm text-muted-foreground">points</span>
      </div>
    </div>
    <div className="min-w-0 text-center sm:text-left">
      <p className="text-sm text-muted-foreground">Final NIQ score</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: selectedColor }}>{classification?.label ?? "No risk category"}</p>
      {classification?.interpretation && <p className="mt-2 max-w-prose text-sm text-muted-foreground">{classification.interpretation}</p>}
    </div>
  </div>;
}
