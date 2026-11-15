"""Synthetic native UiAutomator fixtures for the empty courier start gate."""
import unittest
import xml.etree.ElementTree as ET
from qa.empty_state_contract import assert_empty_home, assert_empty_history


def screen(nodes):
    return ET.fromstring('<hierarchy>' + nodes + '</hierarchy>')


class EmptyStateContractTest(unittest.TestCase):
    def test_home_and_first_slot_action_have_real_48dp_target(self):
        assert_empty_home(screen('''
            <node class="android.widget.TextView" text="Смена ещё не записана" bounds="[42,210][920,290]"/>
            <node class="android.widget.Button" clickable="true" text="Добавить первый слот" bounds="[45,320][610,490]"/>
        '''))

    def test_zero_size_or_too_small_action_cannot_pass(self):
        for box in ('[0,0][0,0]', '[45,320][610,460]', '[45,490][610,320]'):
            with self.subTest(box=box), self.assertRaisesRegex(AssertionError, '48dp'):
                assert_empty_home(screen('''
                    <node text="Смена ещё не записана"/>
                    <node class="android.widget.Button" clickable="true" text="Добавить первый слот" bounds="%s"/>
                ''' % box))

    def test_home_does_not_pass_without_empty_heading(self):
        with self.assertRaisesRegex(AssertionError, 'empty home'):
            assert_empty_home(screen('<node text="Добавить первый слот" clickable="true" bounds="[0,0][150,150]"/>'))

    def test_history_empty_screen_has_no_editable_records(self):
        assert_empty_history(screen('<node text="Пока нет записей" bounds="[45,210][610,290]"/>'))
        with self.assertRaisesRegex(AssertionError, 'unexpected slot'):
            assert_empty_history(screen('''
                <node text="Пока нет записей"/>
                <node text="Редактировать Слот 1" clickable="true" bounds="[30,300][550,480]"/>
            '''))

    def test_history_with_record_is_not_empty(self):
        with self.assertRaisesRegex(AssertionError, 'empty history'):
            assert_empty_history(screen('<node text="Слот 1" bounds="[0,0][150,150]"/>'))


if __name__ == '__main__':
    unittest.main()
