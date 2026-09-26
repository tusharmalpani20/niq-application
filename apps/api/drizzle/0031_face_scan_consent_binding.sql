CREATE UNIQUE INDEX "face_scan_consents_org_id_uidx" ON "face_scan_consents" USING btree ("organization_id","id");
ALTER TABLE "assessment_face_scans" ADD COLUMN "consent_id" varchar(26);
ALTER TABLE "assessment_face_scans" ADD CONSTRAINT "assessment_face_scans_org_consent_fk" FOREIGN KEY ("organization_id","consent_id") REFERENCES "public"."face_scan_consents"("organization_id","id");
