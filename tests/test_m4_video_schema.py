"""M4 local video evidence schema is separate from user finance facts."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "web/m4_schema_v1.sql").read_text(encoding="utf8")


class M4VideoSchemaTest(unittest.TestCase):
    def test_private_evidence_is_not_added_to_android_backup_allowlist(self):
        backup = (ROOT / "android/res/xml/backup_rules.xml").read_text(encoding="utf8")
        extraction = (ROOT / "android/res/xml/data_extraction_rules.xml").read_text(encoding="utf8")
        self.assertNotIn("database", backup)
        self.assertNotIn("files", backup)
        self.assertNotIn("database", extraction)
        self.assertNotIn("files", extraction)

    def test_schema_keeps_extraction_evidence_and_unknown_review_queue(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA)
        db.execute("""INSERT INTO m4_video_imports
            (id,source_sha256,mime_type,byte_size,duration_ms,parser_version,ocr_engine_version,created_at_utc)
            VALUES(?,?,?,?,?,?,?,?)""",
            ("video-1", "a" * 64, "video/mp4", 1000, 4000, "p1", "ocr1", "now"))
        db.execute("""INSERT INTO m4_screen_observations
            (id,import_id,frame_index,timestamp_ms,timestamp_basis,frame_sha256,screen_type,parse_reason,
             ocr_text,ocr_confidence,parser_version,created_at_utc)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("obs-1", "video-1", 0, 1000, "requested_nearest_sync", "b" * 64, "UNKNOWN", "unknown_screen_signature",
             "личный текст", 0.5, "p1", "now"))
        db.execute("""INSERT INTO m4_unknown_screen_queue
            (id,observation_id,screenshot_path,created_at_utc,updated_at_utc)
            VALUES(?,?,?,?,?)""", ("queue-1", "obs-1", "m4-review/frame.jpg", "now", "now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE m4_screen_observations SET ocr_text='changed'")
        # Review status is mutable while the original observation stays fixed.
        db.execute("UPDATE m4_unknown_screen_queue SET review_status='ignored', updated_at_utc='later'")
        self.assertEqual(db.execute("SELECT ocr_text FROM m4_screen_observations").fetchone()[0], "личный текст")
        self.assertEqual(db.execute("SELECT review_status FROM m4_unknown_screen_queue").fetchone()[0], "ignored")
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        # The owner can delete local video evidence; child rows cascade.
        db.execute("DELETE FROM m4_video_imports WHERE id='video-1'")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM m4_screen_observations").fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM m4_unknown_screen_queue").fetchone()[0], 0)
        db.close()


if __name__ == "__main__":
    unittest.main()
