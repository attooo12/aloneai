#!/bin/sh
# Upload (or replace) zip assets on a GitHub release, creating the release if needed.
# Usage: sh release.sh <repo> <tag> <file> [file...]    e.g. sh release.sh reload-until v1.0.1 dist/reload-until-1.0.1.zip
set -e
R=attooo12/$1; T=$2; shift 2; A="Authorization: Bearer $GITHUB_TOKEN"; API=https://api.github.com/repos/$R
id=$(curl -s -H "$A" $API/releases/tags/$T | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$id" ] || id=$(curl -s -H "$A" -X POST $API/releases -d "{\"tag_name\":\"$T\",\"name\":\"$T\",\"body\":\"Upload-ready zips. Chrome/Edge: the plain zip. Firefox: the -firefox zip.\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
for f in "$@"; do
  n=$(basename "$f")
  old=$(curl -s -H "$A" $API/releases/$id/assets | python3 -c "import sys,json;print(next((a['id'] for a in json.load(sys.stdin) if a['name']=='$n'),''))")
  [ -n "$old" ] && curl -s -H "$A" -X DELETE $API/releases/assets/$old
  curl -s -H "$A" -H "Content-Type: application/zip" --data-binary @"$f" "https://uploads.github.com/repos/$R/releases/$id/assets?name=$n" | python3 -c "import sys,json;print(json.load(sys.stdin).get('browser_download_url'))"
done
