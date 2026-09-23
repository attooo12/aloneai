#!/bin/sh
# Usage: ./pack.sh <extension-dir>  -> dist/<name>-<version>.zip (upload-ready for Chrome Web Store)
set -e
dir="$1"; [ -f "$dir/manifest.json" ] || { echo "no manifest in $dir"; exit 1; }
name=$(python3 -c "import json,re;m=json.load(open('$dir/manifest.json'));print(re.sub('[^a-z0-9]+','-',(m.get('short_name') or m['name']).lower()).strip('-'))")
ver=$(python3 -c "import json;print(json.load(open('$dir/manifest.json'))['version'])")
mkdir -p dist; out="$(pwd)/dist/$name-$ver.zip"; rm -f "$out"
(cd "$dir" && zip -qr "$out" . -x '*.DS_Store' -x 'test/*' -x '*.map')
echo "$out"; unzip -l "$out" | tail -1
