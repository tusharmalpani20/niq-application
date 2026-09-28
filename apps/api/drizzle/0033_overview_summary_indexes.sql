CREATE INDEX "patients_overview_recent_idx" ON "patients" USING btree ("organization_id", "created_at") WHERE "is_archived" = false;
CREATE INDEX "assessments_overview_patient_recent_idx" ON "assessments" USING btree ("organization_id", "patient_id", "created_at");
CREATE INDEX "assessments_overview_completed_idx" ON "assessments" USING btree ("organization_id", "completed_at") WHERE "status" = 'COMPLETED';
