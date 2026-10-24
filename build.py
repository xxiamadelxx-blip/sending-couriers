#!/usr/bin/env python3
"""Build the offline APK with Android SDK 35 and Java 17, without Gradle."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import secrets
import zipfile

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--sdk', default=os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME') or str(ROOT.parent / 'tools/android-sdk'))
parser.add_argument('--output', default=str(ROOT.parent / 'artifacts/Courier-Finance-1.7.13.apk'))
args = parser.parse_args()
sdk = Path(args.sdk).resolve()
platforms = [sdk / 'platforms/android-35/android.jar', sdk / 'android-35/android.jar']
platforms += sorted(sdk.glob('android-35-ext*/android.jar'))
android_jar = next((p for p in platforms if p.is_file()), None)
tools = next((p for p in [sdk / 'build-tools/35.0.0', sdk / 'android-15'] if (p / 'aapt').is_file()), None)
if android_jar is None or tools is None:
    raise SystemExit('Install Android platform 35 and build-tools 35.0.0; pass --sdk /path/to/sdk.')
build = ROOT / 'build'
if build.exists(): shutil.rmtree(build)
subprocess.run(['python3', str(ROOT / 'tools/generate_forecast_worker.py')], check=True)
for path in ['assets/www', 'generated', 'classes', 'dex']: (build / path).mkdir(parents=True)
for path in (ROOT / 'web').iterdir():
    if path.is_file(): shutil.copy2(path, build / 'assets/www' / path.name)

def run(*parts):
    subprocess.run([str(p) for p in parts], check=True, cwd=ROOT)

run(tools / 'aapt', 'package', '-f', '-m', '--auto-add-overlay', '-M', ROOT / 'android/AndroidManifest.xml', '-S', ROOT / 'android/res', '-A', build / 'assets', '-I', android_jar, '-J', build / 'generated', '-F', build / 'resources.ap_')
sources = list((ROOT / 'android/src').rglob('*.java')) + list((build / 'generated').rglob('*.java'))
compiler = [shutil.which('javac')] if shutil.which('javac') else [shutil.which('java'), 'com.sun.tools.javac.Main']
run(*compiler, '-encoding', 'UTF-8', '--release', '8', '-classpath', android_jar, '-d', build / 'classes', *sources)
run('java', '-cp', tools / 'lib/d8.jar', 'com.android.tools.r8.D8', '--lib', android_jar, '--min-api', '26', '--output', build / 'dex', *sorted((build / 'classes').rglob('*.class')))
shutil.copy2(build / 'resources.ap_', build / 'unsigned.apk')
with zipfile.ZipFile(build / 'unsigned.apk', 'a', compression=zipfile.ZIP_DEFLATED) as apk:
    apk.write(build / 'dex/classes.dex', 'classes.dex')
run(tools / 'zipalign', '-f', '4', build / 'unsigned.apk', build / 'aligned.apk')
signing = ROOT / 'signing'
signing.mkdir(mode=0o700, exist_ok=True)
key = signing / 'courier-release.jks'
password = signing / 'password.txt'
if not key.exists():
    password.write_text(secrets.token_urlsafe(32))
    password.chmod(0o600)
    run('keytool', '-genkeypair', '-keystore', key, '-storepass:file', password, '-keypass:file', password, '-alias', 'courier', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Courier Finance, OU=Personal Android App, O=Courier Finance', '-noprompt')
    key.chmod(0o600)
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
signed = build / 'signed.apk'
run('java', '-jar', tools / 'lib/apksigner.jar', 'sign', '--ks', key, '--ks-key-alias', 'courier', '--ks-pass', 'file:' + str(password), '--out', signed, build / 'aligned.apk')
run('java', '-jar', tools / 'lib/apksigner.jar', 'verify', '--verbose', signed)
run(tools / 'zipalign', '-c', '4', signed)
# Only expose a complete, verified file at the download path.
staged = output.with_suffix('.apk.staging')
with signed.open('rb') as source, staged.open('wb') as target:
    shutil.copyfileobj(source, target)
    target.flush()
    os.fsync(target.fileno())
os.replace(staged, output)
with zipfile.ZipFile(output) as apk:
    assert apk.testzip() is None
assert output.read_bytes() == signed.read_bytes()
print('APK:', output, 'bytes:', output.stat().st_size)
