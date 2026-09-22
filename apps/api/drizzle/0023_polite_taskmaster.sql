CREATE TABLE "assessment_history" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"actor_id" varchar(26),
	"cycle" integer NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"request_key" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "assessment_score_reviews_revision_uidx";--> statement-breakpoint
ALTER TABLE "assessment_face_scans" ADD COLUMN "cycle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "clinical_review" jsonb;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "current_submission_id" varchar(26);--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "cycle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_history" ADD CONSTRAINT "assessment_history_organization_id_assessment_id_assessments_organization_id_id_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_history" ADD CONSTRAINT "assessment_history_organization_id_actor_id_organization_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_history_request_uidx" ON "assessment_history" USING btree ("assessment_id","actor_id","request_key");--> statement-breakpoint
CREATE INDEX "assessment_history_cycle_idx" ON "assessment_history" USING btree ("organization_id","assessment_id","cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_score_reviews_revision_uidx" ON "assessment_score_reviews" USING btree ("submission_id","revision");--> statement-breakpoint
-- Existing submissions become explicit current pointers; equal timestamps use the stable ID.
UPDATE assessments a SET current_submission_id = (
 SELECT s.id FROM assessment_submissions s
 WHERE s.organization_id=a.organization_id AND s.assessment_id=a.id
 ORDER BY s.created_at DESC,s.id DESC LIMIT 1
);
--> statement-breakpoint
UPDATE assessments a SET scored_at=s.updated_at
FROM assessment_submissions s WHERE s.id=a.current_submission_id AND s.status='SUCCEEDED';
--> statement-breakpoint
-- Do not infer clinical approval from legacy scoring completion timestamps.
-- Preserve the existing encrypted working snapshot as the history coverage baseline.
INSERT INTO assessment_history(id,organization_id,assessment_id,actor_id,cycle,revision,kind,payload,created_at)
SELECT id,organization_id,id,NULL,0,revision,'HISTORY_BASELINE',workflow,now()
FROM assessments WHERE workflow IS NOT NULL;
