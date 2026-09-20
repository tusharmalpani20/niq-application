import { describe, expect, test } from "bun:test";
import { requestAssessmentScoringCalculate, requestAssessmentScoringStart, type AssessmentScoringStart } from "./assessment-scoring";
const binding: AssessmentScoringStart = {
  assessmentReference: "opaque-reference", bindingId: "binding", ruleVersionId: "rule", checksum: "a".repeat(64), version: "FINAL-1",
  questionnaire: { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", sections: [{ id: "section", title: "Section", description: "", fields: Array.from({ length: 19 }, (_, n) => ({ id: `field_${n}`, label: `Field ${n}`, type: "select", help: "", unit: "", options: [{ id: "yes", label: "Yes", help: "" }], dependencies: [] })) }], supportingInputs: [] },
};
const transport = { baseUrl: "https://scoring.example.test", credential: "secret", requestId: "request", timeoutMs: 1000 };
const result = () => ({ ...Object.fromEntries(Object.entries(binding).filter(([key]) => key !== "questionnaire")), formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score: 2, classification: { id: "low", label: "Low", interpretation: "" },
  components: binding.questionnaire.sections[0]!.fields.map((f, i) => ({ id: f.id, sectionId: "section", label: f.label, points: i === 0 ? 2 : null, status: i === 0 ? "answered" : "unanswered" })),
  answerCoverage: { totalEntries: 19, answeredEntries: 1, unansweredEntries: 18, pendingEntries: 0, allUnanswered: false }, derived: { weightLossPercent: null, proteinAdequacy: null }, riskStatus: "CLIENT_CONFIRMED", clinicalUsePermitted: true, interventions: { status: "NOT_APPLICABLE" }, issues: [], calculatedAt: "2026-09-20T00:00:00.000Z" });
const calculate = (body: unknown, status = 200) => requestAssessmentScoringCalculate({ ...transport, binding, idempotencyKey: "request-key", answers: { field_0: "yes" }, fetcher: async () => Response.json(body, { status }) });
const success = () => ({ result: { ...result(), resultReference: "usage" }, idempotencyKey: "request-key" });
describe("assessment scoring transport", () => {
  test("start only transmits opaque reference and disables credential-bearing redirects", async () => {
    const started = await requestAssessmentScoringStart({ ...transport, assessmentReference: binding.assessmentReference, fetcher: async (url, init) => {
      expect(String(url)).toBe("https://scoring.example.test/v1/assessments/start");
      expect(JSON.parse(String(init?.body))).toEqual({ assessmentReference: "opaque-reference" });
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
      return Response.json(binding);
    } });
    expect(started).toEqual(binding);
  });
  test("rejects wrong profiles, leaked internal metadata and rebound starts", async () => {
    for (const body of [{ ...binding, questionnaire: { ...binding.questionnaire, formatVersion: 1 } }, { ...binding, questionnaire: { ...binding.questionnaire, scoring: {} } }, { ...binding, bindingId: "another" }])
      await expect(requestAssessmentScoringStart({ ...transport, assessmentReference: binding.assessmentReference, expectedBinding: binding, fetcher: async () => Response.json(body) })).rejects.toMatchObject({ kind: "uncertain" });
  });
  test("accepts complete upstream totals with unanswered optional components", async () => {
    expect((await calculate(success())).result.score).toBe(2);
  });
  test("checks evidence, component membership, coverage and total", async () => {
    const valid = success();
    for (const body of [{ ...valid, idempotencyKey: "other" }, ...[{ bindingId: "other" }, { score: 3 }, { components: valid.result.components.slice(1) }, { answerCoverage: { ...valid.result.answerCoverage, answeredEntries: 19 } }, { components: valid.result.components.map((c, i) => i === 0 ? { ...c, sectionId: "other" } : c) }].map(patch => ({ ...valid, result: { ...valid.result, ...patch } }))])
      await expect(calculate(body)).rejects.toMatchObject({ kind: "uncertain", code: "INVALID_RESPONSE" });
  });
  test("only validated pre-charge answer rejection is editable", async () => {
    const rejected = { error: "INVALID_ASSESSMENT_ANSWERS", result: { ...result(), complete: false, issues: [{ path: "answers.field_0", code: "INVALID_ANSWER", message: "Choose an option" }] } };
    await expect(calculate(rejected, 400)).rejects.toMatchObject({ kind: "rejected", code: rejected.error });
    await expect(calculate({ ...rejected, result: { ...rejected.result, bindingId: "other" } }, 400)).rejects.toMatchObject({ kind: "uncertain" });
    await expect(calculate({ error: rejected.error }, 400)).rejects.toMatchObject({ kind: "uncertain" });
  });
  test.each(["REQUEST_IN_PROGRESS", "IDEMPOTENCY_CONFLICT"])("retains uncertain %s without reopening", async reason => {
    await expect(calculate({ error: "SCORING_UNAVAILABLE", reason }, 409)).rejects.toMatchObject({ kind: "uncertain", code: reason });
  });
  test("distinguishes blocked credentials from uncertain network failures", async () => {
    await expect(calculate({ error: "UNAUTHORIZED" }, 401)).rejects.toMatchObject({ kind: "blocked", code: "UNAUTHORIZED" });
    await expect(requestAssessmentScoringCalculate({ ...transport, binding, idempotencyKey: "request-key", answers: {}, fetcher: async () => { throw new Error("secret upstream detail"); } })).rejects.toMatchObject({ kind: "uncertain", message: "Assessment scoring request uncertain: TRANSPORT_OR_RESPONSE_FAILURE" });
  });
});
