ALTER TABLE "push_subscriptions" ADD COLUMN "session_id" varchar(26) REFERENCES "auth_sessions"("id");
--> statement-breakpoint
CREATE INDEX "push_subscriptions_session_idx" ON "push_subscriptions" ("session_id");
