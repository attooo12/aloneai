# Store policy audit, 2026-09-24 (CWS, Edge, AMO): all 4 extensions

Adversarial pre-submission review against the policies as fetched today:
- CWS Program Policies (developer.chrome.com/docs/webstore/program-policies/policies), listing requirements,
  Spam FAQ, User Data FAQ, Troubleshooting violations (colour codes).
- Firefox Add-on Policies (extensionworkshop.com) and the built-in data consent page.
- Microsoft Edge Add-ons developer policies (updated 2026-08-13) and the "Publish an extension" guide.

Scope: manifests, every chrome.* call, network/remote-code greps, the release zips, LISTING.md / amo.json /
SUBMIT-*.md, screenshots/marquees/promo tiles, and the four sites including privacy pages and competitor pages.

## Policy facts that changed the answers

1. **CWS User Data FAQ Q3 (verbatim):** "Extensions are required to disclose how they handle user data, even
   when data is processed or stored locally on a user's device and is not transmitted to external servers or
   third parties." Q2 counts "data in a website's browser storage (like cookies)" as user data. The policies
   also say: "If the information listed in your privacy fields contradicts the information provided in your
   privacy policy, or the behavior of your extension, your extensions may be removed." So "tick nothing" was
   wrong for Reload Until (reads page text) and Cookie Crate (cookies, site storage). That is Purple Lithium.
2. **CWS keyword spam:** "Unnatural repetition of the same keyword more than 5 times"; no more than 5
   brands/sites listed; no anonymous testimonials (Yellow Argon).
3. **CWS payments:** "conspicuously post your terms of sale (including any refund and return policies)" and
   "clearly identify that you, not Google, are the seller".
4. **Edge 1.1.2:** the extension "must not reference other browsers". **1.5.2:** the privacy policy "should
   primarily refer to the Microsoft Edge browser and not other browsers" and must describe user controls.
   **1.8.2:** metadata must state the in-product purchase types and the range of prices. **1.1.4:** max 7 search
   terms. **1.7:** localize the description for every language the package declares. **Name:** read-only from
   the manifest; MDN gives Edge's cap as **45 characters** (AMO 50, CWS 75). Microsoft's own page gives no number.
