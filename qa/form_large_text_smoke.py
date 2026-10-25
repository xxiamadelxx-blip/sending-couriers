#!/usr/bin/env python3
"""Android35 black-box UI-M2: 200% form fields, keyboard, save, restart.

This executes only in a disposable QA emulator preseeded with synthetic
4h/8 and 5h/10 slots by ui_audit_matrix.py. No personal files or credentials.
"""
import json
import re
import time
import xml.etree.ElementTree as ET
import emulator_smoke as device

OUT = device.ROOT / 'qa-results' / 'ui-form-200'
OUT.mkdir(parents=True, exist_ok=True)
device.OUT = OUT
LABELS = ('Часы за слот', 'Заказы за слот', 'Вознаграждение',
          'Налог', 'Комиссия парка', 'Чаевые', 'Отдельные бонусы')
VALUES = {'Часы за слот': '1', 'Заказы за слот': '2', 'Вознаграждение': '300'}

def bounds(node):
    return list(map(int, re.findall(r'\d+', node.get('bounds', '')))) if node is not None else []

def snap(name):
    root = device.dump(name)
    device.screenshot(name)
    return root

def input_after_label(root, label):
    nodes = list(root.iter('node'))
    for index, node in enumerate(nodes):
        if (node.get('text') or node.get('content-desc') or '') != label:
            continue
        for other in nodes[index + 1:]:
            if other.get('class') == 'android.widget.EditText':
                return other
            if (other.get('text') or other.get('content-desc') or '') in LABELS:
                break
    return None

def form_scroll(root):
    return next((n for n in root.iter('node') if n.get('scrollable') == 'true'
                 and n.get('class') == 'android.view.View'), None)

