#!/usr/bin/env python3
"""Create an isolated package for transferring a user's own JSON backup."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
root = parser.parse_args().source.resolve()
manifest = root / 'android/AndroidManifest.xml'
original = 'ru.courier.finance'
parallel = 'ru.courier.finance.transfer'
text = manifest.read_text()
assert text.count(f'package="{original}"') == 1
assert text.count(f'{original}.exports') == 1
assert text.count('android:label="Доход курьера"') == 1
text = text.replace(f'package="{original}"', f'package="{parallel}"')
text = text.replace(f'{original}.exports', f'{parallel}.exports')
text = text.replace('android:label="Доход курьера"', 'android:label="Доход курьера · перенос"')
manifest.write_text(text)
for path in (root / 'android/src').rglob('*.java'):
    text = path.read_text()
    assert text.startswith(f'package {original};'), path
    path.write_text(text.replace(original, parallel))
assert all(original not in p.read_text().replace(parallel, '') for p in (root / 'android/src').rglob('*.java'))
print('Parallel package:', parallel)
