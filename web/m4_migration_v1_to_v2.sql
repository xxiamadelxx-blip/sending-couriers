-- Preserve all v1 OCR rows; add parsed, review-only candidates.
CREATE TABLE IF NOT EXISTS m4_extracted_candidates (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES m4_screen_observations(id) ON DELETE CASCADE,
  candidate_type TEXT NOT NULL CHECK(candidate_type IN ('ORDER_DETAIL','ORDER_LIST_ROW','SLOT_DETAIL','INCOME_SUMMARY','INCOME_LINE')),
  candidate_json TEXT NOT NULL,
  rule_score REAL NOT NULL CHECK(rule_score>=0 AND rule_score<=1),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','ignored')),
  reviewer_note TEXT,
  created_at_utc TEXT NOT NULL,
  UNIQUE(observation_id,candidate_type,candidate_json)
);
CREATE INDEX IF NOT EXISTS idx_m4_candidates_pending
  ON m4_extracted_candidates(review_status,created_at_utc);
CREATE TRIGGER IF NOT EXISTS tr_m4_candidates_immutable_evidence
BEFORE UPDATE OF observation_id,candidate_type,candidate_json,rule_score,created_at_utc ON m4_extracted_candidates BEGIN
  SELECT RAISE(ABORT,'M4 extracted candidates are immutable');
END;
