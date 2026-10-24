#!/usr/bin/env python3
"""Capture a fresh, synthetic-only Android UI audit; never ship the test signer."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time

import emulator_smoke as device

parser = argparse.ArgumentParser()
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--phase', choices=['before', 'after'], required=True)
args = parser.parse_args()
out = device.ROOT / 'qa-results' / ('ui-' + args.phase)
out.mkdir(parents=True, exist_ok=True)
device.OUT = out
checks = []


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


def theme(name):
    root = device.dump('theme-current')
    label = 'Включить дневную тему' if name == 'light' else 'Включить ночную тему'
    if device.find_node(root, label) is not None:
        device.tap_node(label)


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
    capture('00-empty-home-360-dark')
    device.tap_node('Прогноз')
    device.wait_node('Импортировать отчёт')
    capture('01-empty-forecast-360-dark')
    device.tap_node('Главная')
    device.add_slot(hours=4, orders=8, reward=1200)
    device.add_slot(hours=5, orders=10, reward=2000)
    for width, size in [(360, '1080x2400'), (390, '1170x2532')]:
        device.adb('shell', 'wm', 'size', size)
        for mode in ['dark', 'light']:
            device.tap_node('Главная')
            theme(mode)
            suffix = f'{width}-{mode}'
            for index, label in enumerate(['Темп', 'Доход', 'Премии']):
                device.tap_node(label)
                capture(f'home-{index}-{suffix}')
            device.tap_node('Период')
            capture('period-' + suffix)
            device.tap_node('Записи периода')
            root = capture('history-' + suffix)
            text = re.sub(r'\s+', ' ', ' '.join(n.get('text', '') for n in root.iter('node')))
            assert '9 ч' in text and '18 заказов' in text and '3 200' in text, text
            device.tap_node('Прогноз')
            device.wait_node('Импортировать отчёт')
            capture('forecast-' + suffix)
            device.tap_node('Настройки')
            titles = ['Период', '₽/час', 'Темп оплаты', 'Темп премии', 'Мин. часы', 'Крит. темп', '% темп', '% 12 недель']
            fields = ['Начиная с периода', 'Ставка за час', 'Темп для оплаты', 'Темп для премии', 'Минимум часов за период', 'Критический темп', 'Премия за темп', 'Премия за 12 недель']
            previous = 'Период'
            for index, label in enumerate(titles):
                tap_payment_tab(label, previous)
                root = capture(f'settings-{index}-{suffix}')
                assert device.find_node(root, fields[index]) is not None, 'Payment page did not change: ' + label
                previous = label
            device.tap_node('Добавить слот')
            root = capture('form-' + suffix)
            edit = next(n for n in root.iter('node') if n.get('class') == 'android.widget.EditText')
            b = list(map(int, re.findall(r'\d+', edit.get('bounds', ''))))
            device.adb('shell', 'input', 'tap', str((b[0]+b[2])//2), str((b[1]+b[3])//2))
            capture('keyboard-' + suffix)
            device.adb('shell', 'input', 'keyevent', '4')
            device.adb('shell', 'input', 'keyevent', '4')
    device.tap_node('Главная')
    for scale in ['1.3', '2.0']:
        device.adb('shell', 'settings', 'put', 'system', 'font_scale', scale)
        device.adb('shell', 'am', 'force-stop', device.PACKAGE)
        device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
        device.wait_home(30)
        capture('font-' + scale + '-home')
        device.tap_node('Прогноз')
        capture('font-' + scale + '-forecast')
    logs = device.adb('logcat', '-d', '-t', '4000')
    (out / 'logcat.txt').write_text(logs)
    assert not re.search(r'FATAL EXCEPTION:[\s\S]{0,300}ru\.courier\.finance', logs)


status = 'PASS'
try:
    main()
except Exception as error:
    status = 'FAIL'
    checks.append({'status': 'FAIL', 'error': str(error)})
    try:
        capture('failure')
    except Exception:
        pass
    raise
finally:
    (out / 'ui-matrix.json').write_text(json.dumps({
        'result': status, 'phase': args.phase,
        'apkSha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(),
        'testSigningOnly': args.phase == 'after', 'releaseUpgradeVerified': False,
        'checks': checks, 'limits': ['TalkBack not tested', 'Screenshot review required']
    }, ensure_ascii=False, indent=2))
