ALTER TABLE "organizations" ADD COLUMN "patient_reference_prefix" varchar(12) DEFAULT 'PAT' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "next_patient_serial" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "reference_prefix" varchar(12) DEFAULT 'PAT' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "serial_number" integer;--> statement-breakpoint
WITH "numbered_patients" AS (
	SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id")::integer AS "serial_number"
	FROM "patients"
)
UPDATE "patients"
SET "serial_number" = "numbered_patients"."serial_number"
FROM "numbered_patients"
WHERE "patients"."id" = "numbered_patients"."id";--> statement-breakpoint
UPDATE "organizations"
SET "next_patient_serial" = COALESCE((
	SELECT MAX("patients"."serial_number") + 1
	FROM "patients"
	WHERE "patients"."organization_id" = "organizations"."id"
), 1);--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "serial_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "serial_number" SET DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX "patients_org_serial_uidx" ON "patients" USING btree ("organization_id","serial_number");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_patient_reference_prefix_ck" CHECK ("organizations"."patient_reference_prefix" ~ '^[A-Z][A-Z0-9]{1,11}$');--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_next_patient_serial_ck" CHECK ("organizations"."next_patient_serial" > 0);--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_reference_prefix_ck" CHECK ("patients"."reference_prefix" ~ '^[A-Z][A-Z0-9]{1,11}$');--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_serial_number_ck" CHECK ("patients"."serial_number" > 0);--> statement-breakpoint
CREATE OR REPLACE FUNCTION allocate_patient_serial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	issued_prefix varchar(12);
BEGIN
	IF NEW.serial_number = 0 THEN
		UPDATE organizations
		SET next_patient_serial = next_patient_serial + 1
		WHERE id = NEW.organization_id
		RETURNING patient_reference_prefix, next_patient_serial - 1
		INTO issued_prefix, NEW.serial_number;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'Patient organization does not exist';
		END IF;

		NEW.reference_prefix := issued_prefix;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER patients_allocate_serial_trigger
BEFORE INSERT ON patients
FOR EACH ROW
EXECUTE FUNCTION allocate_patient_serial();
