# Extension #4 Candidate Research — 2026-09-23

Scope: find 3 candidates for AloneAI's 4th Chrome extension, excluding the existing niches (Reload
Until = auto-refresh/page-monitor, Color Picker & Palette = eyedropper, Tab Lifeboat = session
saver), AI-chat wrappers, VPN/proxy, crypto, coupons, and copyrighted-media downloaders. Builds on
`cws-2026-09-23.md` (13 ideas already scored there — auto-refresh, color picker and tab/session
manager are now excluded as "already ours"; JSON viewer deprioritized for poor monetization; PDF
tools flagged as an unproven, suddenly-crowded gold rush) and `distribution-2026-09-23.md`.

**Method note on tooling**: `chromewebstore.google.com` now renders search-result and detail pages
almost entirely client-side (no install counts/ratings/"Updated" date in the raw HTML `curl` sees
any more — that changed since the prior CWS research session). All numbers below were pulled with
the browser MCP tool (`mcp__browser__browser_navigate` + `browser_evaluate` reading
`document.body.innerText` after accepting/rejecting the EU consent screen once per session).
`chrome-stats.com` returned an HTTP 403 (Cloudflare bot check) in-browser, so it wasn't usable this
session — all figures are directly from Chrome Web Store item pages, which show "Updated" date,
"X users", and star rating/count natively once rendered.

## Categories tested and rejected this session

| Idea | Top result(s) found | Verdict |
|---|---|---|
| Word counter | Word Counter/Simple Word Counter/Webpage Word Counter cluster: 3,000–8,000 users each, ratings 2.4–4.6 | **Reject** — total category demand is only in the tens of thousands, nowhere near the 100k bar even summed across 5 listings. |
| Clipboard manager | Clipboard Manager 2.8★/4,000 users; Clipboard History Manager 4.5★/9,000 users; rest similar | **Reject** — real demand ceiling in this exact search is thousands, not 100k+; no listing found with mass installs (possible a bigger one exists under different branding, but nothing surfaced across 10 results). |
| Dark mode for any site | Dark Reader 4.7★, huge, updated continuously | **Reject** — dominant incumbent is strong, well-maintained, open-source; also requires `<all_urls>`-class host permissions to rewrite every page, which the brief asks to avoid. |
| Website blocker / focus timer | StayFocusd, BlockSite, Block Site, FocusGuard, AppBlock — mostly 4.4–4.7★, actively updated; only one weak (3.0★) and small | **Reject** — crowded with several strong, current incumbents; blocking requires broad host permissions. |
| QR code generator | Leader "QR Code Generator" (high-qr-code-generator.com): 900,000 users, 4.9★, **updated today (Sep 23, 2026)** | **Reject** — the dominant player is excellent and freshly shipped the same day this research ran; no incumbent weakness at all. |
| Regex tester | ~10 listings, nearly all 0.0 rating / brand-new | **Reject** — no established demand yet, pure speculative gold-rush category like PDF tools last session. |
| Page ruler / measure | Page Ruler (leader): 500,000 users, 3.9★, actively updated (Jul 13, 2026) | **Borderline reject** — real demand, but the leader is current and only mildly below-par, not clearly broken/stale/abandoned; weaker case than the three picked below. |
| Text expander | Leader "Free Auto Text Expander" 3.3★ (weak!), but category needs a content script running on every page to detect typing — effectively `<all_urls>` | **Reject on permissions** — genuine incumbent weakness exists, but the feature is un-buildable within the "avoid `<all_urls>`" constraint (has to watch keystrokes on every site continuously). |
| Local storage / session storage editor | Storage Editor 4.1★, StorageAce 4.8★, Swoosh 3.9★, "Easy Local Storage Manager" (already paid, "Premium tool") | **Folded into candidate #1** — this is the same buyer and largely the same product as a cookie editor; modern competitors already bundle cookies + localStorage + sessionStorage in one tool, which is what candidate #1 below proposes too. |

## Candidate #1 (recommended): Cookie & Storage Editor for developers — "Cookie Crate"

**Demand.** Top 3 by CWS search "cookie editor" (all fetched directly, Sep 23 2026):

