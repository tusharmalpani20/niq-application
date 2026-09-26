CREATE TABLE "assessment_priorities" (
  "organization_id" varchar(26) NOT NULL,
  "assessment_id" varchar(26) NOT NULL,
  "membership_id" varchar(26) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assessment_priorities_assessment_fk" FOREIGN KEY ("organization_id", "assessment_id") REFERENCES "public"."assessments"("organization_id", "id"),
  CONSTRAINT "assessment_priorities_membership_fk" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "public"."organization_memberships"("organization_id", "id")
);
CREATE UNIQUE INDEX "assessment_priorities_owner_uidx" ON "assessment_priorities" USING btree ("organization_id", "assessment_id", "membership_id");
CREATE INDEX "assessment_priorities_membership_idx" ON "assessment_priorities" USING btree ("organization_id", "membership_id");
