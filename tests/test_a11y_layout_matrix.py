import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from qa.a11y_layout_matrix import (
    SCREENS, inspect, ensure_labelled_target, inspect_all_layouts,
)


def nodes(*items):
    return ET.fromstring('<hierarchy>' + ''.join(items) + '</hierarchy>')


class NativeLayoutMatrixTests(unittest.TestCase):
    def test_eight_surfaces_four_layouts(self):
        expected = {f'{s}-{w}-{t}' for s in (
            'home', 'forecast', 'history', 'form', 'period',
            'settings-main', 'settings-more', 'export-dialog')
            for w in (360, 390) for t in ('dark', 'light')}
        self.assertEqual(set(SCREENS), expected)
        self.assertEqual(len(SCREENS), 32)

    def test_sufficient_48dp_target(self):
        root = nodes('<node class="android.widget.Button" clickable="true" '
                     'text="Главная" bounds="[0,0][144,144]"/>')
        self.assertTrue(ensure_labelled_target(root, 'Главная'))
        self.assertFalse(ensure_labelled_target(root, 'Главная', min_px=145))

    def test_offscreen_inverted_bounds_never_count_as_accessible(self):
        root = nodes('<node class="android.widget.Button" clickable="true" '
                     'text="Записи периода" bounds="[48,2427][1122,2388]"/>')
        self.assertFalse(ensure_labelled_target(root, 'Записи периода'))

    def test_empty_clickable_action_fails(self):
        root = nodes('<node class="android.widget.Button" clickable="true" '
                     'text="" content-desc="" bounds="[0,0][144,144]"/>')
        with self.assertRaisesRegex(AssertionError, 'unnamed clickable'):
            inspect(root, 'home-360-dark')

    def test_missing_snapshot_must_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(AssertionError, 'missing native XML'):
                inspect_all_layouts(Path(tmp))

    def test_edit_text_value_is_not_a_spoken_label_proof(self):
        root = nodes('<node class="android.widget.EditText" clickable="true" '
                     'text="360" content-desc="" bounds="[0,0][300,144]"/>')
        result = inspect(root, 'settings-main-390-dark')
        self.assertEqual(result['unnamed'], 0)
        self.assertEqual(result['named'], 0)
        self.assertEqual(result['editTextsNotSpeechVerified'], 1)


if __name__ == '__main__':
    unittest.main()