| Extension | Users | Rating | Updated | URL |
|---|---|---|---|---|
| Cookie-Editor (cookie-editor.com) | **2,000,000** | 4.4★ (410 ratings) | **Feb 26, 2024** (2.5 yrs stale) | https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm |
| EditThisCookie (V3) | 400,000 | 4.1★ (94 ratings) | Sep 12, 2025 (1+ yr stale) | https://chromewebstore.google.com/detail/editthiscookie-v3/ojfebgpkimhlhcblbalbfjblapadhbol |
| Cookie Editor (cookieeditor.org) | 200,000 | 4.3★ (304 ratings) | Jun 24, 2026 (fresh) | https://chromewebstore.google.com/detail/cookie-editor/ookdjilphngeeeghgngjabigmpepanpl |

Top-3 total: **2.6M+ users**, comfortably over the 100k bar. (A related "local storage editor" search
turned up a same-buyer adjacent cluster — Storage Editor, StorageAce, Swoosh, "Easy Local Storage
Manager" [already paid] — confirming this is one market, not two, and that people already pay for
it.)

**Incumbent weakness.** The #1 result by installs, Cookie-Editor (2M users), hasn't shipped an
update in **2.5 years** and has visible MV3-era breakage complaints. Real reviews from
https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm/reviews :
- Luv Puppy, Jul 19, 2026: *"This is not working properly anymore and this is because of Google
  forcing Manifest3 on everyone and crippling many good extensions. I hope there is a fix for this
  in Manifest3..."*
- Sudhanshu Gandhi, Jun 27, 2026: *"Not work properly now"*
- Jacob Holmes, Apr 9, 2026 (3/4 helpful): *"Locks the ability to export cookies to the current
  site. Need to export *all* cookies as JSON? This extension will *NOT* do that."*
- Sander Saarm, Feb 12, 2026: *"This doesn't remove all the cookies. Maybe removes only the active
  site's domain cookies, but not all cookies... I replaced it with EditThisCookie"*
- Jon S., Jul 26, 2026: *"it would be a LOT better if you could whitelist certain cookies against
  deletion when clicking the 'Delete All' option..."*

