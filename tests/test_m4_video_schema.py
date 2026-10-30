"""M4 evidence stays local; cross-checked facts are stored separately."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA_V1 = (ROOT / "web/m4_schema_v1.sql").read_text(encoding="utf8")
SCHEMA_V2 = (ROOT / "web/m4_schema_v2.sql").read_text(encoding="utf8")
SCHEMA_V3 = (ROOT / "web/m4_schema_v3.sql").read_text(encoding="utf8")
MIGRATION_V1_TO_V2 = (ROOT / "web/m4_migration_v1_to_v2.sql").read_text(encoding="utf8")
MIGRATION_V2_TO_V3 = (ROOT / "web/m4_migration_v2_to_v3.sql").read_text(encoding="utf8")


def insert_v1_evidence(db):
    db.execute("""INSERT INTO m4_video_imports
        (id,source_sha256,mime_type,byte_size,duration_ms,parser_version,ocr_engine_version,created_at_utc)
        VALUES(?,?,?,?,?,?,?,?)""",
        ("video-1", "a" * 64, "video/mp4", 1000, 4000, "p1", "ocr1", "now"))
    db.execute("""INSERT INTO m4_screen_observations
        (id,import_id,frame_index,timestamp_ms,timestamp_basis,frame_sha256,screen_type,parse_reason,
         ocr_text,ocr_confidence,parser_version,created_at_utc)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("obs-1", "video-1", 0, 1000, "requested_nearest_sync", "b" * 64, "UNKNOWN", "unknown_screen_signature",
         "private OCR text", 0.5, "p1", "now"))
    db.execute("""INSERT INTO m4_unknown_screen_queue
        (id,observation_id,screenshot_path,created_at_utc,updated_at_utc)
        VALUES(?,?,?,?,?)""", ("queue-1", "obs-1", "m4-review/frame.jpg", "now", "now"))