def input_visible(root, label):
    scroll = form_scroll(root)
    label_node = device.find_node(root, label)
    field = input_after_label(root, label)
    sb, lb, eb = bounds(scroll), bounds(label_node), bounds(field)
    if len(sb) != 4 or len(lb) != 4 or len(eb) != 4:
        return None
    pb = bounds(device.find_node(root, 'Сохранить слот'))
    if len(pb) != 4 or pb[2] <= pb[0]:
        return None
    upper, lower = sb[1], min(sb[3], pb[1])
    visible = min(eb[3], lower) - max(eb[1], upper)
    label_visible = min(lb[3], lower) - max(lb[1], upper)
    if eb[2] <= eb[0] or visible < 144 or label_visible < 18 or lb[2] <= lb[0]:
        return None
    return ((eb[0] + eb[2]) // 2, max(eb[1], upper) + visible // 2)

def swipe_form(root):
    sb = bounds(form_scroll(root))
    assert len(sb) == 4 and sb[3] - sb[1] > 350, f'Form not scrollable at 200%: {sb}'
    x = (sb[0] + sb[2]) // 2
    start = sb[1] + (sb[3] - sb[1]) * 3 // 4
    end = sb[1] + (sb[3] - sb[1]) // 4
    device.adb('shell', 'input', 'swipe', str(x), str(start), str(x), str(end), '300')

def scroll_until_input(label, stage):
    last = None
    for attempt in range(11):
        root = device.dump(f'{stage}-{attempt}')
        point = input_visible(root, label)
        if point is not None:
            return point
        last = bounds(device.find_node(root, label))
        swipe_form(root)
    raise AssertionError(f'200% form input unreachable by scroll: {label}; bounds={last}')

def enter_and_check(label, value, point, mode):
    device.adb('shell', 'input', 'tap', str(point[0]), str(point[1]))
    root = device.dump(f'200-{mode}-{label}-ime')
    webview = next((n for n in root.iter('node') if n.get('class') == 'android.webkit.WebView'), None)
    wb, pb = bounds(webview), bounds(device.find_node(root, 'Сохранить слот'))
    assert len(wb) == len(pb) == 4, f'IME/save elements absent for {label}'
    assert 0 < pb[1] < pb[3] <= wb[3] and pb[3]-pb[1] >= 144, (
        f'IME obscures 48dp save action: field={label}, save={pb}, webview={wb}')
    assert wb[3] < 2100, f'IME not opened: {label}, WebView={wb}'
    if label == 'Вознаграждение':
        snap('200-390-light-IME-save-visible')
    device.adb('shell', 'input', 'text', value)
    edited = device.dump(f'200-{mode}-{label}-typed')
    assert any(n.get('class') == 'android.widget.EditText' and n.get('text') == value
               for n in edited.iter('node')), f'Input {value} not entered: {label}'
    device.adb('shell', 'input', 'keyevent', '4')

def assert_saved():
    device.wait_home(45)
    device.tap_node('Период')
    device.tap_node('Записи периода')
    root = snap('200-390-light-history-saved')
    text = re.sub(r'\s+', ' ', ' '.join(n.get('text', '') for n in root.iter('node')))
    assert '10 ч · 20 заказов' in text and '3 500' in text, (
        f'1h/2 orders/300 ₽ not persisted on top of 9h/18/3200 fixture: {text[:1400]}')
    assert device.find_node(root, 'Редактировать Слот 3') is not None, 'New slot cannot be edited'
    return text

def main():
    for mode, size in [('360-dark', '1080x2400'), ('390-light', '1170x2532')]:
        device.adb('shell', 'wm', 'size', size)
        device.adb('shell', 'wm', 'density', '480')
        device.adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0')
        device.adb('shell', 'am', 'force-stop', device.PACKAGE)
        device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
        device.wait_home(45)
        screen = device.dump(f'200-{mode}-theme')
        required_toggle = ('Включить ночную тему' if mode.endswith('light')
                           else 'Включить дневную тему')
        if device.find_node(screen, required_toggle) is None:
            device.tap_node('Включить дневную тему' if mode.endswith('light')
                            else 'Включить ночную тему')
        device.tap_node('Добавить слот')
        device.wait_node('Сохранить слот')
        snap(f'200-{mode}-form-first')
        for label in LABELS:
            point = scroll_until_input(label, f'200-{mode}-{label}')
            if label in ('Вознаграждение', 'Отдельные бонусы'):
                snap(f'200-{mode}-{label}-reachable')
            if mode == '390-light' and label in VALUES:
                enter_and_check(label, VALUES[label], point, mode)
        for attempt in range(12):
            root = device.dump(f'200-{mode}-work-{attempt}')
            bb = bounds(device.find_node(root, 'Рабочее время дня'))
            sb = bounds(form_scroll(root))
            pb = bounds(device.find_node(root, 'Сохранить слот'))
            if len(bb) == len(sb) == len(pb) == 4 and bb[2] > bb[0] and (
                sb[1] <= bb[1] < bb[3] <= min(sb[3], pb[1])):
                break
            swipe_form(root)
        else:
            raise AssertionError(f'200% working-time disclosure unreachable: {mode}')
        device.tap_node('Рабочее время дня')
        device.wait_node('Фактически работал')
        snap(f'200-{mode}-working-expanded')
        device.tap_node('Рабочее время дня')
        if mode == '360-dark':
            device.tap_node('Назад')
            device.tap_node('Главная')
        else:
            device.tap_node('Сохранить слот')
            assert_saved()
            device.adb('shell', 'am', 'force-stop', device.PACKAGE)
            device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
            assert_saved()
            snap('200-390-light-history-after-restart')
    (OUT / 'form-200-result.json').write_text(json.dumps({
        'result':'PASS', 'font_scale':2.0, 'synthetic':True,
        'width_theme':['360-dark', '390-light'], 'fields':list(LABELS),
        'saved':{'hours':1,'orders':2,'reward_rub':300},
        'after_restart':{'hours':10,'orders':20,'reward_rub':3500}
    },ensure_ascii=False,indent=2))
    print('PASS: 200% forms scroll, IME/save and post-restart synthetic history',flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        try:
            snap('200-form-failure')
        except Exception:
            pass
        (OUT / 'form-200-result.json').write_text(json.dumps({
            'result':'FAIL','error':str(error)
        },ensure_ascii=False,indent=2))
        raise
