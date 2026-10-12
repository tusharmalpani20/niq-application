import { describe, expect, test } from "bun:test";
import { GeneratedReportService, assertGeneratedPdf, assertReportReadyForApproval, assertReviewedArtifact, automaticRetryDelay, cleanReportText, finishWeightHistory, normalizeGuidance, normalizeNarrative, prepareNarrativeEdit, reportBrandingFingerprint, reportToxicityAnswers } from "./generated-report";
import { requestScoringReportContent, requestScoringToxicityOptions, scoringReportContentSchema } from "./scoring-report-content";
import { approveGeneratedReportSchema, editGeneratedNarrativeSchema } from "../../../../packages/contracts/src/generated-report";

const narrative = { overview: "Overview", keyFindings: "Findings", actionSummary: "Actions", monitoringSummary: "Monitoring" };
const packet = {
  runId: "run-1", status: "READY", assessmentReference: "anonymous-assessment", resultReference: "reviewed-result-2",
  ruleVersionId: "rule-1", checksum: "a".repeat(64), model: "openai/gpt-6-luna", promptVersion: "rules-r1", schemaVersion: 1,
  classification: { id: "high", label: "High risk" },
  narrative: Object.fromEntries(Object.keys(narrative).map(key => [key, { text: narrative[key as keyof typeof narrative], evidenceIds: ["fact:niq_risk"] }])),
  guidance: {
    nutritionInterventions: [], toxicityInterventions: [], possibleToxicities: [
      { id: "nausea", classId: "taxanes", treatmentTypeId: "radiation", expectedToxicity: "Nausea", nutritionalInterventions: "Try small, frequent meals." },
    ], classGuidance: [],
    carePlan: { nutritionalStatus: "severely_malnourished", statusModifiers: [], treatmentGuidance: [], coMorbidities: [],
      products: { status: "clinician_choice_required", plans: [], choices: [
        { id: "surgical", stage: "surgical", nutritionalStatus: "severely_malnourished", products: "A", dose: "1", duration: "1 week" },
        { id: "treatment", stage: "during_treatment", nutritionalStatus: "severely_malnourished", products: "B", dose: "1", duration: "1 week" },
      ], notes: [] } },
  }, issues: [],
};
const manifest = { sections: [{ fields: [
  { id: "drug_classes", options: [{ id: "taxanes", label: "Taxanes" }] },
  { id: "current_cancer_treatment", options: [{ id: "radiation", label: "Radiotherapy" }] },
] }] } as any;

