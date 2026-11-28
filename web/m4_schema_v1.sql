-- M4 stores local extraction evidence separately from financial facts.
-- No OCR result is an order or payment until a later review/import milestone.
CREATE TABLE IF NOT EXISTS m4_video_imports (
  id TEXT PRIMARY KEY,
  source_sha256 TEXT NOT NULL UNIQUE CHECK(length(source_sha256)=64),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('video/mp4','video/quicktime')),
  byte_size INTEGER NOT NULL CHECK(byte_size>0),
  duration_ms INTEGER NOT NULL CHECK(duration_ms>0),
  parser_version TEXT NOT NULL,
  ocr_engine_version TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS m4_screen_observations (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES m4_video_imports(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL CHECK(frame_index>=0),
  timestamp_ms INTEGER NOT NULL CHECK(timestamp_ms>=0),
  timestamp_basis TEXT NOT NULL CHECK(timestamp_basis='requested_nearest_sync'),
  frame_sha256 TEXT NOT NULL CHECK(length(frame_sha256)=64),
  screen_type TEXT NOT NULL CHECK(screen_type IN ('ORDERS','INCOME','ACTIVITY','YANDEX_UNKNOWN','UNKNOWN')),
  parse_reason TEXT NOT NULL,
  ocr_text TEXT NOT NULL,
  ocr_confidence REAL NOT NULL CHECK(ocr_confidence>=0 AND ocr_confidence<=1),
  parser_version TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  UNIQUE(import_id,frame_index)
);
CREATE TABLE IF NOT EXISTS m4_unknown_screen_queue (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL UNIQUE REFERENCES m4_screen_observations(id) ON DELETE CASCADE,
  screenshot_path TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','ignored')),
  reviewer_note TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m4_observations_import_time
  ON m4_screen_observations(import_id,timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_m4_unknown_pending
  ON m4_unknown_screen_queue(review_status,created_at_utc);
CREATE TRIGGER IF NOT EXISTS tr_m4_observations_immutable_update
BEFORE UPDATE ON m4_screen_observations BEGIN
  SELECT RAISE(ABORT,'M4 extraction observations are immutable');
END;
