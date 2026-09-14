ALTER TABLE "organization_entitlements" DROP CONSTRAINT "organization_entitlements_scoring_limit_ck";--> statement-breakpoint
ALTER TABLE "organization_entitlements" DROP CONSTRAINT "organization_entitlements_face_scan_limit_ck";--> statement-breakpoint
ALTER TABLE "organization_entitlements" DROP COLUMN "scoring_monthly_limit";--> statement-breakpoint
ALTER TABLE "organization_entitlements" DROP COLUMN "face_scan_monthly_limit";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "deployment_mode";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "scoring_enabled";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "face_scan_enabled";--> statement-breakpoint
DROP TYPE "public"."deployment_mode";