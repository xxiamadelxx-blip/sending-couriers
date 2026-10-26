#!/usr/bin/env python3
"""Independent real Android35 UiAutomator XML matrix, NOT TalkBack speech QA.

Seven native surfaces × two widths × two themes plus export. Editable fields
are NOT required to have content-desc: Android recommends hint/labelFor and
warns that editable contentDescription can interfere with text navigation.
"""
import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

SURFACES = ('home', 'forecast', 'history', 'form', 'period',
            'settings-main', 'settings-more')
WIDTHS_DP = (360, 390)
THEMES = ('dark', 'light')
SCREENS = tuple(f'{s}-{w}-{t}' for s in SURFACES
                for w in WIDTHS_DP for t in THEMES) + ('export-dialog-360-dark',)
NAV = ('Главная', 'Период', 'Добавить слот', 'Прогноз', 'Настройки')
MIN_PX = 144  # Android emulator 480dpi, 3px/dp: 48dp = 144px


def bounds(node):
    return [int(x) for x in re.findall(r'-?\d+', node.get('bounds', ''))]


def visible(node):
    b = bounds(node)
    return len(b) == 4 and b[2] > b[0] and b[3] > b[1]


def name(node):
    return (node.get('content-desc') or node.get('text') or '').strip()


def role(node):
    return node.get('class', '').rsplit('.', 1)[-1]


def inspect(root, screen):
    result = {'named': 0, 'unnamed': 0, 'editTextsNotSpeechVerified': 0}
    for node in root.iter('node'):
        if node.get('clickable') != 'true' or not visible(node):
            continue
        if role(node) == 'EditText':
            result['editTextsNotSpeechVerified'] += 1
        elif name(node):
            result['named'] += 1
        else:
            result['unnamed'] += 1
            raise AssertionError(f'{screen}: unnamed clickable {role(node)} at {bounds(node)}')
    return result


def ensure_labelled_target(root, label, *, role_name='Button', min_px=MIN_PX):
    for node in root.iter('node'):
        if (node.get('clickable') != 'true' or role(node) != role_name
                or not name(node) or label not in name(node) or not visible(node)):
            continue
        b = bounds(node)
        if b[2]-b[0] >= min_px and b[3]-b[1] >= min_px:
            return True
    return False


def inspect_all_layouts(directory):
    results = {}
    checked_controls = 0
    for screen in SCREENS:
        file = directory / (screen + '.xml')
        assert file.exists(), f'missing native XML: {file}'
        root = ET.parse(file).getroot()
        results[screen] = inspect(root, screen)
        required = []
        if screen.startswith('export-dialog-'):
            required.extend((s, 'Button') for s in (
                'Поделиться файлом', 'Сохранить файл',
                'Резервная копия JSON', 'Закрыть'))
        else:
            surface = screen.rsplit('-', 2)[0]
            theme = screen.rsplit('-', 1)[-1]
            required.extend((s, 'Button') for s in ('Назад',) if surface != 'home')
            required.append(('Включить дневную тему' if theme == 'dark'
                             else 'Включить ночную тему', 'Button'))
            if surface != 'form':
                required.extend((s, 'Button') for s in NAV)
            if surface == 'home':
                required.extend((s, 'Button') for s in (
                    'Экспорт для ChatGPT', 'Выбрать расчётный период'))
            if surface == 'forecast':
                required.extend((s, 'SeekBar') for s in ('Слот', 'Из них буду работать'))
                required.extend((s, 'Button') for s in (
                    'Слот: минус', 'Слот: плюс',
                    'Из них буду работать: минус', 'Из них буду работать: плюс'))
                # Import action is below the fold on the unscrolled native screen.
                # Its reachability is tested by qa/xlsx_import_smoke.py with swipes.
            if surface == 'history':
                required.extend((s, 'Button') for s in (
                    'Редактировать Слот 1', 'Редактировать Слот 2'))
            if surface == 'form':
                required.append(('Сохранить слот', 'Button'))
                required.append(('', 'Spinner'))  # current dated spinner, named by value
            if surface == 'period':
                required.extend((s, 'Button') for s in (
                    'Записи периода', 'Экспорт для ChatGPT'))
            if surface == 'settings-main':
                required.append(('Сохранить условия', 'Button'))
            if surface in ('settings-main', 'settings-more'):
                required.append(('Остальные условия', 'View'))
        for label, kind in required:
            assert ensure_labelled_target(root, label, role_name=kind), (
                f'{screen}: missing >=48dp named {kind}: {label!r}')
            checked_controls += 1
    return {
        'result': 'PASS', 'test': 'native Android35 XML action layout matrix',
        'actualTalkBackSpeechTested': False, 'dpi': 480,
        'widthsDp': list(WIDTHS_DP), 'themes': list(THEMES),
        'screenCount': len(results), 'checkedNamed48dpTargets': checked_controls,
        'allActionNamesPresent': True,
        'editTextOccurrencesNotSpeechVerified': sum(
            r['editTextsNotSpeechVerified'] for r in results.values()),
        'screens': results,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dir', type=Path, default=Path('qa-results/ui-after'))
    p.add_argument('--out', type=Path, default=Path('qa-results/ui-a11y/layout-29-result.json'))
    args = p.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    try:
        value = inspect_all_layouts(args.dir)
    except Exception as error:
        args.out.write_text(json.dumps({
            'result': 'FAIL', 'error': str(error),
            'actualTalkBackSpeechTested': False,
        }, ensure_ascii=False, indent=2))
        raise
    args.out.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    print(f"PASS: {value['screenCount']} Android layouts, "
          f"{value['checkedNamed48dpTargets']} 48dp controls; TalkBack NOT RUN",
          flush=True)


if __name__ == '__main__':
    main()
