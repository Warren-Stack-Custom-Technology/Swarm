#!/usr/bin/env python3
"""Package the production WebUI; Python 3.9+, standard library only."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
BUILD = ROOT / 'build' / 'webui' / 'public'
STAGE = ROOT / 'release' / 'Swarm-Standalone'
OUT = ROOT / 'artifacts'
if not (BUILD / 'index.html').is_file():
    raise SystemExit('Run npm run build first.')
html = (BUILD / 'index.html').read_text()
for ref in re.findall(r'(?:src|href)="([^"#]+)"', html):
    if ref.startswith(('http:', 'https:', 'data:')) or not (BUILD / ref.split('?')[0].removeprefix('./')).is_file():
        raise SystemExit('Unexpected or missing entry-point asset: ' + ref)
js = '\n'.join(file.read_text() for file in BUILD.rglob('*.js'))
for fixture in ['Ubuntu 26.04', 'Public domain field recordings', 'installDemo']:
    if fixture in js:
        raise SystemExit('Development fixture leaked into production: ' + fixture)
if STAGE.exists():
    shutil.rmtree(STAGE)
(STAGE / 'webui').mkdir(parents=True)
shutil.copytree(BUILD, STAGE / 'webui' / 'public')
for name in ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.txt', 'CHANGELOG.md']:
    shutil.copy2(ROOT / name, STAGE / name)
    shutil.copy2(ROOT / name, STAGE / 'webui' / name)
shutil.copy2(ROOT / 'scripts' / 'Apply-Update.ps1', STAGE / 'Apply-Update.ps1')
release = {'app': 'swarm-standalone', 'version': VERSION, 'license': 'MIT',
           'static_bytes': sum(p.stat().st_size for p in BUILD.rglob('*') if p.is_file()),
           'api': '/api/v2/', 'engine': 'qBittorrent'}
(STAGE / 'release.json').write_text(json.dumps(release, indent=2) + '\n')
manifest = [{'path': p.relative_to(STAGE / 'webui').as_posix(),
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted((STAGE / 'webui').rglob('*')) if p.is_file()]
(STAGE / 'WEBUI-SHA256.json').write_text(json.dumps(manifest, indent=2) + '\n')
OUT.mkdir(exist_ok=True)
zip_path = OUT / f'Swarm-{VERSION}.zip'
with ZipFile(zip_path, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(STAGE.rglob('*')):
        if file.is_file():
            archive.write(file, 'Swarm-Standalone/' + file.relative_to(STAGE).as_posix())
with ZipFile(zip_path) as archive:
    assert archive.testzip() is None
sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()
(OUT / f'Swarm-{VERSION}.sha256').write_text(f'{sha}  {zip_path.name}\n')
print(f'{zip_path.name}: {zip_path.stat().st_size:,} bytes; SHA-256 {sha}')
