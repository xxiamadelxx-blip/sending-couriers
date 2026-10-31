"""M3 append-only snapshot/evaluation storage and schema v3 -> v4 migration."""
import pathlib
import re
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
M2 = (ROOT / "web/m2_schema_v1.sql").read_text(encoding="utf8")
VIEWS = (ROOT / "web/m2_views_v2.sql").read_text(encoding="utf8")
M3 = (ROOT / "web/m3_schema_v1.sql").read_text(encoding="utf8")


class M3SchemaMigrationTest(unittest.TestCase):
    def database_at_v3(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(M2)
        db.executescript(VIEWS)
        db.execute("""INSERT INTO forecast_snapshots
            (id,target_date,created_at,model_version,training_cutoff,center_orders,
             lower_orders,upper_orders,confidence,comparable_n,baseline_orders,payload_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("forecast-1","2026-10-20","2026-10-19T06:00:00Z","native-count-1",
             "2026-10-18",12,5,18,"limited",8,11,'{"zone":"Europe/Moscow"}'))
        db.execute("""INSERT INTO forecast_evaluations
            (id,forecast_id,fact_revision,evaluated_at,factual_orders,signed_error,
             absolute_error,interval_covers_fact,payload_json)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            ("evaluation-1","forecast-1","revision-1","2026-10-21T06:00:00Z",
             13,-1,1,1,"{}"))
        db.execute("""INSERT INTO model_registry
            (id,version,trained_at,training_cutoff,payload_json,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?)""",
            ("model-1","native-count-1","2026-10-19T06:00:00Z","2026-10-18","{}","now","now"))
        db.execute("PRAGMA user_version=3")
        return db

    def test_v3_to_v4_preserves_facts_and_installs_immutable_triggers(self):
        db = self.database_at_v3()
        before = db.execute("SELECT id,center_orders FROM forecast_snapshots").fetchall()
        db.executescript(M3)
        db.execute("PRAGMA user_version=4")
        self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 4)
        self.assertEqual(db.execute("SELECT id,center_orders FROM forecast_snapshots").fetchall(), before)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM forecast_evaluations").fetchone()[0], 1)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'tr_%immutable_%'").fetchone()[0], 6)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE forecast_evaluations SET factual_orders=99")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM forecast_evaluations")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE model_registry SET version='overwritten'")
        db.close()

    def test_migration_from_shipped_v1_and_v2_is_additive_and_idempotent(self):
        pre_archive = M2.split("-- Source-row archive", 1)[0]
        for version in (1, 2):
            with self.subTest(version=version):
                db = sqlite3.connect(":memory:")
                db.execute("PRAGMA foreign_keys=ON")
                db.executescript(pre_archive)
                if version == 2:
                    db.executescript(VIEWS)
                db.execute("""INSERT INTO legacy_slot_facts
                    (id,date,order_count,accounted_hundredths,raw_json,source,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?)""",
                    ("slot","2026-10-18",12,650,"{}","legacy_state","now","now"))
                db.execute("PRAGMA user_version=" + str(version))
                # Same additive SQL strategy used by CourierDatabase.onUpgrade.
                upgrade = re.sub(r"(?im)^\s*--[^\r\n]*", "", M2)
                for kind in ("TABLE", "INDEX", "TRIGGER"):
                    upgrade = re.sub(r"(?i)\bCREATE\s+" + kind + r"\s+(?!IF\s+NOT\s+EXISTS)",
                                     "CREATE " + kind + " IF NOT EXISTS ", upgrade)
                db.executescript(upgrade)
                db.executescript(VIEWS)
                db.executescript(M3)
                db.execute("PRAGMA user_version=4")
                db.executescript(upgrade)
                db.executescript(VIEWS)
                db.executescript(M3)
                self.assertEqual(db.execute("SELECT accounted_hundredths FROM legacy_slot_facts").fetchone()[0], 650)
                self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(db.execute("SELECT COUNT(*) FROM forecast_snapshots").fetchone()[0], 0)
                db.close()

    def test_android_helper_exposes_the_v5_upgrade_path(self):
        source = (ROOT / "android/src/ru/courier/finance/CourierDatabase.java").read_text()
        self.assertIn("public static final int VERSION = 5;", source)
        self.assertIn('applySchema(db, "www/m3_schema_v1.sql");', source)
        self.assertIn("from == 1 || from == 2) && to == 5", source)
        self.assertIn("from == 3 || from == 4) && to == 5", source)


if __name__ == "__main__":
    unittest.main()
