import { describe, expect, test } from "bun:test";
import { requestReviewedClassification, requestAssessmentScoringCalculate, requestAssessmentScoringStart, type AssessmentScoringStart } from "./assessment-scoring";
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
  test("accepts a completed blank questionnaire without inventing a score or risk", async () => {
    const blank = { ...result(), score: null, classification: null,
      components: result().components.map(component => ({ ...component, points: null, status: "unanswered" })),
      answerCoverage: { totalEntries: 19, answeredEntries: 0, unansweredEntries: 19, pendingEntries: 0, allUnanswered: true } };
    const response = { result: { ...blank, resultReference: "blank-usage" }, idempotencyKey: "request-key" };
    const calculateBlank = (body: unknown) => requestAssessmentScoringCalculate({ ...transport, binding, idempotencyKey: "request-key", answers: {}, fetcher: async () => Response.json(body) });
    expect((await calculateBlank(response)).result).toMatchObject({ complete: true, score: null, classification: null, resultReference: "blank-usage" });
    await expect(calculateBlank({ ...response, result: { ...response.result, score: 0, classification: { id: "low", label: "Low", interpretation: "" } } })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  test("accepts a scoring-owned Vital IQ total with no questionnaire answers", async () => {
    const blank = { ...result(), questionnaireScore: null, faceScan: { sessionId: "scan-1", points: 1 }, score: 1,
      components: result().components.map(component => ({ ...component, points: null, status: "unanswered" })),
      answerCoverage: { totalEntries: 19, answeredEntries: 0, unansweredEntries: 19, pendingEntries: 0, allUnanswered: true }, resultReference: "combined-usage" };
    const request = (body: unknown) => requestAssessmentScoringCalculate({ ...transport, binding, idempotencyKey: "request-key", answers: {}, faceScanSessionId: "scan-1", fetcher: async (_url, init) => {
      expect(JSON.parse(String(init?.body)).faceScanSessionId).toBe("scan-1");
      return Response.json(body);
    } });
    expect((await request({ result: blank, idempotencyKey: "request-key" })).result.score).toBe(1);
    await expect(request({ result: { ...blank, score: 2 }, idempotencyKey: "request-key" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(request({ result: { ...blank, faceScan: { sessionId: "other", points: 1 } }, idempotencyKey: "request-key" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
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

test("never transmits identity, unknown fields or non-finite numbers", async () => {
  let called = false;
  for (const answers of ([{ name: "Private" }, { field_0: Infinity }, { field_0: NaN }] as Record<string, string | number>[])) {
    await expect(requestAssessmentScoringCalculate({ ...transport, binding, idempotencyKey: "request-key", answers, fetcher: async () => { called = true; return Response.json(success()); } })).rejects.toMatchObject({ kind: "rejected", code: "INVALID_LOCAL_ANSWERS" });
  }
  expect(called).toBe(false);
});


describe("reviewed risk transport", () => {
 const response = () => ({result:{assessmentReference:binding.assessmentReference,bindingId:binding.bindingId,ruleVersionId:binding.ruleVersionId,checksum:binding.checksum,version:binding.version,resultReference:"risk-result",score:68,classification:{id:"high",label:"High",interpretation:"Review required"},calculatedAt:"2026-09-23T00:00:00.000Z"},idempotencyKey:"risk-request"});
 const classify = (body:unknown,status=200) => requestReviewedClassification({...transport,binding,score:68,idempotencyKey:"risk-request",fetcher:async()=>Response.json(body,{status})});
 test("sends only the bound reference, reviewed total and retry key",async()=>{
  const risk=await requestReviewedClassification({...transport,binding,score:68,idempotencyKey:"risk-request",fetcher:async(url,init)=>{
   expect(String(url)).toBe("https://scoring.example.test/v1/assessments/classify-reviewed");
   expect(JSON.parse(String(init?.body))).toEqual({assessmentReference:binding.assessmentReference,score:68,idempotencyKey:"risk-request"});
   expect(init?.redirect).toBe("error");
   return Response.json(response());
  }});
  expect(risk.classification.label).toBe("High");
 });
 test("rejects a different total, binding, request key or malformed category",async()=>{
  const valid=response();
  for(const body of [{...valid,idempotencyKey:"wrong"},...[
   {score:67},{assessmentReference:"other"},{bindingId:"other"},{ruleVersionId:"other"},{version:"other"},{checksum:"b".repeat(64)},{classification:null}
  ].map(patch=>({...valid,result:{...valid.result,...patch}}))])
   await expect(classify(body)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
 });
 test("preserves unmatched classification and uncertain retry failures",async()=>{
  await expect(classify({error:"UNMATCHED_CLASSIFICATION"},422)).rejects.toMatchObject({kind:"rejected",code:"UNMATCHED_CLASSIFICATION"});
  await expect(classify({error:"SCORING_UNAVAILABLE",reason:"REQUEST_IN_PROGRESS"},409)).rejects.toMatchObject({kind:"uncertain",code:"REQUEST_IN_PROGRESS"});
 });
 test("invalid reviewed totals never leave the application",async()=>{
  let calls=0;
  for(const score of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])
   await expect(requestReviewedClassification({...transport,binding,score,idempotencyKey:"risk-request",fetcher:async()=>{calls++;return Response.json(response());}})).rejects.toBeDefined();
  expect(calls).toBe(0);
 });
});
