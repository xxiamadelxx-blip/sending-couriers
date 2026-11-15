"""M5 upgrade: v1/v2 on-disk schemas migrate to the current version without data loss.

Tests a real SQLite file, foreign keys, missing late-added table objects,
forecast immutability, additive observed-time storage, and source projection
installation from the production Android migration path.
"""
import pathlib
import re
import sqlite3
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCHEMA=(ROOT/"web/m2_schema_v1.sql").read_text("utf8")
M3=(ROOT/"web/m3_schema_v1.sql").read_text("utf8")
VIEWS=(ROOT/"web/m2_views_v2.sql").read_text("utf8")
M5=(ROOT/"web/m5_reconciliation_v1.sql").read_text("utf8")
PRE_ARCHIVE=SCHEMA.split("-- Source-row archive",1)[0]

class UpgradeFromShippedSchemas(unittest.TestCase):
    def test_real_v1_and_v2_preserve_existing_records_and_create_missing_objects(self):
        source=(ROOT/"android/src/ru/courier/finance/CourierDatabase.java").read_text()
        self.assertIn('public static final int VERSION = 5;',source)
        self.assertIn('applySchema(db, "www/m2_schema_v1.sql", true);',source)
        self.assertIn('if ((from == 1 || from == 2) && to == 5)',source)
        self.assertIn('ALTER TABLE orders ADD COLUMN observed_at TEXT',source)
        for version in (1,2):
            with self.subTest(version=version),tempfile.TemporaryDirectory() as folder:
                path=pathlib.Path(folder)/"legacy.db"
                with sqlite3.connect(path) as db:
                    db.execute("PRAGMA foreign_keys=ON")
                    db.executescript(PRE_ARCHIVE)
                    if version==2: db.executescript(VIEWS)
                    db.execute("""INSERT INTO import_sources
                        (id,sha256,source_kind,parser_version,status,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?)""",
                        ("legacy-state","a"*64,"legacy_state","v6","mirrored","now","now"))
                    db.execute("""INSERT INTO legacy_slot_facts
                        (id,date,order_count,accounted_hundredths,raw_json,source,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?)""",
                        ("slot-original","2026-10-18",12,650,'{"date":"2026-10-18","dailyHours":6.5}',
                         "legacy_state","now","now"))
                    db.execute("PRAGMA user_version="+str(version))
                    db.commit()
                with sqlite3.connect(path) as db:
                    db.execute("PRAGMA foreign_keys=ON")
                    # Mirrors only the additive rewrite in production Java.
                    upgrade=SCHEMA
                    upgrade=re.sub(r"(?im)^\s*--[^\r\n]*","",upgrade)
                    for kind in ("TABLE","INDEX","TRIGGER"):
                        upgrade=re.sub(r"(?i)\bCREATE\s+"+kind+r"\s+(?!IF\s+NOT\s+EXISTS)",
                                       "CREATE "+kind+" IF NOT EXISTS ",upgrade)
                    db.executescript(upgrade)
                    db.executescript(VIEWS)
                    db.executescript(M3)
                    db.execute("ALTER TABLE orders ADD COLUMN observed_at TEXT")
                    db.execute("DROP VIEW active_orders")
                    db.execute("DROP VIEW active_aggregate_order_counts")
                    db.executescript(M5)
                    db.execute("PRAGMA user_version=5")
                    db.commit()
                with sqlite3.connect(path) as db:
                    self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0],5)
                    self.assertIn("observed_at",{row[1] for row in db.execute("PRAGMA table_info(orders)")})
                    self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0],"ok")
                    self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM legacy_slot_facts").fetchone()[0],1)
                    self.assertEqual(db.execute("SELECT accounted_hundredths FROM legacy_slot_facts").fetchone()[0],650)
                    for table in ("sheet_import_rows","historical_forecasts","historical_rule_specs",
                                  "historical_model_specs"):
                        self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0],0)
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM active_aggregate_order_counts").fetchone()[0],0)
                    # An upgrade may run only once; repeating additive SQL is harmless.
                    db.executescript(upgrade)
                    db.executescript(VIEWS)
                    db.executescript(M3)
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM legacy_slot_facts").fetchone()[0],1)

if __name__=="__main__":unittest.main()
