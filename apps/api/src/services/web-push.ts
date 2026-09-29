import { and, eq, isNull, lte, or } from "drizzle-orm";
import { createEntityId } from "@niq/application-domain";
import type { ApplicationConfig } from "@niq/application-config";
import webPush from "web-push";
import type { Database } from "../db/client";
import { notificationDeliveries, pushSubscriptions, workspacePresence } from "../db/push-schema";
import { userNotifications } from "../db/notification-schema";
import { organizationMemberships, users } from "../db/schema";
import type { AssessmentWorkflowService } from "./assessment-workflow";
import type { Principal } from "./application";
import { ServiceError } from "./application";
import { notificationKinds, notificationMessage, type NotificationKind } from "./notification-messages";
import { notificationStillRelevant } from "./workspace-notifications";

export type BrowserPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Never let a browser-supplied endpoint turn the API into a general outbound HTTP client. */
export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || endpoint.length > 2048) return false;
    return url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com");
  } catch { return false; }
}

export class WebPushService {
  readonly enabled: boolean;
  constructor(private readonly db: Database, private readonly workflow: AssessmentWorkflowService, private readonly config: ApplicationConfig) {
    this.enabled = !!(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT);
    if (this.enabled) webPush.setVapidDetails(config.VAPID_SUBJECT!, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
  }

  private assertActor(actor: Principal, organizationId: string) {
    if (actor.platformRole !== "USER" || actor.organizationId !== organizationId) throw new ServiceError("FORBIDDEN", "This workspace is unavailable.");
  }

  publicKey(actor: Principal, organizationId: string) {
    this.assertActor(actor, organizationId);
    return { enabled: this.enabled, publicKey: this.enabled ? this.config.VAPID_PUBLIC_KEY : null };
  }

  async subscribe(actor: Principal, organizationId: string, subscription: BrowserPushSubscription) {
    this.assertActor(actor, organizationId);
    if (!this.enabled) throw new ServiceError("VALIDATION_ERROR", "Push notifications are not configured.");
    if (!validPushEndpoint(subscription.endpoint)) throw new ServiceError("VALIDATION_ERROR", "This browser push service is not supported.");
    const [row] = await this.db.select({ id: organizationMemberships.id }).from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.id, actor.membershipId), eq(organizationMemberships.userId, actor.userId), eq(organizationMemberships.isActive, true), eq(users.status, "ACTIVE")));
    if (!row) throw new ServiceError("FORBIDDEN", "Your account is no longer active.");
    await this.db.insert(pushSubscriptions).values({ id: createEntityId(), organizationId, membershipId: actor.membershipId,
      endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: {
        organizationId, membershipId: actor.membershipId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, revokedAt: null,
      } });
  }

  async unsubscribe(actor: Principal, organizationId: string, endpoint: string) {
    this.assertActor(actor, organizationId);
    await this.db.update(pushSubscriptions).set({ revokedAt: new Date() }).where(and(
      eq(pushSubscriptions.organizationId, organizationId), eq(pushSubscriptions.membershipId, actor.membershipId), eq(pushSubscriptions.endpoint, endpoint), isNull(pushSubscriptions.revokedAt),
    ));
  }

  async deliverDue() {
    if (!this.enabled) return;
    const now = new Date();
    const claimed = await this.db.transaction(async tx => {
      const rows = await tx.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(and(eq(notificationDeliveries.channel, "PUSH"), or(
        and(eq(notificationDeliveries.status, "PENDING"), lte(notificationDeliveries.nextAttemptAt, now)),
        and(eq(notificationDeliveries.status, "SENDING"), lte(notificationDeliveries.leaseUntil, now)),
      ))).limit(10).for("update", { skipLocked: true });
      if (rows.length) await tx.update(notificationDeliveries).set({ status: "SENDING", leaseUntil: new Date(Date.now() + 60_000) })
        .where(or(...rows.map(row => eq(notificationDeliveries.id, row.id))));
      return rows.map(row => row.id);
    });
    for (const id of claimed) await this.deliverOne(id);
  }

  private async deliverOne(id: string) {
    const [row] = await this.db.select({ delivery: notificationDeliveries, notification: userNotifications, subscription: pushSubscriptions })
      .from(notificationDeliveries).innerJoin(userNotifications, eq(userNotifications.id, notificationDeliveries.notificationId))
      .innerJoin(pushSubscriptions, eq(pushSubscriptions.id, notificationDeliveries.subscriptionId))
      .where(eq(notificationDeliveries.id, id));
    if (!row) return;
    const { delivery, notification, subscription } = row;
    const [membership] = await this.db.select({ role: organizationMemberships.role, userId: organizationMemberships.userId, active: organizationMemberships.isActive,
      email: users.email, displayName: users.displayName, userStatus: users.status, platformRole: users.platformRole })
      .from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(eq(organizationMemberships.organizationId, notification.organizationId), eq(organizationMemberships.id, notification.recipientMembershipId)));
    const skip = async () => this.db.update(notificationDeliveries).set({ status: "SKIPPED", leaseUntil: null }).where(eq(notificationDeliveries.id, id));
    if (!membership || !membership.active || membership.userStatus !== "ACTIVE" || membership.platformRole !== "USER" ||
      subscription.revokedAt || subscription.membershipId !== notification.recipientMembershipId || notification.readAt || notification.dismissedAt) { await skip(); return; }
    const actor: Principal = { userId: membership.userId, organizationId: notification.organizationId, membershipId: notification.recipientMembershipId,
      email: membership.email, displayName: membership.displayName, role: membership.role, platformRole: "USER" };
    try {
      const assessment = await this.workflow.authorize(actor, notification.organizationId, notification.assessmentId);
      if (!notificationStillRelevant(this.workflow, assessment, actor, notification.kind as NotificationKind)) { await skip(); return; }
    }
    catch (cause) { if (cause instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(cause.code)) { await skip(); return; } throw cause; }
    const [presence] = await this.db.select({ lastSeenAt: workspacePresence.lastSeenAt }).from(workspacePresence).where(and(
      eq(workspacePresence.organizationId, notification.organizationId), eq(workspacePresence.membershipId, notification.recipientMembershipId),
    ));
    if (presence && Date.now() - presence.lastSeenAt.getTime() < 20_000) {
      await this.db.update(notificationDeliveries).set({ status: "PENDING", leaseUntil: null, nextAttemptAt: new Date(Date.now() + 15_000) }).where(eq(notificationDeliveries.id, id));
      return;
    }
    if (!notificationKinds.includes(notification.kind as NotificationKind)) { await skip(); return; }
    const message = notificationMessage(notification.kind as NotificationKind, "push", notification.reference);
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ ...message, href: `/assessments/${notification.reference}` }), { TTL: 3600, urgency: "normal", timeout: 10_000 });
      await this.db.update(notificationDeliveries).set({ status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null }).where(eq(notificationDeliveries.id, id));
    } catch (cause) {
      const status = typeof cause === "object" && cause !== null && "statusCode" in cause ? Number(cause.statusCode) : 0;
      if (status === 404 || status === 410) {
        await this.db.update(pushSubscriptions).set({ revokedAt: new Date() }).where(eq(pushSubscriptions.id, subscription.id));
        await skip();
      } else {
        const attempts = delivery.attempts + 1;
        await this.db.update(notificationDeliveries).set({ status: attempts >= 5 ? "FAILED" : "PENDING", attempts,
          nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** attempts)), leaseUntil: null,
          lastError: status ? `HTTP ${status}` : "Delivery unavailable" }).where(eq(notificationDeliveries.id, id));
      }
    }
  }
}
