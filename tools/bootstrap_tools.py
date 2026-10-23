from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2] / 'tools'
ROOT.mkdir(parents=True, exist_ok=True)
def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

manifest = ET.fromstring(fetch('https://dl.google.com/android/repository/repository2-1.xml'))
for element in manifest.iter():
    element.tag = element.tag.split('}')[-1]
packages = []
for package_id in ['build-tools;35.0.0', 'platforms;android-35']:
    package = next(p for p in manifest.iter('remotePackage') if p.attrib.get('path') == package_id)
    archive = next(a for a in package.iter('archive') if a.findtext('host-os') in (None, 'linux'))
    complete = archive.find('complete')
    packages.append((package_id, 'https://dl.google.com/android/repository/' + complete.findtext('url'), ROOT/'android-sdk', complete.findtext('checksum'), int(complete.findtext('size'))))
chrome = json.loads(fetch('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'))['channels']['Stable']
download = next(x for x in chrome['downloads']['chrome-headless-shell'] if x['platform'] == 'linux64')
packages.append(('headless-' + chrome['version'], download['url'], ROOT/'headless', None, None))

def install(package):
    name, url, destination, checksum, size = package
    data = fetch(url)
    if size is not None:
        assert len(data) == size, name + ': size mismatch'
    if checksum is not None:
        assert hashlib.sha1(data).hexdigest() == checksum, name + ': checksum mismatch'
    archive_path = ROOT/(name.replace(';', '-') + '.zip')
    archive_path.write_bytes(data)
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            assert (destination/info.filename).resolve().is_relative_to(destination.resolve())
            archive.extract(info, destination)
            mode = info.external_attr >> 16
            if mode:
                os.chmod(destination/info.filename, mode & 0o777)
    print(name + ': installed (' + str(len(data)) + ' bytes)', flush=True)

with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(install, packages))
