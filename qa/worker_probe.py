#!/usr/bin/env python3
"""Capture the Android WebView worker startup error without personal data."""
from pathlib import Path
import subprocess
import time
from emulator_smoke import wait_node,tap_node

root=Path(__file__).resolve().parent.parent
out=root/'qa-results';out.mkdir(exist_ok=True)
apk=root/'qa/Courier-Finance-worker-debug.apk'
def adb(*args):
    return subprocess.check_output(['adb',*args])
time.sleep(8)
adb('install','-r',str(apk))
adb('shell','am','start','-n','ru.courier.finance/.MainActivity')
wait_node('Главная',45)
tap_node('Прогноз')
wait_node('Прогноз')
time.sleep(12)
(out/'worker-probe.png').write_bytes(adb('exec-out','screencap','-p'))
adb('shell','uiautomator','dump','/sdcard/window.xml')
(out/'worker-probe.xml').write_bytes(adb('exec-out','cat','/sdcard/window.xml'))
(out/'logcat.txt').write_bytes(adb('logcat','-d','-t','9000'))
print('Worker probe captured.',flush=True)