5. **AMO:** since 2025-11-03 new add-ons must declare `browser_specific_settings.gecko.data_collection_permissions`.
   `ext-kit/build-firefox.sh` sets `{"required": ["none"]}` and `strict_min_version: "142.0"` for all four (still
   true after today's localisation edit). OK. Minified code is allowed; nothing here is minified, bundled or
   obfuscated (longest lines are HTML/comments). No source upload needed. "Listings must disclose when payment is
   required": all amo.json have `requiresPayment: true` and the price. OK.
6. **No store requires an "AI-made" disclosure.** The disclosure we make (listing, UI footer, privacy page) is
   allowed and consistent everywhere.

## Code-level checks (all four): clean
- Remote code (Blue Argon): no `eval`, `new Function`, `importScripts`, remote `<script>`, `fetch`, XHR,
  `sendBeacon` or WebSocket in any extension or Firefox shim. `atob` in license.js decodes the license token
  (data, not code). The only URLs are the Stripe checkout links, opened in a tab when the user clicks "Get Pro".
- Obfuscation (Red Titanium): none. Plain, commented ES modules.
- Permissions (Purple Potassium): every permission is used.
  - Reload Until: storage, alarms, notifications, offscreen (AUDIO_PLAYBACK), scripting, activeTab (the popup
    reads the current tab's URL to request just that origin), optional `<all_urls>` requested per origin.
  - Color Picker: activeTab, scripting, storage. No host permissions.
  - Tab Lifeboat: tabs, tabGroups, storage, unlimitedStorage (justified), alarms, optional downloads.
  - Cookie Crate: cookies, storage, activeTab, scripting, optional `<all_urls>` requested per site (all sites only
    for the Pro export/import).
- Nothing opens a tab on install and nothing shows an upsell automatically (Yellow Nickel).
- Release zips exclude `test/` (no TEST_ONLY private keys shipped).

## Ranked risks per extension

Status: FIXED = fixed today in listing/site text. OWNER = a choice for the owner at submission. CODE = needs a
code or manifest change (exact change in the next section).

### Reload Until
| Risk | Store | Issue | Status |
|---|---|---|---|
| MED | CWS/Edge | Data usage "nothing" while it reads page text via scripting + host access (Purple Lithium) | FIXED in sheets and privacy page. OWNER: tick **Website content** |
| MED | Edge | Localised names over 45 chars: it 48, nl 47, pl 48, pt_BR 46 | CODE (C5) |
| LOW-MED | CWS | Optional `<all_urls>` triggers slower in-depth review (a delay, not a rejection) | Justification improved |
| LOW | Edge | Pro price not shown inside the extension (the button says "pay once" only). The listing has it now | CODE (C2) |
| LOW | CWS | No refund policy in the terms of sale | Terms of sale added to privacy page. OWNER: decide refund wording |
| LOW | Edge | UI says "Chrome" (options.html:43) | CODE (C3) |
| LOW | all | Guide page "…without getting blocked" plus the jitter feature could read as anti-bot evasion. The page itself is careful (read the ToS, no auto-booking) | Left as is |

### Color Picker & Palette
| Risk | Store | Issue | Status |
|---|---|---|---|
| MED | AMO | amo.json name was 52 chars, over AMO's 50. The API PUT would fail | FIXED: now the 44-char locale name |
| MED | Edge | Localised names es 46, pt_BR 46 | CODE (C5) |
| MED | Edge | Listing said "color picker for Chrome", "Chrome's own EyeDropper", "pages where Chrome blocks…" | FIXED (browser-neutral) |
| LOW | AMO | "Doesn't read page content" was false for the Firefox build: the polyfill screenshots the visible tab with captureVisibleTab | FIXED in AMO text and privacy page (in memory only, never saved or sent) |
| LOW | AMO | Shortcuts button opens `chrome://extensions/shortcuts` (options.js:42, popup.js:214), which Firefox can't open | CODE (C4) |
| LOW | CWS | Data usage "nothing" is defensible: only the colour of one clicked pixel is read | Documented in LISTING.md |
| LOW | Edge | UI "Chrome" strings (options.html:45,60; pick.js:8,22,25) | CODE (C3) |
| LOW | site | ColorZilla page contradicted its own table (implied we can't pick outside the tab) | FIXED |

### Tab Lifeboat
| Risk | Store | Issue | Status |
|---|---|---|---|
| MED | Edge | Localised name pl 48 | CODE (C5) |
| LOW-MED | CWS | Form ticks Web history, but the privacy page said "does not collect … any data" (mismatch) | FIXED: page now names the category, local only |
| LOW | CWS | "sessions"/"session" 15× in the description | FIXED (now 5 + synonyms) |
| LOW | Edge | Description said "when Chrome starts", "Chrome deletes…" | FIXED |
| LOW | Edge | Many UI "Chrome" strings (options.html:55,82,90,102; popup.js:240,248; options.js:37,92,110) | CODE (C3) |
| LOW | all | Marquee/screenshot 1 shows a real arXiv paper's text and real domains as demo content | Optional: re-render with fictional content |

### Cookie Crate
| Risk | Store | Issue | Status |
|---|---|---|---|
| HIGH→fixed | CWS/Edge | Data usage "nothing" with the `cookies` permission, and the privacy page said "collects nothing" (Purple Lithium). The FAQ counts cookies/site storage as user data even when handled locally | FIXED in LISTING, sheets and privacy page. OWNER: tick **Authentication information** + **Website content** |
| MED | Edge | Localised names es 48, it 46, pt_BR 47 | CODE (C5) |
| MED | CWS | "cookie/cookies" 25× in the description (Yellow Argon scrutiny) | FIXED (15, 4 of them the brand name) |
| LOW | all | `minimum_chrome_version` 120, but license.js needs WebCrypto Ed25519 (Chrome/Edge 137+). A paid key fails silently on 120-136 | CODE (C1) |
| LOW | CWS | Optional `<all_urls>` means slower review | Justified |
| LOW | CWS | LISTING summary differed from the manifest; stale "CHECKOUT_URL is empty" note | FIXED |
| LOW | site | EditThisCookie page: nominative use, sourced, disclaimer, fair to competitors | OK |

### Cross-cutting (all four)
- Edge price disclosure (1.8.2): LISTING descriptions now state "one-time payment of €X". FIXED.
- Terms of sale (CWS payments): each privacy page now has "Purchases and terms of sale": one-time price, what
  is unlocked, Stripe as merchant of record, not sold by any browser store, statutory rights unaffected. FIXED.
  **OWNER: refund policy.** Nothing I could find commits to one, so I didn't invent it. Suggested line if you
  agree: "Not working for you? Ask within 14 days for a full refund."
- Keyword list pasted by mistake: LISTING.md "Keywords" headings now say "reference only, do NOT paste", and
  SUBMIT-CWS.md says so too. FIXED.
- Reviewers testing Pro: added "Test instructions / Notes for certification / Notes to reviewer" steps to all
  three sheets. OWNER: ask for one reviewer key per extension at submission time. Never commit it: the aloneai
  repo is public.
- Edge localisation: packages now declare 9 languages. Partner Center requires a Description and logo per
  language. The localised short descriptions say the UI is English. Noted in SUBMIT-EDGE.md.
- Superlatives and unprovable claims: none left ("fast", "clean" removed). No testimonials in listings. No
  competitor names in any listing or amo.json.
- Screenshots/tiles: 1280×800 RGB, real UI renders, fictional demo sites, Pro state labelled. OK.

## Code/manifest changes still needed (not made: another agent owns these files)

- **C1** `ext-cookie-crate/manifest.json`: `"minimum_chrome_version": "120"` → `"137"` (Ed25519 in WebCrypto).
- **C2** Reload Until price in UI: in `ext-reload-until/config.js` add `export const PRO_PRICE = '€9';`. In
  `options.html:31` change the button to `Get Pro: <span class="price"></span> once, no subscription`. In
  `options.js`, import `PRO_PRICE` and add
  `for (const el of document.querySelectorAll('.price')) el.textContent = PRO_PRICE;` (same as the other three).
- **C3** Browser-neutral UI strings (Edge 1.1.2): replace "Chrome" in user-visible text with "the browser" or
  "your browser". In all four options.html: "stored in Chrome sync storage" → "stored in the browser's sync
  storage". Also color-picker options.html:60, pick.js:8,22,25; tab-lifeboat options.html:82,90,102,
  popup.js:240,248, options.js:37,92,110; cookie-crate options.html:57,77, popup.html:22 ("the Chrome Web Store" →
  "the browser's extension store"), cookies.js:43, options.js:57, popup.js:57.
- **C4** Color Picker Firefox build: hide the "change shortcut" buttons (options.js:42, popup.js:214), or replace
  them with the text "Firefox: about:addons → gear → Manage Extension Shortcuts". Firefox can't open
  `chrome://extensions/shortcuts` from an extension.
- **C5** `_locales/*/messages.json` `extName` at most 45 chars (Edge). Over the limit now: reload-until it/nl/pl/pt_BR;
  color-picker es/pt_BR; tab-lifeboat pl; cookie-crate es/it/pt_BR.
- Optional: `ext-reload-until/PRIVACY.md`, `ext-color-picker/PRIVACY.md` (shipped in the zips) and
  `ext-{tab-lifeboat,cookie-crate}-listing/PRIVACY.md` are older than the published privacy.html pages. The
  privacy.html pages are now the source of truth. Delete or sync the .md copies.

## Not a risk (checked)
AMO `data_collection_permissions` (set by build-firefox.sh), AMO tags (now only "privacy" on Cookie Crate; the
tag list is fixed: `GET /api/v5/addons/tags/`), MV3 remote-code rules, obfuscation, single purpose (every
extension's features serve one purpose), notifications (only when a condition is met), deceptive installation
(sites say "not in the store yet"), support/privacy URLs (all HTTP 200).
