#!/bin/sh
# Publish this folder to github.com/attooo12/color-picker (GitHub Pages, main branch root).
set -e
D=$(mktemp -d); SRC=$(cd "$(dirname "$0")" && pwd)
printf '#!/bin/sh\ncase "$1" in Username*) echo x-access-token;; *) echo "$GITHUB_TOKEN";; esac\n' > /tmp/askpass.sh; chmod +x /tmp/askpass.sh
export GIT_ASKPASS=/tmp/askpass.sh
git clone -q https://github.com/attooo12/color-picker.git "$D" 2>/dev/null || git init -q -b main "$D"
cd "$D" && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp "$SRC"/*.html "$SRC"/*.css "$SRC"/README.md . && touch .nojekyll
git add -A && git -c user.name=AloneAI -c user.email=aloneai@users.noreply.github.com commit -qm "${1:-Update site}" || true
git push -q https://github.com/attooo12/color-picker.git HEAD:main
rm -rf "$D"
