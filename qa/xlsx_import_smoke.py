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
    wait_node("Пока мало данных о рабочем времени", 25)
    screenshot("xlsx-after-import")


def exported_state():
    """Read the same JSON backup a courier can save through Android's picker."""
    tap_node("Главная")
    tap_node("Экспорт для ChatGPT")
    tap_node("Резервная копия JSON")
    root = dump("backup-picker")
    for word in ("Downloads", "Загрузки"):
        node = find_node(root, word)
        if node is not None:
            tap(node)
            break
    root = dump("backup-destination")
    save = next((node for node in root.iter("node") if
                 (node.get("text", "") or node.get("content-desc", "")).casefold() in ("save", "сохранить")
                 and node.get("enabled") == "true"), None)
    assert save is not None, "Android backup destination has no Save button"
    tap(save)
    filename = "courier-backup-" + adb("shell", "date", "+%Y-%m-%d").strip() + ".json"
    path = "/sdcard/Download/" + filename
    for _ in range(20):
        raw = adb("exec-out", "cat", path, binary=True, check=False)
        if raw:
            try:
                state = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError):
                time.sleep(.5)  # Android may create the destination before the write finishes.
                continue
            adb("shell", "rm", path)
            tap_node("Закрыть")
            tap_node("Прогноз")
            return state
        time.sleep(.5)
    raise AssertionError("Saved JSON backup is missing or incomplete in Downloads")


def exported_forecast():
    return exported_state()["forecast"]


def assert_imported(forecast):
    day = forecast["days"]["2026-10-20"]
    events = day["orderEvidence"]
    assert day["orders"] == 2 and len(events) == 2, "Import did not store both orders exactly once"
    assert sum(event.get("acceptedMin") is not None for event in events) == 1
    assert sum(event.get("deliveredMin") is not None for event in events) == 1
    assert sum(event.get("acceptedMin") is not None and event.get("deliveredMin") is not None for event in events) == 1
    assert day["workConfirmed"] is False, "Reconstructed hours became confirmed work"
    return {"orders": day["orders"], "events": [(e["id"], e.get("acceptedMin"), e.get("deliveredMin")) for e in events],
            "workingMin": day["workingMin"], "workConfirmed": day["workConfirmed"]}


def main():
    fixture = OUT / NAME
    create(fixture)
    adb("push", str(fixture), DEVICE_PATH)
    adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", f"file://{DEVICE_PATH}")
    tap_node("Прогноз")
    choose_workbook()
    first = assert_imported(exported_forecast())
    choose_workbook()
    second = assert_imported(exported_forecast())
    assert first == second, "Repeated XLSX import changed order facts"
    (OUT / "xlsx-import-result.json").write_text(json.dumps({"result": "PASS", "repeatedImports": 2,
        "fixture": NAME, "synthetic": True, "stored": second}, ensure_ascii=False, indent=2))
    print("XLSX picker PASS: saved backup confirms two events and repeat import is idempotent", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        screenshot("xlsx-failure")
        dump("xlsx-failure")
        (OUT / "xlsx-import-result.json").write_text(json.dumps({"result": "FAIL", "error": str(error)}, ensure_ascii=False))
        raise
