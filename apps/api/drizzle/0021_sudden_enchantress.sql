CREATE TABLE "assessment_score_reviews" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"submission_id" varchar(26) NOT NULL,
	"actor_id" varchar(26) NOT NULL,
	"revision" integer NOT NULL,
	"request_key" text NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_score_reviews_revision_ck" CHECK ("assessment_score_reviews"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "assessment_score_reviews" ADD CONSTRAINT "assessment_score_reviews_submission_id_assessment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assessment_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score_reviews" ADD CONSTRAINT "assessment_score_reviews_organization_id_assessment_id_assessments_organization_id_id_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score_reviews" ADD CONSTRAINT "assessment_score_reviews_organization_id_actor_id_organization_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_score_reviews_revision_uidx" ON "assessment_score_reviews" USING btree ("assessment_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_score_reviews_request_uidx" ON "assessment_score_reviews" USING btree ("assessment_id","actor_id","request_key");--> statement-breakpoint
CREATE FUNCTION prevent_score_review_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Score review history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER assessment_score_reviews_immutable BEFORE UPDATE OR DELETE ON assessment_score_reviews FOR EACH ROW EXECUTE FUNCTION prevent_score_review_mutation();
