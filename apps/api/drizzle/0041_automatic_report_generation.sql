ALTER TABLE "generated_reports" DROP CONSTRAINT "generated_reports_status_ck";
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_status_ck" CHECK ("status" in ('QUEUED','GENERATING','DRAFT','READY','APPROVED','FAILED','STALE'));
ALTER TABLE "generated_reports" ADD COLUMN "next_attempt_at" timestamptz;
ALTER TABLE "generated_reports" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "generated_reports" ADD COLUMN "lease_token" varchar(26);
