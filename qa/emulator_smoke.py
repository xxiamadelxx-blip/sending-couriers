#!/usr/bin/env python3
"""Black-box smoke test of the signed release APK on a real Android emulator."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "qa-results"
OUT.mkdir(exist_ok=True)
OLD_APK = ROOT / "qa" / "Courier-Finance-1.7.8.apk"
OLD_HASH = "e6b24ecddf0c728f146b85522e86b2d2b9b340af006b9da4908c0b157f500644"
APK = ROOT / "qa" / "Courier-Finance-1.7.11.apk"
EXPECTED = "0daa53d8fa79bfd2d19c4c0a16c36a065c24ee0cbb390fec3ca0ef302b50ef58"
PACKAGE = "ru.courier.finance"
ACTIVITY = f"{PACKAGE}/.MainActivity"


def adb(*args, binary=False, check=True):
    proc = subprocess.run(["adb", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if check and proc.returncode:
        raise RuntimeError(f"adb {' '.join(args)}: {proc.stderr.decode(errors='replace')}")
    return proc.stdout if binary else proc.stdout.decode(errors="replace")


def dump(name):
    adb("shell", "uiautomator", "dump", "/sdcard/window.xml")
    xml = adb("exec-out", "cat", "/sdcard/window.xml")
    (OUT / f"{name}.xml").write_text(xml)
    return ET.fromstring(xml)


def screenshot(name):
    time.sleep(2)
    (OUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))


def find_node(root, name):
    for node in root.iter("node"):
        if node.get("text", "") == name or node.get("content-desc", "") == name:
            return node
    return None


def dismiss_launcher_anr(root):
    title = next((n for n in root.iter("node") if any(t in n.get("text", "") for t in
                  ("Pixel Launcher isn't responding", "Quickstep isn't responding"))), None)
    if title is None:
        return False
    button = find_node(root, "Close app")
    if button is None:
        button = find_node(root, "Wait")
    coords = list(map(int, re.findall(r"\d+", button.get("bounds", ""))))
    adb("shell", "input", "tap", str((coords[0] + coords[2]) // 2), str((coords[1] + coords[3]) // 2))
    time.sleep(1)
    return True


def wait_node(name, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        try:
            root = dump("current")
            if dismiss_launcher_anr(root):
                continue
            found = find_node(root, name)
            if found is not None:
                return root, found
        except (ET.ParseError, RuntimeError):
            pass
        time.sleep(1)
    raise AssertionError(f"UI node not found: {name}")


def wait_home(seconds=20):
    """Wait for an actual loaded home; tolerate transient UiAutomator dump failure.

    A failed accessibility snapshot is not evidence of app failure. Keep the
    bounded wait and still require visible Home + absence of the slot form.
    """
    end = time.monotonic() + seconds
    last_snapshot_error = None
    while time.monotonic() < end:
        try:
            root = dump("home-current")
        except (RuntimeError, ET.ParseError) as error:
            last_snapshot_error = error
            time.sleep(1)
            continue
        if dismiss_launcher_anr(root):
            continue
        if find_node(root, "Главная") is not None and find_node(root, "Сохранить слот") is None:
            return root
        time.sleep(1)
    if last_snapshot_error is not None:
        raise AssertionError(
            f"Home was not observed within {seconds}s; latest Android XML dump failed: {last_snapshot_error}"
        ) from last_snapshot_error
    raise AssertionError("Slot form did not return to home")


def tap_node(name):
    _, node = wait_node(name)
    coords = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
    if len(coords) != 4:
        raise AssertionError(f"No bounds for {name}: {node.attrib}")
    adb("shell", "input", "tap", str((coords[0] + coords[2]) // 2), str((coords[1] + coords[3]) // 2))


def fill_field(index, value):
    root = dump(f"editing-{index}")
    fields = [n for n in root.iter("node") if n.get("class") == "android.widget.EditText"
              and n.get("package") == PACKAGE]
    assert len(fields) >= 7, f"Expected seven monetary/counter inputs, got {len(fields)}"
    coords = list(map(int, re.findall(r"\d+", fields[index].get("bounds", ""))))
    adb("shell", "input", "tap", str((coords[0] + coords[2]) // 2), str((coords[1] + coords[3]) // 2))
    adb("shell", "input", "text", str(value))
    if index == 2 and value == 0:
        screenshot("ime-rest-reward")
        dump("ime-rest-reward")
    adb("shell", "input", "keyevent", "4")


def add_slot(hours=None, orders=None, reward=0):
    print(f"Add slot: {hours=} {orders=} {reward=}", flush=True)
    tap_node("Добавить слот")
    wait_node("Сохранить слот")
    if hours is not None:
        fill_field(0, hours)
    if orders is not None:
        fill_field(1, orders)
    fill_field(2, reward)
    tap_node("Сохранить слот")
    wait_home()


def main():
    assert hashlib.sha256(OLD_APK.read_bytes()).hexdigest() == OLD_HASH, "Previous APK hash mismatch"
    assert hashlib.sha256(APK.read_bytes()).hexdigest() == EXPECTED, "APK hash mismatch"
    assert "emulator" in adb("devices"), "No emulator attached"
    adb("shell", "wm", "size", "1080x2400")
    adb("shell", "wm", "density", "480")
    adb("shell", "settings", "put", "system", "font_scale", "1.0")
    time.sleep(8)  # Let the system launcher finish cold boot before driving WebView.
    adb("install", "-r", str(OLD_APK))
    print("Installed 1.7.8", flush=True)
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-n", ACTIVITY)
    wait_node("Главная", 45)
    add_slot(reward=0)
    tap_node("Период")
    tap_node("Записи периода")
    assert any(re.sub(r"\s+", " ", n.get("text", "")).strip() == "0 ₽" for n in dump("rest-history").iter("node")), "Zero reward did not persist"
    tap_node("Главная")
    add_slot(hours=4, orders=8, reward=1200)
    add_slot(hours=5, orders=10, reward=2000)
    screenshot("00-three-slots-before-upgrade")
    adb("install", "-r", str(APK))
    print("Updated to 1.7.11", flush=True)
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-n", ACTIVITY)
    wait_node("Главная", 45)
    tap_node("Период")
    root = dump("after-upgrade-period")
    visible = " ".join(n.get("text", "") for n in root.iter("node"))
    assert "9 ч" in visible and "18" in visible, "Slots were lost or not summed after APK upgrade"
    tap_node("Записи периода")
    history = re.sub(r"\s+", " ", " ".join(n.get("text", "") for n in dump("after-upgrade-history").iter("node")))
    assert "9 ч · 18 заказов" in history and "3 200" in history, "Day totals changed after APK upgrade"
    tap_node("Главная")
    screenshot("01-home-360-dark")

    pages = [("Период", "02-period-360-dark"), ("Прогноз", "03-forecast-360-dark"),
             ("Настройки", "04-settings-360-dark"), ("Добавить слот", "05-slot-360-dark")]
    for tab, picture in pages:
        tap_node(tab)
        time.sleep(1)
        root = dump(picture.removesuffix(".png"))
        text = " ".join((n.get("text", "") + " " + n.get("content-desc", "")) for n in root.iter("node"))
        if tab == "Добавить слот":
            assert "Сохранить слот" in text or "Вознаграждение" in text, "Slot form did not open"
        else:
            assert tab in text, f"{tab} screen did not open"
        if tab == "Прогноз":
            deadline = time.monotonic() + 25
            while "Готовим прогноз" in text and time.monotonic() < deadline:
                time.sleep(1)
                root = dump("forecast-ready")
                text = " ".join(n.get("text", "") for n in root.iter("node"))
            assert "Готовим прогноз" not in text, "Forecast Worker did not finish after APK upgrade"
            import_button = find_node(root, "Импортировать отчёт")
            home_tab = find_node(root, "Главная")
            assert import_button is not None and home_tab is not None, "Forecast import or navigation is missing"
            import_bottom = list(map(int, re.findall(r"\d+", import_button.get("bounds", ""))))[3]
            nav_top = list(map(int, re.findall(r"\d+", home_tab.get("bounds", ""))))[1]
            assert import_bottom <= nav_top - 12, f"Forecast import overlaps navigation: {import_bottom=} {nav_top=}"
        screenshot(picture)
        if tab == "Настройки":
            for _ in range(3):
                adb("shell", "input", "swipe", "540", "1770", "540", "550", "360")
            assert find_node(dump("settings-version"), "Версия 1.7.11") is not None, "Settings version differs from APK"
            tap_node("Главная")
            tap_node("Настройки")
            screenshot("04-settings-reopened-360-dark")

    adb("shell", "input", "keyevent", "4")
    adb("shell", "wm", "size", "1170x2532")
    adb("shell", "wm", "density", "480")
    tap_node("Главная")
    time.sleep(1)
    screenshot("06-home-390-dark")
    tap_node("Включить дневную тему")
    time.sleep(1)
    screenshot("07-home-390-light")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-n", ACTIVITY)
    wait_node("Включить ночную тему", 30)
    screenshot("08-home-390-light-restarted")
    assert adb("shell", "pidof", PACKAGE).strip(), "App process died"
    logs = adb("logcat", "-d", "-t", "4000")
    (OUT / "logcat.txt").write_text(logs)
    assert not re.search(r"FATAL EXCEPTION:[\s\S]{0,300}ru\.courier\.finance", logs), "Native crash in logcat"
    (OUT / "result.json").write_text(json.dumps({"result": "PASS", "apkSha256": EXPECTED,
                                                  "screens": [x.name for x in OUT.glob("*.png")]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        try:
            screenshot("failure")
            (OUT / "failure.xml").write_text(adb("exec-out", "cat", "/sdcard/window.xml", check=False))
            (OUT / "logcat.txt").write_text(adb("logcat", "-d", "-t", "4000", check=False))
        finally:
            (OUT / "result.json").write_text(json.dumps({"result": "FAIL", "error": str(exc)}, ensure_ascii=False))
        raise
