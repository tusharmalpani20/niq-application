type CompletedAssessment = {
  id: string;
  patientId: string;
  completedAt: Date | null;
  clinicalReview: unknown;
};

type FinalSnapshot = {
  finalSnapshot?: {
    score?: { risk?: { status?: string; classification?: { id?: string; label?: string } | null } };
  };
};

/** The newest completed assessment decides each patient's current category, even if its category is unavailable. */
export function countOverviewRisk(
  rows: CompletedAssessment[],
  unseal: (value: unknown) => FinalSnapshot,
  now: Date = new Date(),
): { highRiskPatients: number; assessedPatients: number; highRiskPatients30DaysAgo: number; categories: { low: number; moderate: number; high: number }; highRiskAssessments: { patientId: string; assessmentId: string }[] } {
  const latest = new Map<string, CompletedAssessment>();
  const latest30DaysAgo = new Map<string, CompletedAssessment>();
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recordLatest = (byPatient: Map<string, CompletedAssessment>, row: CompletedAssessment) => {
    const prior = byPatient.get(row.patientId);
    if (!prior || (row.completedAt?.getTime() ?? 0) > (prior.completedAt?.getTime() ?? 0)
      || (row.completedAt?.getTime() ?? 0) === (prior.completedAt?.getTime() ?? 0) && row.id > prior.id) {
      byPatient.set(row.patientId, row);
    }
  };
  for (const row of rows) {
    recordLatest(latest, row);
    if (row.completedAt && row.completedAt.getTime() <= cutoff) recordLatest(latest30DaysAgo, row);
  }
  const category = (row: CompletedAssessment): "low" | "moderate" | "high" | null => {
    if (!row.clinicalReview) return null;
    const risk = unseal(row.clinicalReview).finalSnapshot?.score?.risk;
    if (!risk || !["ORIGINAL", "CONFIRMED"].includes(risk.status ?? "") || !risk.classification) return null;
    const id = risk.classification.id?.toLowerCase();
    const label = risk.classification.label?.toLowerCase();
    if (id === "high" || id === "high_risk" || label === "high risk") return "high";
    if (id === "moderate" || id === "moderate_risk" || label === "moderate risk") return "moderate";
    if (id === "low" || id === "low_risk" || label === "low risk") return "low";
    return null;
  };
  const categories = { low: 0, moderate: 0, high: 0 };
  const highRiskAssessments: { patientId: string; assessmentId: string }[] = [];
  let assessedPatients = 0;
  for (const row of latest.values()) {
    const riskCategory = category(row);
    if (riskCategory === null) continue;
    assessedPatients++;
    categories[riskCategory]++;
    if (riskCategory === "high") highRiskAssessments.push({ patientId: row.patientId, assessmentId: row.id });
  }
  let highRiskPatients30DaysAgo = 0;
  for (const row of latest30DaysAgo.values()) {
    if (category(row) === "high") highRiskPatients30DaysAgo++;
  }
  return { highRiskPatients: categories.high, assessedPatients, highRiskPatients30DaysAgo, categories, highRiskAssessments };
}
