-- Rename in place so existing accounts, invitations, and column defaults retain their role.
ALTER TYPE "public"."membership_role" RENAME VALUE 'MEDICAL' TO 'OTHER_MEDICAL';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE 'DOCTOR' BEFORE 'OTHER_MEDICAL';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE 'NUTRITIONIST' BEFORE 'OTHER_MEDICAL';
