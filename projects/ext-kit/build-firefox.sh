#!/bin/sh
# Usage: ./build-firefox.sh <extension-dir> [--zip]
# Generates a Firefox variant of a shared MV3 extension source into dist/firefox/<name>/ (unpacked, for
# `web-ext lint` / `web-ext run`), without forking the Chrome source. It only:
#   - rewrites manifest.json (background scripts+type, browser_specific_settings, drops chrome-only bits)
#   - prepends small shim scripts from firefox-shims/ to the background and to picker.js's injected-files list
#   - inserts one <script> tag into popup.html for the color picker's EyeDropper polyfill
# Everything else is byte-identical to the Chrome source. See firefox-shims/*.js for what each shim does and why.
set -e
dir="$1"; [ -f "$dir/manifest.json" ] || { echo "no manifest in $dir"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
SHIMS="$HERE/firefox-shims"
name=$(python3 -c "import json,re;m=json.load(open('$dir/manifest.json'));print(re.sub('[^a-z0-9]+','-',(m.get('short_name') or m['name']).lower()).strip('-'))")
out="$HERE/dist/firefox/$name"
rm -rf "$out"; mkdir -p "$out"
(cd "$dir" && tar -c --exclude='./test' --exclude='./.git' .) | (cd "$out" && tar -x)

case "$name" in
  reload-until)
    GECKO_ID="reload-until@attooo12.github.io"
    MIN_FF="142.0"  # 128+ for optional_host_permissions, 140+ for browser_specific_settings.gecko.data_collection_permissions
    cp "$SHIMS/reload-until-offscreen-shim.js" "$out/firefox-offscreen-shim.js"
    BG_SCRIPTS='["firefox-offscreen-shim.js", "sw.js"]'
    python3 - "$out/manifest.json" "$GECKO_ID" "$MIN_FF" "$BG_SCRIPTS" <<'PY'
import json, sys
path, gecko_id, min_ff, bg_scripts = sys.argv[1:5]
m = json.load(open(path))
m['background'] = {"scripts": json.loads(bg_scripts), "type": "module"}
m['permissions'] = [p for p in m.get('permissions', []) if p != 'offscreen']
m.pop('minimum_chrome_version', None)
m['browser_specific_settings'] = {"gecko": {
    "id": gecko_id, "strict_min_version": min_ff,
    "data_collection_permissions": {"required": ["none"]}
}}
json.dump(m, open(path, 'w'), indent=2)
PY
    ;;
  color-picker)
    GECKO_ID="color-picker@attooo12.github.io"
    MIN_FF="142.0"  # 126+ for options_page, 140+ for data_collection_permissions; kept equal to reload-until
    FF_NAME="Color Picker & Palette: Eyedropper"  # AMO caps "name" at 45 chars; the CWS name (52 chars) is too long
    cp "$SHIMS/color-picker-capture-shim.js" "$out/firefox-capture-shim.js"
    cp "$SHIMS/eyedropper-polyfill.js" "$out/eyedropper-polyfill.js"
    BG_SCRIPTS='["firefox-capture-shim.js", "sw.js"]'
    # picker.js is injected by file name from pick.js; load the polyfill first, same as the popup <script> below.
    sed -i "s/files: \['picker.js'\]/files: ['eyedropper-polyfill.js', 'picker.js']/" "$out/pick.js"
    sed -i 's#<script type="module" src="popup.js"></script>#<script src="eyedropper-polyfill.js"></script>\n<script type="module" src="popup.js"></script>#' "$out/popup.html"
    grep -q 'eyedropper-polyfill.js' "$out/popup.html" || { echo "popup.html script tag not found/patched"; exit 1; }
    grep -q 'eyedropper-polyfill.js' "$out/pick.js" || { echo "pick.js files: [...] not patched"; exit 1; }
    python3 - "$out/manifest.json" "$GECKO_ID" "$MIN_FF" "$BG_SCRIPTS" "$FF_NAME" <<'PY'
import json, sys
path, gecko_id, min_ff, bg_scripts, ff_name = sys.argv[1:6]
m = json.load(open(path))
m['background'] = {"scripts": json.loads(bg_scripts), "type": "module"}
m['name'] = ff_name
m.pop('minimum_chrome_version', None)
m['browser_specific_settings'] = {"gecko": {
    "id": gecko_id, "strict_min_version": min_ff,
    "data_collection_permissions": {"required": ["none"]}
}}
json.dump(m, open(path, 'w'), indent=2)
PY
    ;;
  tab-lifeboat)
    GECKO_ID="tab-lifeboat@attooo12.github.io"
    MIN_FF="142.0"  # 139+ for the tabGroups API, 140+ for data_collection_permissions
    python3 - "$out/manifest.json" "$GECKO_ID" "$MIN_FF" <<'PY'
import json, sys
path, gecko_id, min_ff = sys.argv[1:4]
m = json.load(open(path))
m['background'] = {"scripts": [m['background']['service_worker']], "type": "module"}
m.pop('minimum_chrome_version', None)
m['browser_specific_settings'] = {"gecko": {
    "id": gecko_id, "strict_min_version": min_ff,
    "data_collection_permissions": {"required": ["none"]}
}}
json.dump(m, open(path, 'w'), indent=2)
PY
    ;;
  *)
    echo "no Firefox build rule for '$name' (add one in build-firefox.sh)"; exit 1
    ;;
esac

echo "$out"
if [ "$2" = "--zip" ]; then
  mkdir -p "$HERE/dist"
  ver=$(python3 -c "import json;print(json.load(open('$out/manifest.json'))['version'])")
  zipout="$HERE/dist/$name-$ver-firefox.zip"; rm -f "$zipout"
  (cd "$out" && zip -qr "$zipout" . -x '*.DS_Store' -x '*.map')
  echo "$zipout"
fi
