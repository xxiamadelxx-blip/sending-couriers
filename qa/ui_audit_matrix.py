#!/usr/bin/env python3
"""Capture a fresh, synthetic-only Android UI audit; never ship the test signer."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time
import xml.etree.ElementTree as ET

import emulator_smoke as device
from empty_state_contract import assert_empty_home, assert_empty_history, assert_empty_backup
from xlsx_import_smoke import exported_state

FORECAST_STEP_MINUTES = 30

parser = argparse.ArgumentParser()
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--phase', choices=['before', 'after'], required=True)
parser.add_argument('--focus', choices=['full', 'delta', 'content'], default='full')
args = parser.parse_args()
out = device.ROOT / 'qa-results' / ('ui-' + args.phase)
out.mkdir(parents=True, exist_ok=True)
device.OUT = out
checks = []
missing_content = []
raw_dump = device.dump


def stable_dump(name):
    for attempt in range(3):
        try:
            device.adb('shell', 'rm', '-f', '/sdcard/window.xml')
            return raw_dump(name)
        except (ET.ParseError, RuntimeError) as error:
            (out / f'{name}-attempt-{attempt+1}-error.txt').write_text(str(error))
            raw = out / (name + '.xml')
            if raw.exists():
                (out / f'{name}-parse-attempt-{attempt+1}.txt').write_text(raw.read_text())
            if attempt == 2:
                raise
            time.sleep(.5)


device.dump = stable_dump


def capture(name):
    root = device.dump(name)
    device.screenshot(name)
    targets = []
    for n in root.iter('node'):
        bounds = list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
        if n.get('clickable') == 'true' and len(bounds) == 4 and bounds[2] > bounds[0]:
            targets.append({'label': n.get('text') or n.get('content-desc'), 'bounds': bounds,
                            'widthDp': (bounds[2] - bounds[0]) / 3,
                            'heightDp': (bounds[3] - bounds[1]) / 3})
    checks.append({'screen': name, 'status': 'CAPTURED', 'targets': targets})
    return root


def scroll_forecast_to_top(attempts=8):
    """Scroll back to the forecast header before checking earlier controls."""
    for attempt in range(attempts):
        root = device.dump(f'font-2.0-forecast-top-{attempt}')
        heading = device.find_node(root, 'Прогноз на сегодня')
        nav = device.find_node(root, 'Главная')
        hb = list(map(int, re.findall(r'\d+', heading.get('bounds', '')))) if heading is not None else []
        nb = list(map(int, re.findall(r'\d+', nav.get('bounds', '')))) if nav is not None else []
        if (len(hb) == len(nb) == 4 and hb[2] > hb[0] and hb[3] > hb[1]
                and hb[1] >= 0 and hb[3] <= nb[1]):
            return root
        scroll = next((n for n in root.iter('node') if n.get('scrollable') == 'true'
                       and n.get('class') != 'android.widget.HorizontalScrollView'), None)
        if scroll is None:
            scroll = next(n for n in root.iter('node') if n.get('class') == 'android.webkit.WebView')
        sb = list(map(int, re.findall(r'\d+', scroll.get('bounds', ''))))
        assert len(sb) == 4, 'Forecast scroll area missing at 200%'
        nav_top = nb[1] if len(nb) == 4 else sb[3]
        top, bottom = max(sb[1], 0), min(sb[3], nav_top - 16)
        assert bottom - top >= 96, 'Forecast scroll area missing at 200%'
        x = (sb[0] + sb[2]) // 2
        device.adb('shell', 'input', 'swipe', str(x), str(top + (bottom-top)//4),
                   str(x), str(top + (bottom-top)*3//4), '450')
    raise AssertionError('Forecast header did not return into view after upward scroll')


def scroll_forecast_action_into_view(label, attempts=8):
    """Scroll toward later forecast content until one action has a safe hitbox."""
    for attempt in range(attempts):
        root = device.dump(f'font-2.0-action-{attempt}')
        node = device.find_node(root, label)
        nav = device.find_node(root, 'Главная')
        bounds = list(map(int, re.findall(r'\d+', node.get('bounds', '')))) if node is not None else []
        nav_bounds = list(map(int, re.findall(r'\d+', nav.get('bounds', '')))) if nav is not None else []
        if (len(bounds) == len(nav_bounds) == 4 and bounds[2] > bounds[0]
                and bounds[3] > bounds[1] and bounds[0] >= 0 and bounds[1] >= 0
                and bounds[3] <= nav_bounds[1]):
            assert bounds[2] - bounds[0] >= 144 and bounds[3] - bounds[1] >= 144, (
                f'200% forecast action below 48dp: {label} {bounds}'
            )
            return root
        scroll = next((n for n in root.iter('node') if n.get('scrollable') == 'true'
                       and n.get('class') != 'android.widget.HorizontalScrollView'), None)
        if scroll is None:
            scroll = next(n for n in root.iter('node') if n.get('class') == 'android.webkit.WebView')
        sb = list(map(int, re.findall(r'\d+', scroll.get('bounds', ''))))
        assert len(sb) == 4, 'Forecast scroll area missing at 200%'
        nav_top = nav_bounds[1] if len(nav_bounds) == 4 else sb[3]
        top, bottom = max(sb[1], 0), min(sb[3], nav_top - 16)
        assert bottom - top >= 96, 'Forecast scroll area missing at 200%'
        x = (sb[0] + sb[2]) // 2
        device.adb('shell', 'input', 'swipe', str(x), str(top + (bottom-top)*3//4),
                   str(x), str(top + (bottom-top)//4), '450')
    raise AssertionError(f'200% forecast action did not enter the viewport: {label}')


def capture_startup(mode):
    """Keep several unaltered Android frames from a real cold start for visual review."""
    device.adb('shell', 'am', 'force-stop', device.PACKAGE)
    device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
    for index in range(5):
        (out / f'startup-{mode}-{index}.png').write_bytes(
            device.adb('exec-out', 'screencap', '-p', binary=True))
        time.sleep(.15)
    device.wait_home(45)


def durations(root):
    return [float(n.get('text', '').replace(',', '.')) for n in root.iter('node')
            if n.get('class') == 'android.widget.EditText']


def theme(name):
    root = device.dump('theme-current')
    label = 'Включить дневную тему' if name == 'light' else 'Включить ночную тему'
    if device.find_node(root, label) is not None:
        device.tap_node(label)
    expected = 'Включить ночную тему' if name == 'light' else 'Включить дневную тему'
    assert device.find_node(device.dump('theme-verified'), expected) is not None, 'Theme was not applied: ' + name


def tap_payment_tab(label, previous):
    root = device.dump('payment-current')
    node = device.find_node(root, label)
    bounds = list(map(int, re.findall(r'\d+', node.get('bounds', '')))) if node is not None else []
    width = int(re.findall(r'\d+', device.adb('shell', 'wm', 'size'))[-2])
    if len(bounds) != 4 or bounds[2] <= bounds[0] or bounds[0] >= width:
        anchor = device.find_node(root, previous)
        assert anchor is not None, 'Payment tab anchor missing: ' + previous
        b = list(map(int, re.findall(r'\d+', anchor.get('bounds', ''))))
        device.adb('shell', 'input', 'swipe', str(int(width * .8)), str((b[1]+b[3])//2),
                   str(int(width * .2)), str((b[1]+b[3])//2), '400')
    device.tap_node(label)


def preview_json_import(suffix):
    """Open a synthetic JSON file through Android DocumentsUI, then cancel."""
    name = 'Courier-QA-import-preview.json'
    device.tap_node('Импорт JSON')
    time.sleep(2)
    root = device.dump('json-import-picker-current')
    if device.find_node(root, name) is None:
        destination = device.find_node(root, 'Downloads') or device.find_node(root, 'Загрузки')
        if destination is None:
            menu = next((n for n in root.iter('node') if n.get('content-desc', '')
                         in ('Show roots', 'Показать меню навигации')), None)
            assert menu is not None, 'JSON picker has no Downloads or root menu'
            bounds = list(map(int, re.findall(r'\d+', menu.get('bounds', ''))))
            device.adb('shell', 'input', 'tap', str((bounds[0]+bounds[2])//2),
                       str((bounds[1]+bounds[3])//2))
            root = device.dump('json-import-picker-roots')
            destination = device.find_node(root, 'Downloads') or device.find_node(root, 'Загрузки')
            assert destination is not None, 'JSON picker Downloads root missing'
        bounds = list(map(int, re.findall(r'\d+', destination.get('bounds', ''))))
        device.adb('shell', 'input', 'tap', str((bounds[0]+bounds[2])//2),
                   str((bounds[1]+bounds[3])//2))
    device.tap_node(name)
    device.wait_node('Импорт данных', 30)
    opened = capture(f'import-dialog-{suffix}')
    for label in ('Импортировать', 'Отмена'):
        assert device.find_node(opened, label) is not None, f'Import action missing: {label}'
    device.tap_node('Отмена')
    device.wait_node('Пока нет записей', 20)


def main():
    assert args.apk.is_file()
    # This dedicated CI emulator contains only facts created by these QA scripts.
    device.adb('uninstall', device.PACKAGE, check=False)
    device.adb('shell', 'wm', 'size', '1080x2400')
    device.adb('shell', 'wm', 'density', '480')
    device.adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')
    device.adb('install', str(args.apk.resolve()))
    device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
    device.wait_home(45)
    if args.phase == 'after' and args.focus == 'full':
        capture_startup('dark')
        theme('light')
        capture_startup('light')
        theme('dark')
        name = 'Courier-QA-import-preview.json'
        fixture = out / name
        fixture.write_text(json.dumps({
            'schemaVersion': 4,
            'entries': [{'id': f'qa-i