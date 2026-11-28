import unittest
from qa.empty_state_contract import assert_empty_backup


class EmptyBackupContractTest(unittest.TestCase):
    def test_real_json_backup_with_no_entries_passes(self):
        self.assertEqual(assert_empty_backup({'schemaVersion': 6, 'entries': []}), 0)

    def test_ghost_slot_fails_even_when_empty_ui_is_visible(self):
        with self.assertRaisesRegex(AssertionError, 'unexpected slots'):
            assert_empty_backup({'entries': [{'id': 'ghost-1', 'dailyHours': None}]})

    def test_missing_entries_is_not_treated_as_empty(self):
        with self.assertRaisesRegex(AssertionError, 'entries'):
            assert_empty_backup({'schemaVersion': 6})

    def test_invalid_entries_is_not_treated_as_empty(self):
        for entries in (None, {}, 0):
            with self.subTest(entries=entries), self.assertRaisesRegex(AssertionError, 'entries'):
                assert_empty_backup({'entries': entries})


if __name__ == '__main__':
    unittest.main()
