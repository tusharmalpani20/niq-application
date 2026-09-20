ALTER TABLE "assessment_face_scans" ADD COLUMN "is_current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_face_scans_current_uidx" ON "assessment_face_scans" USING btree ("organization_id","assessment_id") WHERE "assessment_face_scans"."is_current" = true;--> statement-breakpoint
-- Preserve the existing displayed selection once; future changes use the assessment lock.
UPDATE assessment_face_scans scans SET is_current = true
FROM (
  SELECT DISTINCT ON (organization_id, assessment_id) id
  FROM assessment_face_scans
  ORDER BY organization_id, assessment_id, created_at DESC, id DESC
) latest
WHERE scans.id = latest.id;
