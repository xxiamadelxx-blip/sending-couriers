#!/usr/bin/env python3
"""Native Android UiAutomator semantic gate, NOT a TalkBack speech/gesture test.

Uses real Android 35 snapshots from the same CI run. Unnamed visible action
targets fail. Blank EditText stays explicitly unverified for TalkBack because
UiAutomator XML alone does not prove the HTML label-for announcement.
"""
import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

SCREENS = ('home-390-dark', 'forecast-390-dark', 'history-390-dark',
           'form-390-dark', 'settings-main-390-dark', 'export-dialog-360-dark')
BOTTOM = ('Главная', 'Период', 'Добавить слот', 'Прогноз', 'Настройки')


def bounds(node):
    nums = [int(n) for n in re.findall(r'-?\d+', node.get('bounds', ''))]
    return nums if len(nums) == 4 else []


def visible(node):
    b = bounds(node)
    return len(b) == 4 and b[2] > b[0] and b[3] > b[1]


def name(node):
    return (node.get('content-desc') or node.get('text') or '').strip()


def role(node):
    return (node.get('class') or '').rsplit('.', 1)[-1]


def visible_accessible_actions(root):
    named, unnamed, edits = 0, [], 0
    for node in root.iter('node'):
        if node.get('clickable') != 'true' or not visible(node):
            continue
        if role(node) == 'EditText':
            edits += 1
        elif name(node):
            named += 1
        else:
            unnamed.append({'class': role(node), 'bounds': bounds(node)})
    return {'named': named, 'unnamed': unnamed, 'editFieldsNeedingTalkBackCheck': edits}


def specific_named_control(root, label, *, role='Button', min_pixels=144):
    for node in root.iter('node'):
        if (node.get('clickable') != 'true' or role_of(node) != role
                or label not in name(node) or not visible(node)):
            continue
        b = bounds(node)
        if b[2]-b[0] >= min_pixels and b[3]-b[1] >= min_pixels:
            return True
    return False


def role_of(node):
    return role(node)


def require_native_edit_labels(root, labels, screen):
    """Check Android-exposed input names, not just adjacent visual HTML labels.

    A WebView's blank input value alone cannot identify its financial meaning.
    This verifies native XML accessibility descriptions but cannot prove the
    words a screen reader actually speaks.
    """
    edits = [n for n in root.iter('node') if role(n) == 'EditText' and visible(n)]
    assert len(edits) == len(labels), (f'{screen}: expected {len(labels)} input fields, '
                                       f'found {len(edits)}')
    for expected, node in zip(labels, edits):
        accessible = (node.get('content-desc') or '').strip()
        assert expected in accessible, (f'{screen}: {expected!r} lacks native '
                                       f'accessible description; text={node.get("text")!r}, '
                                       f'content-desc={accessible!r}')
    return list(labels)

def inspect(directory):
    snapshots = {}
    for file in SCREENS:
        p = directory / (file + '.xml')
        if not p.is_file():
            raise AssertionError(f'Missing native Android accessibility XML: {p}')
        snapshots[file] = ET.parse(p).getroot()
    results = {}
    for file, root in snapshots.items():
        checked = visible_accessible_actions(root)
        results[file] = checked
        if checked['unnamed']:
            raise AssertionError(f'{file}: visible clickable non-edit nodes without name: {checked["unnamed"]}')
    def required(screen, label, kind='Button'):
        assert specific_named_control(snapshots[screen], label, role=kind), (
            f'{screen}: missing 48dp labelled {kind} for {label!r}')
    for label in BOTTOM:
        required('home-390-dark', label)
    for label in ('Слот', 'Из них буду работать'):
        required('forecast-390-dark', label, 'SeekBar')
    for label in ('Слот: минус', 'Слот: плюс',
                  'Из них буду работать: минус', 'Из них буду работать: плюс'):
        required('forecast-390-dark', label)
    for label in ('Редактировать Слот 1', 'Редактировать Слот 2'):
        required('history-390-dark', label)
    required('settings-main-390-dark', 'Сохранить условия')
    for label in ('Поделиться файлом', 'Сохранить файл', 'Резервная копия JSON', 'Закрыть'):
        required('export-dialog-360-dark', label)
    # UIAutomator does not expose the complete HTML label-for association.
    form_labels = ('Часы за слот', 'Заказы за слот', 'Вознаграждение')
    present = {name(n) for n in snapshots['form-390-dark'].iter('node')}
    assert set(form_labels) <= present, f'Form labels missing from native hierarchy: {set(form_labels)-present}'
    native_inputs = {
        'form-390-dark': require_native_edit_labels(snapshots['form-390-dark'],
            ('Часы за слот', 'Заказы за слот', 'Вознаграждение', 'Налог',
             'Комиссия парка', 'Чаевые', 'Отдельные бонусы'), 'form-390-dark'),
        'forecast-390-dark': require_native_edit_labels(snapshots['forecast-390-dark'],
            ('Слот', 'Из них буду работать'), 'forecast-390-dark'),
        'settings-main-390-dark': require_native_edit_labels(snapshots['settings-main-390-dark'],
            ('Ставка за час',), 'settings-main-390-dark'),
    }
    return {'result':'PASS', 'test':'native XML semantics subset, not TalkBack',
            'talkBackTested':False, 'androidDpi':480,
            'screens':results, 'formLabelsExposed':list(form_labels),
            'nativeInputLabels':native_inputs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dir', type=Path, default=Path('qa-results/ui-after'))
    parser.add_argument('--out', type=Path, default=Path('qa-results/ui-a11y/a11y-result.json'))
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = inspect(args.dir)
    except Exception as error:
        args.out.write_text(json.dumps({'result':'FAIL','error':str(error),'talkBackTested':False},ensure_ascii=False,indent=2))
        raise
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('PASS: native XML labels/roles/target sizes; TalkBack NOT RUN',flush=True)


if __name__=='__main__':
    main()
