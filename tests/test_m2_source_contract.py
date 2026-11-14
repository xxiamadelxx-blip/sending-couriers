"""M2 approved-source contract preserves private data and detects truncated exports."""
import json
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
CONTRACT=ROOT/"web/m2_source_contract_v1.json"

class ApprovedSourceContract(unittest.TestCase):
    def test_expected_real_export_layout_and_typed_counts(self):
        c=json.loads(CONTRACT.read_text(encoding="utf8"))
        self.assertEqual(len(c["source_rows"]),15)
        self.assertEqual(sum(c["source_rows"].values()),4337)
        self.assertEqual(c["source_rows"]["Заказы RAW"],1248)
        self.assertEqual(c["source_rows"]["Дневные итоги"],500)
        self.assertEqual(c["typed_rows"]["orders"],1248)
        self.assertEqual(c["typed_rows"]["aggregate_order_counts"],55)
        self.assertEqual(c["typed_rows"]["historical_forecasts"],114)
        self.assertEqual(c["typed_rows"]["financial_ledger"],72)
        self.assertEqual(c["typed_rows"]["period_snapshots"],3)
        self.assertEqual(len(c["sha256"]),64)
    def test_cutover_requires_exact_source_fingerprint_and_all_row_counts(self):
        java=(ROOT/"android/src/ru/courier/finance/CourierDatabase.java").read_text()
        app=(ROOT/"android/src/ru/courier/finance/MainActivity.java").read_text()
        self.assertIn('isApprovedPrimarySource(String sha)',java)
        self.assertIn('m2_source_contract_v1.json',java)
        self.assertIn('sheet_import_rows WHERE source_id=? AND sheet_name=?',java)
        self.assertIn('isApprovedPrimarySource(sha)',app)
        self.assertNotIn('if(factMirrorDatabase.hasCompleteWorkbook(sha)',app)
    def test_revisions_cannot_auto_supersede_equal_count_facts(self):
        java=(ROOT/"android/src/ru/courier/finance/CourierDatabase.java").read_text()
        self.assertIn('if(preceding>0) complete=false;',java)
        self.assertIn("status='mirrored' AND id<>",java)

if __name__=="__main__": unittest.main()
