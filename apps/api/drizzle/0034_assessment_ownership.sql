ALTER TABLE "assessments" ADD COLUMN "current_owner_membership_id" varchar(26);
--> statement-breakpoint
UPDATE "assessments" SET "current_owner_membership_id" = CASE
  WHEN "status" = 'UNDER_REVIEW' THEN "assigned_to_membership_id"
  WHEN "status" IN ('DRAFT', 'SCORED', 'SCORING_PENDING', 'SCORING_UNAVAILABLE') AND "clinical_review" IS NULL THEN "created_by_membership_id"
  ELSE NULL END;
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_current_owner_fk" FOREIGN KEY ("organization_id", "current_owner_membership_id") REFERENCES "public"."organization_memberships"("organization_id", "id");
--> statement-breakpoint
CREATE INDEX "assessments_org_current_owner_idx" ON "assessments" USING btree ("organization_id", "current_owner_membership_id");
