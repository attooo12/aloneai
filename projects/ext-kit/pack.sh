#!/bin/sh
# Usage: ./pack.sh <extension-dir>  -> dist/<name>-<version>.zip (upload-ready for Chrome Web Store)
set -e
dir="$1"; [ -f "$dir/manifest.json" ] || { echo "no manifest in $dir"; exit 1; }
name=$(python3 -c "
import json, os, re
d = '$dir'
m = json.load(open(os.path.join(d, 'manifest.json')))
val = m.get('short_name') or m['name']
if isinstance(val, str) and val.startswith('__MSG_') and val.endswith('__'):
    key = val[6:-2]
    loc = m.get('default_locale', 'en')
    msgs = json.load(open(os.path.join(d, '_locales', loc, 'messages.json')))
    val = msgs[key]['message']
print(re.sub('[^a-z0-9]+', '-', val.lower()).strip('-'))
")
ver=$(python3 -c "import json;print(json.load(open('$dir/manifest.json'))['version'])")
mkdir -p dist; out="$(pwd)/dist/$name-$ver.zip"; rm -f "$out"
(cd "$dir" && zip -qr "$out" . -x '*.DS_Store' -x 'test/*' -x '*.map')
echo "$out"; unzip -l "$out" | tail -1
