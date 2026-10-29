"""Isolated Android launcher/UiAutomator resilience tests; no emulator needed."""
import importlib.util
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
import xml.etree.ElementTree as ET

MODULE = Path(__file__).resolve().parents[1] / "qa" / "emulator_smoke.py"
spec = importlib.util.spec_from_file_location("courier_emulator_smoke", MODULE)
device = importlib.util.module_from_spec(spec)
spec.loader.exec_module(device)


class WaitHomeRecoveryTests(TestCase):
    @staticmethod
    def home():
        return ET.fromstring('<hierarchy><node text="Главная" /><node text="Прогноз" /></hierarchy>')

    def test_retry_after_transient_uiautomator_nonzero_exit(self):
        root = self.home()
        with patch.object(device, "dump", side_effect=[
            RuntimeError("adb shell uiautomator dump /sdcard/window.xml: "),
            root,
        ]) as dump, patch.object(device.time, "sleep", return_value=None):
            observed = device.wait_home(seconds=5)
        self.assertIs(observed, root)
        self.assertEqual(dump.call_count, 2)

    def test_retry_after_bad_xml_snapshot(self):
        root = self.home()
        with patch.object(device, "dump", side_effect=[ET.ParseError("no element found"), root]):
            with patch.object(device.time, "sleep", return_value=None):
                self.assertIs(device.wait_home(seconds=5), root)

    def test_never_accepts_form_as_home(self):
        form = ET.fromstring('<hierarchy><node text="Главная" /><node text="Сохранить слот" /></hierarchy>')
        clock = iter([0, 0.1, 0.2, 1.1])
        with patch.object(device, "dump", return_value=form), patch.object(device.time, "monotonic", side_effect=lambda: next(clock)), patch.object(device.time, "sleep", return_value=None):
            with self.assertRaisesRegex(AssertionError, "Slot form did not return to home"):
                device.wait_home(seconds=1)

    def test_all_snapshots_failing_is_still_failure(self):
        clock = iter([0, 0.1, 1.1])
        with patch.object(device, "dump", side_effect=RuntimeError("adb offline")), patch.object(device.time, "monotonic", side_effect=lambda: next(clock)), patch.object(device.time, "sleep", return_value=None):
            with self.assertRaisesRegex(AssertionError, "latest Android XML dump failed"):
                device.wait_home(seconds=1)