class M4VideoSchemaTest(unittest.TestCase):
    def test_forecast_screen_exposes_video_import_action(self):
        forecast_ui = (ROOT / "web/forecast-ui.mjs").read_text(encoding="utf8")
        self.assertIn('id="importForecastVideo"', forecast_ui)
        self.assertIn("Импортировать видео", forecast_ui)
        self.assertIn("Native.importVideo()", forecast_ui)

    def test_export_provider_authority_is_unique_for_each_qa_package(self):
        manifest = (ROOT / "android/AndroidManifest.xml").read_text(encoding="utf8")
        provider = (ROOT / "android/src/ru/courier/finance/ExportProvider.java").read_text(encoding="utf8")
        self.assertIn('android:authorities="${applicationId}.exports"', manifest)
        self.assertIn('getContext().getPackageName()+".exports"', provider)

    def test_private_evidence_is_not_added_to_android_backup_allowlist(self):
        backup = (ROOT / "android/res/xml/backup_rules.xml").read_text(encoding="utf8")
        extraction = (ROOT / "android/res/xml/data_extraction_rules.xml").read_text(encoding="utf8")
        self.assertNotIn("database", backup)
        self.assertNotIn("files", backup)
        self.assertNotIn("database", extraction)
        self.assertNotIn("files", extraction)

    def test_new_schema_records_closest_frame_method_and_keeps_candidate_import_available(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA_V3)
        insert_v1_evidence(db)
        self.assertEqual(db.execute("SELECT frame_selection_method FROM m4_screen_observations WHERE id='obs-1'").fetchone()[0], "closest_sync")
        db.execute("""INSERT INTO m4_screen_observations
            (id,import_id,frame_index,timestamp_ms,timestamp_basis,frame_selection_method,frame_sha256,
             screen_type,parse_reason,ocr_text,ocr_confidence,parser_version,created_at_utc)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("obs-2", "video-1", 1, 1500, "requested_nearest_sync", "closest_frame", "c" * 64,
             "ORDERS", "order_fields_extracted", "orders", 0.9, "p2", "later"))
        self.assertEqual(db.execute("SELECT frame_selection_method FROM m4_screen_observations WHERE id='obs-2'").fetchone()[0], "closest_frame")
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()

    def test_v2_to_v3_migration_preserves_observations_and_unknown_queue(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA_V2)
        insert_v1_evidence(db)
        db.executescript(MIGRATION_V2_TO_V3)
        self.assertEqual(db.execute("SELECT ocr_text FROM m4_screen_observations WHERE id='obs-1'").fetchone()[0], "private OCR text")
        self.assertEqual(db.execute("SELECT screenshot_path FROM m4_unknown_screen_queue WHERE id='queue-1'").fetchone()[0], "m4-review/frame.jpg")
        self.assertEqual(db.execute("SELECT frame_selection_method FROM m4_screen_observations WHERE id='obs-1'").fetchone()[0], "closest_sync")
        db.execute("""INSERT INTO m4_screen_observations
            (id,import_id,frame_index,timestamp_ms,timestamp_basis,frame_selection_method,frame_sha256,
             screen_type,parse_reason,ocr_text,ocr_confidence,parser_version,created_at_utc)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("obs-2", "video-1", 1, 1500, "requested_nearest_sync", "closest_frame", "c" * 64,
             "ORDERS", "order_fields_extracted", "orders", 0.9, "p2", "later"))
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()

    def test_fresh_v2_schema_keeps_candidates_immutable_and_reviewable(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA_V2)
        insert_v1_evidence(db)
        candidate = '{"type":"ORDER_DETAIL","fields":{"total_kopecks":12345}}'
        db.execute("""INSERT INTO m4_extracted_candidates
            (id,observation_id,candidate_type,candidate_json,rule_score,created_at_utc)
            VALUES(?,?,?,?,?,?)""", ("candidate-1", "obs-1", "ORDER_DETAIL", candidate, 0.92, "now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE m4_extracted_candidates SET candidate_json='{}' WHERE id='candidate-1'")
        db.execute("UPDATE m4_extracted_candidates SET review_status='accepted' WHERE id='candidate-1'")
        db.execute("UPDATE m4_unknown_screen_queue SET review_status='ignored', updated_at_utc='later'")
        self.assertEqual(db.execute("SELECT candidate_json FROM m4_extracted_candidates").fetchone()[0], candidate)
        self.assertEqual(db.execute("SELECT review_status FROM m4_extracted_candidates").fetchone()[0], "accepted")
        self.assertEqual(db.execute("SELECT ocr_text FROM m4_screen_observations").fetchone()[0], "private OCR text")
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.execute("DELETE FROM m4_video_imports WHERE id='video-1'")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM m4_extracted_candidates").fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM m4_screen_observations").fetchone()[0], 0)
        db.close()

    def test_v1_to_v2_migration_preserves_existing_ocr_and_unknown_queue(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA_V1)
        insert_v1_evidence(db)
        db.executescript(MIGRATION_V1_TO_V2)
        self.assertEqual(db.execute("SELECT ocr_text FROM m4_screen_observations WHERE id='obs-1'").fetchone()[0], "private OCR text")
        self.assertEqual(db.execute("SELECT screenshot_path FROM m4_unknown_screen_queue WHERE id='queue-1'").fetchone()[0], "m4-review/frame.jpg")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM m4_extracted_candidates").fetchone()[0], 0)
        db.execute("""INSERT INTO m4_extracted_candidates
            (id,observation_id,candidate_type,candidate_json,rule_score,created_at_utc)
            VALUES(?,?,?,?,?,?)""", ("candidate-1", "obs-1", "ORDER_DETAIL", "{}", 0.8, "later"))
        db.executescript(MIGRATION_V2_TO_V3)
        self.assertEqual(db.execute("SELECT frame_selection_method FROM m4_screen_observations WHERE id='obs-1'").fetchone()[0], "closest_sync")
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()


if __name__ == "__main__":
    unittest.main()
