CREATE TABLE "assessment_reviewed_risks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"submission_id" varchar(26) NOT NULL,
	"revision" integer NOT NULL,
	"request_key" text NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb,
	"status" text NOT NULL,
	"failure_code" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_reviewed_risks_status_ck" CHECK ("assessment_reviewed_risks"."status" in ('PENDING','SUCCEEDED','UNAVAILABLE'))
);
--> statement-breakpoint
ALTER TABLE "assessment_reviewed_risks" ADD CONSTRAINT "assessment_reviewed_risks_organization_id_assessment_id_submission_id_assessment_submissions_organization_id_assessment_id_id_fk" FOREIGN KEY ("organization_id","assessment_id","submission_id") REFERENCES "public"."assessment_submissions"("organization_id","assessment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_reviewed_risks_revision_uidx" ON "assessment_reviewed_risks" USING btree ("submission_id","revision");