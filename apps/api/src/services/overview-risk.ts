type CompletedAssessment = {
  id: string;
  patientId: string;
  completedAt: Date | null;
  clinicalReview: unknown;
  submissionResult?: unknown;
  submissionSnapshot?: unknown;
};

type StoredData = {
  finalSnapshot?: {
    score?: { risk?: { status?: string; classification?: { id?: string; label?: string } | null } };
  };
  derived?: { proteinAdequacy?: "adequate" | "inadequate" | null };
  answers?: { dietary_symptoms?: unknown };
  manifest?: { sections?: Array<{ fields?: Array<{ id?: string; options?: Array<{ id: string; label: string }> }> }> };
};

const eatingBarrierIds = new Set([
  "dietary_symptoms_no_appetite", "dietary_symptoms_nausea", "dietary_symptoms_vomiting",
  "dietary_symptoms_constipation", "dietary_symptoms_diarrhoea", "dietary_symptoms_mouth_sores",
  "dietary_symptoms_dry_mouth", "dietary_symptoms_taste_funny", "dietary_symptoms_smells_bother",
  "dietary_symptoms_swallowing_problems", "dietary_symptoms_feel_full_quickly",
]);

/** The newest completed assessment decides each patient's current category, even if its category is unavailable. */
export function countOverviewRisk(
  rows: CompletedAssessment[],
  unseal: (value: unknown) => StoredData,
  now: Date = new Date(),
): OverviewRisk {
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
  const protein = { assessed: 0, inadequate: 0 };
  let eatingBarrierAssessed = 0;
  const barrierCounts = new Map<string, { id: string; label: string; count: number }>();
  let assessedPatients = 0;
  for (const row of latest.values()) {
    const riskCategory = category(row);
    if (riskCategory === null) continue;
    assessedPatients++;
    categories[riskCategory]++;
    if (riskCategory === "high") highRiskAssessments.push({ patientId: row.patientId, assessmentId: row.id });
    if (row.submissionResult) {
      const adequacy = unseal(row.submissionResult).derived?.proteinAdequacy;
      if (adequacy === "adequate" || adequacy === "inadequate") {
        protein.assessed++;
        if (adequacy === "inadequate") protein.inadequate++;
      }
    }
    if (riskCategory !== "low" && row.submissionSnapshot) {
      const snapshot = unseal(row.submissionSnapshot);
      const symptoms = snapshot.answers?.dietary_symptoms;
      if (!Array.isArray(symptoms)) continue;
      eatingBarrierAssessed++;
      const options = snapshot.manifest?.sections?.flatMap(section => section.fields ?? [])
        .find(field => field.id === "dietary_symptoms")?.options ?? [];
      const labels = new Map(options.map(option => [option.id, option.label]));
      for (const id of new Set(symptoms)) {
        if (typeof id !== "string" || !eatingBarrierIds.has(id) || !labels.has(id)) continue;
        const prior = barrierCounts.get(id);
        barrierCounts.set(id, { id, label: labels.get(id)!, count: (prior?.count ?? 0) + 1 });
      }
    }
  }
  const categories30DaysAgo = { low: 0, moderate: 0, high: 0 };
  for (const row of latest30DaysAgo.values()) {
    const riskCategory = category(row);
    if (riskCategory) categories30DaysAgo[riskCategory]++;
  }
  const top = [...barrierCounts.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0] ?? null;
  return { highRiskPatients: categories.high, assessedPatients, highRiskPatients30DaysAgo: categories30DaysAgo.high, categories, categories30DaysAgo, highRiskAssessments,
    nutrition: { protein, eatingBarrier: { assessed: eatingBarrierAssessed, top } } };
}
import type { OverviewRisk } from "@niq/application-contracts";
