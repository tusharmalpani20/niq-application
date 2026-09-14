ALTER TYPE "public"."patient_sex" RENAME TO "patient_gender";--> statement-breakpoint
ALTER TABLE "patients" RENAME COLUMN "sex" TO "gender";