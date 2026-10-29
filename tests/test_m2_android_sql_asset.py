"""Actual Android SQLiteOpenHelper parser safety regression (multi statement)."""
import pathlib
import re
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]

class AndroidSQLAssetTest(unittest.TestCase):
    def test_sql_assets_execute_exactly_one_create_per_statement(self):
        text=(ROOT/"web/m2_schema_v1.sql").read_text(encoding="utf8")
        stripped=re.sub(r"^\s*--[^\r\n]*","",text,flags=re.M)
        statements=[s for s in re.split(r";\s*(?=CREATE)",stripped) if s.strip()]
        self.assertEqual(len(statements),31)
        for i,statement in enumerate(statements):
            self.assertEqual(len(re.findall(r"CREATE\s+(?:TABLE|INDEX|TRIGGER)\b",statement)),1,(i,statement[:80]))
        java=(ROOT/"android/src/ru/courier/finance/CourierDatabase.java").read_text(encoding="utf8")
        # The production parser must strip SQL comments BEFORE splitting.
        self.assertIn("script = script.replaceAll",java)
        self.assertLess(java.index("script = script.replaceAll"),java.index("script.split("))

    def test_v2_views_upgrade_preserves_legacy_rows(self):
        import sqlite3
        v2=(ROOT/"web/m2_views_v2.sql").read_text(encoding="utf8")
        self.assertEqual(v2.count("CREATE VIEW IF NOT EXISTS"),7)
        with sqlite3.connect(":memory:") as db:
            db.executescript((ROOT/"web/m2_schema_v1.sql").read_text(encoding="utf8"))
            db.execute("INSERT INTO legacy_slot_facts(id,date,raw_json,source,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                       ("slot","2026-10-18","{}","legacy_state","now","now"))
            db.executescript(v2)
            db.executescript(v2)  # idempotent migration
            self.assertEqual(db.execute("SELECT COUNT(*) FROM legacy_slot_facts").fetchone()[0],1)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0],"ok")
        java=(ROOT/"android/src/ru/courier/finance/CourierDatabase.java").read_text()
        self.assertIn("public static final int VERSION = 4;",java)
        self.assertIn('applySchema(db, "www/m2_schema_v1.sql", true);',java)
        self.assertIn('applySchema(db, "www/m2_views_v2.sql");',java)

if __name__=="__main__":unittest.main()
