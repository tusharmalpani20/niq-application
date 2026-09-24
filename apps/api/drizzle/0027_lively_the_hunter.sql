ALTER TABLE "assessment_submissions" ADD COLUMN "attestation" jsonb;

-- Scoring retries update submission status, but the original acknowledgement is fixed.
CREATE FUNCTION preserve_assessment_submission_attestation() RETURNS trigger AS $$
BEGIN
  IF NEW.attestation IS DISTINCT FROM OLD.attestation THEN
    RAISE EXCEPTION 'Assessment submission attestation is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_submission_attestation_immutable
BEFORE UPDATE ON assessment_submissions
FOR EACH ROW EXECUTE FUNCTION preserve_assessment_submission_attestation();
