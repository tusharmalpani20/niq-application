import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import type { AssessmentPatient } from "../../../../packages/contracts/src/assessment-workflow";
import { and, desc, eq, sql } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { faceScanContextSchema, faceScanSessionSchema, type FaceScanContext, type FaceScanSession, type FaceScanSignal } from "../../../../packages/contracts/src/face-scan";
import { assessmentFaceScans, assessments, scoringConnections } from "../db/schema";
import { decryptCredential } from "../security/credential-encryption";
import { ServiceError, type Principal, type RequestContext } from "./application";
import { AssessmentWorkflowService, type StoredWorkflow, type WorkflowExecutor } from "./assessment-workflow";
import { appendAssessmentHistory } from "./clinical-review-state";
const recoverableAssessmentStatuses: Array<typeof assessments.$inferSelect.status> = ["DRAFT", "SCORED", "SCORING_PENDING", "SCORING_UNAVAILABLE"];
type Row = typeof assessmentFaceScans.$inferSelect;
type Identity = {
  origin: string;
  deploymentId: string;
  scoringOrganizationId: string;
};
const sameFields = <T extends object>(left: T, right: T, keys: readonly (keyof T)[]) => keys.every(key => left[key] === right[key]);
const contextKeys = ["dob", "gender", "heightCm", "weightKg", "posture", "employeeId"] as const;
const definiteCreateRejections = new Set(["FACE_SCAN_DISABLED", "UNAUTHORIZED", "CLIENT_NOT_ALLOWED", "CAPABILITY_DISABLED", "MONTHLY_LIMIT_REACHED", "INVALID_REQUEST"]);
class FaceScanRejection extends ServiceError {
  constructor(readonly rejectionCode: string) {
    super("SCORING_UNAVAILABLE", "Scoring did not accept this scan. Review availability and saved inputs before starting again.");
  }
}
const terminal = new Set(["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"]);
// Failure/expiry can precede a delayed authenticated result; completed evidence stays immutable.
const needsScoreRepair = (row: Row) => row.state === "COMPLETED" && row.failureCode === "SCORE_MAPPING_UNAVAILABLE";
const recoverable = (row: Row) => row.active || Boolean(row.remoteId && (!["COMPLETED", "CANCELLED"].includes(row.state) || needsScoreRepair(row)));
const recoveryCondition = sql `(${assessmentFaceScans.active}=true or (${assessmentFaceScans.remoteId} is not null and (${assessmentFaceScans.state} not in ('COMPLETED','CANCELLED') or (${assessmentFaceScans.state}='COMPLETED' and ${assessmentFaceScans.failureCode}='SCORE_MAPPING_UNAVAILABLE'))))`;
const remoteSchema = z.object({
  session: faceScanSessionSchema.extend({
    assessmentReference: z.string(),
    organizationReference: z.string()
  }),
  providerConfigured: z.boolean()
});
export function frozenFaceScanContext(patient: {
  dateOfBirth: string | null;
  gender: string;
}, answers: Record<string, unknown>, employeeId: string, posture: FaceScanContext["posture"] = "resting"): FaceScanContext {
  const value = faceScanContextSchema.safeParse({
    dob: patient.dateOfBirth,
    gender: patient.gender === "MALE" ? "male" : patient.gender === "FEMALE" ? "female" : null,
    heightCm: answers.height_cm,
    weightKg: answers.current_weight_kg,
    employeeId,
    posture
  });
  if (!value.success)
    throw new ServiceError("VALIDATION_ERROR", "Face scan requires a saved date of birth, supported gender, height and current weight.");
  return value.data;
}
export class AssessmentFaceScanService {
  constructor(readonly workflow: AssessmentWorkflowService, private fetcher: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response> = fetch) {
  }
  get db() {
    return this.workflow.db;
  }
  async transport(org: string, pinned?: Identity, executor: WorkflowExecutor = this.db) {
    const config = this.workflow.config;
    const [connection] = await executor.select().from(scoringConnections).where(eq(scoringConnections.organizationId, org));
    if (!connection || !config.SCORING_API_URL || !config.SCORING_CREDENTIAL_ENCRYPTION_KEY)
      throw new ServiceError("SCORING_NOT_CONFIGURED", "Connect NIQ Scoring before scanning.");
    const identity = {
      origin: new URL(config.SCORING_API_URL).origin,
      deploymentId: connection.deploymentId,
      scoringOrganizationId: connection.scoringOrganizationId
    };
    if (pinned && !sameFields(identity, pinned, ["origin", "deploymentId", "scoringOrganizationId"]))
      throw new ServiceError("CONFLICT", "Restore the original scoring connection to recover this scan.");
    return {
      identity,
      credential: decryptCredential(connection.encryptedCredential, connection.credentialIv, config.SCORING_CREDENTIAL_ENCRYPTION_KEY)
    };
  }
  dto(row: Row): FaceScanSession {
    if (row.projection)
      return {
        ...this.workflow.unseal<FaceScanSession>(row.projection),
        id: row.id,
        failureCode: row.failureCode ?? this.workflow.unseal<FaceScanSession>(row.projection).failureCode
      };
    return {
      id: row.id,
      state: terminal.has(row.state) ? row.state as FaceScanSession["state"] : "RECONCILIATION_REQUIRED",
      context: this.workflow.unseal(row.snapshot),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: null,
      failureCode: row.failureCode,
      result: null,
      score: null
    };
  }
  async row(org: string, assessment: string, id: string, executor: WorkflowExecutor = this.db) {
    const [row] = await executor.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.assessmentId, assessment), eq(assessmentFaceScans.id, id)));
    if (!row)
      throw new ServiceError("NOT_FOUND", "Scan not found.");
    return row;
  }
  async list(actor: Principal, org: string, assessment: string) {
    const assessmentRow=await this.workflow.authorize(actor, org, assessment);
    const rows = await this.db.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.assessmentId, assessment))).orderBy(desc(assessmentFaceScans.createdAt), desc(assessmentFaceScans.id));
    const enabled = this.workflow.config.FACE_SCAN_ENABLED;
    return {
      enabled,
      ...(!enabled ? {
        reason: "Face scan is not enabled for this deployment."
      } : {}),
      sessions: rows.map(row => this.dto(row)),
      currentSessionId: rows.find(row => row.isCurrent && row.cycle===assessmentRow.cycle)?.id ?? null
    };
  }
  async start(actor: Principal, org: string, assessment: string, input: {
    revision: number;
    requestKey: string;
    posture: FaceScanContext["posture"];
  }, context: RequestContext) {
    this.workflow.clinicalActor(actor, org, "scans.perform");
    const saved = await this.db.transaction(async (tx) => {
      const assessmentRow = await this.workflow.authorize(actor, org, assessment, tx, true);
      const [replay] = await tx.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.requestKey, input.requestKey)));
      if (replay) {
        if (replay.assessmentId !== assessment || replay.revision !== input.revision)
          throw new ServiceError("CONFLICT", "This scan request belongs to another saved draft.");
        return replay;
      }
      this.workflow.editable(assessmentRow, input.revision, actor);
      const [existing] = await tx.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.assessmentId, assessment), eq(assessmentFaceScans.active, true)));
      if (existing)
        throw new ServiceError("CONFLICT", "A face scan attempt already exists. Restore it before starting another.", { currentSessionId: existing.id });
      if (!this.workflow.config.FACE_SCAN_ENABLED)
        throw new ServiceError("SCORING_UNAVAILABLE", "Face scan is not enabled.");
      const connection = await this.transport(org, undefined, tx);
      const patient = await this.workflow.applicationService.getPatient(actor, org, assessmentRow.patientId) as AssessmentPatient;
      const state = this.workflow.unseal<StoredWorkflow>(assessmentRow.workflow);
      const employeeId = this.workflow.config.FACE_SCAN_EMPLOYEE_ID_OVERRIDE ?? `${connection.identity.deploymentId}:${actor.membershipId}`;
      const snapshot = frozenFaceScanContext(patient, state.answers, employeeId, input.posture);
      const id = createEntityId();
      // Selection changes only for an explicit new attempt, never for delayed evidence.
      await tx.update(assessmentFaceScans).set({ isCurrent: false }).where(and(
        eq(assessmentFaceScans.organizationId, org),
        eq(assessmentFaceScans.assessmentId, assessment),
        eq(assessmentFaceScans.isCurrent, true),
      ));
      const [row] = await tx.insert(assessmentFaceScans).values({
        id,
        organizationId: org,
        assessmentId: assessment,
        revision: assessmentRow.revision,
        cycle: assessmentRow.cycle,
        isCurrent: true,
        requestKey: input.requestKey,
        remoteRequestKey: `face-scan:${org}:${id}`,
        connection: connection.identity,
        snapshot: this.workflow.seal(snapshot)
      }).returning();
      await appendAssessmentHistory(this.workflow,tx,assessmentRow,actor,"FACE_SCAN_REQUESTED",{sessionId:id,context:snapshot});
      await this.workflow.audit(tx, actor, context, assessment, "FACE_SCAN_REQUESTED", {
        sessionId: id
      });
      return row!;
    });
    await this.reconcile(saved);
    return this.dto(await this.row(org, assessment, saved.id));
  }
  async get(actor: Principal, org: string, assessment: string, id: string) {
    await this.workflow.authorize(actor, org, assessment);
    const row = await this.row(org, assessment, id);
    if (recoverable(row))
      await this.reconcile(row);
    return this.dto(await this.row(org, assessment, id));
  }
  private async request(row: Row, action: "create" | "status" | "signal" | "cancel", body?: unknown, executor: WorkflowExecutor = this.db) {
    const transport = await this.transport(row.organizationId, row.connection as Identity, executor);
    const url = new URL(action === "create" ? "/v1/face-scans" : `/v1/face-scans/${encodeURIComponent(row.remoteId!)}${action === "status" ? "" : `/${action}`}`, transport.identity.origin);
    url.searchParams.set("organizationReference", row.organizationId);
    const payload = action === "create" ? {
      schemaVersion: 1,
      clientId: transport.identity.scoringOrganizationId,
      organizationReference: row.organizationId,
      assessmentReference: row.assessmentId,
      idempotencyKey: row.remoteRequestKey ?? row.requestKey,
      context: this.workflow.unseal(row.snapshot)
    } : body;
    const response = await this.fetcher(url, {
      method: action === "status" ? "GET" : "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${transport.credential}`,
        "content-type": "application/json"
      },
      body: action === "status" ? undefined : JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(this.workflow.config.SCORING_TIMEOUT_MS)
    });
    if (!response.ok) {
      const failure = z.object({
        error: z.string()
      }).safeParse(JSON.parse(await boundedResponse(response, 16 * 1024)));
      if (action === "create" && failure.success && definiteCreateRejections.has(failure.data.error) && [400, 401, 403, 409, 503].includes(response.status))
        throw new FaceScanRejection(failure.data.error);
      throw new ServiceError("SCORING_UNAVAILABLE", "Scan status could not be confirmed. Recovery will continue.");
    }
    // Bound upstream responses too; neither raw signals nor upstream errors are persisted.
    const text = await boundedResponse(response, 128 * 1024);
    const parsed = remoteSchema.parse(JSON.parse(text));
    const remote = parsed.session;
    if (remote.state === "COMPLETED" && (!remote.result || !remote.completedAt))
      throw new ServiceError("CONFLICT", "Scoring returned incomplete completion evidence.");
    if (remote.organizationReference !== row.organizationId || remote.assessmentReference !== row.assessmentId || row.remoteId && remote.id !== row.remoteId || !sameFields(remote.context, this.workflow.unseal<FaceScanContext>(row.snapshot), contextKeys))
      throw new ServiceError("CONFLICT", "Scoring returned a different scan identity.");
    return remote;
  }
  private async project(row: Row, remote: FaceScanSession, token?: string, executor?: WorkflowExecutor) {
    const save = async (tx: WorkflowExecutor) => {
      // Match workflow lock order: assessment before evidence. Closed cycles stay frozen.
      const [assessment] = await tx.select().from(assessments).where(eq(assessments.id, row.assessmentId)).for("update");
      if (!canProjectScan(assessment, row)) return;
      const [current] = await tx.select().from(assessmentFaceScans).where(eq(assessmentFaceScans.id, row.id)).for("update");
      if (!current || token && current.leaseToken !== token || current.state === "CANCELLED" || !current.remoteId && current.state === "FAILED")
        return;
      if (current.projection && new Date(remote.updatedAt).getTime() < new Date(this.workflow.unseal<FaceScanSession>(current.projection).updatedAt).getTime())
        return;
      if (current.state === "COMPLETED") {
        if (!needsScoreRepair(current) || !current.projection) return;
        const prior = this.workflow.unseal<FaceScanSession>(current.projection);
        // Scoring alone retries the pinned optional mapping. A repair cannot replace provider evidence.
        if (prior.score !== null || remote.state !== "COMPLETED" || remote.completedAt !== prior.completedAt ||
            remote.createdAt !== prior.createdAt || !isDeepStrictEqual(remote.result, prior.result) ||
            !isDeepStrictEqual(remote.context, prior.context))
          throw new ServiceError("CONFLICT", "Scoring returned changed completion evidence during score recovery.");
        const repaired = remote.score !== null && remote.failureCode === null;
        if (repaired && (!["SCORED", "UNAVAILABLE"].includes(remote.score!.status) || typeof remote.score!.ruleVersionId !== "string"))
          throw new ServiceError("CONFLICT", "Scoring returned incomplete mapping evidence.");
        if (repaired) await appendAssessmentHistory(this.workflow,tx,assessment!,null,"FACE_SCAN_MAPPING_RECOVERED",{sessionId:row.id,before:prior,after:remote});
        await tx.update(assessmentFaceScans).set({
          ...(repaired ? {
            projection: this.workflow.seal({...prior, score: remote.score, failureCode: null, updatedAt: remote.updatedAt}),
            failureCode: null,
          } : {}),
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: repaired ? null : new Date(Date.now() + 300000),
          updatedAt: new Date(),
        }).where(eq(assessmentFaceScans.id, current.id));
        return;
      }
      const before=current.projection?this.workflow.unseal(current.projection):null;
      if(!isDeepStrictEqual(before,remote)) await appendAssessmentHistory(this.workflow,tx,assessment!,null,"FACE_SCAN_PROJECTED",{sessionId:row.id,before,after:remote});
      // Never update assessment answers, measurements or frozen questionnaire submissions.
      await tx.update(assessmentFaceScans).set({
        remoteId: remote.id,
        state: remote.state,
        active: current.active && !terminal.has(remote.state),
        projection: this.workflow.seal(remote),
        failureCode: remote.failureCode,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + (terminal.has(remote.state) ? 300000 : 30000)),
        updatedAt: new Date()
      }).where(eq(assessmentFaceScans.id, row.id));
    };
    if (executor)
      await save(executor);
    else
      await this.db.transaction(save);
  }
  async reconcile(row: Row) {
    if (!recoverable(row))
      return;
    const token = crypto.randomUUID(), now = new Date();
    const claimed = await this.db.transaction(async tx => {
      const [assessment] = await tx.select().from(assessments).where(eq(assessments.id,row.assessmentId)).for("update");
      if (!canProjectScan(assessment,row)) return undefined;
      const [claimed] = await tx.update(assessmentFaceScans).set({
      reconciliationAttempts: sql`${assessmentFaceScans.reconciliationAttempts}+1`,
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + 90000)
    }).where(and(eq(assessmentFaceScans.id, row.id), recoveryCondition, sql `(${assessmentFaceScans.leaseExpiresAt} is null or ${assessmentFaceScans.leaseExpiresAt}<${now.toISOString()})`)).returning();
      return claimed;
    });
    if (!claimed)
      return;
    try {
      await this.project(claimed, await this.request(claimed, claimed.remoteId ? "status" : "create"), token);
    }
    catch (error) {
      // A rejection can release the active slot only when no earlier create outcome was uncertain.
      // After response loss or a crashed lease, even revoked credentials cannot prove no remote work exists.
      const rejected = error instanceof FaceScanRejection && !claimed.remoteId && claimed.reconciliationAttempts === 1;
      await this.db.transaction(async tx => {
        const [assessment] = await tx.select().from(assessments).where(eq(assessments.id,row.assessmentId)).for("update");
        if (!canProjectScan(assessment,row)) return;
        await tx.update(assessmentFaceScans).set({
        ...(rejected ? {
          state: "FAILED",
          active: false
        } : {}),
        failureCode: rejected ? error.rejectionCode : needsScoreRepair(claimed) ? "SCORE_MAPPING_UNAVAILABLE" : "RECONCILIATION_REQUIRED",
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: rejected ? null : new Date(Date.now() + 60000),
        updatedAt: new Date()
      }).where(and(eq(assessmentFaceScans.id, row.id), eq(assessmentFaceScans.leaseToken, token)));
      });
    }
  }
  async mutate(actor: Principal, org: string, assessment: string, id: string, action: "signal" | "cancel", signal?: FaceScanSignal) {
    this.workflow.clinicalActor(actor, org, "scans.perform");
    // Reserve a lease under the assessment lock; provider I/O never holds database locks.
    const token=crypto.randomUUID();
    const row=await this.db.transaction(async tx => {
      const assessmentRow=await this.workflow.authorize(actor,org,assessment,tx,true);
      this.workflow.editable(assessmentRow,assessmentRow.revision,actor);
      const row=await this.row(org,assessment,id,tx);
      if(["COMPLETED","CANCELLED"].includes(row.state)) throw new ServiceError("CONFLICT","This scan is already finished.");
      if(row.cycle!==assessmentRow.cycle) throw new ServiceError("CONFLICT","This scan belongs to an earlier assessment cycle.");
      if(action==="signal"&&!this.workflow.config.FACE_SCAN_ENABLED) throw new ServiceError("SCORING_UNAVAILABLE","New scan uploads are disabled.");
      if(!row.remoteId) throw new ServiceError("CONFLICT","Scan setup is still being recovered.");
      if(row.leaseExpiresAt && row.leaseExpiresAt.getTime()>Date.now()) throw new ServiceError("CONFLICT","This scan is still processing. Try again shortly.");
      await tx.update(assessmentFaceScans).set({leaseToken:token,leaseExpiresAt:new Date(Date.now()+90000)}).where(eq(assessmentFaceScans.id,row.id));
      return row;
    });
    try {
      const remote=await this.request(row,action,signal);
      await this.db.transaction(async tx => {
        const assessmentRow=await this.workflow.authorize(actor,org,assessment,tx,true);
        this.workflow.editable(assessmentRow,assessmentRow.revision,actor);
        await this.project(row,remote,token,tx);
      });
    } catch(error) {
      // Outcome may be uncertain. Recovery resolves it before workflow freezing is allowed.
      await this.db.transaction(async tx => {
        const [assessmentRow]=await tx.select().from(assessments).where(eq(assessments.id,assessment)).for("update");
        if(!canProjectScan(assessmentRow,row)) return;
        await tx.update(assessmentFaceScans).set({leaseToken:null,leaseExpiresAt:null,failureCode:"RECONCILIATION_REQUIRED",nextAttemptAt:new Date(Date.now()+60000)}).where(and(eq(assessmentFaceScans.id,row.id),eq(assessmentFaceScans.leaseToken,token)));
      });
      throw error;
    }
    return this.dto(await this.row(org, assessment, id));
  }
  async recoverPending() {
    const rows = await this.db.select().from(assessmentFaceScans).where(and(sql`exists (select 1 from assessments a where a.id=${assessmentFaceScans.assessmentId} and a.cycle=${assessmentFaceScans.cycle} and a.status in (${sql.join(recoverableAssessmentStatuses.map(status => sql`${status}`), sql`, `)}))`, recoveryCondition, sql`(${assessmentFaceScans.leaseExpiresAt} is null or ${assessmentFaceScans.leaseExpiresAt}<now())`, sql `(${assessmentFaceScans.nextAttemptAt} is null or ${assessmentFaceScans.nextAttemptAt}<=now())`)).orderBy(assessmentFaceScans.updatedAt).limit(10);
    for (const row of rows)
      await this.reconcile(row);
  }
}
async function boundedResponse(response: Response, max: number) {
  if (!response.body)
    throw new Error("Missing response");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done)
        break;
      size += part.value.byteLength;
      if (size > max)
        throw new Error("Oversized response");
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  finally {
    await reader.cancel();
  }
}

/** A delayed provider result cannot rewrite a submitted review or an earlier correction cycle. */
export function canProjectScan(assessment: {status: string; cycle: number} | undefined, scan: {cycle: number}): boolean {
  return Boolean(assessment && assessment.cycle === scan.cycle && recoverableAssessmentStatuses.some(status => status === assessment.status));
}
