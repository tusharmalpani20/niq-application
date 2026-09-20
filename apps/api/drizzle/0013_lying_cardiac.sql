CREATE TABLE "assessment_files" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"patient_id" varchar(26) NOT NULL,
	"report_id" varchar(26) NOT NULL,
	"upload_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"storage_backend" text DEFAULT 'LOCAL' NOT NULL,
	"object_key" text,
	"staging_key" text,
	"sha256" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"uploader_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_initializations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"patient_id" varchar(26) NOT NULL,
	"facility_id" varchar(26) NOT NULL,
	"creator_id" varchar(26) NOT NULL,
	"request_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"assessment_id" varchar(26),
	"connection" jsonb NOT NULL,
	"failure_code" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_reports" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"label" text NOT NULL,
	"purpose" text NOT NULL,
	"date_precision" text NOT NULL,
	"year" integer,
	"month" integer,
	"day" integer,
	"creator_id" varchar(26) NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_submissions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"failure_code" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "workflow" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_reports_org_id_uidx" ON "assessment_reports" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "assessment_files" ADD CONSTRAINT "assessment_files_organization_id_assessment_id_assessments_organization_id_id_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_files" ADD CONSTRAINT "assessment_files_organization_id_patient_id_patients_organization_id_id_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "public"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_files" ADD CONSTRAINT "assessment_files_organization_id_report_id_assessment_reports_organization_id_id_fk" FOREIGN KEY ("organization_id","report_id") REFERENCES "public"."assessment_reports"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_initializations" ADD CONSTRAINT "assessment_initializations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_initializations" ADD CONSTRAINT "assessment_initializations_organization_id_patient_id_patients_organization_id_id_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "public"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_initializations" ADD CONSTRAINT "assessment_initializations_organization_id_facility_id_facilities_organization_id_id_fk" FOREIGN KEY ("organization_id","facility_id") REFERENCES "public"."facilities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_organization_id_assessment_id_assessments_organization_id_id_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "assessment_submissions_organization_id_assessment_id_assessments_organization_id_id_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_files_upload_uidx" ON "assessment_files" USING btree ("assessment_id","upload_key");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_initializations_request_uidx" ON "assessment_initializations" USING btree ("organization_id","creator_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_submissions_revision_uidx" ON "assessment_submissions" USING btree ("assessment_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_submissions_key_uidx" ON "assessment_submissions" USING btree ("organization_id","idempotency_key");