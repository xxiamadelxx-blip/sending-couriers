#!/usr/bin/env python3
"""Check the signed APK, embedded source and compatibility with the earlier release."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--sdk', type=Path, default=ROOT.parent / 'tools/android-sdk')
parser.add_argument('--apk', type=Path, default=ROOT.parent / 'artifacts/Courier-Finance-1.7.10.apk')
parser.add_argument('--previous-apk', type=Path, required=True)
parser.add_argument('--previous-source', type=Path, required=True)
args = parser.parse_args()
tools = next(p for p in [args.sdk / 'build-tools/35.0.0', args.sdk / 'android-15'] if (p / 'aapt').is_file())

def run(*command):
    return subprocess.check_output([str(p) for p in command], text=True)

def signature(path):
    output = run('java', '-jar', tools / 'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', path)
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in output
    assert 'Verified using v3 scheme (APK Signature Scheme v3): true' in output
    assert 'Number of signers: 1' in output
    return re.search(r'Signer #1 certificate SHA-256 digest: (\w+)', output).group(1)

certificate = signature(args.apk)
assert certificate == signature(args.previous_apk), 'Update certificate differs'
badging = run(tools / 'aapt', 'dump', 'badging', args.apk)
assert "package: name='ru.courier.finance' versionCode='24' versionName='1.7.10'" in badging
assert "sdkVersion:'26'" in badging and "targetSdkVersion:'35'" in badging
assert "application-label:'Доход курьера'" in badging
assert "package: name='ru.courier.finance'" in run(tools / 'aapt', 'dump', 'badging', args.previous_apk)
permissions = run(tools / 'aapt', 'dump', 'permissions', args.apk)
assert permissions.count('uses-permission') == 1 and 'android.permission.INTERNET' in permissions
run(tools / 'zipalign', '-c', '4', args.apk)
assets = {}
with zipfile.ZipFile(args.apk) as apk:
    names = [n for n in apk.namelist() if n.startswith('assets/www/') and not n.endswith('/')]
    expected = [f'assets/www/{p.name}' for p in (ROOT / 'web').iterdir() if p.is_file()]
    assert sorted(names) == sorted(expected)
    assert 'classes.dex' in apk.namelist()
    assert apk.read('classes.dex') == (ROOT / 'build/dex/classes.dex').read_bytes(), 'APK must contain the freshly compiled native code'
    assert not any(n.startswith('lib/') for n in apk.namelist())
    for name in names:
        actual = apk.read(name)
        assert actual == (ROOT / 'web' / Path(name).name).read_bytes(), name
        assets[Path(name).name] = hashlib.sha256(actual).hexdigest()

native = []
changed_native = []
with zipfile.ZipFile(args.previous_source) as old:
    for path in (ROOT / 'android/src').rglob('*.java'):
        suffix = '/android/src/' + path.relative_to(ROOT / 'android/src').as_posix()
        previous = next((n for n in old.namelist() if n.endswith(suffix)), None)
        if previous and old.read(previous) == path.read_bytes():
            native.append(path.name)
        else:
            assert path.name in ['MainActivity.java', 'AppAppearance.java', 'WorkbookReader.java', 'WeatherClient.java'], 'Unrelated native behavior must remain unchanged'
            changed_native.append(path.name)
main_source = (ROOT / 'android/src/ru/courier/finance/MainActivity.java').read_text()
assert 'getSharedPreferences("courier_finance", MODE_PRIVATE)' in main_source
assert 'preferences.getString("state", "")' in main_source
assert '(schemaVersion != 1 && schemaVersion != 2 && schemaVersion != 3 && schemaVersion != 4 && schemaVersion != 5 && schemaVersion != 6)' in main_source
native_report = json.loads((ROOT / 'verification/1.7.10/native-results.json').read_text())
assert native_report['result'] == 'PASS' and native_report['actualProductionMethodExecuted']
assert native_report['mainActivitySHA256'] == hashlib.sha256((ROOT / 'android/src/ru/courier/finance/MainActivity.java').read_bytes()).hexdigest()
assert native_report['nativeBridgeClassSHA256'] == hashlib.sha256((ROOT / 'build/classes/ru/courier/finance/MainActivity$NativeBridge.class').read_bytes()).hexdigest()

report = {
    'result': 'PASS', 'versionName': '1.7.10', 'versionCode': 24,
    'package': 'ru.courier.finance', 'minSdk': 26, 'targetSdk': 35,
    'signatureSchemes': ['v2', 'v3'], 'sameCertificateAsPrevious': True,
    'certificateSHA256': certificate, 'alignment': 'PASS', 'permissions': ['android.permission.INTERNET'],
    'nativeSourceUnchanged': native, 'nativeSourceChanged': changed_native,
    'nativeSchemaGuardExecution': 'PASS (JVM, storage IO mocked)',
    'samePreferencesNameAndKey': True, 'nativeDexByteComparison': 'PASS', 'assetByteComparison': 'PASS', 'assetSHA256': assets,
    'apkSHA256': hashlib.sha256(args.apk.read_bytes()).hexdigest(), 'sizeBytes': args.apk.stat().st_size,
    'nativeRuntimeTested': False
}
destination = ROOT / 'verification/1.7.10/apk-results.json'
destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
