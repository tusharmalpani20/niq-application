ALTER TABLE "organizations" ALTER COLUMN "primary_color" SET DEFAULT '#3BB9BD';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "secondary_color" SET DEFAULT '#4F5052';--> statement-breakpoint
-- Move only organizations still using the previous default pair.
UPDATE "organizations"
SET "primary_color" = '#3BB9BD', "secondary_color" = '#4F5052'
WHERE upper("primary_color") = '#0E9384' AND upper("secondary_color") = '#175CD3';
