ALTER TABLE "organizations" ADD COLUMN "next_assessment_serial" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "serial_number" integer;--> statement-breakpoint
WITH numbered AS (
 SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id)::integer AS serial_number FROM assessments
)
UPDATE assessments SET serial_number = numbered.serial_number FROM numbered WHERE assessments.id = numbered.id;--> statement-breakpoint
UPDATE organizations SET next_assessment_serial = COALESCE((SELECT MAX(serial_number) + 1 FROM assessments WHERE organization_id = organizations.id), 1);--> statement-breakpoint
ALTER TABLE assessments ALTER COLUMN serial_number SET NOT NULL;--> statement-breakpoint
ALTER TABLE assessments ALTER COLUMN serial_number SET DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX assessments_org_serial_uidx ON assessments (organization_id, serial_number);--> statement-breakpoint
ALTER TABLE assessments ADD CONSTRAINT assessments_serial_number_ck CHECK (serial_number > 0);--> statement-breakpoint
ALTER TABLE organizations ADD CONSTRAINT organizations_next_assessment_serial_ck CHECK (next_assessment_serial > 0);--> statement-breakpoint
-- Updating the organization row serializes concurrent allocations across all branches.
CREATE FUNCTION allocate_assessment_serial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.serial_number <> OLD.serial_number OR NEW.organization_id <> OLD.organization_id THEN
   RAISE EXCEPTION 'Assessment organization and serial are immutable';
  END IF;
 ELSE
  UPDATE organizations SET next_assessment_serial = next_assessment_serial + 1
  WHERE id = NEW.organization_id RETURNING next_assessment_serial - 1 INTO NEW.serial_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment organization does not exist'; END IF;
 END IF;
 RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER assessments_allocate_serial_trigger BEFORE INSERT OR UPDATE OF serial_number, organization_id ON assessments
FOR EACH ROW EXECUTE FUNCTION allocate_assessment_serial();
