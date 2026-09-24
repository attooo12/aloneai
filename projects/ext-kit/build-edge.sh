#!/bin/sh
# Usage: ./build-edge.sh <extension-dir>  -> dist/<name>-<version>-edge.zip
#
# Edge Partner Center requires a store description for every locale *declared in the uploaded package*
# (policy 1.7). Our Chrome zip ships 9 languages in _locales/, which would mean pasting a description into the
# dashboard 9 times per extension (36 pastes total across all four) just to satisfy a requirement Chrome and
# AMO don't have. Instead of that, the Edge zip is English-only on purpose: byte-identical to the Chrome zip
# except _locales/ keeps only en/, so every __MSG_*__ in manifest.json always resolves to the English string,
# Edge sees exactly one declared locale, and the owner pastes the English listing once, same as before.
# Nothing else about the extension changes — same code, same permissions, same manifest fields.
set -e
dir="$1"; [ -f "$dir/manifest.json" ] || { echo "no manifest in $dir"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
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
out="$HERE/dist/edge/$name"
rm -rf "$out"; mkdir -p "$out"
(cd "$dir" && tar -c --exclude='./test' --exclude='./.git' .) | (cd "$out" && tar -x)

# Keep only the default (English) locale.
if [ -d "$out/_locales" ]; then
  for d in "$out"/_locales/*/; do
    loc="$(basename "$d")"
    [ "$loc" = "en" ] || rm -rf "$d"
  done
fi

mkdir -p "$HERE/dist"
zipout="$HERE/dist/$name-$ver-edge.zip"; rm -f "$zipout"
(cd "$out" && zip -qr "$zipout" . -x '*.DS_Store' -x '*.map')
echo "$zipout"; unzip -l "$zipout" | tail -1
