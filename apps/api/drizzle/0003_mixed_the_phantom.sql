CREATE TYPE "public"."deployment_mode" AS ENUM('NIQ_HOSTED', 'CLIENT_CLOUD', 'ON_PREM');--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD COLUMN "scoring_monthly_limit" integer;--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD COLUMN "face_scan_monthly_limit" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deployment_mode" "deployment_mode" DEFAULT 'NIQ_HOSTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "scoring_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "face_scan_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_scoring_limit_ck" CHECK ("organization_entitlements"."scoring_monthly_limit" IS NULL OR "organization_entitlements"."scoring_monthly_limit" >= 0);--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_face_scan_limit_ck" CHECK ("organization_entitlements"."face_scan_monthly_limit" IS NULL OR "organization_entitlements"."face_scan_monthly_limit" >= 0);