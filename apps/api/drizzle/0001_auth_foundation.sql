CREATE TYPE "public"."platform_role" AS ENUM('USER', 'NIQ_ADMIN');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"membership_id" varchar(26) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_id_ulid_ck" CHECK ("auth_sessions"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "authentication_failures" (
	"principal_hash" varchar(64) PRIMARY KEY NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_failures_count_ck" CHECK ("authentication_failures"."failed_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invitation_facilities" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"invitation_id" varchar(26) NOT NULL,
	"facility_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_facilities_id_ulid_ck" CHECK ("invitation_facilities"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"membership_id" varchar(26) NOT NULL,
	"challenge_token_hash" text NOT NULL,
	"otp_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_challenges_attempts_ck" CHECK ("mfa_challenges"."attempts" >= 0 AND "mfa_challenges"."max_attempts" >= 1),
	CONSTRAINT "mfa_challenges_id_ulid_ck" CHECK ("mfa_challenges"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role" DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_id_uidx" ON "invitations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_id_user_uidx" ON "organization_memberships" USING btree ("organization_id","id","user_id");--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_org_membership_user_fk" FOREIGN KEY ("organization_id","membership_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_facilities" ADD CONSTRAINT "invitation_facilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_facilities" ADD CONSTRAINT "invitation_facilities_org_invitation_fk" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "public"."invitations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_facilities" ADD CONSTRAINT "invitation_facilities_org_facility_fk" FOREIGN KEY ("organization_id","facility_id") REFERENCES "public"."facilities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_org_membership_user_fk" FOREIGN KEY ("organization_id","membership_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uidx" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_facilities_invitation_facility_uidx" ON "invitation_facilities" USING btree ("invitation_id","facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_challenges_token_hash_uidx" ON "mfa_challenges" USING btree ("challenge_token_hash");--> statement-breakpoint
CREATE INDEX "mfa_challenges_user_idx" ON "mfa_challenges" USING btree ("user_id");--> statement-breakpoint
