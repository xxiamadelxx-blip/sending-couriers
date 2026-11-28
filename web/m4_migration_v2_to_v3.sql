-- Retain all existing OCR evidence while recording the frame retrieval mode.
ALTER TABLE m4_screen_observations
  ADD COLUMN frame_selection_method TEXT NOT NULL DEFAULT 'closest_sync'
  CHECK(frame_selection_method IN ('closest_sync','closest_frame'));
