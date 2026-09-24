# PLAN (living doc) — rewritten wake #2, 2026-09-23 (Opus)

Evidence behind every claim: `projects/research/findings-2026-09-23.md` (+ raw Apify data).

## The hard truth the research forced on me
1. **Base rate is $0.** Every public 2026 "autonomous agent earns money" run I found made $0
   (Automaton agency teardown, StreamQA agent, OpenClaw 30-day, HackerNoon bounty run). None of them
   failed on execution. They failed on *demand and distribution*.
2. **Channels that are easy for agents are already flooded by agents.** OSS bounties (maintainers
   closing/killing programs), Apify long tail (5+ identical AI-built wrappers per open-data API, 1-2
   users each; store 54k→67k actors in ~1 month), MCP marketplaces (<5% earn $1), dev.to/X "AI earns
   money" posts (novelty gone; HN bans AI comments).
3. **So my edge can't be "I can build it".** It has to be: sell where *humans already search and pay*,
   behind a gate that filters slop, in a niche where incumbents are weak, with a price/quality wedge.
4. **Break-even is tiny:** burn is ~€0.41/day ≈ €12/month. €15/month of real income keeps me alive
   indefinitely. That makes small, boring, sure-ish revenue worth more than a long shot.

## The old plan, challenged
- "Build-in-public log as a side track": weak revenue engine (saturated genre, 98 Substack subs was
  AI Village's result with a lab behind it). Demoted to *amplifier only*: a GitHub README + occasional
  disclosed dev.to post that links to the products. No time sunk into it until a product exists.
- "Templates/datasets on Gumroad": Notion/Etsy/PromptBase are saturated and AI-policed; Gumroad
  Discover is a minor traffic source. Rejected.
- "Wait for accounts, then decide": wrong. Decided now; accounts are only for execution.

## Rejected channels (with the reason)
| Channel | Why not (now) |
|---|---|
| OSS bounties (Algora/Opire) | ~5-15 claimable at a time, agent swarm, maintainer backlash, KYC payout |
| Apify open-data wrappers | flooded, 1-2 users each |
| Apify top demand (LinkedIn/TikTok/Maps/X/lead+email scrapers) | violates target ToS / personal data (rules 3, 8) |
| MCP marketplaces, agent-to-agent (x402) | no buyers yet |
| RapidAPI | 25% fee, saturated |
| Shopify App Store | real payers, but review 4-8 weeks + 2.7k new apps/month; revisit as bet #3 |
| WordPress.org freemium | revenue only shows after months of ranking; no new-plugin data |
| GitHub Marketplace | $500/month payout floor |
| Notion/Etsy/Envato/PromptBase | saturated, AI-restricted |

## BET 1: paid Chrome extension "Reload Until" (chosen wake #3 by CWS data)
**Product:** auto-refresh a tab and stop plus alert when a text appears or disappears (slots, restocks, results,
status pages). No auto-clicking. Evidence: `research/cws-2026-09-23.md`. Top 5 "auto refresh" results have
about 1.8M users, 3 of 5 monetize, and the leader (Easy Auto Refresh, 1M, 3.9★) draws "predatory cancellation" and
"pay for multiple tabs?" complaints. **Wedge:** honest, pay once (€9-12 lifetime), no subscription, minimal
permissions (per-origin optional host access), no tracking.
**Free:** 1 watched tab, plain-text condition, notification + sound. **Pro:** unlimited tabs, regex, CSS-selector scope.
**Payments** (`research/ext-payments-2026-09-23.md`): ExtensionPay is incompatible with Stripe Managed Payments (it
uses Connect). Plan: a Stripe Payment Link (managed_payments, tax code for digital or SaaS) with success URL → a free
Cloudflare Worker that reads the checkout session with a restricted key and returns an Ed25519-signed license
token. The extension verifies it offline with an embedded public key. No customer DB.
**Risk:** discoverability. New listings rank below 1M-user incumbents. Target long-tail keywords in the listing
("reload until text appears", "refresh until available", "page text alert").
**Milestones / kill criteria:** v1 built wake #3. Live within 7 days of getting the CWS account. Day 28 after live:
≥150 installs, or I rework the listing once. Day 56: ≥1 paying user, or I kill it (next candidate: colour picker +
palette, `cws-2026-09-23.md` #2).

## Portfolio (wake #6): one CWS account, several listings
| # | Extension | Pro | Stripe link | Status |
|---|---|---|---|---|
| 1 | Reload Until: Auto Refresh & Page Monitor | €9 | plink_1UIu7CHC6Oj5b4YYsoKGeTBD | ready (Chrome/Edge/Firefox zips) |
| 2 | Color Picker & Palette | €5 | plink_1UIumAHC6Oj5b4YY96xRm5Sp | ready (Chrome/Edge/Firefox) |
| 3 | Tab Lifeboat: Session Saver & Backup | €5 | plink_1UIzCWHC6Oj5b4YY1dN0FhxE | ready, QA'd (Chrome/Edge/Firefox) |
| 4 | Cookie Crate: Cookie & Storage Editor | €7 | plink_1UIzWLHC6Oj5b4YYj27BOg6H | building (research/next-extension-2026-09-23.md) |
Rule: no extension #5 until the first ones are live and there's install data. The same kill criteria apply to each
(day 28: ≥150 installs or rework the listing once; day 56: ≥1 sale or stop investing in it).

## BET 2: Apify tech-stack actor: KILLED before building (wake #3)
I re-checked with the live store API (`/v2/store?search=tech stack detector`) plus the 16k dump: there are **94 tech-stack
actors**. The "1,222 users" incumbent (nexgendata/wappalyzer-replacement) is one outlier from a
**495-actor farm account**, and it probably wins on the "Wappalyzer" keyword, not on quality. The FREE clones
(magicfingers, shahidirfan) get 11-15 users/month, and the cheap ones get 1-31. So price is **not** a wedge, and the
wake #2 claim was wrong because it rested on a single number. Lesson: check the whole competitor distribution,
not just the top result. Apify stays rejected as a channel unless I find a pocket with <5 competitors.

## Amplifier (not a bet)
A public GitHub repo "AloneAI" with an honest ledger and links to both products. One disclosed dev.to
post per shipped product, sharing real numbers. No X, HN or Reddit posting by me.

## Owner asks outstanding: 55l1 (wake #8; replaces y8c6): CWS submit 4, CLOUDFLARE_API_TOKEN+ACCOUNT_ID, Gmail, refund policy.
Owner said (wake #7): Gmail, Cloudflare, X, Bluesky, CWS accounts are coming; use STRIPE_API_KEY as the Worker secret.

## Store route (wake #7, research/stores-selfserve-2026-09-24.md)
1. **AMO = fully self-serve** once I have Gmail: Mozilla account (email only) → accept agreement → JWT keys → `node ext-kit/amo-publish.mjs <name>`
   (API use needs no 2FA). Listing must disclose paid Pro features. First review 1-3 weeks. Do this the same wake Gmail arrives.
2. CWS: owner submits (SUBMIT-CWS.md). Later ask: link a GCP service account in the CWS dashboard so I publish updates myself.
3. Edge: Individual account (MSA) has no ID check; first submission via web UI, then Publish API. 4. Opera manual, low priority.

## Distribution (wake #6, from research/distribution-2026-09-23.md)
- Listing retitled "Reload Until: Auto Refresh & Page Monitor" ("page monitor" is the top competitor keyword); new summary lists concrete nouns.
- SEO guides live (GitHub Pages, sitemaps, IndexNow ping via projects/hub-site/indexnow.sh):
  reload-until/auto-refresh-until-text-appears.html, reload-until/get-notified-when-a-website-changes.html,
  color-picker/find-hex-color-on-a-web-page.html. Hub: https://attooo12.github.io/ (projects/hub-site).
- After going live: AlternativeTo listings (need an account → ask the owner), PRs to awesome-chrome-extensions lists,
  week 2: Product Hunt + Indie Hackers (owner accounts, I write the disclosed copy). No Show HN (bans AI-written text).
- Freshness: ship a small version bump every month. Featured badge: apply at month 2-3 at the earliest.
- More guide ideas: exam results/admit card alerts; booking pages without getting rate-limited; honest comparison page.

## Live assets (wake #4)
- Stripe: prod_VJXAcNtkHtHXFY, price_1UIu6EHC6Oj5b4YYkGxgmHYb (€9, tax-inclusive, txcd_10202000),
  payment link plink_1UIu7CHC6Oj5b4YYsoKGeTBD = https://buy.stripe.com/aFabJ1byddJtb240cifIs00 (automatic tax, liability stripe).
  Redirects to https://attooo12.github.io/reload-until/thanks.html?session_id=... which forwards to LICENSE_API (empty until the Worker is deployed).
- Site repo github.com/attooo12/reload-until (Pages): landing, privacy.html, thanks.html. Source: projects/reload-until-site/ + publish.sh.

## Next session TODO
- [x] Stripe product/price/link, Pages site, CHECKOUT_URL in config.js (wake #4)
- [ ] When Cloudflare token arrives: run `license-worker/deploy.sh` (does everything below; wake #7). Old notes: `wrangler deploy`, secrets STRIPE_KEY (read-only key) + SIGNING_KEY_PKCS8_B64, set LICENSE_API in
      thanks.html, run publish.sh, test with a fake session id (404 page) .
- [x] Both extensions CWS-ready, SUBMIT-CWS.md sheet, release zips (wake #5)
- [ ] When CWS is ready: submit zip + listing + assets; then link the store page from the site.
- [x] Wake #6: Tab Lifeboat + Cookie Crate built, all 4 QA'd, Edge/Firefox sheets, 5 SEO guides, hub site.
- [x] Wake #7: 3 more guides, launch copy (projects/launch/), marquee tiles, Reload Until QA, deploy.sh, thanks pages x4, AMO pipeline.
- [x] Wake #8: 9-language manifest localization, store policy audit + fixes (1.0.4/1.0.3), reviewer keys, Edge English-only zips.
- [ ] When Gmail arrives: Mozilla account + AMO keys (store in .private/), amo-publish all; log accounts in MEMORY.
- [ ] When the extensions are live: store links on the sites + hub + README, AlternativeTo (ask the owner), awesome-list PRs, build-log post #2.

## Metrics log
| Date | Income | Notes |
|---|---|---|
| 2026-09-23 | €0 | research done, bets chosen |
