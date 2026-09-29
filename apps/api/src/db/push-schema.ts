import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organizationMemberships, organizations } from "./schema";
import { userNotifications } from "./notification-schema";

const entityId = (name: string) => varchar(name, { length: 26 });

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: entityId("id").primaryKey(),
  organizationId: entityId("organization_id").notNull().references(() => organizations.id),
  membershipId: entityId("membership_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [
  uniqueIndex("push_subscriptions_endpoint_uidx").on(table.endpoint),
  index("push_subscriptions_membership_idx").on(table.organizationId, table.membershipId),
  foreignKey({ columns: [table.organizationId, table.membershipId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id] }),
  check("push_subscriptions_id_ulid_ck", sql`${table.id} ~ '^[0-9A-HJKMNP-TV-Z]{26}$'`),
]);

/** Delivery attempts are channel neutral so email and WhatsApp can be added later. */
export const notificationDeliveries = pgTable("notification_deliveries", {
  id: entityId("id").primaryKey(),
  notificationId: entityId("notification_id").notNull().references(() => userNotifications.id),
  channel: text("channel").notNull(),
  destinationKey: text("destination_key").notNull(),
  subscriptionId: entityId("subscription_id").references(() => pushSubscriptions.id),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("notification_deliveries_destination_uidx").on(table.notificationId, table.channel, table.destinationKey),
  index("notification_deliveries_due_idx").on(table.status, table.nextAttemptAt),
  check("notification_deliveries_channel_ck", sql`${table.channel} in ('PUSH','EMAIL','WHATSAPP')`),
  check("notification_deliveries_status_ck", sql`${table.status} in ('PENDING','SENDING','SENT','FAILED','SKIPPED')`),
]);

export const workspacePresence = pgTable("workspace_presence", {
  organizationId: entityId("organization_id").notNull().references(() => organizations.id),
  membershipId: entityId("membership_id").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
}, table => [
  primaryKey({ columns: [table.organizationId, table.membershipId] }),
  foreignKey({ columns: [table.organizationId, table.membershipId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id] }),
]);
