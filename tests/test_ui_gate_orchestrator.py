import json
import tempfile
import unittest
from pathlib import Path

from qa.run_ui_gates import execute_pipeline


class IndependentAndroidGateTests(unittest.TestCase):
    def test_failed_accessibility_and_form_do_not_skip_xlsx_or_upgrade(self):
        seen = []

        def fake_runner(name, commands):
            seen.append(name)
            return (1, 'deliberate native failure') if name in ('native_edit_labels', 'large_font_form') else (0, 'ok')

        with tempfile.TemporaryDirectory() as directory:
            code = execute_pipeline(Path(directory), 'full', 'current.apk', 'prior.apk', 'new.apk', fake_runner)
            data = json.loads((Path(directory) / 'ui-independent-gates.json').read_text())
        self.assertEqual(code, 1)
        self.assertEqual(seen, ['ui_matrix', 'action_layout', 'native_edit_labels', 'xlsx_import', 'large_font_form', 'transfer_upgrade'])
        self.assertEqual(data['gates']['xlsx_import']['status'], 'PASS')
        self.assertEqual(data['gates']['transfer_upgrade']['status'], 'PASS')
        self.assertEqual(data['gates']['native_edit_labels']['status'], 'FAIL')
        self.assertEqual(data['gates']['large_font_form']['status'], 'FAIL')
        self.assertEqual(data['result'], 'FAIL')

    def test_without_matrix_seed_downstream_is_blocked_but_upgrade_runs(self):
        seen = []
        def fake_runner(name, commands):
            seen.append(name)
            return (2, 'matrix unavailable') if name == 'ui_matrix' else (0, 'ok')
        with tempfile.TemporaryDirectory() as directory:
            code = execute_pipeline(Path(directory), 'full', 'current.apk', 'prior.apk', 'new.apk', fake_runner)
            data = json.loads((Path(directory) / 'ui-independent-gates.json').read_text())
        self.assertEqual(code, 1)
        self.assertEqual(seen, ['ui_matrix', 'transfer_upgrade'])
        self.assertEqual(data['gates']['xlsx_import']['status'], 'BLOCKED')
        self.assertEqual(data['gates']['action_layout']['status'], 'BLOCKED')
        self.assertEqual(data['gates']['transfer_upgrade']['status'], 'PASS')

    def test_delta_mode_runs_only_matrix_and_upgrade(self):
        seen = []
        def fake_runner(name, commands):
            seen.append(name)
            return (0, 'ok')
        with tempfile.TemporaryDirectory() as directory:
            code = execute_pipeline(Path(directory), 'delta', 'current.apk', 'prior.apk', 'new.apk', fake_runner)
            data = json.loads((Path(directory) / 'ui-independent-gates.json').read_text())
        self.assertEqual(code, 0)
        self.assertEqual(data['result'], 'PASS')
        self.assertEqual(seen, ['ui_matrix', 'transfer_upgrade'])
        self.assertEqual(data['gates']['native_edit_labels']['status'], 'NOT RUN')

    def test_failed_upgrade_is_never_hidden_by_other_passes(self):
        def fake_runner(name, commands):
            return (17, 'signature mismatch') if name == 'transfer_upgrade' else (0, 'ok')
        with tempfile.TemporaryDirectory() as directory:
            code = execute_pipeline(Path(directory), 'full', 'current.apk', 'prior.apk', 'new.apk', fake_runner)
            data = json.loads((Path(directory) / 'ui-independent-gates.json').read_text())
        self.assertEqual(code, 1)
        self.assertEqual(data['gates']['transfer_upgrade']['exitCode'], 17)
        self.assertEqual(data['result'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
