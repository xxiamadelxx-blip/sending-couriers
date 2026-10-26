import unittest
import xml.etree.ElementTree as ET
from qa.visual_glance_contract import assert_income_above_nav


def xml(amount, nav):
    def node(text='', desc='', rect='[0,0][0,0]'):
        return f'<node text="{text}" content-desc="{desc}" bounds="{rect}" />'
    return ET.fromstring('<hierarchy>' + node('3\u00a0240\u00a0₽', rect=amount) +
                         node(desc='Главная', rect=nav) + '</hierarchy>')


class VisualGlanceTest(unittest.TestCase):
    def test_amount_entirely_visible_above_navigation(self):
        out = assert_income_above_nav(xml('[100,500][400,580]', '[0,620][220,710]'))
        self.assertEqual(out['clearancePx'], 40)

    def test_real_390_dark_old_geometry_is_red(self):
        with self.assertRaisesRegex(AssertionError, 'overlaps bottom navigation'):
            assert_income_above_nav(xml('[108,2079][1062,2220]', '[30,2202][249,2367]'))

    def test_not_enough_clearance_fails(self):
        with self.assertRaisesRegex(AssertionError, 'overlaps'):
            assert_income_above_nav(xml('[100,500][400,600]', '[0,608][200,690]'))

    def test_missing_visible_income_is_not_pass(self):
        with self.assertRaisesRegex(AssertionError, 'missing'):
            assert_income_above_nav(xml('[0,0][0,0]', '[0,620][220,710]'))


if __name__ == '__main__':
    unittest.main()
