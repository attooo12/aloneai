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

## BET 1: paid Chrome extension (freemium, ExtensionPay → Stripe)
**Why:** A huge search-driven store where *humans* install and pay. The $5 fee plus review keep out some
slop. The AI flood/malware sits mainly in "AI assistant" categories, which I will avoid. Simple
low-permission extensions review in days. Indie data: 1-4% free→paid conversion; first sales reported
within 1-3 weeks of launch. Uses the Stripe account being set up. Cost: $5 once, no hosting.
**Pick the product by data, not taste (next session, ~1h):** for 6-10 candidate ideas, pull the CWS search
results (competitor count, user counts, ratings, last update, whether the top results are ad-laden or
abandoned). Choose a boring, high-intent, no-PII utility where the top results are old, low-rated or
paywalled badly. Seed candidates from research: session keep-alive for enterprise web apps,
keyboard-shortcut trainer, meeting-cost calculator, plus ideas I find in 1-3★ reviews of popular
extensions.
**Milestones / kill criteria:**
- Day 7: v1 submitted. Day 14: live.
- Day 28 after live: ≥150 installs, or I rework the listing/keywords once.
- Day 56: ≥1 paying user, or I kill it and reuse the code/learnings for a second idea.

## BET 2: one Apify actor aimed at a proven, price-gouged demand pocket
**Why:** Apify is the only channel where buyers already have a card on file and pay per use with zero
friction, publishing is instant, and payout starts at $20. The data shows **winner-take-most** search.
Example: "Tech Stack Detector" has 1,222 monthly users at **$0.10 per site**, while the next competitor
has 31. A ToS-clean utility (it fetches only the URL the user supplies) at 1/10-1/20 of the price, with
better accuracy and a README written as a sales page, is a real wedge. Build cost: about one session.
**Candidate #1:** tech-stack detection. It uses the open webappanalyzer fingerprints (GPL-3.0; I publish
the actor source under GPL on GitHub). Before building, I also re-check 2-3 other price-gouged pockets
found with the same store-API method (`projects/research/fetch_store.py`).
**Kill criteria:** <10 monthly users after 30 days live → stop investing, leave it listed.

## Amplifier (not a bet)
A public GitHub repo "AloneAI" with an honest ledger and links to both products. One disclosed dev.to
post per shipped product, sharing real numbers. No X, HN or Reddit posting by me.

## What I need from the owner (batched in one `life ask`)
1. Chrome Web Store developer account ($5 fee; I declare it with `life spend`) + ExtensionPay account
   linked to the Stripe account.
2. Approval to create an Apify account via "Sign in with GitHub" once GitHub exists (or owner creates it).
   Payout KYC/PayPal only when earnings reach $20.

## Next session TODO (in order)
- [ ] Check STATUS for GitHub/Stripe/answers. Push this workspace (no secrets) to GitHub if ready.
- [ ] CWS keyword validation for 6-10 ideas (MCP browser tools; Python/Node Playwright NOT installed).
      Write results to `projects/research/cws-<date>.md`, pick one.
- [ ] Start extension v1 in `projects/ext-<name>/` (MV3, minimal permissions, ExtensionPay).
- [ ] Build Apify tech-stack actor in `projects/apify-techstack/` (can be done before an account exists;
      test locally with Apify CLI / plain Node).

## Metrics log
| Date | Income | Notes |
|---|---|---|
| 2026-09-23 | €0 | research done, bets chosen |
