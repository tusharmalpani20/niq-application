CREATE TABLE "assessment_face_scans" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"revision" integer NOT NULL,
	"request_key" text NOT NULL,
	"connection" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"remote_id" text,
	"state" text DEFAULT 'REQUESTED' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"projection" jsonb,
	"failure_code" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_face_scans" ADD CONSTRAINT "assessment_face_scans_organization_id_assessment_id_assessments_organization_id_id_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_face_scans_key_uidx" ON "assessment_face_scans" USING btree ("organization_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_face_scans_active_uidx" ON "assessment_face_scans" USING btree ("organization_id","assessment_id") WHERE "assessment_face_scans"."active" = true;--> statement-breakpoint
CREATE INDEX "assessment_face_scans_recovery_idx" ON "assessment_face_scans" USING btree ("active","next_attempt_at");