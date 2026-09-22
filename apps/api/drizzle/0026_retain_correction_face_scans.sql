-- Older return-to-draft commands cleared the selected completed scan. Restore only
-- the latest attempt for an existing correction draft with no newer selection.
-- Failed/replaced attempts never fall back to an earlier successful scan.
WITH latest AS (
  SELECT DISTINCT ON (s.organization_id, s.assessment_id) s.*
  FROM assessment_face_scans s
  ORDER BY s.organization_id, s.assessment_id, s.created_at DESC, s.id DESC
)
UPDATE assessment_face_scans s
SET is_current = true
FROM latest l, assessments a
WHERE s.id = l.id
  AND a.id = l.assessment_id AND a.organization_id = l.organization_id
  AND a.status = 'DRAFT' AND a.cycle > l.cycle
  AND l.state = 'COMPLETED' AND l.projection IS NOT NULL AND l.active = false
  AND NOT EXISTS (
    SELECT 1 FROM assessment_face_scans current_scan
    WHERE current_scan.organization_id = a.organization_id
      AND current_scan.assessment_id = a.id AND current_scan.is_current = true
  );
