import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import type { Database } from "../db/client";
import { userNotifications, workspaceEventCursors, workspaceEvents } from "../db/notification-schema";
import { notificationDeliveries, pushSubscriptions, workspacePresence } from "../db/push-schema";
import type { WorkflowExecutor, AssessmentWorkflowService, WorkflowRow } from "./assessment-workflow";
import type { Principal } from "./application";
import { ServiceError } from "./application";
import { notificationKinds, notificationMessage, type NotificationKind } from "./notification-messages";
import { isCurrentAssessmentOwner } from "./assessment-access";
import { reviewState } from "./clinical-review-state";

export type WorkspaceScope = "assessment" | "patient" | "facility" | "users" | "organization";
export type NotificationRecipient = { membershipId: string; kind: NotificationKind; reference: string };

export function notificationStillRelevant(workflow: AssessmentWorkflowService, row: WorkflowRow, actor: Principal, kind: NotificationKind) {
  const review = reviewState(workflow, row);
  const owner = isCurrentAssessmentOwner(row, actor, review.correctionPerson?.membershipId);
  switch (kind) {
    case "REVIEW_AVAILABLE": return row.status === "UNDER_REVIEW" && !review.assignee;
    case "REVIEW_ASSIGNED": return row.status === "UNDER_REVIEW" && owner;
    case "REVIEW_RETURNED":
    case "CORRECTION_ASSIGNED": return ["DRAFT", "SCORED", "SCORING_PENDING", "SCORING_UNAVAILABLE"].includes(row.status) && owner;
    case "OWNER_TRANSFERRED": return ["DRAFT", "SCORED", "SCORING_PENDING", "SCORING_UNAVAILABLE"].includes(row.status) && owner;
    case "REVIEW_COMPLETED": return row.status === "COMPLETED";
    case "SCORING_FAILED": return row.status === "SCORING_UNAVAILABLE" && owner;
    case "SCAN_FAILED": return row.status !== "COMPLETED" && owner;
  }
}

/** The counter row is locked through commit, so a reconnect cursor cannot skip a late commit. */
export async function publishWorkspaceChange(executor: WorkflowExecutor, input: {
  organizationId: string; scope: WorkspaceScope; assessmentId?: string; recipients?: NotificationRecipient[];
}): Promise<number> {
  const recipients = [...new Map((input.recipients ?? []).map(item => [item.membershipId, item])).values()];
  if (recipients.length && !input.assessmentId) throw new Error("Assessment notifications require an assessment ID.");
  const [cursor] = await executor.insert(workspaceEventCursors)
    .values({ organizationId: input.organizationId, sequence: 1 })
    .onConflictDoUpdate({ target: workspaceEventCursors.organizationId, set: { sequence: sql`${workspaceEventCursors.sequence} + 1` } })
    .returning({ sequence: workspaceEventCursors.sequence });
  const sequence = cursor!.sequence;
  await executor.insert(workspaceEvents).values({ organizationId: input.organizationId, sequence, scope: input.scope, assessmentId: input.assessmentId ?? null });
  const notificationRows = recipients.map(item => ({
    id: createEntityId(), organizationId: input.organizationId, recipientMembershipId: item.membershipId,
    eventSequence: sequence, kind: item.kind, assessmentId: input.assessmentId!, reference: item.reference,
  }));
  if (notificationRows.length) {
    await executor.insert(userNotifications).values(notificationRows);
    const subscriptions = await executor.select({ id: pushSubscriptions.id, membershipId: pushSubscriptions.membershipId })
      .from(pushSubscriptions).where(and(eq(pushSubscriptions.organizationId, input.organizationId), inArray(pushSubscriptions.membershipId, recipients.map(item => item.membershipId)), isNull(pushSubscriptions.revokedAt)));
    const deliveries = notificationRows.flatMap(notification => subscriptions.filter(subscription => subscription.membershipId === notification.recipientMembershipId)
      .map(subscription => ({ id: createEntityId(), notificationId: notification.id, channel: "PUSH", destinationKey: subscription.id, subscriptionId: subscription.id, nextAttemptAt: new Date(Date.now() + 30_000) })));
    if (deliveries.length) await executor.insert(notificationDeliveries).values(deliveries);
  }
  // PostgreSQL delivers NOTIFY only after the transaction commits. The durable row is the source of truth.
  await executor.execute(sql`select pg_notify('niq_workspace_events', ${input.organizationId})`);
  return sequence;
}

export class WorkspaceNotificationService {
  constructor(private readonly workflow: AssessmentWorkflowService) {}
  get db(): Database { return this.workflow.db; }

  private actor(actor: Principal, organizationId: string) {
    if (actor.platformRole !== "USER" || actor.organizationId !== organizationId) throw new ServiceError("FORBIDDEN", "This workspace is unavailable.");
  }

  async visible(actor: Principal, organizationId: string, assessmentId: string): Promise<boolean> {
    try { await this.workflow.authorize(actor, organizationId, assessmentId); return true; }
    catch (cause) { if (cause instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(cause.code)) return false; throw cause; }
  }

