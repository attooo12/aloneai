#!/bin/sh
# Ping IndexNow (Bing, Yandex, ...) for new or changed pages: sh indexnow.sh URL [URL...]
K=2bd34d652fb4c28518caaf3365ee05e6
L=$(for u in "$@"; do printf '"%s",' "$u"; done | sed 's/,$//')
curl -s -w '%{http_code}\n' -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json; charset=utf-8' \
  -d "{\"host\":\"attooo12.github.io\",\"key\":\"$K\",\"keyLocation\":\"https://attooo12.github.io/$K.txt\",\"urlList\":[$L]}"
