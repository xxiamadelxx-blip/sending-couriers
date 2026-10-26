import unittest
import xml.etree.ElementTree as ET
from qa.a11y_xml_smoke import visible_accessible_actions, specific_named_control, require_native_edit_labels


def nodes(xml):
    return ET.fromstring('<hierarchy>' + xml + '</hierarchy>')


class AccessibilityNativeXmlTest(unittest.TestCase):
    def test_visible_unnamed_button_is_a_failure(self):
        root = nodes('<node class="android.widget.Button" clickable="true" text="" content-desc="" bounds="[40,80][220,230]"/>')
        self.assertEqual(len(visible_accessible_actions(root)['unnamed']), 1)

    def test_offscreen_controls_are_not_falsely_failed(self):
        root = nodes('<node class="android.widget.Button" clickable="true" text="" content-desc="" bounds="[0,0][0,0]"/>')
        self.assertEqual(visible_accessible_actions(root)['unnamed'], [])

    def test_empty_edit_text_not_accepted_as_named_button(self):
        root = nodes('<node class="android.widget.EditText" clickable="true" text="" content-desc="" bounds="[40,80][220,230]"/>')
        self.assertEqual(visible_accessible_actions(root)['editFieldsNeedingTalkBackCheck'], 1)
        self.assertEqual(visible_accessible_actions(root)['named'], 0)

    def test_named_seekbar_role_and_48dp_target(self):
        root = nodes('<node class="android.widget.SeekBar" clickable="true" text="14 ч, Слот" bounds="[273,1437][897,1584]"/>')
        self.assertTrue(specific_named_control(root, 'Слот', role='SeekBar', min_pixels=144))
        self.assertFalse(specific_named_control(root, 'Из них буду работать', role='SeekBar', min_pixels=144))

    def test_unnamed_native_text_input_fails_accessible_name_gate(self):
        root = nodes('<node class="android.widget.EditText" clickable="true" text="360" content-desc="" bounds="[40,80][220,230]"/>')
        with self.assertRaisesRegex(AssertionError, 'lacks native accessible description'):
            require_native_edit_labels(root, ('Ставка за час',), 'settings')

    def test_native_text_input_has_human_label_not_only_numeric_value(self):
        root = nodes('<node class="android.widget.EditText" clickable="true" text="360" content-desc="Ставка за час" bounds="[40,80][220,230]"/>')
        self.assertEqual(require_native_edit_labels(root, ('Ставка за час',), 'settings'), ['Ставка за час'])

    def test_a_nonvisible_target_never_counts_as_accessible(self):
        root = nodes('<node class="android.widget.Button" clickable="true" text="Сохранить слот" bounds="[48,2427][1122,2388]"/>')
        self.assertFalse(specific_named_control(root, 'Сохранить слот', role='Button', min_pixels=144))


if __name__ == '__main__':
    unittest.main()