  async notificationVisible(actor: Principal, organizationId: string, assessmentId: string, kind: string): Promise<boolean> {
    if (!notificationKinds.includes(kind as NotificationKind)) return false;
    try {
      const row = await this.workflow.authorize(actor, organizationId, assessmentId);
      return notificationStillRelevant(this.workflow, row, actor, kind as NotificationKind);
    } catch (cause) { if (cause instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(cause.code)) return false; throw cause; }
  }

  async list(actor: Principal, organizationId: string) {
    this.actor(actor, organizationId);
    const rows = await this.db.select().from(userNotifications).where(and(
      eq(userNotifications.organizationId, organizationId), eq(userNotifications.recipientMembershipId, actor.membershipId), isNull(userNotifications.dismissedAt),
    )).orderBy(desc(userNotifications.createdAt), desc(userNotifications.id));
    const visible = [];
    for (const row of rows) {
      if (!await this.notificationVisible(actor, organizationId, row.assessmentId, row.kind)) continue;
      const { title, body } = notificationMessage(row.kind as NotificationKind, "inApp", row.reference);
      visible.push({ id: row.id, kind: row.kind, title, body, href: `/assessments/${row.reference}`, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null });
    }
    return { items: visible, unreadCount: visible.filter(item => !item.readAt).length };
  }

  async markRead(actor: Principal, organizationId: string, id: string) {
    this.actor(actor, organizationId);
    await this.db.update(userNotifications).set({ readAt: new Date() }).where(and(
      eq(userNotifications.id, id), eq(userNotifications.organizationId, organizationId), eq(userNotifications.recipientMembershipId, actor.membershipId), isNull(userNotifications.readAt),
    ));
  }

  async markAllRead(actor: Principal, organizationId: string) {
    this.actor(actor, organizationId);
    await this.db.update(userNotifications).set({ readAt: new Date() }).where(and(
      eq(userNotifications.organizationId, organizationId), eq(userNotifications.recipientMembershipId, actor.membershipId), isNull(userNotifications.readAt), isNull(userNotifications.dismissedAt),
    ));
  }

  async dismiss(actor: Principal, organizationId: string, id: string) {
    this.actor(actor, organizationId);
    await this.db.update(userNotifications).set({ dismissedAt: new Date() }).where(and(
      eq(userNotifications.id, id), eq(userNotifications.organizationId, organizationId), eq(userNotifications.recipientMembershipId, actor.membershipId), isNull(userNotifications.dismissedAt),
    ));
  }

  async dismissAll(actor: Principal, organizationId: string) {
    this.actor(actor, organizationId);
    await this.db.update(userNotifications).set({ dismissedAt: new Date() }).where(and(
      eq(userNotifications.organizationId, organizationId), eq(userNotifications.recipientMembershipId, actor.membershipId), isNull(userNotifications.dismissedAt),
    ));
  }

  async latestSequence(organizationId: string): Promise<number> {
    const [row] = await this.db.select({ sequence: workspaceEventCursors.sequence }).from(workspaceEventCursors).where(eq(workspaceEventCursors.organizationId, organizationId));
    return row?.sequence ?? 0;
  }

  async markPresent(actor: Principal, organizationId: string) {
    this.actor(actor, organizationId);
    await this.db.insert(workspacePresence).values({ organizationId, membershipId: actor.membershipId, lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: [workspacePresence.organizationId, workspacePresence.membershipId], set: { lastSeenAt: new Date() } });
  }

  async changes(actor: Principal, organizationId: string, after: number, limit = 100) {
    this.actor(actor, organizationId);
    const rows = await this.db.select().from(workspaceEvents).where(and(eq(workspaceEvents.organizationId, organizationId), gt(workspaceEvents.sequence, after)))
      .orderBy(workspaceEvents.sequence).limit(limit);
    const delivered: Array<{ sequence: number; scope: WorkspaceScope | "notification"; assessmentId?: string }> = [];
    for (const row of rows) {
      if (row.assessmentId && !await this.visible(actor, organizationId, row.assessmentId)) {
        // A former owner must refresh their list after losing access without learning
        // which assessment changed.
        delivered.push({ sequence: row.sequence, scope: "organization" });
        continue;
      }
      const [own] = await this.db.select({ id: userNotifications.id, assessmentId: userNotifications.assessmentId, kind: userNotifications.kind }).from(userNotifications).where(and(
        eq(userNotifications.organizationId, organizationId), eq(userNotifications.eventSequence, row.sequence), eq(userNotifications.recipientMembershipId, actor.membershipId), isNull(userNotifications.dismissedAt),
      )).limit(1);
      if (own && await this.notificationVisible(actor, organizationId, own.assessmentId, own.kind)) delivered.push({ sequence: row.sequence, scope: "notification" });
      delivered.push({ sequence: row.sequence, scope: row.scope as WorkspaceScope, ...(row.assessmentId ? { assessmentId: row.assessmentId } : {}) });
    }
    return { events: delivered, lastSequence: rows.at(-1)?.sequence ?? after, hasMore: rows.length === limit };
  }
}
