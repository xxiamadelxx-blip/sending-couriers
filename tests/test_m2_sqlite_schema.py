"""M2 RED→GREEN: real SQLite schema contracts, independent of Android UI."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SQL = ROOT / "web/m2_schema_v1.sql"

class M2SchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SQL.read_text(encoding="utf8"))

    def tearDown(self):
        self.db.close()

    def test_required_normalized_tables_and_original_rollback_exist(self):
        names = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for name in ("legacy_state", "legacy_slot_facts", "orders", "aggregate_order_counts",
                     "work_intervals", "period_snapshots", "financial_ledger", "weather_observations",
                     "forecast_snapshots", "forecast_evaluations", "model_registry",
                     "import_sources", "extraction_evidence", "sync_queue", "audit_events"):
            self.assertIn(name, names)

    def test_unknown_is_null_and_zero_is_real_zero(self):
        self.db.execute("INSERT INTO legacy_slot_facts(id,date,order_count,accounted_hundredths,raw_json,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("day-1","2026-10-18", None, None, "{}", "legacy_state","now","now"))
        self.db.execute("INSERT INTO legacy_slot_facts(id,date,order_count,accounted_hundredths,raw_json,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("day-2","2026-10-18", 0, 0, "{}", "legacy_state","now","now"))
        self.assertEqual(list(self.db.execute("SELECT order_count,accounted_hundredths FROM legacy_slot_facts ORDER BY id")),
                         [(None,None),(0,0)])

    def test_same_date_two_slots_have_separate_stable_ids(self):
        for ident, n in (("slot-am",12),("slot-pm",9)):
            self.db.execute("INSERT INTO aggregate_order_counts(id,date,slot_id,order_count,source_kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                (ident,"2026-10-18",ident,n,"legacy_state","now","now"))
        self.assertEqual(self.db.execute("SELECT SUM(order_count) FROM aggregate_order_counts WHERE date='2026-10-18'").fetchone()[0], 21)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], 0, "No fabricated individual orders")

    def test_financial_amounts_are_integer_kopecks(self):
        self.db.execute("INSERT INTO financial_ledger(id,date,kind,amount_kopecks,source_kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
            ("r","2026-10-18","reward",2237600,"legacy_state","now","now"))
        self.assertEqual(self.db.execute("SELECT typeof(amount_kopecks),amount_kopecks FROM financial_ledger").fetchone(),("integer",2237600))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO financial_ledger(id,date,kind,amount_kopecks,source_kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                ("wrong","2026-10-18","tip",2.5,"legacy_state","now","now"))

    def test_repeated_legacy_slot_upsert_does_not_create_duplicates(self):
        sql = "INSERT INTO legacy_slot_facts(id,date,order_count,accounted_hundredths,raw_json,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET raw_json=excluded.raw_json"
        args = ("s1","2026-10-18",11,None,"{}","legacy_state","now","now")
        self.db.execute(sql,args)
        self.db.execute(sql,args)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM legacy_slot_facts").fetchone()[0], 1)

    def test_published_forecast_is_immutable(self):
        self.db.execute("INSERT INTO forecast_snapshots(id,target_date,created_at,model_version,training_cutoff,center_orders) VALUES(?,?,?,?,?,?)",
            ("f1","2026-10-20","2026-10-19T06:00:00Z","baseline-1","2026-10-18",21))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE forecast_snapshots SET center_orders=90 WHERE id='f1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM forecast_snapshots WHERE id='f1'")

if __name__=="__main__":
    unittest.main()
