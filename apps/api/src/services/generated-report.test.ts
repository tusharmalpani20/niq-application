import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/bun";
import { initializeMonitoring } from "../monitoring";
import { PgDialect } from "drizzle-orm/pg-core";
import { GeneratedReportService, REPORT_REVIEW_REQUIRED, assertGeneratedPdf, assertReadyPdfRefresh, assertReportPdfDownloadable, assertReportReadyForApproval, assertReviewedArtifact, automaticReportCanFinalize, automaticRetryDelay, cleanReportText, finishWeightHistory, reportWeightComparison, normalizeGuidance, normalizeNarrative, prepareNarrativeEdit, publicReportGeneration, reportPredecessorId, preserveReportPdfHold, reportDefersPdf, reportBrandingFingerprint, reportClinicalFacts, reportGenerationIssues, reportNeedsClinicalReview, reportObservations, reportProductCatalog, reportProductPlans, reportToxicityAnswers } from "./generated-report";
import { requestScoringReportContent, requestScoringToxicityOptions, ScoringReportContentPending, scoringReportContentSchema } from "./scoring-report-content";
import { approveGeneratedReportSchema, editGeneratedNarrativeSchema } from "../../../../packages/contracts/src/generated-report";

const narrative = { overview: "Overview", keyFindings: "Findings", actionSummary: "Actions", monitoringSummary: "Monitoring" };
const packet = {
  runId: "run-1", status: "READY", assessmentReference: "anonymous-assessment", resultReference: "reviewed-result-2",
  ruleVersionId: "rule-1", checksum: "a".repeat(64), model: "openai/gpt-6-luna", promptVersion: "rules-r1", schemaVersion: 1,
  classification: { id: "high", label: "High risk" },
  narrative: Object.fromEntries(Object.keys(narrative).map(key => [key, { text: narrative[key as keyof typeof narrative], evidenceIds: ["fact:niq_risk"] }])),
  guidance: {
    nutritionInterventions: [], toxicityInterventions: [], possibleToxicities: [
      { id: "nausea", classId: "taxanes", treatmentTypeId: "radiation", expectedToxicity: "Nausea", summary: "If nausea occurs, try small, frequent meals.", nutritionalInterventions: "Try small, frequent meals." },
    ], classGuidance: [],
    carePlan: { nutritionalStatus: "severely_malnourished", statusModifiers: [], treatmentGuidance: [], coMorbidities: [],
      products: { status: "clinician_choice_required", plans: [], choices: [
        { id: "surgical", stage: "surgical", nutritionalStatus: "severely_malnourished", products: "A", dose: "1", duration: "1 week" },
        { id: "treatment", stage: "during_treatment", nutritionalStatus: "severely_malnourished", products: "B", dose: "1", duration: "1 week" },
      ], notes: [] } },
  }, issues: [],
};

test("reviewed target decisions cross the boundary without private conflict reasoning", () => {
  const targetResolutions = [
    { nutrient: "protein", decision: "select_source", selectedSourceId: "rule:status:high", sourceIds: ["rule:nutrition:high", "rule:status:high"],
      rationale: "Internal clinical comparison", targetText: "1.2–1.5 g/kg/day" },
    { nutrient: "energy", decision: "withhold_numeric", selectedSourceId: null, sourceIds: ["rule:nutrition:high"],
      rationale: "Internal unresolved conflict", targetText: null },
  ];
  expect(scoringReportContentSchema.parse({ ...packet, targetResolutions }).targetResolutions).toEqual([
    { nutrient: "protein", decision: "select_source", targetText: "1.2–1.5 g/kg/day" },
    { nutrient: "energy", decision: "withhold_numeric", targetText: null },
  ]);
  expect(scoringReportContentSchema.parse(packet).targetResolutions).toBeUndefined();
});

test("target decisions reject ambiguous duplicates or missing selected text", () => {
  const selected = { nutrient: "protein", decision: "select_source", targetText: "1.2–1.5 g/kg/day" };
  expect(scoringReportContentSchema.safeParse({ ...packet, targetResolutions: [selected, selected] }).success).toBe(false);
  expect(scoringReportContentSchema.safeParse({ ...packet, targetResolutions: [{ ...selected, targetText: null }] }).success).toBe(false);
});
const manifest = { sections: [{ fields: [
  { id: "drug_classes", options: [{ id: "taxanes", label: "Taxanes" }] },
  { id: "current_cancer_treatment", options: [{ id: "radiation", label: "Radiotherapy" }] },
] }] } as any;

test("class and treatment candidates retain conditional summaries as possible effects", () => {
  const current = structuredClone(packet) as any;
  current.guidance.possibleToxicities = [{ id: "candidate", classId: "taxanes", treatmentTypeId: "radiation",
    expectedToxicity: "Mouth discomfort", summary: "If mouth discomfort occurs, consider soft foods.",
    nutritionalInterventions: "Raw source advice that should not be shown.", requiresDrugConfirmation: false }];
  const parsed = scoringReportContentSchema.parse(current);
  expect(parsed.guidance.possibleToxicities?.[0]).toMatchObject({ id: "candidate", requiresDrugConfirmation: false });
  expect(normalizeGuidance(parsed, manifest)).toMatchObject({ issues: [], sections: [{
    id: "candidate", kind: "toxicity", title: "Mouth discomfort", text: "If mouth discomfort occurs, consider soft foods.",
    drugClass: "Taxanes", certainty: "possible",
  }] });
  expect(normalizeGuidance(parsed, manifest).sections[0]?.text).not.toContain("Raw source advice");
  current.guidance.possibleToxicities[0].requiresDrugConfirmation = true;
  expect(normalizeGuidance(scoringReportContentSchema.parse(current), manifest).sections).toEqual([]);
});

test("a missing possible-effect summary requires review and is not displayed", () => {
  const current = structuredClone(packet) as any;
  current.guidance.possibleToxicities[0].summary = "";
  const normalized = normalizeGuidance(scoringReportContentSchema.parse(current), manifest);
  expect(normalized.sections).toEqual([]);
  expect(normalized.issues).toEqual(["possibleToxicities:nausea:MISSING_SUMMARY"]);
  current.guidance.possibleToxicities[0].expectedToxicity = "";
  const missingLabel = normalizeGuidance(scoringReportContentSchema.parse(current), manifest);
  expect(missingLabel.sections).toEqual([]);
  expect(missingLabel.issues).toEqual(["possibleToxicities:nausea:MISSING_LABEL"]);
});

