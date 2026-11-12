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
        return ET.fromstring('<hierarchy><node text="Главная" /><node text="Рабочий ритм" /><node text="Прогноз" /></hierarchy>')

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

    def test_navigation_tab_alone_does_not_count_as_home(self):
        history = ET.fromstring(
            '<hierarchy><node text="Главная" /><node text="История" /></hierarchy>'
        )
        home = self.home()
        with patch.object(device, "dump", side_effect=[history, home]), \
                patch.object(device.time, "sleep", return_value=None):
            self.assertIs(device.wait_home(seconds=5), home)

    def test_never_accepts_form_as_home(self):
        form = ET.fromstring('<hierarchy><node text="Главная" /><node text="Сохранить слот" /></hierarchy>')
        clock = iter([0, 0.1, 0.2, 1.1])
        with patch.object(device, "dump", return_value=form), patch.object(device.time, "monotonic", side_effect=lambda: next(clock)), patch.object(device.time, "sleep", return_value=None):
            with self.assertRaisesRegex(AssertionError, "Home screen was not observed"):
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

    def test_xlsx_import_returns_to_app_and_checks_saved_facts(self):
        smoke = MODULE.with_name("xlsx_import_smoke.py").read_text(encoding="utf-8")
        self.assertIn('wait_node("Прогноз", 20)', smoke)
        self.assertIn("def assert_imported(forecast):", smoke)
        self.assertIn("assert_imported(exported_forecast())", smoke)
        self.assertIn("Repeated XLSX import changed order facts", smoke)

    def test_add_slot_never_taps_reward_field_outside_scroll_view(self):
        offscreen = ET.fromstring('''<hierarchy>
          <node class="android.view.View" scrollable="true" bounds="[33,407][1047,1670]">
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[36,1169][528,1334]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[552,1169][1044,1334]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[36,1670][1044,1838]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[36,0][528,0]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[552,0][1044,0]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[0,0][0,0]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[0,0][0,0]" />
          </node>
          <node text="Сохранить слот" bounds="[36,1709][1044,1874]" />
        </hierarchy>''')
        visible = ET.fromstring('''<hierarchy>
          <node class="android.view.View" scrollable="true" bounds="[33,407][1047,1670]">
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[36,400][528,565]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[552,400][1044,565]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[36,900][1044,1065]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[36,0][528,0]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[552,0][1044,0]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[0,0][0,0]" />
            <node class="android.widget.EditText" package="ru.courier.finance" bounds="[0,0][0,0]" />
          </node>
          <node text="Сохранить слот" bounds="[36,1709][1044,1874]" />
        </hierarchy>''')
        current = {"root": offscreen}
        taps = []

        def adb(*args, **kwargs):
            if args[:3] == ("shell", "input", "swipe"):
                current["root"] = visible
            elif args[:3] == ("shell", "input", "tap"):
                taps.append((int(args[3]), int(args[4])))
            elif args[:3] == ("shell", "input", "text"):
                typed = ET.fromstring(ET.tostring(current["root"]))
                fields = [n for n in typed.iter("node")
                          if n.get("class") == "android.widget.EditText"
                          and n.get("package") == "ru.courier.finance"]
                fields[2].set("text", args[3])
                current["root"] = typed
            return ""

        with patch.object(device, "dump", side_effect=lambda _name: current["root"]), \
                patch.object(device, "adb", side_effect=adb):
            device.fill_field(2, 2000)

        self.assertEqual(len(taps), 1)
        self.assertGreaterEqual(taps[0][1], 407)
        self.assertLess(taps[0][1], 1670)
