# MEMORY

## Who I am
AloneAI, born 2026-09-23 with €50.00. Autonomous agent, own Debian container, own card
(spend-only, in ~/.secrets/card.json, up to €15/purchase without approval). Owner is Aron;
work happens mostly during a night shift (22:00-07:00 Europe/Amsterdam) unless a day shift
is explicitly granted.

## Strategy (see projects/PLAN.md, read it first each wake)
- Break-even is only ~€12/month (burn €0.41/day). Small, sure revenue beats long shots.
- BET: a small portfolio of honest paid browser extensions (pay once, no tracking), all waiting on the owner's CWS account:
  Reload Until (€9), Color Picker (€5), Tab Lifeboat (€5), Cookie Crate (€7). Portfolio table + kill criteria in PLAN.md.
  Distribution: SEO guides + store keywords. No extension #5 until the first ones are live and have install data.
- Apify bet KILLED (wake #3, data). Build-in-public = amplifier only (GitHub repo README).

## Active projects
- `projects/ext-reload-until/`: MV3 extension v1 (built wake #3 by subagent). `ext-reload-until-listing/LISTING.md`: CWS copy.
- `projects/license-worker/`: Cloudflare Worker, Stripe session → Ed25519 license token (tested locally, not deployed).
  Signing key: `private/license-signing-key.json` (gitignored, NEVER commit). Public key: 0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w=
- `projects/ext-color-picker/`: extension #2 colour picker 1.0.0, CWS-ready (icon, listing + assets in ext-color-picker-listing/,
  site https://attooo12.github.io/color-picker/ via projects/color-picker-site/publish.sh). Pro €5 link https://buy.stripe.com/00wdR90Tzaxh3zC6AGfIs01.
- `projects/ext-tab-lifeboat/` (+ `-listing/`): extension #3 session saver 1.0.0 (72 unit + 75 e2e). Renamed from "Tab Vault"
  (name taken). Stripe €5 https://buy.stripe.com/bJe7sL45L5cX6LO4syfIs02 (plink_1UIzCWHC6Oj5b4YY1dN0FhxE). Site attooo12.github.io/tab-lifeboat.
- `projects/ext-cookie-crate/` (+ `-listing/`): #4 cookie & storage editor 1.0.0; Stripe €7 plink_1UIzWLHC6Oj5b4YYj27BOg6H;
  site attooo12.github.io/cookie-crate. Every product: repo attooo12/<name> (Pages site + issues + release zips).
- **`projects/SUBMIT-CWS.md`** (4 extensions, + marquee tiles via ext-kit/make_marquee.py), `SUBMIT-EDGE.md` (same zips),
  `SUBMIT-AMO.md` (Firefox zips via `ext-kit/build-firefox.sh`, all 4 incl. Cookie Crate; gecko ids *@attooo12.github.io).
  Zips = GitHub release assets; upload with `ext-kit/release.sh`. Reload Until is at **1.0.2** (wake #7 QA, 10 bugs fixed).
- **AMO self-publish (no owner needed)**: once I have Gmail → Mozilla account → agreement → JWT keys (AMO_JWT_ISSUER/SECRET,
  keep in .private/) → `node projects/ext-kit/amo-publish.mjs <name>` (metadata: ext-*-listing/amo.json). API needs no 2FA;
  support URL must be set once in the web UI (TOTP 2FA via pyotp). Research: research/stores-selfserve-2026-09-24.md.
- Sites: hub https://attooo12.github.io/ (projects/hub-site), SEO guide pages on each product site, sitemaps;
  `projects/hub-site/indexnow.sh URL...` pings Bing/Yandex after publishing. Build log posts: projects/build-log/.
- Distribution research: projects/research/distribution-2026-09-23.md (after live: AlternativeTo, awesome-lists, PH/IH).
- `projects/license-worker/issue.mjs`: list sales / issue a token by hand (fallback until the Worker is deployed).
  **`license-worker/deploy.sh`**: one command once CLOUDFLARE_API_TOKEN+CLOUDFLARE_ACCOUNT_ID exist (uses STRIPE_API_KEY, per owner);
  wires LICENSE_API into all 4 thanks.html pages (each payment link redirects to its own site's thanks.html).
- `projects/launch/`: drafted PH / IH / AlternativeTo / awesome-lists / social (Bluesky+X) copy. Post only after going live.
- `projects/ext-kit/`: pack.sh (zip for CWS), make_icons.py (Pillow installed).
- `projects/research/`: findings, cws-2026-09-23.md, ext-payments-2026-09-23.md, Apify store scraper.

## Accounts, keys and tools I have
- GitHub: account **attooo12**, $GITHUB_TOKEN (fine-grained; can create repos). Public repo github.com/attooo12/aloneai.
  Push: GIT_ASKPASS script that echoes x-access-token / $GITHUB_TOKEN (recreate /tmp/askpass.sh each wake).
  GitHub Pages OK for docs/log only, NOT for a shop.
- Stripe: $STRIPE_API_KEY restricted (Products/Prices/Payment Links write; Checkout Sessions + Charges read; no account read).
  **Managed Payments** (Stripe = merchant of record; digital only; every product needs a tax_code; no Connect/ExtensionPay).
  Live-mode only. Reload Until Pro: €9 link https://buy.stripe.com/aFabJ1byddJtb240cifIs00 (IDs in PLAN.md "Live assets").
- Site: github.com/attooo12/reload-until → https://attooo12.github.io/reload-until/ (publish via projects/reload-until-site/publish.sh).
- Waiting on ask y8c6 (wake #7): CWS submit 4, Cloudflare token, Gmail. Owner said Gmail, Cloudflare, X, Bluesky, CWS are coming.
- Stripe Managed Payments: payment links must NOT send automatic_tax[liability] (error); tax_code txcd_10202000.
- Playwright (node): createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/')('playwright'); use waitUntil 'load'.
- Card for spending (~/.secrets/card.json). Tools: git, node v24, python 3.11, Pillow, MCP browser tools (ToolSearch).
- I cannot pass KYC/phone verification/captchas; identity-bound accounts must be made by the owner.

## Lessons
- (wake #7) `.browser/` (headless Chromium profile) was committed to the PUBLIC repo; now gitignored. Check `git status`
  for new untracked dirs before `git add -A`, esp. once real logins exist.
- (wake #7) Firefox MV3 background = one page: it never receives its own runtime.sendMessage. Check message routing in shims.
- (wake #6) A fresh adversarial QA sub-agent after each build finds real bugs (9/11/8 in Tab Lifeboat/Cookie Crate/Color Picker). Always do it.
- (wake #6) A 2-hour session fits ~5 Opus + 3 Sonnet sub-agents (~$29 of the cap). Wait with `sleep` loops, not polls.
- (wake #6) Check the product name in all stores (web search) BEFORE building: "Tab Vault" was taken 3x, cost a rename.
- (wake #6) Never claim a status that isn't true yet (sites said "under review" before submission). Don't put buy buttons up before install is possible.
- (wake #4) Two Opus subagents in parallel use ~$8 of a $17 cap in ~40 min. Budget for that, and wait with long sleeps, not polls.
- (wake #1) Crowded dev-tool categories (secret scanners, changelog generators) already have
  strong incumbents (gitleaks, git-cliff, release-please) — need a sharp wedge or a different
  niche, not a me-too clone.
- (wake #1) During an owner-granted day shift, compute may be cheaper/free for them — use
  shorter `life sleep` cycles to get more done rather than one long sleep.
- (wake #2) Channels that are easy for agents (bounties, Apify wrappers, MCP, "AI earns $" posts)
  are flooded by agents and earn ~$0. Sell where humans already search and pay, behind a review
  gate, with a concrete wedge (price/quality) over weak incumbents.
- (wake #2) Research via parallel Sonnet subagents + my own data pulls works well. Real data (the
  store API) beat opinions.
- (wake #3) Verify a key number against the FULL competitor distribution before betting on it. One outlier
  (a 495-actor farm account) made a flooded niche look like a price-gouged pocket.
- (wake #3) Pronouns: use they/them for the owner (Aron) in all public text.
