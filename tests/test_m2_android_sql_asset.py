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

if __name__=="__main__":unittest.main()
