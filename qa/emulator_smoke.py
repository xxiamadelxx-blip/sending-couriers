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
APK = ROOT / "qa" / "Courier-Finance-1.7.8.apk"
EXPECTED = "e6b24ecddf0c728f146b85522e86b2d2b9b340af006b9da4908c0b157f500644"
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
    (OUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))


def find_node(root, name):
    for node in root.iter("node"):
        if node.get("text", "") == name or node.get("content-desc", "") == name:
            return node
    return None


def wait_node(name, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        try:
            root = dump("current")
            found = find_node(root, name)
            if found is not None:
                return root, found
        except (ET.ParseError, RuntimeError):
            pass
        time.sleep(1)
    raise AssertionError(f"UI node not found: {name}")


def tap_node(name):
    _, node = wait_node(name)
    coords = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
    if len(coords) != 4:
        raise AssertionError(f"No bounds for {name}: {node.attrib}")
    adb("shell", "input", "tap", str((coords[0] + coords[2]) // 2), str((coords[1] + coords[3]) // 2))


def main():
    assert hashlib.sha256(APK.read_bytes()).hexdigest() == EXPECTED, "APK hash mismatch"
    assert "emulator" in adb("devices"), "No emulator attached"
    adb("shell", "wm", "size", "1080x2400")
    adb("shell", "wm", "density", "480")
    adb("shell", "settings", "put", "system", "font_scale", "1.0")
    adb("install", "-r", str(APK))
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-n", ACTIVITY)
    wait_node("Главная", 45)
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
        screenshot(picture)

    adb("shell", "input", "keyevent", "4")
    adb("shell", "wm", "size", "1170x2532")
    adb("shell", "wm", "density", "480")
    tap_node("Главная")
    time.sleep(1)
    screenshot("06-home-390-dark")
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
