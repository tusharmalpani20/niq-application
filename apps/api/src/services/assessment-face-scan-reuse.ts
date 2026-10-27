import { scoringServiceUrl } from "./scoring-service-url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { formatAssessmentReference } from "../../../../packages/contracts/src/assessment-workflow";
import { faceScanSessionSchema, hasUsableFaceScan, reuseFaceScanSchema, type FaceScanSession } from "../../../../packages/contracts/src/face-scan";
import { assessmentFaceScans } from "../db/schema";
import { appendAssessmentHistory } from "./clinical-review-state";
import { ServiceError, type Principal, type RequestContext } from "./application";
import type { AssessmentFaceScanService } from "./assessment-face-scan";
import type { StoredWorkflow, WorkflowRow } from "./assessment-workflow";

type Input = z.infer<typeof reuseFaceScanSchema>;
const remoteEnvelope = z.object({
  session: faceScanSessionSchema.extend({ assessmentReference: z.string(), organizationReference: z.string() }),
  providerConfigured: z.boolean(),
});

export function assertHistoricalScanSource(target: Pick<WorkflowRow, "id" | "patientId">, source: Pick<WorkflowRow, "id" | "patientId" | "status">, session: FaceScanSession) {
  if (target.id === source.id || target.patientId !== source.patientId)
    throw new ServiceError("VALIDATION_ERROR", "Historical measurements must come from another assessment for the same patient.");
  if (source.status !== "COMPLETED" || !hasUsableFaceScan(session) || !session.completedAt || session.historicalSource)
    throw new ServiceError("VALIDATION_ERROR", "Choose an original completed measurement from an approved assessment.");
}

export function verifyHistoricalScanResponse(value: unknown, expected: {
  organizationId: string; assessmentId: string; sourceAssessmentId: string; sourceRemoteId: string;
  source: FaceScanSession; ruleVersionId: string;
}) {
  const parsed = remoteEnvelope.safeParse(value);
  if (!parsed.success) throw new ServiceError("SCORING_UNAVAILABLE", "The historical measurement response was invalid.");
  const remote = parsed.data.session;
  const historical = remote.historicalSource;
  if (remote.organizationReference !== expected.organizationId || remote.assessmentReference !== expected.assessmentId ||
      !hasUsableFaceScan(remote) || remote.score?.ruleVersionId !== expected.ruleVersionId ||
      !historical || historical.sessionId !== expected.sourceRemoteId || historical.assessmentReference !== expected.sourceAssessmentId ||
      historical.capturedAt !== expected.source.completedAt || remote.completedAt !== expected.source.completedAt ||
      !isDeepStrictEqual(remote.context, expected.source.context) || !isDeepStrictEqual(remote.result, expected.source.result))
    throw new ServiceError("SCORING_UNAVAILABLE", "Scoring did not confirm the original measurement and its new rule mapping.");
  return remote;
}

/** Historical evidence is explicit and never creates a capture, consent, or provider usage event. */
export class AssessmentFaceScanReuseService {
  constructor(private readonly scans: AssessmentFaceScanService, private readonly fetcher: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response> = fetch) {}

  async reuse(actor: Principal, organizationId: string, assessmentId: string, input: Input, context: RequestContext) {
    const workflow = this.scans.workflow;
    workflow.clinicalActor(actor, organizationId, "scans.perform");
    return workflow.db.transaction(async tx => {
      const target = await workflow.authorize(actor, organizationId, assessmentId, tx, true);
      const source = await workflow.authorize(actor, organizationId, input.sourceAssessmentId, tx);
      const sourceRow = await this.scans.row(organizationId, source.id, input.sourceSessionId, tx);
      const sourceSession = this.scans.dto(sourceRow);
      assertHistoricalScanSource(target, source, sourceSession);
      if (!sourceRow.remoteId) throw new ServiceError("VALIDATION_ERROR", "The source has no verified scoring measurement.");
      const [replay] = await tx.select().from(assessmentFaceScans).where(and(
        eq(assessmentFaceScans.organizationId, organizationId), eq(assessmentFaceScans.requestKey, input.requestKey),
      ));
      if (replay) {
        const previous = this.scans.dto(replay);
        if (replay.assessmentId !== assessmentId || replay.revision !== input.revision || previous.historicalSource?.sessionId !== sourceRow.remoteId)
          throw new ServiceError("CONFLICT", "This reuse request belongs to a different saved assessment.");
        return previous;
      }
      workflow.editable(target, input.revision, actor);
      const [current] = await tx.select().from(assessmentFaceScans).where(and(
        eq(assessmentFaceScans.organizationId, organizationId), eq(assessmentFaceScans.assessmentId, assessmentId),
        eq(assessmentFaceScans.isCurrent, true),
      ));
      if (current) throw new ServiceError("CONFLICT", "This assessment already has a selected Vital IQ measurement.");
      const state = workflow.unseal<StoredWorkflow>(target.workflow);
      const sourceConnection = sourceRow.connection as Parameters<AssessmentFaceScanService["transport"]>[1];
      const transport = await this.scans.transport(organizationId, sourceConnection, tx);
      if (!isDeepStrictEqual(state.connection, sourceRow.connection))
        throw new ServiceError("CONFLICT", "Both assessments must use the same scoring connection.");
      const response = await this.fetcher(scoringServiceUrl(workflow.config.SCORING_API_URL!, `/v1/face-scans/${encodeURIComponent(sourceRow.remoteId)}/reuse`), {
        method: "POST", redirect: "error",
        headers: { authorization: `Bearer ${transport.credential}`, "content-type": "application/json", "x-request-id": context.requestId },
        body: JSON.stringify({ organizationReference: organizationId, sourceAssessmentReference: source.id, assessmentReference: assessmentId }),
        signal: AbortSignal.timeout(workflow.config.SCORING_TIMEOUT_MS),
      });
      if (!response.ok) throw new ServiceError("SCORING_UNAVAILABLE", "The historical measurement could not be mapped to this assessment. Retry the same request.");
      const { readBoundedJson } = await import("../http/bounded-json");
      const remote = verifyHistoricalScanResponse(await readBoundedJson(response, 128 * 1024), {
        organizationId, assessmentId, sourceAssessmentId: source.id, sourceRemoteId: sourceRow.remoteId,
        source: sourceSession, ruleVersionId: state.binding.ruleVersionId,
      });
      const id = createEntityId();
      const projection: FaceScanSession = { ...remote, id, historicalSource: { ...remote.historicalSource!, assessmentReference: formatAssessmentReference(source.serialNumber) } };
      const [saved] = await tx.insert(assessmentFaceScans).values({
        id, organizationId, assessmentId, revision: target.revision, cycle: target.cycle,
        requestKey: input.requestKey, connection: sourceRow.connection, snapshot: sourceRow.snapshot,
        remoteId: remote.id, state: "COMPLETED", isCurrent: true, active: false,
        // This links the original consent evidence; it does not assert a new consent or capture.
        consentId: sourceRow.consentId, projection: workflow.seal(projection),
      }).returning();
      const provenance = { sessionId: id, sourceAssessmentId: source.id, sourceSessionId: sourceRow.id,
        sourceRemoteSessionId: sourceRow.remoteId, originalCapturedAt: sourceSession.completedAt, ruleVersionId: state.binding.ruleVersionId };
      await appendAssessmentHistory(workflow, tx, target, actor, "FACE_SCAN_HISTORICAL_REUSED", provenance, input.requestKey);
      await workflow.audit(tx, actor, context, assessmentId, "FACE_SCAN_HISTORICAL_REUSED", provenance);
      return this.scans.dto(saved!);
    });
  }
}
