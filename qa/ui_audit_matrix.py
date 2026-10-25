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
    if args.focus == 'content':
        device.tap_node('Период')
        device.tap_node('Записи периода')
        root = capture('01-empty-history-360-dark')
        assert device.find_node(root, 'Пока нет записей') is not None
    else:
        device.tap_node('Прогноз')
        device.wait_node('Импортировать отчёт')
        capture('01-empty-forecast-360-dark')
    device.tap_node('Главная')
    device.add_slot(hours=4, orders=8, reward=1200)
    device.add_slot(hours=5, orders=10, reward=2000)
    if args.phase == 'after' and args.focus != 'content':
        device.tap_node('Прогноз')
        for _ in range(6):
            device.tap_node('Из них буду работать: минус 15 минут')
        device.tap_node('Главная')
        device.adb('shell', 'am', 'force-stop', device.PACKAGE)
        device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
        device.wait_home(30)
        device.tap_node('Прогноз')
        root = capture('plan-6-5-after-process-restart')
        fields = [n.get('text', '') for n in root.iter('node') if n.get('class') == 'android.widget.EditText']
        assert len(fields) == 2 and [float(v.replace(',', '.')) for v in fields] == [14, 6.5], fields
        for _ in range(6):
            device.tap_node('Из них буду работать: плюс 15 минут')
        root = device.dump('duration-gesture-before')
        assert durations(root) == [14, 8], 'Restore before gesture checks failed'
        slider = next(n for n in root.iter('node') if n.get('class') == 'android.widget.SeekBar'
                      and 'Из них буду работать' in n.get('text', ''))
        b = list(map(int, re.findall(r'\d+', slider.get('bounds', ''))))
        y = (b[1] + b[3]) // 2
        device.adb('shell', 'input', 'tap', str(b[2]-8), str(y))
        root = capture('duration-track-touch')
        assert durations(root) == [14, 8], 'Track touch changed duration'
        thumb = b[0] + 51 + (b[2]-b[0]-102) // 3  # 34 dp thumb, value 8/24, density 3.
        device.adb('shell', 'input', 'swipe', str(thumb), str(y), str(thumb+120), str(y), '450')
        root = capture('duration-thumb-drag')
        assert durations(root) == [14, 9], 'Thumb drag must use four 15-minute detents'
        for _ in range(4):
            device.tap_node('Из них буду работать: минус 15 минут')
        device.tap_node('Главная')
    for width, size in [(360, '1080x2400'), (390, '1170x2532')]:
        device.adb('shell', 'wm', 'size', size)
        for mode in ['dark', 'light']:
            device.tap_node('Главная')
            theme(mode)
            suffix = f'{width}-{mode}'
            root = capture(f'home-{suffix}')
            assert device.find_node(root, 'Темп периода') is not None, 'Period pace is missing'
            device.adb('shell', 'input', 'swipe', '540', '1800', '540', '750', '450')
            root = capture(f'home-finance-{suffix}')
            assert device.find_node(root, 'Общий доход') is not None, 'Income is missing from the main scroll'
            if args.focus == 'content':
                visible_text = re.sub(r'\s+', ' ', ' '.join(n.get('text', '') for n in root.iter('node')))
                if '3 240' not in visible_text:
                    missing_content.append(f'home-income-{suffix}: {visible_text}')
            if args.focus == 'content':
                continue
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
            root = capture(f'settings-main-{suffix}')
            assert device.find_node(root, 'Действует с даты') is not None
            assert device.find_node(root, 'Ставка за час') is not None, 'Date and rate must share the same screen'
            if args.focus != 'delta':
                device.tap_node('Остальные условия')
                root = capture(f'settings-more-{suffix}')
                assert device.find_node(root, 'Темп для оплаты') is not None
            device.tap_node('Добавить слот')
            root = capture('form-' + suffix)
            edit = next(n for n in root.iter('node') if n.get('class') == 'android.widget.EditText')
            b = list(map(int, re.findall(r'\d+', edit.get('bounds', ''))))
            device.adb('shell', 'input', 'tap', str((b[0]+b[2])//2), str((b[1]+b[3])//2))
            capture('keyboard-' + suffix)
            device.adb('shell', 'input', 'keyevent', '4')
            device.adb('shell', 'input', 'keyevent', '4')
    if args.focus == 'content':
        assert not missing_content, 'Main headings or values missing: ' + ', '.join(missing_content)
        return
    device.tap_node('Главная')
    for scale in ['1.3', '2.0']:
        device.adb('shell', 'settings', 'put', 'system', 'font_scale', scale)
        device.adb('shell', 'am', 'force-stop', device.PACKAGE)
        device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
        device.wait_home(30)
        capture('font-' + scale + '-home')
        device.tap_node('Прогноз')
        root = capture('font-' + scale + '-forecast')
        before_scroll = durations(root)
        for attempt in range(3):
            root = device.dump(f'font-scroll-current-{attempt}')
            action = device.find_node(root, 'Импортировать отчёт')
            nav = device.find_node(root, 'Главная')
            if action is not None and nav is not None:
                ab = list(map(int, re.findall(r'\d+', action.get('bounds', ''))))
                nb = list(map(int, re.findall(r'\d+', nav.get('bounds', ''))))
                if len(ab) == 4 and ab[3] > ab[1] and ab[3] <= nb[1]:
                    break
            scroll = next((n for n in root.iter('node') if n.get('scrollable') == 'true' and n.get('class') != 'android.widget.HorizontalScrollView'), None)
            if scroll is None:
                scroll = next(n for n in root.iter('node') if n.get('class') == 'android.webkit.WebView')
            b = list(map(int, re.findall(r'\d+', scroll.get('bounds', ''))))
            x = (b[0]+b[2])//2
            device.adb('shell', 'input', 'swipe', str(x), str(b[1]+(b[3]-b[1])*3//4), str(x), str(b[1]+(b[3]-b[1])//4), '450')
        root = capture('font-' + scale + '-forecast-bottom')
        assert durations(root) == before_scroll, 'Vertical scroll changed planned hours'
        action = device.find_node(root, 'Импортировать отчёт')
        nav = device.find_node(root, 'Главная')
        assert action is not None and nav is not None, 'Large-text import action missing'
        action_bounds = list(map(int, re.findall(r'\d+', action.get('bounds', ''))))
        nav_bounds = list(map(int, re.findall(r'\d+', nav.get('bounds', ''))))
        assert action_bounds[2] > action_bounds[0] and action_bounds[3] > action_bounds[1] and action_bounds[1] >= 0 and action_bounds[3] <= nav_bounds[1], 'Large-text import is missing or covered by navigation'
        device.tap_node('Настройки')
        capture('font-' + scale + '-settings')
        device.tap_node('Добавить слот')
        capture('font-' + scale + '-form')
        device.adb('shell', 'input', 'keyevent', '4')
        device.tap_node('Главная')
    logs = device.adb('logcat', '-d', '-t', '4000')
    (out / 'logcat.txt').write_text(logs)
    assert not re.search(r'FATAL EXCEPTION:[\s\S]{0,300}ru\.courier\.finance', logs)
    if args.phase == 'after' and missing_content:
        raise AssertionError('Main content is missing from the native accessibility tree: ' + ', '.join(missing_content))


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
    try:
        (out / 'logcat.txt').write_text(device.adb('logcat', '-d', '-t', '4000', check=False))
    except Exception:
        pass
    (out / 'ui-matrix.json').write_text(json.dumps({
        'result': status, 'phase': args.phase,
        'apkSha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(),
        'testSigningOnly': args.phase == 'after', 'releaseUpgradeVerified': False,
        'visualAuditStatus': 'NOT_VERIFIED', 'imeInteractionStatus': 'CAPTURED_REQUIRES_REVIEW',
        'checks': checks, 'focus': args.focus,
        'limits': ['TalkBack not tested', 'Screenshot review required', 'Large text only at 390 dp in light theme']
    }, ensure_ascii=False, indent=2))
