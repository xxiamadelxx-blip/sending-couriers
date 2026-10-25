"""Independent UI-geometry unit fixtures for native large-text form."""
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'qa'))
import form_large_text_smoke as audit

def fake(label='Часы за слот', input_bounds='[48,1869][1122,2112]',
         label_bounds='[48,1746][1122,1851]', save_bounds='[48,2133][1122,2340]'):
    return ET.fromstring(f'''<hierarchy>
      <node class="android.view.View" scrollable="true" bounds="[42,861][1128,2097]">
        <node text="{label}" bounds="{label_bounds}" />
        <node class="android.widget.EditText" bounds="{input_bounds}" />
        <node text="Заказы за слот" bounds="[0,0][0,0]" />
        <node class="android.widget.EditText" bounds="[0,0][0,0]" />
      </node>
      <node text="Сохранить слот" bounds="{save_bounds}" />
    </hierarchy>''')

class FormLargeGeometry(unittest.TestCase):
    def test_48dp_input_and_label_inside_scroll_above_save(self):
        point = audit.input_visible(fake(), 'Часы за слот')
        self.assertIsNotNone(point)
        self.assertGreaterEqual(point[1], 1869)
        self.assertLessEqual(point[1], 2097)

    def test_offscreen_zero_bounds_are_not_a_pass(self):
        self.assertIsNone(audit.input_visible(fake(input_bounds='[0,0][0,0]'), 'Часы за слот'))

    def test_input_obscured_by_sticky_save_is_not_a_pass(self):
        self.assertIsNone(audit.input_visible(fake(input_bounds='[48,2120][1122,2360]'),'Часы за слот'))

    def test_less_than_48dp_exposed_is_not_a_pass(self):
        self.assertIsNone(audit.input_visible(fake(input_bounds='[48,2010][1122,2300]'),'Часы за слот'))

    def test_next_fields_input_cannot_validate_previous_label(self):
        self.assertIsNone(audit.input_visible(fake(input_bounds='[0,0][0,0]'),'Часы за слот'))

if __name__ == '__main__':
    unittest.main()

class PeriodHistoryAccessGeometry(unittest.TestCase):
    def fake_period(self, button):
        return ET.fromstring(f'''<hierarchy>
          <node class="android.webkit.WebView" bounds="[0,135][1170,2388]" />
          <node text="Записи периода" class="android.widget.Button" bounds="{button}" />
          <node text="Главная" class="android.widget.Button" bounds="[30,2202][249,2367]" />
        </hierarchy>''')

    def test_red_offscreen_bounds_cannot_tap_android_home(self):
        self.assertIsNone(audit.period_history_center(self.fake_period('[48,2427][1122,2388]')))

    def test_visible_period_action_returns_safe_tap(self):
        self.assertEqual(audit.period_history_center(self.fake_period('[48,1910][1122,2080]')),(585,1995))

    def test_action_covered_by_nav_is_rejected(self):
        self.assertIsNone(audit.period_history_center(self.fake_period('[48,2120][1122,2300]')))
