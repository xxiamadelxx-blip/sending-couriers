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

# The UI matrix ends at 200% font scale; start this independent flow at baseline.
device.adb('shell', 'wm', 'size', '1080x2400')
device.adb('shell', 'wm', 'density', '480')
device.adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')

device.adb('install', str(args.old.resolve()))
device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
device.wait_home(45)
device.add_slot(hours=4, orders=8, reward=1200)
device.tap_node('Период')
device.tap_node('Записи периода')
def assert_slot_visible(root, phase):
    """Check the same factual slot across either old inline or new split labels.

    Values remain independently strict: 4 actual hours, exactly 8 orders,
    and the recorded 1200-ruble reward. Styling cannot alter these facts.
    """
    visible = re.sub(r'\s+', ' ', ' '.join(n.get('text', '') for n in root.iter('node'))).casefold()
    assert re.search(r'(?<!\d)4\s*ч\b', visible), f"{phase}: 4 hours missing: {visible}"
    assert re.search(r'(?<!\d)8\s+заказов\b', visible), f"{phase}: 8 orders missing: {visible}"
    assert re.search(r'(?<!\d)1\s*200\s*₽', visible), f"{phase}: reward 1200 RUB missing: {visible}"


assert_slot_visible(device.dump('before-update'), 'before-update')

# Android rejects this update if the signing certificate or package changes.
device.adb('install', '-r', str(args.new.resolve()))
device.adb('shell', 'am', 'force-stop', device.PACKAGE)
device.adb('shell', 'am', 'start', '-n', device.ACTIVITY)
device.wait_home(45)
device.tap_node('Период')
device.tap_node('Записи периода')
assert_slot_visible(device.dump('after-update'), 'after-update')
device.screenshot('after-update')

# Verify the *persisted facts*, not just presentation. Read the backup using
# the same Android DocumentsUI workflow available to the courier.
from xlsx_import_smoke import exported_state
saved = exported_state()
entries = saved.get('entries')
assert isinstance(entries, list) and len(entries) == 1, (
    f"Upgrade must preserve exactly one synthetic slot, got {len(entries) if isinstance(entries, list) else 'invalid'}"
)
slot = entries[0]
for key, expected in [('dailyHours', 4), ('dailyOrders', 8), ('reward', 1200)]:
    assert slot.get(key) == expected, f"Upgrade changed persisted {key}: {slot.get(key)} != {expected}"
print('PASS: same-signer upgrade retained one stored slot: 4h, 8 orders, 1200 RUB')
