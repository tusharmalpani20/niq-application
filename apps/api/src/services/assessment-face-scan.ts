import { z } from "zod";
import type { AssessmentPatient } from "../../../../packages/contracts/src/assessment-workflow";
import { and, desc, eq, sql } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import { faceScanContextSchema, faceScanSessionSchema, type FaceScanContext, type FaceScanSession, type FaceScanSignal } from "../../../../packages/contracts/src/face-scan";
import { assessmentFaceScans, scoringConnections } from "../db/schema";
import { decryptCredential } from "../security/credential-encryption";
import { ServiceError, type Principal, type RequestContext } from "./application";
import { AssessmentWorkflowService, type StoredWorkflow, type WorkflowExecutor } from "./assessment-workflow";
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
const recoverable = (row: Row) => row.active || Boolean(row.remoteId && ["FAILED", "EXPIRED"].includes(row.state));
const recoveryCondition = sql `(${assessmentFaceScans.active}=true or (${assessmentFaceScans.remoteId} is not null and ${assessmentFaceScans.state} in ('FAILED','EXPIRED')))`;
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
}, answers: Record<string, unknown>, employeeId: string): FaceScanContext {
  const value = faceScanContextSchema.safeParse({
    dob: patient.dateOfBirth,
    gender: patient.gender === "MALE" ? "male" : patient.gender === "FEMALE" ? "female" : null,
    heightCm: answers.height_cm,
    weightKg: answers.current_weight_kg,
    employeeId,
    posture: "resting"
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
    await this.workflow.authorize(actor, org, assessment);
    const rows = await this.db.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.assessmentId, assessment))).orderBy(desc(assessmentFaceScans.createdAt), desc(assessmentFaceScans.id));
    const enabled = this.workflow.config.FACE_SCAN_ENABLED;
    return {
      enabled,
      ...(!enabled ? {
        reason: "Face scan is not enabled for this deployment."
      } : {}),
      sessions: rows.map(row => this.dto(row)),
      currentSessionId: rows[0]?.id ?? null
    };
  }
  async start(actor: Principal, org: string, assessment: string, input: {
    revision: number;
    requestKey: string;
    posture: "resting";
  }, context: RequestContext) {
    const saved = await this.db.transaction(async (tx) => {
      const assessmentRow = await this.workflow.authorize(actor, org, assessment, tx, true);
      const [replay] = await tx.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.requestKey, input.requestKey)));
      if (replay) {
        if (replay.assessmentId !== assessment || replay.revision !== input.revision)
          throw new ServiceError("CONFLICT", "This scan request belongs to another saved draft.");
        return replay;
      }
      this.workflow.editable(assessmentRow, input.revision);
      const [existing] = await tx.select().from(assessmentFaceScans).where(and(eq(assessmentFaceScans.organizationId, org), eq(assessmentFaceScans.assessmentId, assessment), eq(assessmentFaceScans.active, true)));
      if (existing)
        return existing;
      if (!this.workflow.config.FACE_SCAN_ENABLED)
        throw new ServiceError("SCORING_UNAVAILABLE", "Face scan is not enabled.");
      const connection = await this.transport(org, undefined, tx);
      const patient = await this.workflow.applicationService.getPatient(actor, org, assessmentRow.patientId) as AssessmentPatient;
      const state = this.workflow.unseal<StoredWorkflow>(assessmentRow.workflow);
      const snapshot = frozenFaceScanContext(patient, state.answers, `${connection.identity.deploymentId}:${actor.membershipId}`);
      const id = createEntityId();
      const [row] = await tx.insert(assessmentFaceScans).values({
        id,
        organizationId: org,
        assessmentId: assessment,
        revision: assessmentRow.revision,
        requestKey: input.requestKey,
        connection: connection.identity,
        snapshot: this.workflow.seal(snapshot)
      }).returning();
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
      idempotencyKey: row.requestKey,
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
    if (remote.organizationReference !== row.organizationId || remote.assessmentReference !== row.assessmentId || row.remoteId && remote.id !== row.remoteId || !sameFields(remote.context, this.workflow.unseal<FaceScanContext>(row.snapshot), contextKeys))
      throw new ServiceError("CONFLICT", "Scoring returned a different scan identity.");
    return remote;
  }
  private async project(row: Row, remote: FaceScanSession, token?: string, executor?: WorkflowExecutor) {
    const save = async (tx: WorkflowExecutor) => {
      const [current] = await tx.select().from(assessmentFaceScans).where(eq(assessmentFaceScans.id, row.id)).for("update");
      if (!current || token && current.leaseToken !== token || current.state === "COMPLETED" || current.state === "CANCELLED" || !current.remoteId && current.state === "FAILED")
        return;
      if (current.projection && new Date(remote.updatedAt).getTime() < new Date(this.workflow.unseal<FaceScanSession>(current.projection).updatedAt).getTime())
        return;
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
    const [claimed] = await this.db.update(assessmentFaceScans).set({
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + 90000)
    }).where(and(eq(assessmentFaceScans.id, row.id), recoveryCondition, sql `(${assessmentFaceScans.leaseExpiresAt} is null or ${assessmentFaceScans.leaseExpiresAt}<${now.toISOString()})`)).returning();
    if (!claimed)
      return;
    try {
      await this.project(claimed, await this.request(claimed, claimed.remoteId ? "status" : "create"), token);
    }
    catch (error) {
      // A rejection can release the active slot only when no earlier create outcome was uncertain.
      // After response loss or a crashed lease, even revoked credentials cannot prove no remote work exists.
      const rejected = error instanceof FaceScanRejection && !row.remoteId && !row.failureCode && !row.leaseToken;
      await this.db.update(assessmentFaceScans).set({
        ...(rejected ? {
          state: "FAILED",
          active: false
        } : {}),
        failureCode: rejected ? error.rejectionCode : "RECONCILIATION_REQUIRED",
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: rejected ? null : new Date(Date.now() + 60000),
        updatedAt: new Date()
      }).where(and(eq(assessmentFaceScans.id, row.id), eq(assessmentFaceScans.leaseToken, token)));
    }
  }
  async mutate(actor: Principal, org: string, assessment: string, id: string, action: "signal" | "cancel", signal?: FaceScanSignal) {
    // Keep the assessment lock across the bounded remote call: submission cannot lock it mid-upload.
    await this.db.transaction(async (tx) => {
      const assessmentRow = await this.workflow.authorize(actor, org, assessment, tx, true);
      this.workflow.editable(assessmentRow, assessmentRow.revision);
      const row = await this.row(org, assessment, id, tx);
      if (action === "signal" && !this.workflow.config.FACE_SCAN_ENABLED)
        throw new ServiceError("SCORING_UNAVAILABLE", "New scan uploads are disabled.");
      if (!row.remoteId)
        throw new ServiceError("CONFLICT", "Scan setup is still being recovered.");
      const remote = await this.request(row, action, signal, tx);
      await this.project(row, remote, undefined, tx);
    });
    return this.dto(await this.row(org, assessment, id));
  }
  async recoverPending() {
    const rows = await this.db.select().from(assessmentFaceScans).where(and(recoveryCondition, sql `(${assessmentFaceScans.nextAttemptAt} is null or ${assessmentFaceScans.nextAttemptAt}<=now())`)).orderBy(assessmentFaceScans.updatedAt).limit(10);
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
