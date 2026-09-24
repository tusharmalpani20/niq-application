import { z } from "zod";

const id = z.string().min(1).max(200);
const option = z.object({ id, label: z.string(), help: z.string() }).strict();
export const assessmentScoringQuestionnaireSchema = z.object({
  formatVersion: z.literal(2), profile: z.literal("NIQ_FINAL_ASSESSMENT"),
  sections: z.array(z.object({ id, title: z.string(), description: z.string(), fields: z.array(z.object({
    id, label: z.string(), type: z.enum(["select", "multi_select", "yes_no", "conditional", "count", "calculated", "derived"]),
    help: z.string(), unit: z.string(), options: z.array(option), dependencies: z.array(id),
  }).strict()).min(1) }).strict()).min(1),
  supportingInputs: z.array(z.object({ id, label: z.string(), kind: z.enum(["number", "select"]), unit: z.string().optional(), required: z.boolean(), options: z.array(option).optional() }).strict()),
}).strict().superRefine((q, ctx) => {
  const fields = q.sections.flatMap(s => s.fields);
  const ids = [...fields, ...q.supportingInputs].map(f => f.id);
  if (new Set(ids).size !== ids.length || new Set(q.sections.map(s => s.id)).size !== q.sections.length)
    ctx.addIssue({ code: "custom", message: "Duplicate questionnaire identifiers" });
  for (const field of fields) {
    if (field.dependencies.some(d => !ids.includes(d)) || new Set(field.options.map(o => o.id)).size !== field.options.length)
      ctx.addIssue({ code: "custom", message: "Invalid questionnaire references" });
  }
});
const evidenceSchema = z.object({ assessmentReference: id, bindingId: id, ruleVersionId: id, checksum: z.string().regex(/^[a-f0-9]{64}$/), version: id });
export const assessmentScoringStartSchema = evidenceSchema.extend({ questionnaire: assessmentScoringQuestionnaireSchema }).strict();
export type AssessmentScoringStart = z.infer<typeof assessmentScoringStartSchema>;
export type AssessmentScoringBinding = z.infer<typeof evidenceSchema>;
const issue = z.object({ path: z.string().max(300), code: z.string().max(100), message: z.string().max(1000) }).strict();
const component = z.object({ id, sectionId: id, label: z.string(), points: z.number().finite().nonnegative().nullable(), status: z.enum(["answered", "unanswered", "pending"]), reason: z.string().optional() }).strict();
const evaluationSchema = evidenceSchema.extend({
  formatVersion: z.literal(2), profile: z.literal("NIQ_FINAL_ASSESSMENT"), complete: z.boolean(),
  score: z.number().finite().nonnegative().nullable(), classification: z.object({ id, label: z.string(), interpretation: z.string() }).strict().nullable(),
  questionnaireScore: z.number().finite().nonnegative().nullable().optional(),
  faceScan: z.object({ sessionId: id, points: z.number().finite().nonnegative() }).strict().nullable().optional(),
  components: z.array(component), answerCoverage: z.object({ totalEntries: z.literal(19), answeredEntries: z.number().int().nonnegative(), unansweredEntries: z.number().int().nonnegative(), pendingEntries: z.number().int().nonnegative(), allUnanswered: z.boolean() }).strict(),
  derived: z.object({ weightLossPercent: z.number().finite().nullable(), proteinAdequacy: z.enum(["adequate", "inadequate"]).nullable() }).strict(),
  riskStatus: z.enum(["DEVELOPMENT_PLACEHOLDER", "CLIENT_CONFIRMED"]), clinicalUsePermitted: z.boolean(),
  interventions: z.object({ status: z.literal("NOT_APPLICABLE") }).strict(), issues: z.array(issue).max(128), calculatedAt: z.iso.datetime(),
}).strict();
export const assessmentScoringCalculationSchema = z.object({ result: evaluationSchema.extend({ resultReference: id }).strict(), idempotencyKey: id }).strict();
export type AssessmentScoringCalculation = z.infer<typeof assessmentScoringCalculationSchema>;
export type AssessmentScoringAnswers = Record<string, string | string[] | number | null>;
type Fetcher = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;
export type AssessmentScoringTransport = { baseUrl: string; credential: string; requestId: string; timeoutMs: number; fetcher?: Fetcher };
export class AssessmentScoringRequestError extends Error {
  constructor(readonly kind: "rejected" | "uncertain" | "blocked", readonly code: string, readonly issues: z.infer<typeof issue>[] = []) {
    super(`Assessment scoring request ${kind}: ${code}`);
  }
}
const invalid = () => new AssessmentScoringRequestError("uncertain", "INVALID_RESPONSE");
function sameEvidence(actual: AssessmentScoringBinding, expected: AssessmentScoringBinding) {
  return (["assessmentReference", "bindingId", "ruleVersionId", "checksum", "version"] as const).every(k => actual[k] === expected[k]);
}
const blockedCodes = new Set(["UNAUTHORIZED", "PLATFORM_DISABLED", "CLIENT_DISABLED", "DEPLOYMENT_DISABLED", "CLIENT_NOT_ALLOWED", "CAPABILITY_DISABLED", "VERSION_UNAVAILABLE", "ASSESSMENT_NOT_FOUND", "MONTHLY_LIMIT_REACHED"]);
async function post(input: AssessmentScoringTransport, action: "start" | "calculate" | "classify-reviewed", body: unknown) {
  try {
    const response = await (input.fetcher ?? fetch)(new URL(`/v1/assessments/${action}`, input.baseUrl), {
      method: "POST", redirect: "error", headers: { authorization: `Bearer ${input.credential}`, "content-type": "application/json", "x-request-id": input.requestId },
      body: JSON.stringify(body), signal: AbortSignal.timeout(input.timeoutMs),
    });
    return { response, body: await response.json() as unknown };
  } catch { throw new AssessmentScoringRequestError("uncertain", "TRANSPORT_OR_RESPONSE_FAILURE"); }
}
function upstreamFailure(status: number, body: unknown): never {
  const parsed = z.object({ error: z.string(), reason: z.string().optional() }).safeParse(body);
  const code = parsed.success ? (parsed.data.error === "SCORING_UNAVAILABLE" ? parsed.data.reason : parsed.data.error) : undefined;
  if ([401, 403, 404, 409].includes(status) && code && blockedCodes.has(code)) throw new AssessmentScoringRequestError("blocked", code);
  throw new AssessmentScoringRequestError("uncertain", code === "REQUEST_IN_PROGRESS" || code === "IDEMPOTENCY_CONFLICT" ? code : "UPSTREAM_FAILURE");
}
export async function requestAssessmentScoringStart(input: AssessmentScoringTransport & { assessmentReference: string; expectedBinding?: AssessmentScoringBinding }): Promise<AssessmentScoringStart> {
  const reply = await post(input, "start", { assessmentReference: input.assessmentReference });
  if (!reply.response.ok) upstreamFailure(reply.response.status, reply.body);
  const parsed = assessmentScoringStartSchema.safeParse(reply.body);
  if (!parsed.success || parsed.data.assessmentReference !== input.assessmentReference || input.expectedBinding && !sameEvidence(parsed.data, input.expectedBinding)) throw invalid();
  return parsed.data;
}
export async function requestAssessmentScoringCalculate(input: AssessmentScoringTransport & { binding: AssessmentScoringStart; idempotencyKey: string; answers: AssessmentScoringAnswers; faceScanSessionId?: string }): Promise<AssessmentScoringCalculation> {
  const allowed = new Set([
    ...input.binding.questionnaire.sections.flatMap(s => s.fields.filter(f => f.type !== "calculated" && f.type !== "derived").map(f => f.id)),
    ...input.binding.questionnaire.supportingInputs.map(f => f.id),
  ]);
  const answers = z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number().finite(), z.null()])).safeParse(input.answers);
  // Validate before JSON serialization: NaN/Infinity otherwise become null silently.
  if (!answers.success || Object.keys(input.answers).some(key => !allowed.has(key)))
    throw new AssessmentScoringRequestError("rejected", "INVALID_LOCAL_ANSWERS");
  const reply = await post(input, "calculate", { assessmentReference: input.binding.assessmentReference, idempotencyKey: input.idempotencyKey, answers: answers.data, ...(input.faceScanSessionId ? { faceScanSessionId: input.faceScanSessionId } : {}) });
  if (!reply.response.ok) {
    if (reply.response.status === 422 && z.object({ error: z.literal("FACE_SCAN_UNAVAILABLE") }).safeParse(reply.body).success)
      throw new AssessmentScoringRequestError("rejected", "FACE_SCAN_UNAVAILABLE", [{ path: "face_scan", code: "FACE_SCAN_UNAVAILABLE", message: "The reviewed face scan is unavailable for scoring." }]);
    const rejection = z.object({ error: z.enum(["INVALID_ASSESSMENT_ANSWERS", "ASSESSMENT_INCOMPLETE"]), result: evaluationSchema }).strict().safeParse(reply.body);
    if (rejection.success && sameEvidence(rejection.data.result, input.binding) &&
      (reply.response.status === 400 && rejection.data.error === "INVALID_ASSESSMENT_ANSWERS" && rejection.data.result.issues.length > 0 || reply.response.status === 422 && rejection.data.error === "ASSESSMENT_INCOMPLETE" && !rejection.data.result.complete)) {
      throw new AssessmentScoringRequestError("rejected", rejection.data.error, rejection.data.result.issues);
    }
    upstreamFailure(reply.response.status, reply.body);
  }
  const parsed = assessmentScoringCalculationSchema.safeParse(reply.body);
  if (!parsed.success) throw invalid();
  const { result } = parsed.data;
  if (!sameEvidence(result, input.binding) || parsed.data.idempotencyKey !== input.idempotencyKey || !result.complete || result.issues.length) throw invalid();
  const expected = input.binding.questionnaire.sections.flatMap(s => s.fields.map(f => ({ id: f.id, sectionId: s.id })));
  if (result.components.length !== expected.length || new Set(result.components.map(c => c.id)).size !== expected.length || result.components.some(c => !expected.some(f => f.id === c.id && f.sectionId === c.sectionId) || (c.status === "answered") !== (c.points !== null))) throw invalid();
  const coverage = result.answerCoverage;
  const count = (status: string) => result.components.filter(c => c.status === status).length;
  if (coverage.totalEntries !== expected.length || coverage.answeredEntries !== count("answered") || coverage.unansweredEntries !== count("unanswered") || coverage.pendingEntries !== count("pending") || coverage.allUnanswered !== (count("answered") === 0)) throw invalid();
  if (input.faceScanSessionId ? result.faceScan?.sessionId !== input.faceScanSessionId : result.faceScan != null) throw invalid();
  const questionnaireScore = result.questionnaireScore ?? (result.faceScan ? null : result.score);
  const questionnairePoints = result.components.reduce((total, c) => total + (c.points ?? 0), 0);
  if (questionnaireScore === null ? coverage.answeredEntries !== 0 : coverage.answeredEntries === 0 || Math.abs(questionnaireScore - questionnairePoints) > Number.EPSILON * Math.max(1, questionnaireScore, questionnairePoints) * expected.length) throw invalid();
  if (result.score === null) {
    if (result.classification !== null || !coverage.allUnanswered || coverage.pendingEntries !== 0 || result.faceScan) throw invalid();
    return parsed.data;
  }
  if (result.classification === null || coverage.answeredEntries === 0 && !result.faceScan) throw invalid();
  const sum = questionnairePoints + (result.faceScan?.points ?? 0);
  if (!Number.isFinite(sum) || Math.abs(sum - result.score) > Number.EPSILON * Math.max(1, sum, result.score) * (expected.length + 1)) throw invalid();
  return parsed.data;
}

