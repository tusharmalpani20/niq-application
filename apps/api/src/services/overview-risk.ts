import type { OverviewNutrition, OverviewRisk } from "@niq/application-contracts";

type CompletedAssessment = {
  id: string;
  patientId: string;
  completedAt: Date | null;
  clinicalReview: unknown;
  finalRiskCategory?: "low" | "moderate" | "high" | null;
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

function latestAssessments(rows: CompletedAssessment[], cutoff?: number): Map<string, CompletedAssessment> {
  const latest = new Map<string, CompletedAssessment>();
  for (const row of rows) {
    if (cutoff !== undefined && (!row.completedAt || row.completedAt.getTime() > cutoff)) continue;
    const prior = latest.get(row.patientId);
    if (!prior || (row.completedAt?.getTime() ?? 0) > (prior.completedAt?.getTime() ?? 0)
      || (row.completedAt?.getTime() ?? 0) === (prior.completedAt?.getTime() ?? 0) && row.id > prior.id) {
      latest.set(row.patientId, row);
    }
  }
  return latest;
}

export function riskCategoryFromFinalSnapshot(snapshot: unknown): "low" | "moderate" | "high" | null {
  const risk = (snapshot as StoredData["finalSnapshot"] | null | undefined)?.score?.risk;
  if (!risk || !["ORIGINAL", "CONFIRMED"].includes(risk.status ?? "") || !risk.classification) return null;
  const id = risk.classification.id?.toLowerCase();
  const label = risk.classification.label?.toLowerCase();
  if (id === "high" || id === "high_risk" || label === "high risk") return "high";
  if (id === "moderate" || id === "moderate_risk" || label === "moderate risk") return "moderate";
  if (id === "low" || id === "low_risk" || label === "low risk") return "low";
  return null;
}

export function finalResultFromSnapshot(snapshot: unknown) {
  const score = (snapshot as { score?: { overall?: { reviewedPoints?: number | null } } } | null)?.score?.overall?.reviewedPoints ?? null;
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid final assessment score");
  }
  return { finalScore: score, finalRiskCategory: riskCategoryFromFinalSnapshot(snapshot) };
}

function category(row: CompletedAssessment, unseal: (value: unknown) => StoredData): "low" | "moderate" | "high" | null {
  // Rows created before the summary backfill still use the sealed final snapshot.
  if (row.finalRiskCategory) return row.finalRiskCategory;
  return row.clinicalReview ? riskCategoryFromFinalSnapshot(unseal(row.clinicalReview).finalSnapshot) : null;
}

export function overviewRiskNutritionTargets(rows: CompletedAssessment[], unseal: (value: unknown) => StoredData) {
  const assessmentIds: string[] = [];
  const snapshotAssessmentIds: string[] = [];
  for (const row of latestAssessments(rows).values()) {
    const riskCategory = category(row, unseal);
    if (!riskCategory) continue;
    assessmentIds.push(row.id);
    if (riskCategory !== "low") snapshotAssessmentIds.push(row.id);
  }
  return { assessmentIds, snapshotAssessmentIds };
}

/** The newest completed assessment decides each patient's current category, even if its category is unavailable. */
export function countOverviewRiskCategories(
  rows: CompletedAssessment[],
  unseal: (value: unknown) => StoredData,
  now: Date = new Date(),
): OverviewRisk {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const latest = latestAssessments(rows);
  const latest30DaysAgo = latestAssessments(rows, cutoff);
  const categories = { low: 0, moderate: 0, high: 0 };
  const highRiskAssessments: { patientId: string; assessmentId: string }[] = [];
  let assessedPatients = 0;
  for (const row of latest.values()) {
    const riskCategory = category(row, unseal);
    if (riskCategory === null) continue;
    assessedPatients++;
    categories[riskCategory]++;
    if (riskCategory === "high") highRiskAssessments.push({ patientId: row.patientId, assessmentId: row.id });
  }
  const categories30DaysAgo = { low: 0, moderate: 0, high: 0 };
  for (const row of latest30DaysAgo.values()) {
    const riskCategory = category(row, unseal);
    if (riskCategory) categories30DaysAgo[riskCategory]++;
  }
  return { highRiskPatients: categories.high, assessedPatients, highRiskPatients30DaysAgo: categories30DaysAgo.high, categories, categories30DaysAgo, highRiskAssessments };
}

export function countOverviewNutrition(rows: CompletedAssessment[], unseal: (value: unknown) => StoredData): OverviewNutrition {
  const protein = { assessed: 0, inadequate: 0 };
  let eatingBarrierAssessed = 0;
  const barrierCounts = new Map<string, { id: string; label: string; count: number }>();
  for (const row of latestAssessments(rows).values()) {
    const riskCategory = category(row, unseal);
    if (riskCategory === null) continue;
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
  const top = [...barrierCounts.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0] ?? null;
  return { protein, eatingBarrier: { assessed: eatingBarrierAssessed, top } };
}

export function countOverviewRisk(rows: CompletedAssessment[], unseal: (value: unknown) => StoredData, now: Date = new Date()): OverviewRisk & { nutrition: OverviewNutrition } {
  return { ...countOverviewRiskCategories(rows, unseal, now), nutrition: countOverviewNutrition(rows, unseal) };
}
