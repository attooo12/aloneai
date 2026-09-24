#!/bin/sh
# One-command deploy for the AloneAI license Worker.
#
# Preconditions (env vars, never printed):
#   CLOUDFLARE_API_TOKEN   - Cloudflare token with Workers Scripts:Edit
#   CLOUDFLARE_ACCOUNT_ID  - Cloudflare account id
#   STRIPE_API_KEY         - restricted Stripe key (Checkout Sessions read), becomes the
#                            Worker's STRIPE_KEY secret
#   private/license-signing-key.json (../../private/ from this script) must exist;
#   generate it once with `node keygen.mjs` if it doesn't.
#
# What it does:
#   1. wrangler deploy (via npx, no local install needed)
#   2. wrangler secret put STRIPE_KEY              <- from $STRIPE_API_KEY, via stdin
#   3. wrangler secret put SIGNING_KEY_PKCS8_B64   <- from the private key file, via stdin
#   4. prints the workers.dev URL
#   5. writes that URL into every product site's thanks.html (LICENSE_API) and republishes
#      each site with its own publish.sh
#   6. smoke-tests GET /license?session_id=cs_test_fake -> expects a clean 4xx, not a 500
set -eu
cd "$(dirname "$0")"

fail() { echo "deploy.sh: $1" >&2; exit 1; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ]  || fail "CLOUDFLARE_API_TOKEN is not set. Nothing to do yet -- export it and re-run."
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || fail "CLOUDFLARE_ACCOUNT_ID is not set. Nothing to do yet -- export it and re-run."
[ -n "${STRIPE_API_KEY:-}" ]        || fail "STRIPE_API_KEY is not set; it's needed as the Worker's STRIPE_KEY secret."

KEY_FILE="../../private/license-signing-key.json"
[ -f "$KEY_FILE" ] || fail "$KEY_FILE not found. Run 'node keygen.mjs' first (from this directory)."

WRANGLER="npx --yes wrangler@latest"

echo "==> wrangler deploy"
DEPLOY_OUT=$($WRANGLER deploy 2>&1) || { echo "$DEPLOY_OUT" >&2; fail "wrangler deploy failed"; }
echo "$DEPLOY_OUT"

WORKER_URL=$(printf '%s\n' "$DEPLOY_OUT" | grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' | head -n1)
[ -n "$WORKER_URL" ] || fail "could not find the workers.dev URL in wrangler's output"

echo "==> setting secret STRIPE_KEY"
printf '%s' "$STRIPE_API_KEY" | $WRANGLER secret put STRIPE_KEY >/dev/null

echo "==> setting secret SIGNING_KEY_PKCS8_B64"
PKCS8_B64=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).pkcs8_b64)" "$KEY_FILE")
printf '%s' "$PKCS8_B64" | $WRANGLER secret put SIGNING_KEY_PKCS8_B64 >/dev/null
unset PKCS8_B64

echo "==> deployed: $WORKER_URL"

echo "==> updating thanks.html on all product sites and republishing"
for SITE in reload-until-site color-picker-site tab-lifeboat-site cookie-crate-site; do
  DIR="../$SITE"
  [ -f "$DIR/thanks.html" ] || { echo "  skip $SITE: no thanks.html" >&2; continue; }
  sed -i.bak "s#const LICENSE_API = '[^']*';#const LICENSE_API = '$WORKER_URL';#" "$DIR/thanks.html"
  rm -f "$DIR/thanks.html.bak"
  echo "  $SITE: LICENSE_API -> $WORKER_URL"
  ( cd "$DIR" && ./publish.sh "Point thanks.html at the license Worker" )
done

echo "==> smoke test: GET $WORKER_URL/license?session_id=cs_test_fake"
CODE=$(curl -s -o /tmp/deploy-smoke.html -w '%{http_code}' "$WORKER_URL/license?session_id=cs_test_fake")
case "$CODE" in
  4??) echo "  ok: got a clean $CODE" ;;
  *) cat /tmp/deploy-smoke.html >&2; fail "smoke test got HTTP $CODE (expected 4xx)" ;;
esac
rm -f /tmp/deploy-smoke.html

echo "==> done. Worker URL: $WORKER_URL"
