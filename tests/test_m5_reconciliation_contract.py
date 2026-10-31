"""M5 reconciliation projections preserve evidence and avoid double-counting."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
M2 = ROOT / "web/m2_schema_v1.sql"
VIEWS = ROOT / "web/m2_views_v2.sql"
M3 = ROOT / "web/m3_schema_v1.sql"
M5 = ROOT / "web/m5_reconciliation_v1.sql"
NOW = "2026-10-31T00:00:00Z"


def add_source(db, ident, kind, digest):
    db.execute("""INSERT INTO import_sources
        (id,sha256,source_kind,parser_version,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)""",
        (ident, digest, kind, "m5-test", "mirrored", NOW, NOW))


def add_aggregate(db, ident, source, kind, date, slot, count, reward, confidence):
    db.execute("""INSERT INTO aggregate_order_counts
        (id,date,slot_id,order_count,reward_kopecks,source_id,source_kind,confidence,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (ident, date, slot, count, reward, source, kind, confidence, NOW, NOW))


def add_order(db, ident, source, kind, date, completed, reward, confidence="reported_high", number=None):
    db.execute("""INSERT INTO orders
        (id,date,completed_at,yandex_order_id,reward_kopecks,source_id,source_kind,confidence,precision,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (ident, date, completed, number, reward, source, kind, confidence, "m5-test", NOW, NOW))


class M5ReconciliationTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(M2.read_text(encoding="utf8"))
        self.db.executescript(VIEWS.read_text(encoding="utf8"))
        self.db.executescript(M3.read_text(encoding="utf8"))
        self.db.execute("DROP VIEW active_orders")
        self.db.execute("DROP VIEW active_aggregate_order_counts")
        self.db.executescript(M5.read_text(encoding="utf8"))

    def tearDown(self):
        self.db.close()

    def test_matching_slot_aggregate_beats_reported_day_total_without_double_counting(self):
        add_source(self.db, "sheet-28", "xlsx", "a" * 64)
        add_source(self.db, "video-28a", "video_import", "b" * 64)
        add_source(self.db, "video-28b", "video_import", "c" * 64)
        add_aggregate(self.db, "day-28", "sheet-28", "xlsx", "2026-10-28", None, 11, None, "reported_sheet")
        add_aggregate(self.db, "slot-28a", "video-28a", "video_import", "2026-10-28", "341234567", 11, 110000, "confirmed")
        add_aggregate(self.db, "slot-28b", "video-28b", "video_import", "2026-10-28", "341234567", 11, 110000, "confirmed")

        rows = self.db.execute("""SELECT source_kind,order_count,reward_kopecks
            FROM active_aggregate_order_counts WHERE date='2026-10-28'""").fetchall()
        self.assertEqual(rows, [("video_import", 11, 110000)])
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM aggregate_order_counts WHERE date='2026-10-28'").fetchone()[0], 3,
            "all three source records stay available for audit")

    def test_partial_raw_day_uses_day_count_and_keeps_only_observed_order_rows(self):
        add_source(self.db, "sheet-17", "xlsx", "d" * 64)
        add_source(self.db, "video-17", "video_import", "e" * 64)
        add_aggregate(self.db, "day-17", "sheet-17", "xlsx", "2026-10-17", None, 29, None, "reported_sheet")
        add_aggregate(self.db, "slot-17", "video-17", "video_import", "2026-10-17", "339533360", 12, 120000, "confirmed")
        for i in range(12):
            add_order(self.db, f"raw-17-{i}", "sheet-17", "xlsx", "2026-10-17",
                      f"2026-10-17T{10 + i:02d}:10:00+03:00", 10000)
        aggregate = self.db.execute(
            "SELECT source_kind,order_count FROM active_aggregate_order_counts WHERE date='2026-10-17'").fetchall()
        self.assertEqual(aggregate, [("xlsx", 29)])
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM active_orders WHERE date='2026-10-17'").fetchone()[0], 12,
            "the aggregate does not fabricate the 17 unobserved RAW order rows")

    def test_conflicting_totals_are_retained_but_hidden_from_active_projection(self):
        add_source(self.db, "sheet-conflict", "xlsx", "f" * 64)
        add_source(self.db, "video-conflict", "video_import", "1" * 64)
        add_aggregate(self.db, "raw-slot", "sheet-conflict", "xlsx", "2026-10-18", "778899001", 11, 110000, "reported_sheet")
        add_aggregate(self.db, "video-slot", "video-conflict", "video_import", "2026-10-18", "778899001", 10, 100000, "confirmed")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM aggregate_order_counts WHERE date='2026-10-18'").fetchone()[0], 2)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM active_aggregate_order_counts WHERE date='2026-10-18'").fetchone()[0], 0)

    def test_unknown_slot_blocks_partial_slot_sums_from_becoming_a_day_total(self):
        add_source(self.db, "sheet-unknown", "xlsx", "7" * 64)
        add_source(self.db, "video-known", "video_import", "8" * 64)
        add_source(self.db, "video-unknown", "video_import", "9" * 64)
        add_aggregate(self.db, "day-unknown", "sheet-unknown", "xlsx", "2026-10-17", None, 29, None, "reported_sheet")
        add_aggregate(self.db, "slot-known", "video-known", "video_import", "2026-10-17", "slot-a", 12, 120000, "confirmed")
        add_aggregate(self.db, "slot-unknown", "video-unknown", "video_import", "2026-10-17", "slot-b", None, None, "observed")
        rows = self.db.execute(
            "SELECT source_kind,order_count,confidence FROM active_aggregate_order_counts WHERE date='2026-10-17'").fetchall()
        self.assertEqual(rows, [("xlsx", 29, "reported_sheet")])

        add_source(self.db, "video-only", "video_import", "0" * 64)
        add_aggregate(self.db, "slot-only-known", "video-known", "video_import", "2026-10-19", "slot-c", 5, 50000, "confirmed")
        add_aggregate(self.db, "slot-only-unknown", "video-only", "video_import", "2026-10-19", "slot-d", None, None, "observed")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM active_aggregate_order_counts WHERE date='2026-10-19'").fetchone()[0], 0)

    def test_same_yandex_id_is_deduplicated_but_conflicting_identity_is_reviewed(self):
        add_source(self.db, "sheet-orders", "xlsx", "2" * 64)
        add_source(self.db, "video-orders", "video_import", "3" * 64)
        add_order(self.db, "sheet-event", "sheet-orders", "xlsx", "2026-10-28",
                  "2026-10-28T12:46:00+03:00", 10000, number="261028-1234567")
        add_order(self.db, "video-event", "video-orders", "video_import", "2026-10-28",
                  "2026-10-28T09:46:00Z", 10000, confidence="confirmed", number="261028-1234567")
        rows = self.db.execute("SELECT id,source_kind FROM active_orders WHERE date='2026-10-28'").fetchall()
        self.assertEqual(rows, [("video-event", "video_import")])

        add_order(self.db, "bad-date-a", "sheet-orders", "xlsx", "2026-10-17",
                  "2026-10-17T12:00:00+03:00", 10000, number="261017-7654321")
        add_order(self.db, "bad-date-b", "video-orders", "video_import", "2026-10-18",
                  "2026-10-18T09:00:00Z", 10000, confidence="confirmed", number="261017-7654321")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM active_orders WHERE yandex_order_id='261017-7654321'").fetchone()[0], 0)

    def test_two_orders_in_the_same_minute_remain_two_without_stable_yandex_ids(self):
        add_source(self.db, "sheet-18", "xlsx", "4" * 64)
        for i in range(2):
            add_order(self.db, f"raw-18-{i}", "sheet-18", "xlsx", "2026-10-18",
                      "2026-10-18T18:57:00+03:00", 10000)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM active_orders WHERE date='2026-10-18' "
            "AND completed_at='2026-10-18T18:57:00+03:00'").fetchone()[0], 2)

    def test_m5_upgrade_is_additive_and_visible_time_stays_distinct(self):
        helper = (ROOT / "android/src/ru/courier/finance/CourierDatabase.java").read_text(encoding="utf8")
        writer = (ROOT / "m4/src/main/java/ru/courier/finance/M4ForecastFactWriter.java").read_text(encoding="utf8")
        self.assertIn("public static final int VERSION = 5;", helper)
        self.assertIn("from == 4) && to == 5", helper)
        self.assertIn("ALTER TABLE orders ADD COLUMN observed_at TEXT", helper)
        self.assertIn('row.put("observed_at"', writer)
        self.assertIn('if(order.completedAt!=null) row.put("completed_at"', writer)

        add_source(self.db, "migration-source", "xlsx", "6" * 64)
        add_order(self.db, "pre-migration-row", "migration-source", "xlsx", "2026-10-28",
                  "2026-10-28T12:46:00+03:00", 10000)
        self.db.execute("ALTER TABLE orders ADD COLUMN observed_at TEXT")
        self.assertEqual(self.db.execute(
            "SELECT id,reward_kopecks,observed_at FROM orders WHERE id='pre-migration-row'").fetchone(),
            ("pre-migration-row", 10000, None))

    def test_period_snapshot_and_final_guarantee_stay_outside_order_aggregates(self):
        add_source(self.db, "sheet-finance", "xlsx", "5" * 64)
        self.db.execute("""INSERT INTO period_snapshots
            (id,period_start,period_end,seen_at,orders,accounted_hundredths,precision,source_id,source_kind,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            ("period-90","2026-09-01","2026-10-26",NOW,90,5700,"displayed","sheet-finance","xlsx",NOW,NOW))
        self.db.execute("""INSERT INTO financial_ledger
            (id,date,kind,amount_kopecks,source_id,source_kind,confidence,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            ("final-guarantee","2026-10-15","final_guarantee",2237600,"sheet-finance","xlsx","reported_sheet",NOW,NOW))
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM active_aggregate_order_counts WHERE date='2026-10-15'").fetchone()[0], 0)
        self.assertEqual(self.db.execute(
            "SELECT amount_kopecks FROM financial_ledger WHERE kind='final_guarantee'").fetchone()[0], 2237600)
        self.assertEqual(self.db.execute(
            "SELECT orders,accounted_hundredths FROM period_snapshots WHERE id='period-90'").fetchone(), (90, 5700))


if __name__ == "__main__":
    unittest.main()