test("report-content request binds the clinician-reviewed score and result reference", async () => {
  let sent: any;
  let calls = 0;
  const result = await requestScoringReportContent({ baseUrl: "http://scoring.test", credential: "private", requestId: "r1", timeoutMs: 1000,
    assessmentReference: packet.assessmentReference, resultReference: packet.resultReference, idempotencyKey: "request-1234567890",
    facts: { reviewedScore: 28, reviewedRiskCategoryId: "high", treatmentTypeIds: [], drugClassIds: [], confirmedToxicityIds: [], observations: [],
      assessmentAnswers: { previous_weight_kg: 62, current_weight_kg: 64 },
      weightComparison: { source: "assessment_history", previousWeightKg: 63, currentWeightKg: 64, previousDate: "2026-10-13", currentDate: "2026-10-15", changePercent: 1 / 63 * 100 } },
    fetcher: async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (init?.method === "POST") { sent = JSON.parse(String(init.body)); return Response.json({ runId: "run-1", status: "QUEUED" }, { status: 202 }); }
      return Response.json({ runId: "run-1", status: "READY", response: packet });
    },
  } as any);
  expect(sent.resultReference).toBe("reviewed-result-2");
  expect(sent.facts.reviewedScore).toBe(28);
  expect(sent.facts.assessmentAnswers.previous_weight_kg).toBe(62);
  expect(sent.facts.weightComparison).toMatchObject({ source: "assessment_history", previousWeightKg: 63, currentWeightKg: 64,
    previousDate: "2026-10-13", currentDate: "2026-10-15" });
  expect(result.checksum).toBe("a".repeat(64));
  expect(calls).toBe(2);
  await expect(requestScoringReportContent({ baseUrl: "http://scoring.test", credential: "private", requestId: "r2", timeoutMs: 1000,
    assessmentReference: packet.assessmentReference, resultReference: "wrong-result", idempotencyKey: "request-1234567891",
    facts: sent.facts, fetcher: async () => Response.json(packet),
  } as any)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("v2 care-plan passages are required, cleaned, and kept separate from older saved reports", () => {
  const current = structuredClone(packet) as any;
  current.schemaVersion = 2;
  expect(scoringReportContentSchema.safeParse(current).success).toBe(false);
  current.narrative.nutritionAdvice = { text: "Take small meals; monitor intake.", evidenceIds: ["rule:nutrition"] };
  current.narrative.treatmentAdvice = { text: "Discuss treatment effects.", evidenceIds: ["rule:treatment"] };
  current.narrative.conditionAdvice = { text: "Check blood pressure.", evidenceIds: ["rule:condition"] };
  current.narrative.effectsAdvice = { text: "", evidenceIds: [] };
  current.omittedNarrativeFields = ["effectsAdvice"];
  const parsed = scoringReportContentSchema.parse(current);
  expect(normalizeNarrative(parsed.narrative)).toMatchObject({
    nutritionAdvice: "Take small meals. monitor intake.", treatmentAdvice: "Discuss treatment effects.",
    conditionAdvice: "Check blood pressure.", effectsAdvice: "",
  });
  expect(parsed.omittedNarrativeFields).toEqual(["effectsAdvice"]);
  expect(normalizeNarrative(scoringReportContentSchema.parse(packet).narrative).nutritionAdvice).toBeUndefined();
  expect(editGeneratedNarrativeSchema.safeParse({ revision: 1, narrative: { conditionAdvice: "Check blood pressure." } }).success).toBe(true);
});

test("v3 accepts the reviewed closing summary and keeps older reports readable", () => {
  const current = structuredClone(packet) as any;
  current.schemaVersion = 3;
  for (const field of ["nutritionAdvice", "treatmentAdvice", "conditionAdvice", "effectsAdvice"])
    current.narrative[field] = { text: "", evidenceIds: [] };
  expect(scoringReportContentSchema.safeParse(current).success).toBe(false);
  current.narrative.overallSummary = {
    text: "High nutrition risk warrants early support. Monitor weight and intake with the care team.",
    evidenceIds: ["fact:niq_risk", "rule:nutrition"],
  };
  const parsed = scoringReportContentSchema.parse(current);
  expect(normalizeNarrative(parsed.narrative).overallSummary).toContain("Monitor weight and intake");
  expect(scoringReportContentSchema.parse(packet).narrative.overallSummary).toBeUndefined();
  expect(editGeneratedNarrativeSchema.safeParse({ revision: 1, narrative: { overallSummary: "Reviewed closing summary." } }).success).toBe(true);
});

test("automatic generation retries an in-progress Scoring run with bounded delay", async () => {
  expect([1,2,3,4,20].map(automaticRetryDelay)).toEqual([30_000,60_000,120_000,240_000,300_000]);
  await expect(requestScoringReportContent({ baseUrl: "http://scoring.test", credential: "private", requestId: "r1", timeoutMs: 1000,
    assessmentReference: packet.assessmentReference, resultReference: packet.resultReference, idempotencyKey: "report-request-retry",
    facts: { reviewedScore: 28, treatmentTypeIds: [], drugClassIds: [], confirmedToxicityIds: [], assessmentDate: "2026-10-12", observations: [] },
    fetcher: async () => Response.json({ error: "REQUEST_IN_PROGRESS" }, { status: 409 }),
  } as any)).rejects.toMatchObject({ kind: "unavailable", code: "REQUEST_IN_PROGRESS" });
});

test("Scoring review failures and local rule issues stay out of automatic PDF generation", () => {
  expect(reportGenerationIssues("REVIEW_REQUIRED", [])).toEqual(["Generated text needs clinical review before a PDF can be issued."]);
  expect(reportGenerationIssues("READY", ["Choose a product stage"])).toEqual(["Choose a product stage"]);
  expect(reportNeedsClinicalReview("REVIEW_REQUIRED", [])).toBe(true);
  expect(reportNeedsClinicalReview("READY", ["Choose a product stage"])).toBe(true);
  expect(reportNeedsClinicalReview("READY", [])).toBe(false);
  expect(automaticReportCanFinalize("DRAFT", REPORT_REVIEW_REQUIRED, [])).toBe(false);
  expect(automaticReportCanFinalize("DRAFT", null, ["Unresolved content issue"])).toBe(false);
  expect(automaticReportCanFinalize("DRAFT", null, [])).toBe(true);
  expect(publicReportGeneration("DRAFT", REPORT_REVIEW_REQUIRED, [])).toEqual({ status: "FAILED", failureCode: "REVIEW_REQUIRED" });
  expect(publicReportGeneration("READY", null, ["Legacy unresolved issue"])).toEqual({ status: "FAILED", failureCode: "REVIEW_REQUIRED" });
  expect(publicReportGeneration("READY", null, [])).toEqual({ status: "READY", failureCode: null });
  expect(() => assertReportPdfDownloadable(["Legacy unresolved issue"])).toThrow("final report PDF is not available");
  expect(() => assertReportPdfDownloadable([])).not.toThrow();
});

test("PDF refresh is restricted to ready reports without unresolved issues", () => {
  expect(() => assertReadyPdfRefresh("READY", [])).not.toThrow();
  expect(() => assertReadyPdfRefresh("APPROVED", [])).toThrow("Only a ready report");
  expect(() => assertReadyPdfRefresh("DRAFT", [])).toThrow("Only a ready report");
  expect(() => assertReadyPdfRefresh("READY", ["Unsupported claim"])).toThrow("Resolve report-generation issues");
});

test("toxicity options request binds the reviewed result and only sends selected treatment IDs", async () => {
  let sent: any;
  const result = await requestScoringToxicityOptions({ baseUrl: "http://scoring.test", credential: "private", requestId: "r1", timeoutMs: 1000,
    assessmentReference: packet.assessmentReference, resultReference: packet.resultReference,
    treatmentTypeIds: ["chemotherapy"], drugClassIds: ["taxanes"],
    fetcher: async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({ assessmentReference: packet.assessmentReference, resultReference: packet.resultReference,
        ruleVersionId: packet.ruleVersionId, checksum: packet.checksum,
        options: [{ id: "fatigue", classId: "taxanes", classLabel: "Taxanes", treatmentTypeId: "chemotherapy", treatmentTypeLabel: "Chemotherapy", expectedToxicity: "Fatigue" }] });
    },
  } as any);
  expect(sent).toEqual({ assessmentReference: packet.assessmentReference, resultReference: packet.resultReference,
    treatmentTypeIds: ["chemotherapy"], drugClassIds: ["taxanes"] });
  expect(result.options[0]?.classLabel).toBe("Taxanes");
});

test("only allowlisted structured symptom answers and weights cross to Scoring", () => {
  expect(reportToxicityAnswers({
    gastrointestinal_symptoms: ["nausea", "vomiting"], dietary_symptoms: ["fatigue"], appetite_status: "reduced",
    previous_weight_kg: 68, current_weight_kg: 68.1, free_text: "private patient narrative",
  } as any)).toEqual({ gastrointestinal_symptoms: ["nausea", "vomiting"], dietary_symptoms: ["fatigue"],
    appetite_status: "reduced", previous_weight_kg: 68, current_weight_kg: 68.1 });
});

test("report keeps available Vital IQ details and excludes unknown or missing provider fields", () => {
  const metrics = reportObservations({ current_weight_kg: 62, height_cm: 175 } as any, { sections: [] } as any,
    new Date("2026-10-12T08:00:00.000Z"), {
      completedAt: "2026-10-12T08:00:00.000Z",
      context: { dob: "1980-01-01", gender: "male", heightCm: 175, weightKg: 62, posture: "resting", employeeId: "operator" },
      result: {
        wellnessScore: 80, healthRiskScore: 20, physiologicalScore: 91, mentalWellbeingScore: null,
        vitals: { heartRate: 66, oxygenSaturation: 96, respiratoryRate: 16, systolic: 131, diastolic: 84 },
        additionalMetrics: { sdnn: 42, pnn50: 0, bodyFat: 21, hba1c: 5.8, vo2max: null, unknownVendorField: "not for report" },
      },
      score: { status: "SCORED", points: 3, stressIndex: 1.6, stressBand: "average" },
    });
  expect(metrics.filter(metric => metric.source === "face_scan").map(metric => metric.id)).toEqual([
    "vital_iq_points", "wellness_score", "health_risk_score", "physiological_score", "heart_rate", "oxygen_saturation",
    "respiratory_rate", "systolic", "diastolic", "sdnn", "pnn50", "stress_index", "body_fat", "stress_band",
  ]);
  expect(metrics.find(metric => metric.id === "pnn50")?.value).toBe("0");
  expect(metrics.find(metric => metric.id === "body_fat")?.unit).toBe("%");
  expect(metrics.find(metric => metric.id === "sdnn")).toMatchObject({ referenceRange: "60–100 ms", outsideReferenceRange: true });
  expect(metrics.find(metric => metric.id === "heart_rate")).toMatchObject({ referenceRange: "60–100 bpm", outsideReferenceRange: false });
  expect(metrics.find(metric => metric.id === "systolic")).toMatchObject({ referenceRange: "90–120/60–80 mmHg", outsideReferenceRange: true });
  expect(metrics.some(metric => metric.id === "hba1c")).toBe(false);
});

test("Scoring guidance boundary strips unknown proprietary fields and rejects malformed care plans", () => {
  const withPrivate = structuredClone(packet) as any;
  withPrivate.guidance.carePlan.internalPrompt = "secret rule table";
  withPrivate.guidance.carePlan.products.choices[0].sourceText = "private source";
  withPrivate.guidance.carePlan.products.choices[0].source = { document: "private" };
  const parsed = scoringReportContentSchema.parse(withPrivate);
  expect(JSON.stringify(parsed)).not.toContain("secret rule table");
  expect(JSON.stringify(parsed)).not.toContain("private source");
  expect(scoringReportContentSchema.safeParse({ ...packet, guidance: { ...packet.guidance, carePlan: { products: { status: "none" } } } }).success).toBe(false);
});

test("weight history uses the questionnaire's 1–2 month answer for a first assessment, and prior assessments thereafter", () => {
  expect(finishWeightHistory([], { date: "2026-10-11", kg: 68 }, 85)).toEqual([
    { date: null, kg: 85, label: "Weight 1 Month Ago" }, { date: "2026-10-11", kg: 68 },
  ]);
  expect(finishWeightHistory([{ date: "2026-03-01", kg: 81 }], { date: "2026-10-11", kg: 68 }, 85)).toEqual([
    { date: "2026-03-01", kg: 81 }, { date: "2026-10-11", kg: 68 },
  ]);
  expect(finishWeightHistory([], { date: "2026-10-11", kg: 68 }, 85, false)).toEqual([
    { date: "2026-10-11", kg: 68 },
  ]);
});

test("weight chart drops conflicting recent history when reported previous and current weights agree", () => {
  expect(finishWeightHistory([
    { date: "2026-10-12", kg: 62 },
    { date: "2026-10-05", kg: 48 },
    { date: "2026-06-07", kg: 48 },
  ], { date: "2026-10-13", kg: 62 }, 64)).toEqual([
    { date: "2026-10-13", kg: 62 },
  ]);
});

test("possible drug-class effects are retained while an unresolved product stage is omitted", () => {
  const unresolved = structuredClone(packet) as any;
  unresolved.guidance.carePlan.products.plans = [
    { id: "unselected", stage: "surgical", nutritionalStatus: "severely_malnourished", products: "Liss WH", dose: "1 Liss WH", duration: "30 days" },
  ];
  unresolved.guidance.carePlan.products.notes = [
    { id: "diet_exception", kind: "vegetarian_liss_substitution", label: "Vegetarian diet", guidance: "Replace Liss WH with Invigour." },
  ];
  const result = normalizeGuidance(scoringReportContentSchema.parse(unresolved), manifest);
  expect(result.issues).toEqual([]);
  expect(result.sections.find(row=>row.id==="nausea")?.certainty).toBe("possible");
  expect(result.sections.find(row=>row.kind==="product")).toBeUndefined();
  expect(() => assertReportReadyForApproval(result.issues, 1, 1)).not.toThrow();
});

test("matched treatment, status, co-morbidity, and selected product guidance enter display sections", () => {
  const selected = structuredClone(packet) as any;
  selected.guidance.possibleToxicities = [];
  selected.guidance.carePlan.products = { status: "selected", plans: [
    { id: "plan", stage: "during_treatment", nutritionalStatus: "severely_malnourished", products: "Product A", dose: "One serving", duration: "Two weeks" },
  ], notes: [{ id: "exception", kind: "liver_nourish_once_daily", label: "Liver precaution", guidance: "Use once daily." }] };
  selected.guidance.carePlan.statusModifiers = [{ id: "modifier", classId: "taxanes", treatmentTypeId: "radiation", nutritionalStatus: "severely_malnourished", riskEmphasis: "Higher nutrition risk", actions: "Monitor intake." }];
  selected.guidance.carePlan.treatmentGuidance = [{ id: "radiation-rule", treatmentTypeId: "radiation", nutritionalStatus: "severely_malnourished", guidance: "Add small meals." }];
  selected.guidance.carePlan.coMorbidities = [{ id: "co-morbidity", conditionId: "liver", label: "Liver support", guidance: "Ask the clinical team." }];
  const result = normalizeGuidance(scoringReportContentSchema.parse(selected), manifest);
  expect(result.issues).toEqual([]);
  expect(result.sections.map(row => row.id)).toEqual(["radiation-rule", "modifier", "co-morbidity", "plan"]);
  expect(result.sections.find(row => row.id === "radiation-rule")?.title).toBe("Radiotherapy guidance");
});

test("structured product quantities appear once with preparation and duration", () => {
  const selected = structuredClone(packet) as any;
  selected.guidance.possibleToxicities = [];
  selected.guidance.carePlan.products = { status: "selected", plans: [{
    id: "surgical", stage: "surgical", nutritionalStatus: "severely_malnourished",
    products: "Invigour + Liss WH", dose: "1 Invigour + 2 leveled scoops in 150ml water", duration: "30 days after surgery",
    items: [{ productName: "Invigour", quantityPerDay: 1 }, { productName: "Liss WH", quantityPerDay: 2, unit: "leveled scoops", preparation: "Mix in 150ml water" }],
  }], notes: [] };
  const parsed = scoringReportContentSchema.parse(selected);
  expect(parsed.guidance.carePlan.products.plans[0]?.items).toHaveLength(2);
  expect(normalizeGuidance(parsed, manifest).sections[0]?.text).toBe("1 Invigour + 2 leveled scoops Liss WH (Mix in 150ml water)\n30 days after surgery");
  selected.guidance.carePlan.products.plans[0].items[1].quantityPerDay = undefined;
  expect(normalizeGuidance(scoringReportContentSchema.parse(selected), manifest).sections).toMatchObject([{ id: "surgical", kind: "product", text: "1 Invigour + 2 leveled scoops in 150ml water\n30 days after surgery" }]);
});

test("clinical background uses submitted answer labels and omits unanswered fields", () => {
  const form = { sections: [{ fields: [
    { id: "cancer_type", options: [{ id: "cancer_breast", label: "Breast cancer" }] },
    { id: "stage", options: [{ id: "stage_local", label: "Localised" }] },
    { id: "current_cancer_treatment", options: [{ id: "chemotherapy", label: "Chemotherapy" }] },
    { id: "diet_preference", options: [{ id: "vegetarian", label: "Vegetarian" }] },
  ] }] } as any;
  expect(reportClinicalFacts({ cancer_type: "cancer_breast", stage: "stage_local", current_cancer_treatment: ["chemotherapy"], diet_preference: "vegetarian" }, form)).toEqual([
    { label: "Diagnosis", value: "Breast cancer" }, { label: "Disease stage", value: "Localised" },
    { label: "Current treatment", value: "Chemotherapy" }, { label: "Diet Preference", value: "Vegetarian" },
  ]);
  expect(reportClinicalFacts({ cancer_type: "cancer_breast", treatment_status: "treatment_status_newly_diagnosed",
    current_cancer_treatment: ["chemotherapy"], planned_treatment_start_date: "2026-10-20" }, form, "2026-10-13")).toContainEqual(
    { label: "Planned treatment", value: "Chemotherapy" });
  expect(reportClinicalFacts({ current_cancer_treatment: ["chemotherapy"], planned_treatment_start_date: "2026-10-20" }, form, "2026-10-13")).toContainEqual(
    { label: "Treatment Start Date", value: "20 Oct 2026" });
});

test("selected product schedule retains rule instructions as structured report data", () => {
  const selected = structuredClone(packet) as any;
  selected.guidance.carePlan.products = { status: "selected", plans: [{ id: "plan", stage: "during_treatment", nutritionalStatus: "moderate",
    products: "Invigour", dose: "1 daily", duration: "At least 3 months", durationAmount: 90,
    items: [{ productName: "Invigour", quantityPerDay: 1, unit: "sachet", timesPerDay: 1,
      preparation: "Mix with water", mealTiming: "after breakfast", description: "Obsolete product instructions", rationale: "Obsolete reason" }],
  }], catalog: [{ id: "product-1", name: "Invigour", description: "Nutrition supplement.", benefits: ["Supports intake", "Supports muscle maintenance"], aliases: ["Es Invigour"] }], notes: [] };
  const parsed = scoringReportContentSchema.parse(selected);
  expect(reportProductPlans(parsed)).toEqual([{ id: "plan", duration: "At least 3 months", durationAmount: 90,
    items: [{ productName: "Invigour", quantityPerDay: 1, unit: "sachet", timesPerDay: 1,
      preparation: "Mix with water", mealTiming: "after breakfast" }] }]);
  expect(reportProductCatalog(parsed)).toEqual([{ id: "product-1", name: "Invigour", description: "Nutrition supplement.", benefits: ["Supports intake", "Supports muscle maintenance"], aliases: ["Es Invigour"] }]);
});

test("a compound source topic is displayed using only the symptom actually reported", () => {
  const selected = structuredClone(packet) as any;
  selected.guidance.possibleToxicities = [];
  selected.guidance.toxicityInterventions = [{ id: "fatigue", classId: "taxanes", treatmentTypeId: "radiation",
    expectedToxicity: "Fatigue / reduced appetite", nutritionalInterventions: "Try small meals.",
    matchSource: "assessment_answer", matchedAnswerLabels: ["Fatigue"] }];
  const section = normalizeGuidance(scoringReportContentSchema.parse(selected), manifest).sections.find(row => row.id === "fatigue");
  expect(section).toMatchObject({ title: "Fatigue", matchSource: "assessment_answer", matchedAnswerLabels: ["Fatigue"] });
});

test("a clinician can resolve generation issues while omitting unsupported passages", () => {
  const data = { narrative: { overview: "", keyFindings: "", actionSummary: "", monitoringSummary: "" }, narrativeEvidence: { overview: ["fact:old"] }, issues: ["Unsupported claim"], issueResolution: null } as any;
  const prepared = prepareNarrativeEdit(data, { narrative: { overview: "Corrected" }, issueResolution: { explanation: "I checked and removed the unsupported claim" } }, "Clinician", new Date("2026-10-11T00:00:00Z"));
  expect(prepared.resolvedIssueCount).toBe(1);
  expect(prepared.data.issues).toEqual([]);
  expect(prepared.data.narrative).toEqual({ overview: "Corrected", keyFindings: "", actionSummary: "", monitoringSummary: "" });
  expect(prepared.data.narrativeEvidence?.overview).toBeUndefined();
  expect(prepared.data.issueResolution).toEqual({ originalIssues: ["Unsupported claim"], explanation: "I checked and removed the unsupported claim", clinicianName: "Clinician", resolvedAt: "2026-10-11T00:00:00.000Z" });
});

test("approval requires an artifact for the exact revision and PDF bytes must be valid", () => {
  expect(() => assertReportReadyForApproval(["Unresolved claim"], 3, 3)).toThrow("Resolve report-generation issues");
  expect(() => assertReportReadyForApproval([], 2, 3)).toThrow("final PDF");
  expect(() => assertReportReadyForApproval([], 3, 3)).not.toThrow();
  expect(() => assertGeneratedPdf(Buffer.from("not a PDF"))).toThrow("valid generated PDF");
  expect(() => assertGeneratedPdf(Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF"))).not.toThrow();
});

test("approval binds the reviewed PDF and current organisation branding", () => {
  const brand = { displayName: " Example Clinic ", logoObjectKey: "database:logo-1", primaryColor: "#112233", secondaryColor: "#445566" };
  const fingerprint = reportBrandingFingerprint(brand);
  expect(reportBrandingFingerprint({ ...brand, displayName: "Example Clinic" })).toBe(fingerprint);
  expect(reportBrandingFingerprint({ ...brand, logoObjectKey: "database:logo-2" })).not.toBe(fingerprint);
  expect(reportBrandingFingerprint({ ...brand, secondaryColor: "#000000" })).not.toBe(fingerprint);
  const sha256 = "a".repeat(64);
  const artifact = { sha256, brandingFingerprint: fingerprint };
  expect(() => assertReviewedArtifact(artifact, sha256, fingerprint)).not.toThrow();
  expect(() => assertReviewedArtifact({ ...artifact, sha256: "b".repeat(64) }, sha256, fingerprint)).toThrow("PDF changed after review");
  expect(() => assertReviewedArtifact({ ...artifact, brandingFingerprint: null }, sha256, fingerprint)).toThrow("theme changed");
  expect(() => assertReviewedArtifact(artifact, sha256, reportBrandingFingerprint({ ...brand, primaryColor: "#abcdef" }))).toThrow("theme changed");
  expect(approveGeneratedReportSchema.safeParse({ revision: 0, reviewedSha256: sha256 }).success).toBe(true);
  expect(approveGeneratedReportSchema.safeParse({ revision: 0 }).success).toBe(false);
});

test("report copy removes emojis, semicolons and em dashes", () => {
  expect(cleanReportText("Use Nourish; monitor intake — daily 🩺")).toBe("Use Nourish. monitor intake - daily");
  const selected = structuredClone(packet) as any;
  selected.guidance.possibleToxicities = [];
  selected.guidance.carePlan.products = { status: "selected", plans: [{ id: "plan", stage: "during_treatment", nutritionalStatus: "moderate", products: "Product", dose: "1", duration: "1 day" }], notes: [
    { id: "note", kind: "vegetarian", label: "Diet 🥗", guidance: "Use Invigour; avoid Liss WH — today." },
  ] };
  expect(normalizeGuidance(scoringReportContentSchema.parse(selected), manifest).sections).toMatchObject([
    { title: "Product plan", text: "1\n1 day" },
  ]);
  const edited = prepareNarrativeEdit({ narrative, issues: [], issueResolution: null } as any,
    { narrative: { overview: "Review; keep going — today 🩺" } }, "Clinician", new Date());
  expect(edited.data.narrative.overview).toBe("Review. keep going - today");
});

test("a clinician adding supported text clears that passage from the omitted list", () => {
  const data = { narrative: { ...narrative, overview: "", actionSummary: "" },
    omittedNarrativeFields: ["overview", "actionSummary"], issues: [], issueResolution: null } as any;
  const edited = prepareNarrativeEdit(data, { narrative: { overview: "Reviewed risk" } }, "Clinician", new Date());
  expect(edited.data.omittedNarrativeFields).toEqual(["actionSummary"]);
});

describe("source binding", () => {
  const service = new GeneratedReportService({ unseal: (stored: unknown) => stored } as any);
  const row = { id: "assessment", status: "COMPLETED", currentSubmissionId: "submission", completedAt: new Date("2026-10-11T00:00:00Z"),
    clinicalReview: { finalSnapshot: { submissionId: "submission", scoreRevision: 2, score: { overall: { reviewedPoints: 28 }, risk: {
      status: "CONFIRMED", resultReference: "reviewed-result-2", classification: { id: "high", label: "High risk", color: "red" },
    } } } },
  } as any;
  test("uses the completed reviewed result, and invalidates the report after a score revision changes", () => {
    const source = (service as any).source(row);
    expect(source.resultReference).toBe("reviewed-result-2");
    expect(source.risk.color).toBe("red");
    const before = (service as any).currentFingerprint(row, "a".repeat(64));
    const changed = structuredClone(row);
    changed.clinicalReview.finalSnapshot.scoreRevision = 3;
    expect((service as any).currentFingerprint(changed, "a".repeat(64))).not.toBe(before);
    changed.status = "DRAFT";
    expect((service as any).currentFingerprint(changed, "a".repeat(64))).toBeNull();
  });
});


test("HTML review holds survive retries and expose only checked drafts without issuing a PDF", () => {
  const held = "auto-final-v1:submission:html-review";
  expect(reportDefersPdf(held)).toBe(true);
  expect(reportDefersPdf("auto-final-v1:submission")).toBe(false);
  for (const continuation of ["retry", "recovery"]) {
    const next = preserveReportPdfHold(`auto-final-v1:submission:${continuation}:report`, held);
    expect(reportDefersPdf(next)).toBe(true);
    expect(preserveReportPdfHold(next, held)).toBe(next);
    expect(publicReportGeneration("DRAFT", null, [], next)).toEqual({status:"READY",failureCode:null});
  }
  expect(publicReportGeneration("DRAFT", null, [])).toEqual({status:"GENERATING",failureCode:null});
  expect(publicReportGeneration("DRAFT", null, ["Unsafe content"], held).status).toBe("FAILED");
  expect(publicReportGeneration("DRAFT", REPORT_REVIEW_REQUIRED, [], held).status).toBe("FAILED");
  expect(publicReportGeneration("QUEUED", null, [], held).status).toBe("QUEUED");
});

test("a rejected explicit HTML attempt stays terminal while legacy automatic attempts remain queued", async () => {
  const assessment = {};
  const service = new GeneratedReportService({ unseal: (stored: unknown) => stored } as any);
  (service as any).clinical = async () => assessment;
  for (const status of ["DRAFT", "FAILED"]) {
    const row = { status, failureCode: REPORT_REVIEW_REQUIRED, requestKey: "auto-final-v1:submission:html-review",
      content: { issues: ["nutritionAdvice:MISSING_SOURCE_CONTENT"] } };
    (service as any).latest = async () => row;
    expect(await service.read({} as any, "org", "assessment")).toEqual({ report: null,
      generation: { status: "FAILED", failureCode: REPORT_REVIEW_REQUIRED } });
    row.requestKey = "auto-final-v1:submission";
    expect(await service.read({} as any, "org", "assessment")).toEqual({ report: null,
      generation: { status: "QUEUED", failureCode: null } });
  }
});

test("HTML review recovery cannot reserve a successor even when called directly", async () => {
  const service = new GeneratedReportService({ db: { transaction: () => { throw new Error("Unexpected successor transaction"); } } } as any);
  await (service as any).recoverReviewRequired({ requestKey: "auto-final-v1:submission:html-review" }, {}, {});
  await (service as any).recoverReviewRequired({ requestKey: "auto-final-v1:submission:html-review:retry:run" }, {}, {});
});

test("the recovery worker query excludes explicit HTML review requests with token boundaries", async () => {
  let query: { sql: string; params: unknown[] } | undefined;
  const chain: any = {};
  for (const method of ["from", "orderBy"]) chain[method] = () => chain;
  chain.where = (predicate: any) => { query = new PgDialect().sqlToQuery(predicate); return chain; };
  chain.limit = async () => [];
  const service = new GeneratedReportService({ config: { REPORT_GENERATION_TIMEOUT_MS: 1000 }, db: { select: () => chain } } as any);
  await service.processDue();
  expect(query?.sql).toContain('"request_key" !~');
  expect(query?.params).toContain("(^|:)html-review(:|$)");
});


test("selected product images survive the authenticated transport boundary and report snapshot", () => {
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const current = structuredClone(packet) as any;
  current.guidance.carePlan.products = {status:"selected",plans:[],notes:[],catalog:[{
    id:"product-1",name:"Es Invigour",description:null,benefits:[],aliases:[],imageDataUrl:image,
  }]};
  const parsed = scoringReportContentSchema.parse(current);
  expect(reportProductCatalog(parsed)).toEqual([{id:"product-1",name:"Es Invigour",description:"",benefits:[],aliases:[],imageDataUrl:image}]);
  current.guidance.carePlan.products.catalog[0].imageDataUrl = "data:image/svg+xml;base64,PHN2Zz4=";
  expect(scoringReportContentSchema.safeParse(current).success).toBe(false);
  current.guidance.carePlan.products.catalog[0].imageDataUrl = "https://example.com/product.png";
  expect(scoringReportContentSchema.safeParse(current).success).toBe(false);
});

describe("explicit report regeneration", () => {
  async function attempt(status: string, requestKey = "auto-final-v1:submission", failureCode: string | null = null) {
    const previous = { id: "01PREVIOUSREPORT", status, requestKey, failureCode, content: "saved-content", artifact: "saved-pdf" };
    const inserted: any[] = [];
    const audited: any[] = [];
    const query: any = {};
    for (const method of ["from", "where", "orderBy", "limit"]) query[method] = () => query;
    query.for = async () => [previous];
    const tx = { select: () => query, insert: () => ({ values: async (row: unknown) => { inserted.push(row); } }) };
    const assessment = { patientId: "patient" };
    const backing = { db: { transaction: async (run: any) => run(tx) }, authorize: async () => assessment,
      audit: async (...args: any[]) => { audited.push(args); } };
    const service = new GeneratedReportService(backing as any);
    (service as any).clinical = async () => assessment;
    (service as any).source = () => ({ submissionId: "submission", scoreRevision: 2 });
    service.read = async () => ({ report: null, generation: { status: "QUEUED", failureCode: null } });
    const result = service.regenerate({} as any, "org", "assessment", {} as any);
    return { result, inserted, audited, previous };
  }

  test("ready and approved reports create a new attempt while preserving issued content and PDF", async () => {
    for (const status of ["READY", "APPROVED"]) {
      const run = await attempt(status, "auto-final-v1:submission:html-review");
      expect(await run.result).toMatchObject({ generation: { status: "QUEUED" } });
      expect(run.inserted).toHaveLength(1);
      expect(run.inserted[0]).toMatchObject({ status: "QUEUED", submissionId: "submission", attemptCount: 0 });
      expect(run.inserted[0].id).not.toBe("01PREVIOUSREPORT");
      expect(reportDefersPdf(run.inserted[0].requestKey)).toBe(true);
      expect(reportPredecessorId(run.inserted[0].requestKey)).toBe("01PREVIOUSREPORT");
      expect(run.previous).toMatchObject({ status, content: "saved-content", artifact: "saved-pdf" });
      expect(run.audited[0]?.[5]).toMatchObject({ previousReportId: "01PREVIOUSREPORT", scoreRevision: 2 });
    }
  });

  test("a queued or generating latest attempt rejects duplicate regeneration without writes", async () => {
    for (const status of ["QUEUED", "GENERATING"]) {
      const run = await attempt(status);
      await expect(run.result).rejects.toMatchObject({ code: "CONFLICT" });
      expect(run.inserted).toHaveLength(0);
      expect(run.audited).toHaveLength(0);
    }
  });

  test("checked HTML drafts and failed automatic attempts remain restartable", async () => {
    for (const [status, requestKey, failureCode] of [
      ["DRAFT", "auto-final-v1:submission:html-review", null],
      ["DRAFT", "auto-final-v1:submission", REPORT_REVIEW_REQUIRED],
      ["FAILED", "auto-final-v1:submission", "MODEL_UNAVAILABLE"],
    ] as const) {
      const run = await attempt(status, requestKey, failureCode);
      await run.result;
      expect(run.inserted).toHaveLength(1);
    }
  });
});

 test("report predecessor references preserve recovery and explicit retry lineage", () => {
  expect(reportPredecessorId("auto-final-v1:submission:recovery:01PREVIOUS:html-review")).toBe("01PREVIOUS");
  expect(reportPredecessorId("auto-final-v1:submission:retry:01NEW:predecessor:01PREVIOUS")).toBe("01PREVIOUS");
  expect(reportPredecessorId("auto-final-v1:submission:retry:01NEW")).toBeUndefined();
});

test("regeneration inherits the clinician product stage across a failed attempt without changing toxicities", async () => {
  const decision = { productStageChoice: "surgical", confirmedToxicityIds: ["old-confirmation"] };
  const rows = [
    { id: "01FAILED", submissionId: "submission", requestKey: "auto-final-v1:submission:retry:01FAILED:predecessor:01ISSUED", content: null },
    { id: "01ISSUED", submissionId: "submission", requestKey: "auto-final-v1:submission", content: { decision } },
  ];
  let reads = 0;
  const query: any = {};
  for (const name of ["from", "where"]) query[name] = () => query;
  query.limit = async () => { reads++; return [rows.shift()]; };
  const service = new GeneratedReportService({ db: { select: () => query }, unseal: (value: unknown) => value } as any);
  expect(await (service as any).predecessorDecision({ id: "01NEW", organizationId: "org", assessmentId: "assessment",
    submissionId: "submission", requestKey: "auto-final-v1:submission:retry:01NEW:predecessor:01FAILED" })).toEqual(decision);
  expect(reads).toBe(2);
});


describe("narrative weight comparison matches the chart", () => {
  test("recorded assessment history takes priority without altering reported assessment answers", () => {
    const answers = { previous_weight_kg: 62, current_weight_kg: 64 };
    const history = finishWeightHistory([{ assessmentId: "previous", date: "2026-10-13", kg: 63 }],
      { assessmentId: "current", date: "2026-10-15", kg: 64 }, answers.previous_weight_kg);
    expect(reportWeightComparison(history, 64, "2026-10-15")).toEqual({
      source: "assessment_history", previousWeightKg: 63, currentWeightKg: 64,
      previousDate: "2026-10-13", currentDate: "2026-10-15", changePercent: 1 / 63 * 100,
    });
    expect(reportToxicityAnswers(answers)).toMatchObject({ previous_weight_kg: 62, current_weight_kg: 64 });
    expect(JSON.stringify(reportWeightComparison(history, 64, "2026-10-15"))).not.toContain("assessmentId");
  });

  test("first assessment uses its reported previous weight without inventing a date", () => {
    const history = finishWeightHistory([], { date: "2026-10-15", kg: 64 }, 62);
    expect(reportWeightComparison(history, 64, "2026-10-15")).toEqual({
      source: "reported_previous_weight", previousWeightKg: 62, currentWeightKg: 64,
      previousLabel: "Weight 1 Month Ago", currentDate: "2026-10-15", changePercent: 2 / 62 * 100,
    });
  });

  test("omits unavailable or stale comparisons instead of describing two prior measurements", () => {
    expect(reportWeightComparison([{ date: "2026-10-15", kg: 64 }], 64, "2026-10-15")).toBeUndefined();
    expect(reportWeightComparison([{ date: "2026-10-13", kg: 63 }, { date: "2026-10-14", kg: 64 }], null, "2026-10-15")).toBeUndefined();
    expect(reportWeightComparison([{ date: "2026-10-13", kg: 63 }, { date: "2026-10-14", kg: 64 }], 64, "2026-10-15")).toBeUndefined();
  });
});


test("historical Vital IQ report observations retain provenance without redating measurements", () => {
  const source = { sessionId: "source", assessmentReference: "ASM-003545", capturedAt: "2026-10-21T08:00:00Z" };
  const metrics = reportObservations({ current_weight_kg: 62 } as any, { sections: [] } as any, new Date("2026-10-23T08:00:00Z"), { completedAt: source.capturedAt, historicalSource: source, result: { vitals: { heartRate: 66 } } });
  expect(metrics.find(metric => metric.id === "heart_rate")).toMatchObject({ measuredAt: source.capturedAt, historicalSource: source });
  expect(metrics.find(metric => metric.id === "current_weight_kg")).not.toHaveProperty("historicalSource");
});


test("automatic terminal source failures reach monitoring without private assessment details", async () => {
  const envelopes: unknown[] = [];
  const transport = () => ({ send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true });
  initializeMonitoring({ NODE_ENV: "development", SENTRY_DSN: "https://public@example.com/1" }, transport);
  const updates: unknown[] = [];
  const chain: any = {};
  for (const method of ["from", "where", "orderBy"]) chain[method] = () => chain;
  chain.limit = async () => [{ id: "PRIVATE_REPORT", organizationId: "PRIVATE_ORG", assessmentId: "PRIVATE_ASSESSMENT", status: "QUEUED", attemptCount: 0 }];
  chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  const update: any = { set: (values: unknown) => { updates.push(values); return update; }, where: async () => [] };
  const service = new GeneratedReportService({ config: { REPORT_GENERATION_TIMEOUT_MS: 1000 }, db: { select: () => chain, update: () => update } } as any);
  try {
    await service.processDue();
    await Sentry.flush(1000);
    expect(updates).toContainEqual(expect.objectContaining({ status: "FAILED", failureCode: "APPROVAL_SOURCE_INVALID" }));
    expect(envelopes).toHaveLength(1);
    const sent = JSON.stringify(envelopes);
    expect(sent).toContain("source_validation");
    expect(sent).toContain("APPROVAL_SOURCE_INVALID");
    expect(sent).not.toContain("PRIVATE_");
    expect(sent).not.toContain("Assessment not found");
  } finally { await Sentry.close(1000); }
});


test("automatic worker alerts for exhausted retries and swallowed failures, not normal pending jobs", async () => {
  const envelopes: unknown[] = [];
  const transport = () => ({ send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true });
  initializeMonitoring({ NODE_ENV: "development", SENTRY_DSN: "https://public@example.com/1" }, transport);
  const run = async (attemptCount: number, error: Error) => {
    const chain: any = {};
    for (const method of ["from", "where", "orderBy"]) chain[method] = () => chain;
    chain.limit = async () => [{ id: "PRIVATE_REPORT", organizationId: "PRIVATE_ORG", assessmentId: "PRIVATE_ASSESSMENT", status: "QUEUED", attemptCount }];
    chain.then = (_resolve: unknown, reject: (error: Error) => unknown) => Promise.reject(error).catch(reject);
    const update: any = { set: () => update, where: async () => [] };
    const service = new GeneratedReportService({ config: { REPORT_GENERATION_TIMEOUT_MS: 1000 }, db: { select: () => chain, update: () => update } } as any);
    await service.processDue();
    await Sentry.flush(1000);
  };
  try {
    await run(5, new Error("Unused"));
    expect(envelopes).toHaveLength(1);
    expect(JSON.stringify(envelopes)).toContain("AUTOMATIC_RETRIES_EXHAUSTED");
    await run(0, new Error("PRIVATE_DATABASE_DETAIL"));
    expect(envelopes).toHaveLength(2);
    expect(JSON.stringify(envelopes)).toContain("report_worker");
    expect(JSON.stringify(envelopes)).not.toContain("PRIVATE_DATABASE_DETAIL");
    await run(0, new ScoringReportContentPending("PRIVATE_RUN", "PROCESSING"));
    expect(envelopes).toHaveLength(2);
  } finally { await Sentry.close(1000); }
});


test("an abandoned legacy generation emits one terminal alert when expiry wins the update", async () => {
  const envelopes: unknown[] = [];
  const transport = () => ({ send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true });
  initializeMonitoring({ NODE_ENV: "development", SENTRY_DSN: "https://public@example.com/1" }, transport);
  let row: any = { id: "PRIVATE_REPORT", status: "GENERATING", requestKey: "manual-request", updatedAt: new Date(0), content: null };
  const update: any = { set: (values: unknown) => { row = { ...row, ...(values as object) }; return update; }, where: () => update, returning: async () => [row] };
  const service = new GeneratedReportService({ config: { REPORT_GENERATION_TIMEOUT_MS: 1000 }, db: { update: () => update } } as any);
  (service as any).clinical = async () => ({});
  (service as any).latest = async () => row;
  try {
    const result = await service.read({} as any, "PRIVATE_ORG", "PRIVATE_ASSESSMENT");
    await service.read({} as any, "PRIVATE_ORG", "PRIVATE_ASSESSMENT");
    await Sentry.flush(1000);
    expect(result.generation).toEqual({ status: "FAILED", failureCode: "GENERATION_INTERRUPTED" });
    expect(envelopes).toHaveLength(1);
    expect(JSON.stringify(envelopes)).toContain("GENERATION_INTERRUPTED");
    expect(JSON.stringify(envelopes)).not.toContain("PRIVATE_");
  } finally { await Sentry.close(1000); }
});
