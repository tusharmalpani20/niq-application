CREATE TABLE "generated_reports" (
  "id" varchar(26) PRIMARY KEY NOT NULL,
  "organization_id" varchar(26) NOT NULL,
  "assessment_id" varchar(26) NOT NULL,
  "patient_id" varchar(26) NOT NULL,
  "submission_id" varchar(26) NOT NULL,
  "request_key" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "status" text DEFAULT 'GENERATING' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "run_id" text,
  "content" jsonb,
  "failure_code" text,
  "approved_by_membership_id" varchar(26),
  "approved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "generated_reports_status_ck" CHECK ("status" in ('GENERATING','DRAFT','APPROVED','FAILED','STALE')),
  CONSTRAINT "generated_reports_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "assessments"("organization_id","id"),
  CONSTRAINT "generated_reports_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "patients"("organization_id","id"),
  CONSTRAINT "generated_reports_submission_fk" FOREIGN KEY ("organization_id","assessment_id","submission_id") REFERENCES "assessment_submissions"("organization_id","assessment_id","id")
);
CREATE UNIQUE INDEX "generated_reports_org_id_uidx" ON "generated_reports" ("organization_id","id");
CREATE UNIQUE INDEX "generated_reports_request_uidx" ON "generated_reports" ("organization_id","assessment_id","request_key");
CREATE INDEX "generated_reports_latest_idx" ON "generated_reports" ("organization_id","assessment_id","created_at" DESC);

CREATE TABLE "generated_report_artifacts" (
  "report_id" varchar(26) PRIMARY KEY NOT NULL,
  "organization_id" varchar(26) NOT NULL,
  "assessment_id" varchar(26) NOT NULL,
  "revision" integer NOT NULL,
  "sha256" text NOT NULL,
  "size" integer NOT NULL,
  "encrypted_pdf" bytea NOT NULL,
  "uploaded_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "generated_report_artifacts_size_ck" CHECK ("size" > 0 AND "size" <= 10485760),
  CONSTRAINT "generated_report_artifacts_report_fk" FOREIGN KEY ("organization_id","report_id") REFERENCES "generated_reports"("organization_id","id")
);
