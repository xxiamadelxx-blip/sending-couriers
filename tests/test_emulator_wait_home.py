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


class AndroidSmokeOracleTests(TestCase):
    def test_visible_node_geometry_reads_real_android_size_and_bounds(self):
        root = ET.fromstring(
            '<hierarchy>'
            '<node text="Сохранить слот" bounds="[50,120][500,200]" />'
            '<node text="Главная" bounds="[0,2300][1080,2400]" />'
            '</hierarchy>'
        )
        with patch.object(device, "adb", return_value="Physical size: 1080x2400") as adb, \
                patch.object(device, "dump", return_value=root), \
                patch.object(device, "tap_node") as tap:
            device.tap_visible_node("Сохранить слот")
        adb.assert_called_once_with("shell", "wm", "size")
        tap.assert_called_once_with("Сохранить слот")

    def test_xlsx_import_waits_for_full_accessible_no_work_history_label(self):
        root = ET.fromstring(
            '<hierarchy><node text="Пока мало данных о рабочем времени" /></hierarchy>'
        )
        label = device.NO_WORK_HISTORY_LABEL
        self.assertEqual(label, "Пока мало данных о рабочем времени")
        self.assertIsNotNone(device.find_node(root, label))
        self.assertIsNone(device.find_node(root, "Пока мало данных"))
        smoke = MODULE.with_name("xlsx_import_smoke.py").read_text(encoding="utf-8")
        self.assertIn("wait_node(NO_WORK_HISTORY_LABEL, 25)", smoke)