test("report-content request binds the clinician-reviewed score and result reference", async () => {
  let sent: any;
  const result = await requestScoringReportContent({ baseUrl: "http://scoring.test", credential: "private", requestId: "r1", timeoutMs: 1000,
    assessmentReference: packet.assessmentReference, resultReference: packet.resultReference, idempotencyKey: "request-1234567890",
    facts: { reviewedScore: 28, reviewedRiskCategoryId: "high", treatmentTypeIds: [], drugClassIds: [], confirmedToxicityIds: [], observations: [] },
    fetcher: async (_url: RequestInfo | URL, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return Response.json(packet); },
  } as any);
  expect(sent.resultReference).toBe("reviewed-result-2");
  expect(sent.facts.reviewedScore).toBe(28);
  expect(result.checksum).toBe("a".repeat(64));
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

test("automatic generation retries an in-progress Scoring run with bounded delay", async () => {
  expect([1,2,3,4,20].map(automaticRetryDelay)).toEqual([30_000,60_000,120_000,240_000,300_000]);
  await expect(requestScoringReportContent({ baseUrl: "http://scoring.test", credential: "private", requestId: "r1", timeoutMs: 1000,
    assessmentReference: packet.assessmentReference, resultReference: packet.resultReference, idempotencyKey: "report-request-retry",
    facts: { reviewedScore: 28, treatmentTypeIds: [], drugClassIds: [], confirmedToxicityIds: [], assessmentDate: "2026-10-12", observations: [] },
    fetcher: async () => Response.json({ error: "REQUEST_IN_PROGRESS" }, { status: 409 }),
  } as any)).rejects.toMatchObject({ kind: "unavailable", code: "REQUEST_IN_PROGRESS" });
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

test("weight chart uses an undated previous weight only when no dated history exists", () => {
  expect(finishWeightHistory([], { date: "2026-10-11", kg: 68 }, 85)).toEqual([
    { date: null, kg: 85, label: "Previous weight (date not recorded)" }, { date: "2026-10-11", kg: 68 },
  ]);
  expect(finishWeightHistory([{ date: "2026-03-01", kg: 81 }], { date: "2026-10-11", kg: 68 }, 85)).toEqual([
    { date: "2026-03-01", kg: 81 }, { date: "2026-10-11", kg: 68 },
  ]);
});

test("possible drug-class effects and an unresolved product stage are omitted", () => {
  const unresolved = structuredClone(packet) as any;
  unresolved.guidance.carePlan.products.plans = [
    { id: "unselected", stage: "surgical", nutritionalStatus: "severely_malnourished", products: "Liss WH", dose: "1 Liss WH", duration: "30 days" },
  ];
  unresolved.guidance.carePlan.products.notes = [
    { id: "diet_exception", kind: "vegetarian_liss_substitution", label: "Vegetarian diet", guidance: "Replace Liss WH with Invigour." },
  ];
  const result = normalizeGuidance(scoringReportContentSchema.parse(unresolved), manifest);
  expect(result.issues).toEqual([]);
  expect(result.sections.find(row=>row.id==="nausea")).toBeUndefined();
  expect(result.sections.find(row=>row.kind==="product")).toBeUndefined();
  expect(() => assertReportReadyForApproval(result.issues, 1, 1)).not.toThrow();
});

test("matched treatment, status, co-morbidity, product, and exception guidance enter display sections", () => {
  const selected = structuredClone(packet) as any;
  selected.guidance.carePlan.products = { status: "selected", plans: [
    { id: "plan", stage: "during_treatment", nutritionalStatus: "severely_malnourished", products: "Product A", dose: "One serving", duration: "Two weeks" },
  ], notes: [{ id: "exception", kind: "liver_nourish_once_daily", label: "Liver precaution", guidance: "Use once daily." }] };
  selected.guidance.carePlan.statusModifiers = [{ id: "modifier", classId: "taxanes", treatmentTypeId: "radiation", nutritionalStatus: "severely_malnourished", riskEmphasis: "Higher nutrition risk", actions: "Monitor intake." }];
  selected.guidance.carePlan.treatmentGuidance = [{ id: "radiation-rule", treatmentTypeId: "radiation", nutritionalStatus: "severely_malnourished", guidance: "Add small meals." }];
  selected.guidance.carePlan.coMorbidities = [{ id: "co-morbidity", conditionId: "liver", label: "Liver support", guidance: "Ask the clinical team." }];
  const result = normalizeGuidance(scoringReportContentSchema.parse(selected), manifest);
  expect(result.issues).toEqual([]);
  expect(result.sections.map(row => row.id)).toEqual(["radiation-rule", "modifier", "co-morbidity", "plan", "exception"]);
  expect(result.sections.find(row => row.id === "radiation-rule")?.title).toBe("Radiotherapy guidance");
  expect(result.sections.find(row => row.id === "exception")?.text).toBe("Use once daily.");
});

test("structured product quantities appear once with preparation and duration", () => {
  const selected = structuredClone(packet) as any;
  selected.guidance.carePlan.products = { status: "selected", plans: [{
    id: "surgical", stage: "surgical", nutritionalStatus: "severely_malnourished",
    products: "Invigour + Liss WH", dose: "1 Invigour + 2 leveled scoops in 150ml water", duration: "30 days after surgery",
    items: [{ productName: "Invigour", quantityPerDay: 1 }, { productName: "Liss WH", quantityPerDay: 2, description: "leveled scoops in 150ml water" }],
  }], notes: [] };
  const parsed = scoringReportContentSchema.parse(selected);
  expect(parsed.guidance.carePlan.products.plans[0]?.items).toHaveLength(2);
  expect(normalizeGuidance(parsed, manifest).sections[0]?.text).toBe("1 Invigour + Liss WH: 2 leveled scoops in 150ml water\n30 days after surgery");
  selected.guidance.carePlan.products.plans[0].items[1].quantityPerDay = undefined;
  expect(normalizeGuidance(scoringReportContentSchema.parse(selected), manifest).sections).toEqual([]);
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
  const data = { narrative: { overview: "", keyFindings: "", actionSummary: "", monitoringSummary: "" }, issues: ["Unsupported claim"], issueResolution: null } as any;
  const prepared = prepareNarrativeEdit(data, { narrative: { overview: "Corrected" }, issueResolution: { explanation: "I checked and removed the unsupported claim" } }, "Clinician", new Date("2026-10-11T00:00:00Z"));
  expect(prepared.resolvedIssueCount).toBe(1);
  expect(prepared.data.issues).toEqual([]);
  expect(prepared.data.narrative).toEqual({ overview: "Corrected", keyFindings: "", actionSummary: "", monitoringSummary: "" });
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
  selected.guidance.carePlan.products = { status: "selected", plans: [], notes: [
    { id: "note", kind: "vegetarian", label: "Diet 🥗", guidance: "Use Invigour; avoid Liss WH — today." },
  ] };
  expect(normalizeGuidance(scoringReportContentSchema.parse(selected), manifest).sections).toMatchObject([
    { title: "Diet", text: "Use Invigour. avoid Liss WH - today." },
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
      status: "CONFIRMED", resultReference: "reviewed-result-2", classification: { id: "high", label: "High risk" },
    } } } },
  } as any;
  test("uses the completed reviewed result, and invalidates the report after a score revision changes", () => {
    const source = (service as any).source(row);
    expect(source.resultReference).toBe("reviewed-result-2");
    const before = (service as any).currentFingerprint(row, "a".repeat(64));
    const changed = structuredClone(row);
    changed.clinicalReview.finalSnapshot.scoreRevision = 3;
    expect((service as any).currentFingerprint(changed, "a".repeat(64))).not.toBe(before);
    changed.status = "DRAFT";
    expect((service as any).currentFingerprint(changed, "a".repeat(64))).toBeNull();
  });
});
