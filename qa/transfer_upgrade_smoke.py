#!/usr/bin/env python3
"""Keep synthetic local records through a same-signer transfer-package update."""
import argparse
from pathlib import Path
import re

import emulator_smoke as device

parser = argparse.ArgumentParser()
parser.add_argument('--old', type=Path, required=True)
parser.add_argument('--new', type=Path, required=True)
args = parser.parse_args()

device.PACKAGE = 'ru.courier.finance.transfer'
device.ACTIVITY = device.PACKAGE + '/.MainActivity'
device.OUT = device.ROOT / 'qa-results' / 'ui-transfer-upgrade'
device.OUT.mkdir(parents=True, exist_ok=True)

device.adb('install', str(args.old.resolve()))
device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
device.wait_home(45)
device.add_slot(hours=4, orders=8, reward=1200)
device.tap_node('Период')
device.tap_node('Записи периода')
before = re.sub(r'\s+', ' ', ' '.join(n.get('text', '') for n in device.dump('before-update').iter('node')))
assert '4 ч' in before and '8 заказов' in before and '1 200' in before, before

# Android rejects this update if the signing certificate or package changes.
device.adb('install', '-r', str(args.new.resolve()))
device.adb('shell', 'am', 'force-stop', device.PACKAGE)
device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
device.wait_home(45)
device.tap_node('Период')
device.tap_node('Записи периода')
after = re.sub(r'\s+', ' ', ' '.join(n.get('text', '') for n in device.dump('after-update').iter('node')))
device.screenshot('after-update')
assert '4 ч' in after and '8 заказов' in after and '1 200' in after, after
print('PASS: transfer package updated with the same signer; synthetic entry retained')
