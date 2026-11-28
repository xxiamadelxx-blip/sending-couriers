"""JavaScript bridge file-picker contract stays stable while native setup is shared."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "android/src/ru/courier/finance/MainActivity.java"


class AndroidFilePickerContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf8")

    def test_public_bridge_methods_keep_their_names_and_request_codes(self):
        self.assertRegex(self.source, r"@JavascriptInterface\s+public void importData\(\)\s*\{\s*openImportPicker\(")
        self.assertRegex(self.source, r"@JavascriptInterface\s+public void importForecast\(\)\s*\{\s*openImportPicker\(")
        self.assertIn("IMPORT_FILE);", self.source)
        self.assertIn("IMPORT_FORECAST);", self.source)
        self.assertIn("else if (requestCode == IMPORT_FILE || requestCode == IMPORT_FORECAST)", self.source)

    def test_one_picker_preserves_mime_filters_and_error_handling(self):
        self.assertEqual(self.source.count("new Intent(Intent.ACTION_OPEN_DOCUMENT)"), 1)
        self.assertIn("intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);", self.source)
        self.assertIn("startActivityForResult(intent, requestCode);", self.source)
        self.assertIn('new String[]{"application/json", "text/plain", "application/octet-stream"}', self.source)
        self.assertIn('new String[]{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/json", "application/octet-stream"}', self.source)
        self.assertIn('error("Не удалось открыть выбор файла.");', self.source)


if __name__ == "__main__":
    unittest.main()
