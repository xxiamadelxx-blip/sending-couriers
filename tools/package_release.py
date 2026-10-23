#!/usr/bin/env python3
"""Package the validated APK and reproducible source, excluding internal screenshots."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
version = ET.parse(root / 'android/AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
artifacts = root.parent / 'artifacts'
apk = artifacts / f'Courier-Finance-{version}.apk'
verification = root / 'verification' / version
proof = json.loads((verification / 'apk-results.json').read_text())
assert proof['result'] == 'PASS' and proof['apkSHA256'] == hashlib.sha256(apk.read_bytes()).hexdigest()
source = artifacts / f'Courier-Finance-Source-{version}.zip'
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or any(part.startswith('.') or part in {'build', 'node_modules', '__pycache__', 'signing'} for part in relative.parts):
            continue
        if path.name == 'import-training-results.json':
            continue
        if relative.parts[0] == 'verification' and path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.mp4'}:
            continue
        archive.write(path, f'courier-finance/{relative.as_posix()}')
with zipfile.ZipFile(source) as archive:
    assert archive.testzip() is None
    assert not any('/signing/' in name for name in archive.namelist()), 'Private signing files must never enter the source archive'
    for path in (root / 'web').iterdir():
        if path.is_file():
            assert archive.read(f'courier-finance/web/{path.name}') == path.read_bytes()
    for path in (root / 'android').rglob('*'):
        if path.is_file():
            assert archive.read('courier-finance/' + path.relative_to(root).as_posix()) == path.read_bytes()
apk_zip = artifacts / f'Courier-Finance-{version}-APK.zip'
with zipfile.ZipFile(apk_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(apk, apk.name)
    archive.writestr('Install.txt', f'Доход курьера {version}\n\nРаспакуйте ZIP и откройте {apk.name} на Android.\nУстанавливайте поверх прежней версии, чтобы сохранить записи.\n'.encode())
with zipfile.ZipFile(apk_zip) as archive:
    assert archive.testzip() is None and archive.read(apk.name) == apk.read_bytes()
report = {'version': version, 'result': 'PASS', 'sourceWebAndAndroidByteComparison': 'PASS', 'zipApkByteComparison': 'PASS',
          'files': [{'name': p.name, 'sizeBytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [apk, source, apk_zip]]}
(artifacts / f'Courier-Finance-{version}-files.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
