ALTER TABLE "assessments" ADD COLUMN "final_score" double precision;
ALTER TABLE "assessments" ADD COLUMN "final_risk_category" text;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_final_score_ck" CHECK ("final_score" IS NULL OR ("final_score" >= 0 AND "final_score" <= 9007199254740991));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_final_risk_category_ck" CHECK ("final_risk_category" IS NULL OR "final_risk_category" IN ('low', 'moderate', 'high'));
CREATE INDEX "assessments_completed_patient_latest_idx" ON "assessments" USING btree ("organization_id", "patient_id", "completed_at" DESC, "id" DESC) WHERE "status" = 'COMPLETED';

-- Backfill decrypted, clinically approved values without changing completion history.
CREATE FUNCTION "backfill_assessment_final_result"(
  p_organization_id varchar(26),
  p_assessment_id varchar(26),
  p_score double precision,
  p_category text
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  matched_rows integer;
BEGIN
  IF p_score IS NOT NULL AND (p_score < 0 OR p_score > 9007199254740991 OR p_score = 'NaN'::double precision) THEN
    RAISE EXCEPTION 'Invalid final score';
  END IF;
  IF p_category IS NOT NULL AND p_category NOT IN ('low', 'moderate', 'high') THEN
    RAISE EXCEPTION 'Invalid final risk category';
  END IF;

  UPDATE "assessments"
  SET "final_score" = p_score, "final_risk_category" = p_category
  WHERE "organization_id" = p_organization_id
    AND "id" = p_assessment_id
    AND "status" = 'COMPLETED';
  GET DIAGNOSTICS matched_rows = ROW_COUNT;
  RETURN matched_rows = 1;
END;
$$;
