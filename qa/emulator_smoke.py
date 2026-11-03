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
NO_WORK_HISTORY_LABEL = "Пока мало данных о рабочем времени"


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



def tap_visible_node(name, attempts=6):
    """Scroll a requested control above the fixed navigation before tapping it.

    Android exposes off-screen WebView controls in UiAutomator's tree. Tapping
    their stale/off-screen bounds can hit the fixed FAB, so only tap after the
    control is fully inside the viewport and above the bottom navigation.
    """
    dimensions = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
    if not dimensions:
        raise AssertionError("Unable to read emulator screen size")
    width, height = map(int, dimensions[-1])
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-") or "target"
    for attempt in range(attempts):
        root = dump(f"scroll-{safe_name}-{attempt}")
        node = find_node(root, name)
        nav = find_node(root, "Главная")
        bounds = list(map(int, re.findall(r"\d+", node.get("bounds", "")))) if node is not None else []
        nav_bounds = list(map(int, re.findall(r"\d+", nav.get("bounds", "")))) if nav is not None else []
        safe_bottom = min(height, nav_bounds[1]) if len(nav_bounds) == 4 else height
        if (len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]
                and bounds[0] >= 0 and bounds[2] <= width
                and bounds[1] >= 0 and bounds[3] <= safe_bottom):
            tap_node(name)
            return
        start_y = min(int(height * .78), safe_bottom - 32)
        end_y = int(height * .30)
        if start_y <= end_y:
            start_y, end_y = int(height * .72), int(height * .25)
        adb("shell", "input", "swipe", str(width // 2), str(start_y),
            str(width // 2), str(end_y), "350")
    raise AssertionError(f"UI node did not enter the visible area above bottom navigation: {name}")


def form_input_point(root, index, minimum_visible_pixels=144):
    """Return a tap point only when the input is exposed inside the scroll pane."""
    fields = [n for n in root.iter("node") if n.get("class") == "android.widget.EditText"
              and n.get("package") == PACKAGE]
    if len(fields) < 7 or index >= len(fields):
        return None
    scroll = next((n for n in root.iter("node") if n.get("class") == "android.view.View"
                   and n.get("scrollable") == "true"), None)
    save = find_node(root, "Сохранить слот")

    def parse_bounds(node):
        return list(map(int, re.findall(r"\d+", node.get("bounds", "")))) if node is not None else []

    sb, fb, pb = map(parse_bounds, (scroll, fields[index], save))
    if any(len(bounds) != 4 for bounds in (sb, fb, pb)):
        return None
    if fb[2] <= fb[0] or fb[3] <= fb[1] or sb[2] <= sb[0] or sb[3] <= sb[1]:
        return None
    top, bottom = max(sb[1], fb[1]), min(sb[3], pb[1], fb[3])
    if fb[0] < sb[0] or fb[2] > sb[2] or bottom - top < minimum_visible_pixels:
        return None
    return (fb[0] + fb[2]) // 2, (top + bottom) // 2


def tap_form_input(index, attempts=8):
    """Scroll an input clear of the fixed save action before tapping it."""
    for attempt in range(attempts):
        root = dump(f"editing-{index}-{attempt}")
        point = form_input_point(root, index)
        if point is not None:
            adb("shell", "input", "tap", str(point[0]), str(point[1]))
            return
        if index == 2:
            fields = [n for n in root.iter("node") if n.get("class") == "android.widget.EditText"
                      and n.get("package") == PACKAGE]
            scrollables = [n for n in root.iter("node") if n.get("class") == "android.view.View"
                           and n.get("scrollable") == "true"]
            scroll = scrollables[0] if scrollables else None
            save = find_node(root, "Сохранить слот")
            diagnostics = {
                "attempt": attempt,
                "fieldCount": len(fields),
                "target": fields[index].attrib if len(fields) > index else None,
                "fields": [{"text": n.get("text"), "content-desc": n.get("content-desc"),
                            "resource-id": n.get("resource-id"), "bounds": n.get("bounds")}
                           for n in fields],
                "scrollables": [{"bounds": n.get("bounds"), "content-desc": n.get("content-desc"),
                                 "resource-id": n.get("resource-id")}
                                for n in scrollables],
                "save": save.attrib if save is not None else None,
            }
            print("FORM_INPUT_GEOMETRY " + json.dumps(diagnostics, ensure_ascii=False), flush=True)
        scroll = next((n for n in root.iter("node") if n.get("class") == "android.view.View"
                       and n.get("scrollable") == "true"), None)
        bounds = (list(map(int, re.findall(r"\d+", scroll.get("bounds", ""))))
                  if scroll is not None else [])
        if len(bounds) != 4 or bounds[2] <= bounds[0] or bounds[3] - bounds[1] < 96:
            raise AssertionError(f"Slot form scroll area missing while locating input {index}")
        x = (bounds[0] + bounds[2]) // 2
        adb("shell", "input", "swipe", str(x), str(bounds[3] - 32),
            str(x), str(bounds[1] + 32), "350")
    raise AssertionError(f"Slot form input {index} did not enter the visible area")


def fill_field(index, value):
    tap_form_input(index)
    adb("shell", "input", "text", str(value))
    if index == 2 and value == 0:
        screenshot("ime-rest-reward")
        dump("ime-rest-reward")
    adb("shell", "input", "keyevent", "4")
    root = dump(f"filled-{index}")
    fields = [n for n in root.iter("node") if n.get("class") == "android.widget.EditText"
              and n.get("package") == PACKAGE]
    assert len(fields) >= 7 and fields[index].get("text") == str(value), (
        f"Input {index} did not retain {value}: "
        f"{fields[index].get('text') if len(fields) > index else 'missing'}")
    if find_node(root, "Сохранить слот") is None:
        raise AssertionError("Leaving the input closed the slot form instead of the keyboard")


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
