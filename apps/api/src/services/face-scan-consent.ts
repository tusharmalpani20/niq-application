import { and, eq } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import type { FaceScanConsentSummary } from "../../../../packages/contracts/src/face-scan-consent";
import { faceScanConsents } from "../db/schema";
import type { ReportMediaType, StagedReport } from "../storage/report-storage";
import type { AssessmentWorkflowService, WorkflowExecutor } from "./assessment-workflow";
import type { Principal, RequestContext } from "./application";
import { ServiceError } from "./application";

type ConsentRow = typeof faceScanConsents.$inferSelect;
const demoDelayMs = 2_000;

function record(row: ConsentRow): NonNullable<FaceScanConsentSummary["current"]> {
  return {
    id: row.id,
    method: row.method as "LINK" | "UPLOAD",
    provenance: row.provenance as "SIMULATED" | "SIGNED_UPLOAD",
    status: row.status as "REQUESTED" | "APPROVED",
    requestedAt: row.requestedAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    fileName: row.fileName,
    mediaType: row.mediaType as ReportMediaType | null,
    size: row.size,
  };
}

export class FaceScanConsentService {
  constructor(private readonly workflow: AssessmentWorkflowService) {}
  private get db() { return this.workflow.db; }
  private get demoEnabled() { return this.workflow.config.NODE_ENV !== "production"; }

  async current(actor: Principal, org: string, assessment: string, executor: WorkflowExecutor = this.db, context?: RequestContext) {
    const assessmentRow = await this.workflow.authorize(actor, org, assessment, executor);
    const [found] = await executor.select().from(faceScanConsents).where(and(
      eq(faceScanConsents.organizationId, org), eq(faceScanConsents.assessmentId, assessment), eq(faceScanConsents.isCurrent, true),
    ));
    if (!found || found.cycle !== assessmentRow.cycle) return null;
    if (found.method === "LINK" && found.status === "REQUESTED" && this.demoEnabled && found.requestedAt &&
      Date.now() - found.requestedAt.getTime() >= demoDelayMs) {
      const now = new Date();
      const [approved] = await executor.update(faceScanConsents).set({ status: "APPROVED", respondedAt: now, updatedAt: now })
        .where(and(eq(faceScanConsents.id, found.id), eq(faceScanConsents.status, "REQUESTED"), eq(faceScanConsents.isCurrent, true))).returning();
      if (approved) {
        if (context) await this.workflow.audit(executor, actor, context, assessment, "FACE_SCAN_CONSENT_DEMO_RESPONSE", { consentId: found.id, provenance: "SIMULATED" });
        return approved;
      }
      const [latest] = await executor.select().from(faceScanConsents).where(eq(faceScanConsents.id, found.id));
      return latest?.isCurrent ? latest : null;
    }
    return found;
  }

  async read(actor: Principal, org: string, assessment: string, context?: RequestContext): Promise<FaceScanConsentSummary> {
    const current = await this.current(actor, org, assessment, this.db, context);
    return { current: current ? record(current) : null, demoEnabled: this.demoEnabled };
  }

  async request(actor: Principal, org: string, assessment: string, revision: number, context: RequestContext): Promise<FaceScanConsentSummary> {
    this.workflow.clinicalActor(actor, org, "scans.perform");
    if (!this.demoEnabled) throw new ServiceError("FORBIDDEN", "Consent links are not connected in this environment.");
    await this.db.transaction(async tx => {
      const row = await this.workflow.authorize(actor, org, assessment, tx, true);
      this.workflow.editable(row, revision, actor);
      const now = new Date();
      await tx.update(faceScanConsents).set({ isCurrent: false, updatedAt: now }).where(and(
        eq(faceScanConsents.organizationId, org), eq(faceScanConsents.assessmentId, assessment), eq(faceScanConsents.isCurrent, true),
      ));
      const id = createEntityId();
      await tx.insert(faceScanConsents).values({ id, organizationId: org, assessmentId: assessment, patientId: row.patientId,
        actorId: actor.membershipId, cycle: row.cycle, method: "LINK", provenance: "SIMULATED", status: "REQUESTED", requestedAt: now });
      await this.workflow.audit(tx, actor, context, assessment, "FACE_SCAN_CONSENT_DEMO_REQUESTED", { consentId: id, provenance: "SIMULATED" });
    });
    return this.read(actor, org, assessment, context);
  }

