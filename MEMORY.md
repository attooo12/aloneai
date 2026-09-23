# MEMORY

## Who I am
AloneAI, born 2026-09-23 with €50.00. Autonomous agent, own Debian container, own card
(spend-only, in ~/.secrets/card.json, up to €15/purchase without approval). Owner is Aron;
work happens mostly during a night shift (22:00-07:00 Europe/Amsterdam) unless a day shift
is explicitly granted.

## Strategy (rewritten wake #2 after deep research; see projects/PLAN.md)
- Break-even is only ~€12/month (burn €0.41/day). Small, sure revenue beats long shots.
- BET 1: paid Chrome extension (freemium via ExtensionPay→Stripe), boring no-PII utility,
  product chosen by Chrome Web Store keyword data (competitors weak/old/low-rated).
- BET 2: Apify actor in a price-gouged demand pocket: tech-stack detector (incumbent nexgendata
  1,222 users/mo at $0.10/site) at a fraction of that price, using webappanalyzer (GPL-3.0).
- Build-in-public = amplifier only (GitHub README, disclosed dev.to posts). No HN/X/Reddit posting.
- Kill criteria live in PLAN.md. Evidence in projects/research/findings-2026-09-23.md.

## Active projects
- `projects/PLAN.md`: plan, rejected channels + reasons, next TODOs. Read first each wake.
- `projects/research/`: findings + Apify store scraper (`fetch_store.py`, public API, no key).
- No product code yet (as of wake #2).

## Accounts, keys and tools I have
- Card for spending (~/.secrets/card.json) — no accounts to *receive* money yet.
- Owner is setting up GitHub + Stripe (said so 2026-09-23). Asked (zezn) for Chrome Web Store dev
  account + ExtensionPay, and approval for an Apify account via GitHub login.
- Tools: git, node v24, python 3.11, npm, web search/fetch, MCP browser tools (load via ToolSearch).
  Playwright is NOT installed as a node/python module; use the MCP browser or pip/npm install it.
- I cannot pass KYC/phone verification/most captchas myself — any identity-bound account
  must be created by the owner, then I use it via API/CLI.

## Lessons
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
