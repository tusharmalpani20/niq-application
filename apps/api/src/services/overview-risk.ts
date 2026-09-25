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
): { highRiskPatients: number; assessedPatients: number } {
  const latest = new Map<string, CompletedAssessment>();
  for (const row of rows) {
    const prior = latest.get(row.patientId);
    if (!prior || (row.completedAt?.getTime() ?? 0) > (prior.completedAt?.getTime() ?? 0)
      || (row.completedAt?.getTime() ?? 0) === (prior.completedAt?.getTime() ?? 0) && row.id > prior.id) {
      latest.set(row.patientId, row);
    }
  }
  let highRiskPatients = 0;
  let assessedPatients = 0;
  for (const row of latest.values()) {
    if (!row.clinicalReview) continue;
    const risk = unseal(row.clinicalReview).finalSnapshot?.score?.risk;
    if (!risk || !["ORIGINAL", "CONFIRMED"].includes(risk.status ?? "") || !risk.classification) continue;
    assessedPatients++;
    const id = risk.classification.id?.toLowerCase();
    const label = risk.classification.label?.toLowerCase();
    if (id === "high" || id === "high_risk" || label === "high risk") highRiskPatients++;
  }
  return { highRiskPatients, assessedPatients };
}
