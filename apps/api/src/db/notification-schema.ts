import { bigint, check, foreignKey, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assessments, organizationMemberships, organizations } from "./schema";

const entityId = (name: string) => varchar(name, { length: 26 });
const sequence = (name: string) => bigint(name, { mode: "number" });

/** Updating this row locks one organization's sequence until its transaction commits. */
export const workspaceEventCursors = pgTable("workspace_event_cursors", {
  organizationId: entityId("organization_id").primaryKey().references(() => organizations.id),
  sequence: sequence("sequence").notNull(),
});

/** Small durable invalidations. Neither patient data nor clinical notes belong here. */
export const workspaceEvents = pgTable("workspace_events", {
  organizationId: entityId("organization_id").notNull().references(() => organizations.id),
  sequence: sequence("sequence").notNull(),
  scope: text("scope").notNull(),
  assessmentId: entityId("assessment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.organizationId, table.sequence] }),
  foreignKey({ columns: [table.organizationId, table.assessmentId], foreignColumns: [assessments.organizationId, assessments.id] }),
  check("workspace_events_scope_ck", sql`${table.scope} in ('assessment','patient','facility','users','organization')`),
]);

/** Personal inbox items reference a workflow event and store only safe template inputs. */
export const userNotifications = pgTable("user_notifications", {
  id: entityId("id").primaryKey(),
  organizationId: entityId("organization_id").notNull().references(() => organizations.id),
  recipientMembershipId: entityId("recipient_membership_id").notNull(),
  eventSequence: sequence("event_sequence").notNull(),
  kind: text("kind").notNull(),
  assessmentId: entityId("assessment_id").notNull(),
  reference: text("reference").notNull(),
  templateData: jsonb("template_data").notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("user_notifications_event_recipient_uidx").on(table.organizationId, table.eventSequence, table.recipientMembershipId),
  index("user_notifications_inbox_idx").on(table.organizationId, table.recipientMembershipId, table.dismissedAt, table.createdAt),
  foreignKey({ columns: [table.organizationId, table.recipientMembershipId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id] }),
  foreignKey({ columns: [table.organizationId, table.assessmentId], foreignColumns: [assessments.organizationId, assessments.id] }),
  foreignKey({ columns: [table.organizationId, table.eventSequence], foreignColumns: [workspaceEvents.organizationId, workspaceEvents.sequence] }),
  check("user_notifications_id_ulid_ck", sql`${table.id} ~ '^[0-9A-HJKMNP-TV-Z]{26}$'`),
]);
