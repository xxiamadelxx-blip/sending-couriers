"""M2: preserve historical forecasts and rules without inventing publication evidence."""
import pathlib
import sqlite3
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCHEMA=ROOT/"web/m2_schema_v1.sql"

class HistoryTypesTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA.read_text("utf8"))
        self.db.execute("INSERT INTO import_sources(id,sha256,source_kind,parser_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          ("src","a"*64,"xlsx","m2-sheet-archive-1","mirrored","now","now"))
    def tearDown(self): self.db.close()

    def test_historical_forecast_is_not_a_prospectively_published_forecast(self):
        self.db.execute("""INSERT INTO historical_forecasts
            (id,source_id,row_number,target_date,window_label,center_orders,lower_orders,upper_orders,
             claimed_publication,claimed_model,source_status,record_json,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("row1","src",2,"2026-09-12","10:00–15:00",21,16,26,None,
             "CF_BASELINE_DOW_HOUR","unverified_historical",'{"A":"2026-09-12"}',"now"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM forecast_snapshots").fetchone()[0],0)
        self.assertIsNone(self.db.execute("SELECT claimed_publication FROM historical_forecasts").fetchone()[0])
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE historical_forecasts SET center_orders=999 WHERE id='row1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM historical_forecasts WHERE id='row1'")

    def test_rules_and_model_specs_keep_original_text_without_activation(self):
        self.db.execute("""INSERT INTO historical_rule_specs
            (id,source_id,row_number,rule_label,rule_text,source_status,created_at)
            VALUES(?,?,?,?,?,?,?)""",
            ("rule1","src",13,"Финальная доплата почасовой гарантии",
             "Не прибавлять поверх часов×360", "declared_archive","now"))
        self.db.execute("""INSERT INTO historical_model_specs
            (id,source_id,row_number,model_label,model_state,declared_version,source_status,created_at)
            VALUES(?,?,?,?,?,?,?,?)""",
            ("model1","src",2,"CF_BASELINE_DOW_HOUR","АКТИВНАЯ","v1.0","declared_archive","now"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM financial_ledger").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM model_registry").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM historical_rule_specs").fetchone()[0],1)

    def test_forecast_count_is_integer_and_nullable(self):
        self.db.execute("""INSERT INTO historical_forecasts
         (id,source_id,row_number,target_date,source_status,record_json,created_at)
         VALUES (?,?,?,?,?,?,?)""",("row2","src",3,"2026-10-19","unverified_historical","{}","now"))
        self.assertIsNone(self.db.execute("SELECT center_orders FROM historical_forecasts").fetchone()[0])
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO historical_forecasts
             (id,source_id,row_number,target_date,center_orders,source_status,record_json,created_at)
             VALUES(?,?,?,?,?,?,?,?)""",("row3","src",4,"2026-10-19",3.5,"unverified_historical","{}","now"))

if __name__=="__main__": unittest.main()
