CREATE TABLE "face_scan_consents" (
  "id" varchar(26) PRIMARY KEY NOT NULL,
  "organization_id" varchar(26) NOT NULL,
  "assessment_id" varchar(26) NOT NULL,
  "patient_id" varchar(26) NOT NULL,
  "actor_id" varchar(26) NOT NULL,
  "cycle" integer NOT NULL,
  "method" text NOT NULL,
  "provenance" text NOT NULL,
  "status" text NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "requested_at" timestamp with time zone,
  "responded_at" timestamp with time zone,
  "file_name" text,
  "media_type" text,
  "size" integer,
  "sha256" text,
  "object_key" text,
  "upload_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "face_scan_consents_method_ck" CHECK ("method" in ('LINK','UPLOAD')),
  CONSTRAINT "face_scan_consents_provenance_ck" CHECK ("provenance" in ('SIMULATED','SIGNED_UPLOAD')),
  CONSTRAINT "face_scan_consents_status_ck" CHECK ("status" in ('REQUESTED','APPROVED')),
  CONSTRAINT "face_scan_consents_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id"),
  CONSTRAINT "face_scan_consents_org_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "public"."patients"("organization_id","id"),
  CONSTRAINT "face_scan_consents_org_actor_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."organization_memberships"("organization_id","id")
);
CREATE UNIQUE INDEX "face_scan_consents_current_uidx" ON "face_scan_consents" USING btree ("organization_id","assessment_id") WHERE "is_current" = true;
CREATE UNIQUE INDEX "face_scan_consents_upload_uidx" ON "face_scan_consents" USING btree ("organization_id","upload_key");
CREATE INDEX "face_scan_consents_assessment_idx" ON "face_scan_consents" USING btree ("organization_id","assessment_id","created_at");