  async clear(actor: Principal, org: string, assessment: string, revision: number, context: RequestContext): Promise<FaceScanConsentSummary> {
    this.workflow.clinicalActor(actor, org, "scans.perform");
    await this.db.transaction(async tx => {
      const row = await this.workflow.authorize(actor, org, assessment, tx, true);
      this.workflow.editable(row, revision, actor);
      const [cleared] = await tx.update(faceScanConsents).set({ isCurrent: false, updatedAt: new Date() }).where(and(
        eq(faceScanConsents.organizationId, org), eq(faceScanConsents.assessmentId, assessment), eq(faceScanConsents.isCurrent, true),
      )).returning();
      if (cleared) await this.workflow.audit(tx, actor, context, assessment, "FACE_SCAN_CONSENT_CLEARED", { consentId: cleared.id });
    });
    return this.read(actor, org, assessment, context);
  }

  async upload(actor: Principal, org: string, assessment: string, input: {
    revision: number; uploadKey: string; filename: string; mediaType: ReportMediaType; size: number; sha256: string;
    body: ReadableStream<Uint8Array>; signal?: AbortSignal;
  }, context: RequestContext): Promise<FaceScanConsentSummary> {
    this.workflow.clinicalActor(actor, org, "scans.perform");
    const storage = this.workflow.storage;
    if (!storage) throw new ServiceError("VALIDATION_ERROR", "Consent file storage is not configured.");
    if (input.size < 1 || input.size > this.workflow.config.REPORT_MAX_FILE_BYTES) throw new ServiceError("VALIDATION_ERROR", "The consent file is too large or empty.");
    const row = await this.workflow.authorize(actor, org, assessment);
    this.workflow.editable(row, input.revision, actor);
    const scope = { organizationId: org, patientId: row.patientId, assessmentId: assessment };
    const id = createEntityId();
    let staged: StagedReport | undefined;
    try {
      staged = await storage.stage(scope, `consent-${id}`, input.body, { expectedMediaType: input.mediaType, signal: input.signal });
      if (staged.size !== input.size || staged.sha256 !== input.sha256) throw new ServiceError("VALIDATION_ERROR", "The uploaded consent file differs from the declared file.");
      await this.db.transaction(async tx => {
        const locked = await this.workflow.authorize(actor, org, assessment, tx, true);
        this.workflow.editable(locked, input.revision, actor);
        if (locked.patientId !== row.patientId || locked.cycle !== row.cycle) throw new ServiceError("CONFLICT", "The assessment changed during upload.");
        const [replay] = await tx.select().from(faceScanConsents).where(and(eq(faceScanConsents.organizationId, org), eq(faceScanConsents.uploadKey, input.uploadKey)));
        if (replay) throw new ServiceError("CONFLICT", "This upload key has already been used.");
        // Publish while holding the assessment lock, then commit metadata and audit together.
        await storage.promote(staged!);
        const now = new Date();
        await tx.update(faceScanConsents).set({ isCurrent: false, updatedAt: now }).where(and(
          eq(faceScanConsents.organizationId, org), eq(faceScanConsents.assessmentId, assessment), eq(faceScanConsents.isCurrent, true),
        ));
        await tx.insert(faceScanConsents).values({ id, organizationId: org, assessmentId: assessment, patientId: row.patientId,
          actorId: actor.membershipId, cycle: row.cycle, method: "UPLOAD", provenance: "SIGNED_UPLOAD", status: "APPROVED",
          respondedAt: now, fileName: input.filename, mediaType: input.mediaType, size: staged!.size, sha256: staged!.sha256,
          objectKey: staged!.objectKey, uploadKey: input.uploadKey });
        await this.workflow.audit(tx, actor, context, assessment, "FACE_SCAN_CONSENT_FILE_UPLOADED", { consentId: id, fileSha256: staged!.sha256 });
      });
    } catch (error) {
      // A transaction may have committed before its acknowledgement was lost. Preserve referenced evidence.
      if (staged) {
        const [saved] = await this.db.select({ id: faceScanConsents.id }).from(faceScanConsents).where(eq(faceScanConsents.id, id));
        if (!saved) await storage.remove(scope, staged.objectKey).catch(() => {});
        await storage.discard(staged).catch(() => {});
      }
      throw error;
    }
    return this.read(actor, org, assessment, context);
  }

  async download(actor: Principal, org: string, assessment: string, consentId: string) {
    await this.workflow.authorize(actor, org, assessment);
    const [row] = await this.db.select().from(faceScanConsents).where(and(eq(faceScanConsents.id, consentId),
      eq(faceScanConsents.organizationId, org), eq(faceScanConsents.assessmentId, assessment)));
    if (!row?.objectKey || !row.mediaType || !row.fileName || !this.workflow.storage) throw new ServiceError("NOT_FOUND", "Consent file not found.");
    const data = await this.workflow.storage.open({ organizationId: org, patientId: row.patientId, assessmentId: assessment }, row.objectKey);
    return { ...data, filename: row.fileName, mediaType: row.mediaType };
  }
}