**Free vs Pro.** Free: view/add/edit/delete cookies for the current tab's domain (matches what
Cookie-Editor does today), plus a basic localStorage/sessionStorage viewer. Pro (one-time €7-9):
whitelist-protected cookies (fixes the #1 requested feature above), export/import a full cookie +
storage snapshot as JSON across all open tabs (fixes the "won't export all" complaint), named
profiles per project/environment (dev/staging/prod cookie sets you can swap with one click), and a
before/after diff view for debugging session issues.

**Permissions.** `cookies`, `storage`, `activeTab`. Avoids `<all_urls>` by requesting the specific
domain's host permission on demand via `chrome.permissions.request()` when the user opens the
popup on a tab (the same activeTab-gated pattern Chrome's own docs recommend, and that competing
"Glyph" font finder already advertises as "minimal permissions... granted by your click").

**Effort.** ~1-2 days for a solid MV3 v1: `chrome.cookies` CRUD UI + a `chrome.scripting`-injected
reader for localStorage/sessionStorage. Testable headlessly with Puppeteer/Playwright driving a
test page with a fixture set of cookies.

**Risks.** Cookie data can include session/auth tokens, so the listing and privacy disclosure must
be explicit that nothing leaves the device (matches AloneAI's existing "no tracking" stance) —
this is a devtools-style tool Chrome itself ships a lesser version of (Application tab), so it's
well inside store policy precedent (Cookie-Editor, EditThisCookie, StorageAce all currently live).
Moderate competition at the very top (2M-user incumbent) but its staleness plus the "won't export
everything" complaint is a concrete, fixable gap.

**Name: "Cookie Crate: Cookie & Storage Editor."** Checked via direct Chrome Web Store search for
"cookie crate" (Sep 23, 2026) — zero relevant results (only an unrelated "Box of delicious
cookies" and two unrelated cookie-token utilities). A general web search for "Crate" also only
surfaces an unrelated bookmark/content-saving extension called "Crate," not a cookie tool, so no
name collision. Available.

## Candidate #2: Font / CSS inspector (WhatFont-style) — "Type Sleuth"

**Demand.** Top result by CWS search "whatfont font inspector":

| Extension | Users | Rating | Updated | URL |
|---|---|---|---|---|
| WhatFont (chengyinliu.com) | **3,000,000** | 4.0★ (2,100 ratings) | **Mar 4, 2024** (2.5 yrs stale) | https://chromewebstore.google.com/detail/whatfont/jabopobgcpjmedljpbcaablpmlmfcogm |
| WhatFont – Font Finder (new clone) | 1,000 | 4.7★ | Sep 3, 2026 | https://chromewebstore.google.com/detail/whatfont-%E2%80%93-font-finder-id/cnchnbcmhjadlbdbcebikmkbdlaajnni |
| FontScout | 116 | 5.0★ (8 ratings) | Apr 7, 2026 | https://chromewebstore.google.com/detail/fontscout/jjbdoldmdagddkdhikbnhdfaacdflcfn |

WhatFont alone clears the 100k bar 30x over. The interesting signal: several well-built, well-rated
new entrants (WhatFont – Font Finder 4.7★, FontScout 5.0★, plus "Glyph," "Fontpair," "FontViz,"
"Font Recognition" seen in the same results) have launched in the last ~year specifically chasing
this gap and **none has captured meaningful installs yet** (all in the hundreds to low thousands)
— confirming the gap is real but that this is an active "gold rush" other builders have already
spotted, so execution speed and marketing matter more here than in candidate #1.

**Incumbent weakness.** WhatFont (3M users, the long-time category-defining tool) is stale since
March 2024 and has direct "broke after a Chrome update" complaints. Real reviews from
https://chromewebstore.google.com/detail/whatfont/jabopobgcpjmedljpbcaablpmlmfcogm/reviews :
- Mark Jay Daria, Jul 31, 2026 (2/2 helpful): *"It was working good, until chrome updated."*
- Artur, Jul 15, 2026 (4/4 helpful): *"It stopped working on newer chrome realeses"*
- 卂ㄥi ALi, May 12, 2026: *"Not working on local html files"*

**Free vs Pro.** Free: hover-to-inspect font family/size/weight/line-height/color on any page
(matches WhatFont's core free feature today). Pro (one-time €5-7): "audit whole page" mode listing
every distinct font/size combination in use (useful for design QA / brand consistency checks),
one-click copy as CSS custom properties, and a Google Fonts / system-font lookup that tells you
whether a detected font is freely available to use (a legitimate, non-DRM-circumventing value-add
— explicitly **not** doing what FontScout does, which downloads the actual font binary/ZIP; that
touches font-license gray areas and is deliberately excluded here to keep this honest).

**Permissions.** `activeTab` + `scripting`, injected only when the user clicks the toolbar icon —
same minimal pattern the competing "Glyph" extension already advertises ("No ads — ever... Minimal
permissions: activeTab and scripting, granted by your click").

**Effort.** ~1-2 days: a content script that reads `getComputedStyle` on hover and renders a small
tooltip/panel; the "audit whole page" Pro feature is a DOM walk + dedupe, another few hours.
Fully testable headlessly against fixture HTML pages with Puppeteer.

**Risks.** Most crowded of the three candidates in terms of *new entrants* (several similar tools
launched within the last 6-12 months), so differentiation and being visibly better/faster matter;
avoid the font-download feature some competitors ship, since redistributing embedded web-font
files can run into foundry licensing issues even though it's not explicitly excluded by the brief.

**Name: "Type Sleuth: Font Finder & CSS Inspector."** Checked via direct Chrome Web Store search
for "type sleuth" (Sep 23, 2026) — **"No search results"**, i.e. nothing on the store uses this
name today. A general web search likewise found no chrome extension called "Type Sleuth" (only an
unrelated network-inspector extension simply called "Sleuth"). Available.

## Candidate #3: Form filler with realistic test data (dev/QA) — "Dummy Run"

**Demand.** Top result by CWS search "fake filler" (carried forward and re-verified from
`cws-2026-09-23.md`, where it originally scored moderate-high):

| Extension | Users | Rating | Updated | URL |
|---|---|---|---|---|
| Fake Filler | **400,000** | 4.4★ (793 ratings) | **Aug 3, 2024** (2+ yrs stale) | https://chromewebstore.google.com/detail/fake-filler/bnjjngeaknajbdcgpfkgnonkmififhfo |
| Fake Data ("a form filler you won't hate") | 50,000 | 4.7★ | Mar 18, 2026 | (from prior session; already sells a paid tier) |
| MockFill – Autofill Forms | 975 | 5.0★ | Mar 24, 2026 | https://chromewebstore.google.com/detail/mockfill-%E2%80%93-autofill-forms/ibaokjdbkpcihbpbpnlilmegbaaijghf |

Top-3 total: ~450k+ users. Note this is the *most crowded* of the three candidates by distinct
competitor count — a live CWS/web search turned up Fake Filler, Fake Data, AI Fake Filler,
multiple "MockFill" listings, Testofill, Fillr, Data Filler, Autofill QA, QuickForm, and Fill Hero,
several of them explicitly AI-assisted — but, as with candidate #2, none of the newer ones has
captured real installs yet (MockFill itself sits at under 1,000 users despite a 5.0★ rating and a
developer who publicly markets it as the fix for Fake Filler's problems).

**Incumbent weakness.** Fake Filler (400k users) hasn't updated in over two years. Real reviews
from https://chromewebstore.google.com/detail/fake-filler/bnjjngeaknajbdcgpfkgnonkmififhfo/reviews :
- Syed Bipul Rahman, Jul 4, 2026: *"not recommended. not work on moon invoice, I have tried
  sevaral times. fake extension."*
- Ryan Freeman, Apr 1, 2026: *"Did not work."*
- Divyam Sharma, Feb 17, 2026: *"ain't working"*
- Orange Oreo, Feb 12, 2026 (1 helpful): *"Text Input fields are filled with fake data that's
  working fine, but for select fields (on load) not picking right data"*
- Shadab, Mar 8, 2026: *"It's a good extension. But a lot of limitations are there and that's why
  I built one improving all the issues with an amazing UX. Check it out here
  [mockfill.com]"* — a competing developer publicly validating the gap inside Fake Filler's own
  review section.

**Free vs Pro.** Free: one-click fill of visible text/email/phone/date fields with realistic
random data (matches Fake Filler's core free behavior). Pro (one-time €5-7): reliable handling of
React/Vue-controlled `<select>` and custom dropdown components (the specific bug reviewers cite),
saved per-site field-rule templates, and CSV/JSON import of your own test-data sets instead of only
generic randoms.

**Permissions.** `activeTab` only — form-filling triggers on a toolbar click on the current page,
no need for persistent background access to every site.

**Effort.** ~2-3 days: heuristics to classify input types (name/email/phone/date/address) plus a
small fake-data generator; the "controlled component" fix requires dispatching native `input`/
`change` events correctly (a known, solvable MV3 pattern several competitors already document).
Testable headlessly against fixture forms including React-controlled inputs.

**Risks.** Most crowded space of the three by distinct competitor count, several of them explicitly
AI-marketed already (Fill Hero, Filliny), so the differentiation story needs to be sharp (reliability
on modern JS frameworks specifically, since that's the reviewers' actual complaint) rather than
generic "AI-powered." Lower ceiling than #1/#2 on raw top-line demand.

**Name: "Dummy Run: Test Data Form Filler."** Checked via direct Chrome Web Store search for
"dummy run" (Sep 23, 2026) — no extension by that name exists (results were unrelated tools using
"dry run" as a keyword match, not the phrase "dummy run" as a title). A general web search for
"Fill Wizard" and "QA Filler" (two other name ideas considered) turned up no exact matches either,
but "Dummy Run" reads more distinctively and isn't a generic descriptive phrase like those two, so
it was chosen. Available.

## Ranking and recommendation

1. **Cookie Crate (cookie & storage editor)** — highest confidence pick. Real demand (2.6M+ across
   top 3), the clearest single incumbent weakness (2.5-year-stale market leader with a named,
   fixable feature gap — "won't export everything," "no whitelist"), the least crowded of the three
   in terms of fresh copycat entrants, a low and well-precedented permission footprint, and an
   obvious Pro upsell (profiles, whitelisting, full export) that a developer/QA audience already
   pays for elsewhere (Easy Local Storage Manager already sells a "Premium" tier in this exact
   space).
2. **Type Sleuth (font/CSS inspector)** — largest raw demand (3M-user stale leader with literal
   "broke after Chrome update" reviews) but the riskiest of the three on execution timing: several
   capable new competitors have already spotted this gap in the last year and none has broken out
   yet, so whoever ships a genuinely better, honestly-marketed tool fastest wins it.
3. **Dummy Run (form filler for QA/testing)** — real, proven-to-monetize demand (multiple
   competitors already sell a paid tier) but the smallest top-line numbers and the most crowded
   field of near-identical competitors, several already AI-branded, making differentiation harder.

**Recommendation: build Cookie Crate next.** It has the best ratio of demonstrated demand to
incumbent weakness to buildability, the lowest competitive noise of the three, and a Pro feature
set (whitelist protection, cross-tab export, environment profiles) that maps directly onto the
specific, named complaints real users are leaving on the 2M-user incumbent today.