const reviewedClassificationSchema = z.object({
  result: evidenceSchema.extend({resultReference:id,score:z.number().finite().nonnegative(),classification:z.object({id,label:z.string(),interpretation:z.string()}).strict(),calculatedAt:z.iso.datetime()}).strict(),
  idempotencyKey:id,
}).strict();
export type ReviewedClassification = z.infer<typeof reviewedClassificationSchema>["result"];
export async function requestReviewedClassification(input:AssessmentScoringTransport & {binding:AssessmentScoringBinding;idempotencyKey:string;score:number}):Promise<ReviewedClassification>{
 if(!Number.isFinite(input.score)||input.score<0||input.score>Number.MAX_SAFE_INTEGER)throw new AssessmentScoringRequestError("rejected","INVALID_REVIEWED_SCORE");
 const reply=await post(input,"classify-reviewed",{assessmentReference:input.binding.assessmentReference,idempotencyKey:input.idempotencyKey,score:input.score});
 if(!reply.response.ok){
  if(reply.response.status===422 && z.object({error:z.literal("UNMATCHED_CLASSIFICATION")}).safeParse(reply.body).success)throw new AssessmentScoringRequestError("rejected","UNMATCHED_CLASSIFICATION");
  upstreamFailure(reply.response.status,reply.body);
 }
 const parsed=reviewedClassificationSchema.safeParse(reply.body);
 if(!parsed.success||parsed.data.idempotencyKey!==input.idempotencyKey||!sameEvidence(parsed.data.result,input.binding)||parsed.data.result.score!==input.score)throw invalid();
 return parsed.data.result;
}
