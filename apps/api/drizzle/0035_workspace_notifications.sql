CREATE TABLE "workspace_event_cursors" (
  "organization_id" varchar(26) PRIMARY KEY NOT NULL REFERENCES "organizations"("id"),
  "sequence" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_events" (
  "organization_id" varchar(26) NOT NULL REFERENCES "organizations"("id"),
  "sequence" bigint NOT NULL,
  "scope" text NOT NULL,
  "assessment_id" varchar(26),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_events_pk" PRIMARY KEY ("organization_id", "sequence"),
  CONSTRAINT "workspace_events_assessment_fk" FOREIGN KEY ("organization_id", "assessment_id") REFERENCES "assessments"("organization_id", "id"),
  CONSTRAINT "workspace_events_scope_ck" CHECK ("scope" in ('assessment','patient','facility','users','organization'))
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
  "id" varchar(26) PRIMARY KEY NOT NULL,
  "organization_id" varchar(26) NOT NULL REFERENCES "organizations"("id"),
  "recipient_membership_id" varchar(26) NOT NULL,
  "event_sequence" bigint NOT NULL,
  "kind" text NOT NULL,
  "assessment_id" varchar(26) NOT NULL,
  "reference" text NOT NULL,
  "template_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamptz,
  "dismissed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_notifications_recipient_fk" FOREIGN KEY ("organization_id", "recipient_membership_id") REFERENCES "organization_memberships"("organization_id", "id"),
  CONSTRAINT "user_notifications_assessment_fk" FOREIGN KEY ("organization_id", "assessment_id") REFERENCES "assessments"("organization_id", "id"),
  CONSTRAINT "user_notifications_event_fk" FOREIGN KEY ("organization_id", "event_sequence") REFERENCES "workspace_events"("organization_id", "sequence"),
  CONSTRAINT "user_notifications_id_ulid_ck" CHECK ("id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_notifications_event_recipient_uidx" ON "user_notifications" ("organization_id", "event_sequence", "recipient_membership_id");
--> statement-breakpoint
CREATE INDEX "user_notifications_inbox_idx" ON "user_notifications" ("organization_id", "recipient_membership_id", "dismissed_at", "created_at");
