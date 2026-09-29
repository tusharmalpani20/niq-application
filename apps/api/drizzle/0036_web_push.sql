CREATE TABLE "push_subscriptions" (
  "id" varchar(26) PRIMARY KEY NOT NULL,
  "organization_id" varchar(26) NOT NULL REFERENCES "organizations"("id"),
  "membership_id" varchar(26) NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  CONSTRAINT "push_subscriptions_membership_fk" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "organization_memberships"("organization_id", "id"),
  CONSTRAINT "push_subscriptions_id_ulid_ck" CHECK ("id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uidx" ON "push_subscriptions" ("endpoint");
--> statement-breakpoint
CREATE INDEX "push_subscriptions_membership_idx" ON "push_subscriptions" ("organization_id", "membership_id");
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
  "id" varchar(26) PRIMARY KEY NOT NULL,
  "notification_id" varchar(26) NOT NULL REFERENCES "user_notifications"("id"),
  "channel" text NOT NULL,
  "destination_key" text NOT NULL,
  "subscription_id" varchar(26) REFERENCES "push_subscriptions"("id"),
  "status" text DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "lease_until" timestamptz,
  "last_error" text,
  "sent_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "notification_deliveries_channel_ck" CHECK ("channel" in ('PUSH','EMAIL','WHATSAPP')),
  CONSTRAINT "notification_deliveries_status_ck" CHECK ("status" in ('PENDING','SENDING','SENT','FAILED','SKIPPED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_destination_uidx" ON "notification_deliveries" ("notification_id", "channel", "destination_key");
--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" ("status", "next_attempt_at");
--> statement-breakpoint
CREATE TABLE "workspace_presence" (
  "organization_id" varchar(26) NOT NULL REFERENCES "organizations"("id"),
  "membership_id" varchar(26) NOT NULL,
  "last_seen_at" timestamptz NOT NULL,
  CONSTRAINT "workspace_presence_pk" PRIMARY KEY ("organization_id", "membership_id"),
  CONSTRAINT "workspace_presence_membership_fk" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "organization_memberships"("organization_id", "id")
);
