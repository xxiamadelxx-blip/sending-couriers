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
        name = 'Courier-QA-import-preview.json'
        fixture = out / name
        fixture.write_text(json.dumps({
            'schemaVersion': 4,
            'entries': [{'id': f'qa-import-{i}', 'date': f'2026-10-{16+i:02d}',
                         'dailyHours': 4, 'dailyOrders': 8, 'reward': 1200}
                        for i in range(7)],
            'closures': {}
        }))
        device_path = '/sdcard/Download/' + name
        device.adb('push', str(fixture), device_path)
        fixture.unlink()
        device.adb('shell', 'am', 'broadcast', '-a',
                   'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
                   '-d', 'file://' + device_path)
        # Independent native empty-state acceptance: all width/theme layouts
        # before creating any synthetic facts. An abandoned form must remain
        # empty after history navigation and after Android force-stop.
        for width, size in [(360, '1080x2400'), (390, '1170x2532')]:
            device.adb('shell', 'wm', 'size', size)
            for mode in ('dark', 'light'):
                theme(mode)
                suffix = f'{width}-{mode}'
                assert_empty_home(capture(f'00-empty-home-{suffix}'))
                device.tap_node('Добавить первый слот')
                device.wait_node('Сохранить слот')
                capture(f'00-empty-form-{suffix}')
                device.tap_node('Назад')
                # A cancelled form navigates to History, not directly Home.
                # The Home button exists on both screens, so its presence alone
                # was never proof that the navigation actually completed.
                device.wait_node('Пока нет записей', 20)
                assert_empty_history(capture(f'00-empty-cancelled-history-{suffix}'))
                device.tap_node('Главная')
                device.wait_node('Смена ещё не записана', 20)
                assert_empty_home(capture(f'00-empty-cancelled-{suffix}'))
                device.tap_node('Период')
                device.tap_node('Записи периода')
                device.wait_node('Пока нет записей', 20)
                assert_empty_history(capture(f'00-empty-history-{suffix}'))
                preview_json_import(suffix)
                device.tap_node('Главная')
                device.wait_node('Смена ещё не записана', 20)
        # The XML screen alone cannot prove an empty native database. Save the
        # actual user-facing Android JSON backup before and after force-stop.
        # Only the entry count enters QA artifacts, never the exported data.
        backup_result = {'result': 'FAIL', 'source': 'native Android DocumentsUI JSON backup',
                         'synthetic': True, 'beforeRestartEntries': None,
                         'afterRestartEntries': None}
        try:
            backup_result['beforeRestartEntries'] = assert_empty_backup(exported_state())
            device.tap_node('Главная')
            device.wait_node('Смена ещё не записана', 20)
            device.adb('shell', 'am', 'force-stop', device.PACKAGE)
            device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
            device.wait_home(30)
            device.wait_node('Смена ещё не записана', 20)
            assert_empty_home(capture('00-empty-after-restart-390-light'))
            backup_result['afterRestartEntries'] = assert_empty_backup(exported_state())
            backup_result['result'] = 'PASS'
        finally:
            (out / '00-empty-json-backup-result.json').write_text(
                json.dumps(backup_result, ensure_ascii=False, indent=2))
        device.tap_node('Главная')
        device.wait_node('Смена ещё не записана', 20)
        device.adb('shell', 'wm', 'size', '1080x2400')
        theme('dark')
    else:
        empty_root = capture('00-empty-home-360-dark')
        assert device.find_node(empty_root, 'Смена ещё не записана') is not None, 'Empty state heading missing'
        assert device.find_node(empty_root, 'Добавить первый слот') is not None, 'First-shift CTA missing'
        device.tap_node('Добавить первый слот')
        device.wait_node('Сохранить слот')
        device.tap_node('Назад')
        device.tap_node('Главная')
        root_after_cancel = device.dump('first-slot-abandoned')
        assert device.find_node(root_after_cancel, 'Смена ещё не записана') is not None, 'Leaving an unsaved form changed empty state'

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
    if args.phase == 'after' and args.focus == 'full':
        # Exercise export modal. Cancel must never mutate the fixture.
        device.tap_node('Экспорт для ChatGPT')
        device.wait_node('Резервная копия JSON')
        opened = capture('export-dialog-360-dark')
        for action in ('Поделиться отчётом', 'Сохранить отчёт', 'Резервная копия JSON', 'Закрыть'):
            assert device.find_node(opened, action) is not None, f'Export action missing: {action}'
        device.tap_node('Закрыть')
        closed = device.dump('export-dialog-closed')
        assert device.find_node(closed, 'Сохранить отчёт') is None, 'Export modal remained open'
        assert device.find_node(closed, 'Главная') is not None, 'Export modal did not restore the home screen'
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
            if args.phase == 'after' and args.focus == 'full' and suffix != '360-dark':
                device.tap_node('Экспорт для ChatGPT')
                device.wait_node('Резервная копия JSON')
                opened = capture(f'export-dialog-{suffix}')
                for action in ('Поделиться отчётом', 'Сохранить отчёт',
                               'Резервная копия JSON', 'Закрыть'):
                    assert device.find_node(opened, action) is not None, f'Export action missing: {action}'
                device.tap_node('Закрыть')
            period_choice = device.find_node(root, 'Выбрать расчётный период')
            pb = list(map(int, re.findall(r'\d+', period_choice.get('bounds', '')))) if period_choice is not None else []
            assert len(pb) == 4 and pb[2] > pb[0] and pb[3]-pb[1] >= 144, (
                f'Home period button must be at least 48dp tall: {pb}, {suffix}'
            )
            assert any(device.find_node(root, name) is not None for name in ('Темп периода', 'ТЕМП ПЕРИОДА')), 'Period pace is missing'
            device.adb('shell', 'input', 'swipe', '540', '1800', '540', '750', '450')
            root = capture(f'home-finance-{suffix}')
            assert any(device.find_node(root, name) is not None for name in ('Общий доход', 'ОБЩИЙ ДОХОД')), 'Income is missing from the main scroll'
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
            # Android 35 is fixed at 480 dpi (3 px per dp). Edit affordances
            # must be at least 48 dp high, not merely readable text labels.
            for slot_num in (1, 2):
                label = f'Редактировать Слот {slot_num}'
                edit = device.find_node(root, label)
                assert edit is not None, f'Missing history edit action: {label}'
                eb = list(map(int, re.findall(r'\d+', edit.get('bounds', ''))))
                assert len(eb) == 4 and eb[3] - eb[1] >= 144, (
                    f'{label} tap height is below 48 dp at 480 dpi: {eb}'
                )
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
                # The DOM can list off-screen fields with [0,0][0,0] bounds.
                # For each payment setting, independently prove scroll reachability.
                fields = ('Темп для оплаты', 'Темп для премии',
                          'Минимум часов за период', 'Критический темп',
                          'Премия за темп', 'Премия за 12 недель')
                for field_index, label in enumerate(fields):
                    visible = False
                    fb = []
                    for attempt in range(8):
                        root = device.dump(f'settings-field-{suffix}-{field_index}-{attempt}')
                        node = device.find_node(root, label)
                        nav = device.find_node(root, 'Главная')
                        nb = list(map(int, re.findall(r'\d+', nav.get('bounds', '')))) if nav is not None else []
                        fb = list(map(int, re.findall(r'\d+', node.get('bounds', '')))) if node is not None else []
                        if (len(nb) == len(fb) == 4 and fb[2] > fb[0] and
                            fb[3] > fb[1] and fb[1] >= 0 and fb[3] <= nb[1]):
                            visible = True
                            break
                        device.adb('shell', 'input', 'swipe', '540', '1770', '540', '680', '360')
                    assert visible, f'Payment setting not reachable by scroll: {label}; bounds={fb}'
                    capture(f'settings-field-visible-{suffix}-{field_index}')
            device.tap_node('Добавить слот')
            root = capture('form-' + suffix)
            edit = next(n for n in root.iter('node') if n.get('class') == 'android.widget.EditText')
            b = list(map(int, re.findall(r'\d+', edit.get('bounds', ''))))
            device.adb('shell', 'input', 'tap', str((b[0]+b[2])//2), str((b[1]+b[3])//2))
            capture('keyboard-' + suffix)
            device.adb('shell', 'input', 'keyevent', '4')
            # RED in #40173464789: a second hardware Back leaves the form open.
            # Dismiss IME, then exercise the actual visible in-app Back handler.
            device.tap_node('Назад')
            root = device.dump('form-abandoned-' + suffix)
            assert device.find_node(root, 'Главная') is not None, (
                'Canceling the form must restore history with bottom navigation'
            )
            assert device.find_node(root, 'История') is not None or device.find_node(root, 'ИСТОРИЯ') is not None, (
                'Canceled form did not return to history'
            )
    if args.focus == 'content':
        assert not missing_content, 'Main headings or values missing: ' + ', '.join(missing_content)
        return
    device.tap_node('Главная')
    for scale in ['1.3', '2.0']:
        device.adb('shell', 'settings', 'put', 'system', 'font_scale', scale)
        device.adb('shell', 'am', 'force-stop', device.PACKAGE)
        device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
        device.wait_home(30)
        home_root = capture('font-' + scale + '-home')
        if scale == '2.0':
            # This fixture has 18 orders / 9 active hours against a 1.80 goal.
            # At 200% font the visible 111% must NOT sit under the bottom nav.
            percent = device.find_node(home_root, '111%')
            nav_home = device.find_node(home_root, 'Главная')
            assert percent is not None and nav_home is not None, '200% progress or bottom navigation missing'
            percent_box = list(map(int, re.findall(r'\d+', percent.get('bounds', ''))))
            nav_box = list(map(int, re.findall(r'\d+', nav_home.get('bounds', ''))))
            assert len(percent_box) == 4 and len(nav_box) == 4
            assert percent_box[1] >= 0 and percent_box[3] <= nav_box[1], (
                f'200% progress is covered by bottom navigation: {percent_box}, {nav_box}'
            )
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
        if scale == '2.0' and args.phase == 'after' and args.focus == 'full':
            # Prior still-frame suggested both sliders were obscured. The
            # scrolled Android tree proves visibility; now prove both controls
            # respond at 200% font without touching the other time basis.
            nav = device.find_node(root, 'Главная')
            nav_box = list(map(int, re.findall(r'\d+', nav.get('bounds', ''))))
            assert len(nav_box) == 4
            for label in ('Слот: минус 15 минут', 'Слот: плюс 15 минут',
                          'Из них буду работать: минус 15 минут',
                          'Из них буду работать: плюс 15 минут'):
                node = device.find_node(root, label)
                bb = list(map(int, re.findall(r'\d+', node.get('bounds', '')))) if node is not None else []
                assert len(bb) == 4 and bb[2] > bb[0] and bb[1] >= 0 and bb[3] <= nav_box[1], (
                    f'200% slider action is offscreen or covered: {label} {bb}, nav {nav_box}'
                )
                assert bb[2]-bb[0] >= 144 and bb[3]-bb[1] >= 144, (
                    f'200% slider action below 48dp: {label} {bb}'
                )
            assert durations(root) == [14, 8], f'Unexpected 200% baseline: {durations(root)}'
            device.tap_node('Слот: плюс 15 минут')
            after_slot_plus = capture('font-2.0-slot-plus')
            assert durations(after_slot_plus) == [14.25, 8], (
                f'Full slot action changed wrong field: {durations(after_slot_plus)}'
            )
            device.tap_node('Слот: минус 15 минут')
            restored_slot = device.dump('font-2.0-slot-restored')
            assert durations(restored_slot) == [14, 8]
            device.tap_node('Из них буду работать: плюс 15 минут')
            after_active_plus = capture('font-2.0-active-plus')
            assert durations(after_active_plus) == [14, 8.25], (
                f'Active-hours action changed wrong field: {durations(after_active_plus)}'
            )
            device.tap_node('Из них буду работать: минус 15 минут')
            restored_both = capture('font-2.0-both-restored')
            assert durations(restored_both) == [14, 8], (
                f'200% button round trip lost original values: {durations(restored_both)}'
            )
            device.adb('shell', 'am', 'force-stop', device.PACKAGE)
            device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
            device.wait_home(30)
            device.tap_node('Прогноз')
            reloaded = device.dump('font-2.0-both-after-process-death')
            assert durations(reloaded) == [14, 8], (
                f'200% round-trip values changed after process death: {durations(reloaded)}'
            )
        if scale == '1.3' and args.phase == 'after' and args.focus == 'full':
            # An Android file import starts DocumentsUI. Dismissing the picker
            # is a CANCEL operation, never an empty import or reset.
            device.tap_node('Импортировать отчёт')
            picker_seen = False
            for picker_attempt in range(15):
                try:
                    picker_root = device.dump(f'import-picker-current-{picker_attempt}')
                except (ET.ParseError, RuntimeError):
                    time.sleep(.5)
                    continue
                if any('documentsui' in n.get('package', '').lower()
                       for n in picker_root.iter('node')):
                    picker_seen = True
                    break
                time.sleep(.5)
            assert picker_seen, 'Native ACTION_OPEN_DOCUMENT picker did not appear'
            capture('forecast-import-native-picker-1.3')
            device.adb('shell', 'input', 'keyevent', '4')
            device.wait_node('Импортировать отчёт', 25)
            back_from_picker = capture('forecast-import-cancelled-1.3')
            assert durations(back_from_picker) == before_scroll, (
                'Canceling native import changed 14h slot or working hours'
            )
            assert device.find_node(back_from_picker, 'Главная') is not None, (
                'Canceling import did not restore forecast navigation'
            )
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
