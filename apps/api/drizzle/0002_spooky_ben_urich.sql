ALTER TABLE "mfa_challenges" DROP CONSTRAINT "mfa_challenges_attempts_ck";--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD COLUMN "resend_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD COLUMN "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_attempts_ck" CHECK ("mfa_challenges"."attempts" >= 0 AND "mfa_challenges"."max_attempts" >= 1 AND "mfa_challenges"."resend_count" >= 0);