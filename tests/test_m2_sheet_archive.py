"""RED/GREEN M2 contract: no Google Sheet row lost or fabricated on XLSX import."""
import pathlib
import sqlite3
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SHEETS={
    "Смены","Прогнозы","Точность","Настройки","Дневные итоги",
    "Календарь","Заказы RAW","Методика","Решения","Модели",
    "Финансовые правила","Финансовые факты","Контроль",
    "Аудит 19.10","Снимки периода"
}

class M2SheetArchiveTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT/"web/m2_schema_v1.sql").read_text())

    def tearDown(self):
        self.db.close()

    def test_every_historical_tab_is_readable_by_offline_xlsx_parser(self):
        reader=(ROOT/"android/src/ru/courier/finance/WorkbookReader.java").read_text()
        for name in SHEETS:
            self.assertIn('"'+name+'"',reader, f"XLSX migration silently drops {name}")

    def test_import_rows_archive_is_source_scoped_and_reimport_idempotent(self):
        self.db.execute("INSERT INTO import_sources(id,sha256,source_kind,parser_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("a","a"*64,"xlsx","m2-sheets-1","verified","now","now"))
        sql="""INSERT INTO sheet_import_rows(id,source_id,sheet_name,row_number,raw_json,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING"""
        values=("a:raw:2","a","Заказы RAW",2,'{"A":"2026-10-17","E":"100"}',"now","now")
        self.db.execute(sql,values)
        self.db.execute(sql,values)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM sheet_import_rows").fetchone()[0],1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql,("a:raw:3","no-file","Заказы RAW",3,'{}',"now","now"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM orders").fetchone()[0],0)

    def test_unknown_financial_record_keeps_exact_text_and_no_invented_transactions(self):
        self.db.execute("INSERT INTO import_sources(id,sha256,source_kind,parser_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("b","b"*64,"xlsx","m2-sheets-1","verified","now","now"))
        self.db.execute("INSERT INTO sheet_import_rows(id,source_id,sheet_name,row_number,raw_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("b:fin:2","b","Финансовые факты",2,'{"A":"2026-10-15","B":"Бонусы и корректировки","C":"22 376,00"}',"now","now"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM financial_ledger").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM sheet_import_rows").fetchone()[0],1)


    def test_two_versions_of_same_fact_have_only_one_active_count(self):
        for name, digest, status in (("old","a"*64,"mirrored"),("new","b"*64,"superseded")):
            self.db.execute("INSERT INTO import_sources(id,sha256,source_kind,parser_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (name,digest,"xlsx","m2-sheet-archive-1",status,"now","now"))
            self.db.execute("""INSERT INTO aggregate_order_counts
                (id,date,order_count,source_id,source_kind,confidence,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?)""",
                (name+":14","2026-10-14",12,name,"xlsx","reported_sheet","now","now"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM aggregate_order_counts").fetchone()[0],2,
                         "Both immutable source revisions remain auditable")
        self.assertEqual(self.db.execute("SELECT SUM(order_count) FROM active_aggregate_order_counts").fetchone()[0],12,
                         "Updated workbooks must not double count identical facts")
        self.db.execute("UPDATE import_sources SET status='superseded' WHERE id='old'")
        self.db.execute("UPDATE import_sources SET status='mirrored' WHERE id='new'")
        self.assertEqual(self.db.execute("SELECT SUM(order_count) FROM active_aggregate_order_counts").fetchone()[0],12,
                         "Latest validated revision stays the sole active source")

if __name__=="__main__":
    unittest.main()
