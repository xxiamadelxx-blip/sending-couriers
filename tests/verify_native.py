#!/usr/bin/env python3
"""Run the compiled production NativeBridge on the JVM with fake storage IO.

This tests its actual schema guard and commit contract, not Android UI or disk IO.
Build the APK first. The standalone JSON parser is a test-only dependency.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--sdk', type=Path, default=ROOT.parent / 'tools/android-sdk')
parser.add_argument('--json-jar', type=Path, default=ROOT.parent / 'tools/test-deps/json-20250517.jar')
args = parser.parse_args()
platforms = [args.sdk / 'platforms/android-35/android.jar', args.sdk / 'android-35/android.jar']
platforms += sorted(args.sdk.glob('android-35-ext*/android.jar'))
android_jar = next((p for p in platforms if p.is_file()), None)
if android_jar is None:
    raise SystemExit('Android platform 35 is required; pass --sdk.')
gradle_classes = ROOT / 'app/build/intermediates/javac/release/compileReleaseJavaWithJavac/classes'
bridge_relative = Path('ru/courier/finance/MainActivity$NativeBridge.class')
classes = gradle_classes if (gradle_classes / bridge_relative).is_file() else ROOT / 'build/classes'
bridge_class = classes / bridge_relative
source = ROOT / 'android/src/ru/courier/finance/MainActivity.java'
if not bridge_class.is_file() or bridge_class.stat().st_mtime < source.stat().st_mtime:
    raise SystemExit('Run build.py first to compile the current production code.')
dependency_url = 'https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar'
dependency_hash = '3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796'
if not args.json_jar.is_file():
    args.json_jar.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(dependency_url, timeout=60) as response:
        args.json_jar.write_bytes(response.read())
assert hashlib.sha256(args.json_jar.read_bytes()).hexdigest() == dependency_hash, 'Test dependency checksum differs'
destination = ROOT / 'build/native-probe'
destination.mkdir(parents=True, exist_ok=True)
classpath = os.pathsep.join(str(p.resolve()) for p in [classes, args.json_jar, android_jar])
compiler = [shutil.which('javac')] if shutil.which('javac') else ['java', 'com.sun.tools.javac.Main']
# NativeBridge is exercised on the host JVM with Android stubs. WorkManager queueing
# is an Android runtime side effect and is verified by the emulator workflow, so
# replace only these two scheduler entry points with no-ops in this host probe.
scheduler_stub = destination / 'ForecastAutomation.java'
scheduler_stub.write_text("""package ru.courier.finance;
import android.content.Context;
public final class ForecastAutomation {
    public static void scheduleDaily(Context context, String serializedState) {}
    public static void enqueueEvaluation(Context context) {}
}
""", encoding='utf-8')
subprocess.run([*compiler, '-encoding', 'UTF-8', '-cp', classpath, '-d', str(destination), str(scheduler_stub)], check=True)
subprocess.run([*compiler, '-encoding', 'UTF-8', '-cp', classpath, '-d', str(destination), str(ROOT / 'tests/NativeStateProbe.java')], check=True)
verification = ROOT / 'verification/1.7.11'
verification.mkdir(parents=True, exist_ok=True)
fixture = ROOT / 'tests/fixtures/native-state-fixture.json'
output = subprocess.check_output(['java', '-cp', str(destination) + os.pathsep + classpath,
    'ru.courier.finance.NativeStateProbe', str(fixture)], text=True)
assert output.startswith('PASS: actual compiled NativeBridge')
report = {
    'result': 'PASS', 'actualProductionMethodExecuted': True,
    'mainActivitySHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'nativeBridgeClassSHA256': hashlib.sha256(bridge_class.read_bytes()).hexdigest(),
    'fixtureSHA256': hashlib.sha256(fixture.read_bytes()).hexdigest(),
    'jsonTestDependency': {'url': dependency_url, 'sha256': dependency_hash},
    'scenarios': ['schema1-still-writable', 'schema2-still-writable', 'schema3-still-writable', 'schema4-still-writable', 'schema5-still-writable', 'schema6-forecast-same-date-slots-pay-rules-theme-cycle-exact-readback', 'native-black-and-day-palette',
        'malformed-and-future-reject-before-commit', 'entry-and-utf8-byte-limits', 'commit-failure-returned'],
    'storageIO': 'SharedPreferences test double', 'androidRuntimeTested': False,
    'hostTestDoubles': ['ForecastAutomation.scheduleDaily and enqueueEvaluation no-op; WorkManager is exercised in Android emulator checks'],
    'output': output.strip()
}
(verification / 'native-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(output, end='')
