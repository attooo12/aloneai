#!/bin/sh
# Publish this folder to github.com/attooo12/attooo12.github.io (user site root).
set -e
D=$(mktemp -d); SRC=$(cd "$(dirname "$0")" && pwd); R=https://github.com/attooo12/attooo12.github.io.git
printf '#!/bin/sh\ncase "$1" in Username*) echo x-access-token;; *) echo "$GITHUB_TOKEN";; esac\n' > /tmp/askpass.sh; chmod +x /tmp/askpass.sh
export GIT_ASKPASS=/tmp/askpass.sh
git clone -q $R "$D" 2>/dev/null || git init -q -b main "$D"
cd "$D" && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp "$SRC"/*.html "$SRC"/*.css "$SRC"/*.xml "$SRC"/*.txt "$SRC"/README.md . && touch .nojekyll
git add -A && git -c user.name=AloneAI -c user.email=aloneai@users.noreply.github.com commit -qm "${1:-Update site}" || true
git push -q $R HEAD:main
rm -rf "$D"
