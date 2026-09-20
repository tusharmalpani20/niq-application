ALTER TABLE "assessment_face_scans" ADD COLUMN "remote_request_key" text;--> statement-breakpoint
ALTER TABLE "assessment_face_scans" ADD COLUMN "reconciliation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing rows may have lost a create response before this counter existed.
-- Preserve their legacy remote key and never classify a replay as a first request.
UPDATE assessment_face_scans SET reconciliation_attempts = 1;
