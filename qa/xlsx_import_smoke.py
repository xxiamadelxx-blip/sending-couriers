#!/usr/bin/env python3
"""Exercise Android's document picker and native XLSX callback with synthetic data."""

import json
import re
import time
from pathlib import Path

from emulator_smoke import OUT, adb, dump, find_node, screenshot, tap_node, wait_node
from make_partial_xlsx import create

NAME = "Courier-QA-partial.xlsx"
DEVICE_PATH = f"/sdcard/Download/{NAME}"


def tap(node):
    bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
    assert len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1], node.attrib
    adb("shell", "input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))


def choose_workbook():
    tap_node("Импортировать отчёт")
    time.sleep(2)
    screenshot("xlsx-picker")
    root = dump("xlsx-picker")
    file = find_node(root, NAME)
    if file is None:
        for word in ("Downloads", "Загрузки"):
            node = find_node(root, word)
            if node is not None:
                tap(node)
                break
        else:
            menu = next((n for n in root.iter("node") if n.get("content-desc", "") in ("Show roots", "Показать меню навигации")), None)
            if menu is not None:
                tap(menu)
                root = dump("xlsx-picker-roots")
                node = find_node(root, "Downloads") or find_node(root, "Загрузки")
                assert node is not None, "Downloads root missing from document picker"
                tap(node)
    _, file = wait_node(NAME, 15)
    tap(file)
    ready = wait_node("История загружена: 1 дней", 20)[0]
    assert find_node(ready, "Прогноз") is not None, "Forecast did not return after XLSX import"
    assert find_node(ready, "Не удалось прочитать файл") is None
    screenshot("xlsx-after-import")


def main():
    fixture = OUT / NAME
    create(fixture)
    adb("push", str(fixture), DEVICE_PATH)
    adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", f"file://{DEVICE_PATH}")
    tap_node("Прогноз")
    choose_workbook()
    choose_workbook()
    (OUT / "xlsx-import-result.json").write_text(json.dumps({"result": "PASS", "repeatedImports": 2,
        "fixture": NAME, "synthetic": True, "note": "UI callback confirmed; idempotent content verified by JVM+JS separately"}, ensure_ascii=False, indent=2))
    print("XLSX picker PASS: two synthetic imports returned to the forecast screen", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        screenshot("xlsx-failure")
        dump("xlsx-failure")
        (OUT / "xlsx-import-result.json").write_text(json.dumps({"result": "FAIL", "error": str(error)}, ensure_ascii=False))
        raise
