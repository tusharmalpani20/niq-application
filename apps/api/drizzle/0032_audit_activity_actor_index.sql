CREATE INDEX "audit_events_org_actor_occurred_idx" ON "audit_events" USING btree ("organization_id", "actor_membership_id", "occurred_at");
