# addons.mozilla.org (AMO) submission: copy-paste sheet for the owner (~15 min per extension)

## Self-publish (preferred)

The whole submission — build, upload, validation, listing metadata and screenshots — can be done from the
command line via AMO's API v5, no web UI and no 2FA (`projects/research/stores-selfserve-2026-09-24.md`: the
2FA requirement is for the AMO web UI only; pure API-key use is exempt). This is the preferred path; the
manual dashboard steps below are the fallback if the API path ever breaks.

1. **Get API keys** (once, human step — needs a Mozilla account, which needs its own email):
   - Sign in at https://addons.mozilla.org/ (any Mozilla account; no developer fee).
   - Go to https://addons.mozilla.org/developers/addon/api/key/, accept the Firefox Add-on Distribution
     Agreement if prompted, and generate a JWT issuer + secret.
2. **Export them** where the agent's shell can see them:
   ```
   export AMO_JWT_ISSUER='user:12345:678'
   export AMO_JWT_SECRET='...'
   ```
3. **Publish one extension**:
   ```
   node projects/ext-kit/amo-publish.mjs <name>            # reload-until | color-picker | tab-lifeboat | cookie-crate
   node projects/ext-kit/amo-publish.mjs <name> --dry-run   # print every request without sending anything
   ```
   The script rebuilds the Firefox zip fresh from source each time (`build-firefox.sh`), validates the listing
   in `projects/ext-<name>-listing/amo.json` (categories and tags against AMO's live API, license against
   AMO's documented license-slug list), uploads it, polls for validation, creates the add-on (or attaches a new
   version if the `guid` already exists on AMO — same command either way), and uploads the screenshots.
4. **One thing the API can't do**: AMO's documented Add-on Create/Edit endpoints have a `support_email` field
   but no `support_url` field. The script prints the support URL from `amo.json` as a reminder — set it once by
   hand per extension at the listing's "Edit Product Page" → "Support Information" in the AMO web UI (a 2FA-gated
   page, so this one step needs a human with the Mozilla account, not the API key).
5. All four `amo.json` files disclose, per AMO's payment-disclosure policy: that AloneAI (an autonomous AI
   agent) made the extension, that the free part needs no account or payment, the exact one-time Pro price, and
   that no data is collected. Checked for conflicts: none of the four extensions show any upsell automatically
   (no `onInstalled` tab-opening, no popup nag) — every "Get Pro"/"Buy" action is a plain link/button the user
   clicks on the options page, which satisfies AMO's "clear opt-in for monetization" rule as-is.

Firefox needed real, if small, code changes (Chrome's `chrome.offscreen` and the `EyeDropper` API don't exist
in Firefox). Those live in a **separate build step**, not a fork: `projects/ext-kit/build-firefox.sh` reads the
same source in `ext-reload-until/` and `ext-color-picker/` and generates a Firefox variant into
`projects/ext-kit/dist/firefox/<name>/`, changing only `manifest.json` (background scripts/type, Firefox
add-on ID, min version) and adding 1–3 small shim files. See "What changed for Firefox" below if you want the
details; the short version is nothing in the Chrome zips changed and both extensions' full Chrome test suites
(`test/e2e.mjs`, `test/unit.mjs`) still pass unmodified.

Dashboard: https://addons.mozilla.org/en-US/developers/ → **Submit a New Add-on** → **On this site** (listed,
like the Chrome/Edge stores) → upload the zip below → fill the fields → **Submit**. AMO's own automated
validator runs the same checks as `web-ext lint`, which both zips already pass with 0 errors (warnings listed
below are expected/harmless — see "Known lint warnings").

## Zips (already built, ready to upload)
- Reload Until: https://github.com/attooo12/reload-until/releases/download/v1.0.4/reload-until-1.0.4-firefox.zip
- Color Picker & Palette: https://github.com/attooo12/color-picker/releases/download/v1.0.3/color-picker-1.0.3-firefox.zip
- Tab Lifeboat: https://github.com/attooo12/tab-lifeboat/releases/download/v1.0.3/tab-lifeboat-1.0.3-firefox.zip (wake #6: lint 0 errors;
  Firefox 139+ has the tabGroups API; not run in real Firefox yet. Listing text: projects/ext-tab-lifeboat-listing/LISTING.md,
  privacy https://attooo12.github.io/tab-lifeboat/privacy.html, category Tabs)
- Cookie Crate: https://github.com/attooo12/cookie-crate/releases/download/v1.0.3/cookie-crate-1.0.3-firefox.zip. See
  "3. Cookie Crate" below for the Firefox feasibility assessment.
- Rebuild any of them at any time with `ext-kit/build-firefox.sh <extension-dir> --zip`.

## Account setup (once, free)
Any Firefox Account works; no developer fee. First submission asks you to accept the Firefox Add-on
Distribution Agreement.

## Reviewer notes
In the version's "Notes to reviewer" field, paste a reviewer license key for the Pro features (from `.private/reviewer-keys.txt`; one per
extension; never commit it) and one line on how to use it (options page, License key, Save).

## Source code submission: not needed
AMO requires a separate source upload only when the reviewable copy is hard to read — minified, bundled
(webpack/rollup) or transpiled code. Neither build produces any of that: every file in the Firefox zip is the
same plain, commented JS as the Chrome version, plus a couple of small new shim files (also plain JS, see
below) and a `manifest.json` that's just re-formatted JSON. You can answer "no" to AMO's "does this add-on
contain minified or bundled code" prompt. If a reviewer ever asks how the zip was produced, the answer is
`ext-kit/build-firefox.sh` in the public aloneai repo — it's a plain shell+Python script, not a bundler.

## License
AMO's listing form has a "License" dropdown (defaults to "All Rights Reserved"). Same call as the Chrome/Edge
listings, which don't have this field: since Pro is a paid one-time unlock and the code isn't meant to be
redistributed, I'd leave it on **All Rights Reserved** unless you want to make it genuinely open source. The
build log being public on GitHub doesn't imply a reuse license either way — this is your call.

## 1. Reload Until
- **Name**: same as Chrome, "Reload Until: Auto Refresh & Page Monitor" (41 characters, under AMO's 50-char
  cap on the manifest `name`). Now delivered via `_locales/*/messages.json` (`__MSG_extName__`): AMO shows the
  name/description in the reviewer's or user's locale automatically, same manifest for every store.
- **Summary / description / categories / keywords**: copy from `projects/ext-reload-until-listing/LISTING.md`
  — same text as Chrome. AMO's closest categories are **Tabs** and **Feeds, News & Blogging**; pick "Tabs" as
  primary (auto-refresh/tab-monitoring tools live there).
- **Screenshots**: same PNGs as Chrome, `projects/ext-reload-until-listing/assets/screenshot-*.png` (AMO
  accepts the same 1280×800 images; no resize needed).
- **Privacy policy URL**: https://attooo12.github.io/reload-until/privacy.html (same page as Chrome/Edge).
- **Support site / email**: https://github.com/attooo12/reload-until/issues
- **Permissions shown to the user at install**: storage, alarms, notifications, scripting, activeTab (the
  `offscreen` permission was dropped for Firefox — see below). `optional_host_permissions: ["<all_urls>"]` is
  requested at runtime only, same UX as Chrome's "ask for this one site" flow.
- **Firefox compatibility**: targets desktop Firefox 142+ (needed for the new mandatory
  `data_collection_permissions` manifest key, already set to "none" — no data is collected). I left "Firefox
  for Android" unchecked for the first submission: `permissions.request` (used for the optional site-access
  prompt) isn't implemented on Firefox for Android, so the "watch under 30s / with a text condition" flow
  wouldn't fully work there; worth a follow-up wake if you want Android support later.

## 2. Color Picker & Palette
- **Name**: the manifest `name` is now "Color Picker & Palette: Eyedropper, Contrast" (44 characters) in every
  store, Chrome/Edge included — shortened from the old 52-character CWS-only name so one name fits AMO's
  50-char cap everywhere, instead of a separate Firefox-only override. Delivered via `__MSG_extName__` /
  `_locales/*/messages.json`, so it's also localized per store locale. The listing page's display title on AMO
  is a separate field and can use the fuller wording from `projects/ext-color-picker-listing/LISTING.md` if you
  prefer — only the manifest's internal `name` had to shrink.
- **Summary / description / categories / keywords**: copy from `LISTING.md`. Closest AMO category:
  **Web Development** (primary) — the eyedropper/contrast-checker/palette feature set is squarely a
  developer/designer tool.
- **Screenshots**: same PNGs as Chrome, `projects/ext-color-picker-listing/assets/screenshot-*.png`.
- **Privacy policy URL**: https://attooo12.github.io/color-picker/privacy.html
- **Support site**: https://github.com/attooo12/color-picker/issues
- **Permissions shown to the user**: activeTab, scripting, storage — unchanged from Chrome.
- **Important product note — EyeDropper on Firefox**: Firefox has no native `EyeDropper` API (Chrome/Edge-only;
  Mozilla hasn't committed to shipping it). Rather than showing "not supported," the Firefox build includes a
  fallback: it screenshots the current tab (`tabs.captureVisibleTab`) and shows an in-page magnifier overlay
  that reads the exact pixel color back out of that screenshot on click — same click-to-pick, Esc-to-cancel UX
  as the real EyeDropper. **This covers the main path** (toolbar button or Alt+Shift+E on a regular web page).
  It does **not** cover the "Open picker window" escape hatch used for chrome://-style restricted pages,
  because that mode is designed to sample pixels from *outside* the browser tab entirely (the real EyeDropper
  can do that; a tab screenshot fundamentally can't). On Firefox, that button now shows a clear message asking
  the user to use Chrome or Edge for that specific case — worth one line in the listing description so it
  isn't a surprise, e.g. "the picker window for browser-internal pages needs Chrome or Edge."

## 3. Cookie Crate — Firefox feasibility assessment

**Verdict: feasible, and simpler than the other three.** Cookie Crate has no background/service worker (popup +
options only) and doesn't touch `chrome.offscreen` or `EyeDropper`, so it needed **no shim files at all** — only
a manifest transform (drop `minimum_chrome_version`, add `browser_specific_settings.gecko`), same as the other
three's manifest changes. Added as a `cookie-crate` case in `ext-kit/build-firefox.sh`.

Cookie API differences checked:
- **`partitionKey` (CHIPS)**: `cookies.js`'s `getAll()` already wraps Chrome's `partitionKey: {}` filter in a
  try/catch that falls back to a plain `cookies.getAll(details)` call if the browser rejects/doesn't understand
  that filter — written before this Firefox work, for defensiveness, but it turns out to be exactly what's
  needed here too. Firefox partitions cookies differently (dynamic First-Party Isolation / Total Cookie
  Protection) and doesn't expose the same `partitionKey` filter shape, so on Firefox this silently degrades to
  "unpartitioned cookies only" instead of throwing. `setCookie`/`removeCookie` only ever send a `partitionKey`
  field back if the cookie object already has one (i.e. came from a successful CHIPS-aware `getAll`), so nothing
  Firefox-incompatible gets sent on that browser either. Net effect: on Firefox, CHIPS-partitioned cookies
  (a narrow, newer case) may not show up; every other cookie operation is unaffected.
- **`storeId` / `getAllCookieStores()`**: used as-is; Firefox implements this for its container tabs and private
  browsing, so it should work at least as well as on Chrome (arguably better — Firefox Multi-Account Containers
  give more distinct cookie stores than Chrome's built-in profiles).
- **`firstPartyDomain`**: not used by this extension on either browser; not a compatibility concern.
- **`chrome.scripting.executeScript` for storage access**: uses the `{ target: { tabId }, func, args }` form,
  the exact same call shape already shipped and verified working in the Reload Until Firefox build (`sw.js`,
  unmodified, calls `chrome.scripting.executeScript({ target, func: pageRun, args: [...] })`). No polyfill
  needed; Firefox's `chrome.*` namespace already returns promises the same way `browser.*` does.
- **`chrome.permissions.request/contains` for optional host permissions**: same call already proven for the
  other two extensions' Firefox builds (needs Firefox 128+, already the version floor used here).

Verification performed: `web-ext lint` on the built zip is **0 errors, 1 warning** (`UNSAFE_VAR_ASSIGNMENT` on
a static, non-dynamic `innerHTML` string literal in `options.js` — a false positive, same class of warning
already documented as harmless for the other two extensions). The built extension **installs successfully as a
temporary add-on in a real (Playwright-provided) headless Firefox** via `web-ext run --firefox=<path> --args=-headless`,
with no errors in the process. **Not verified** (time-boxed, consistent with the other two extensions' notes):
an actual interactive session — opening the popup, editing a real cookie, using the Pro import/export/profile
features — because Playwright doesn't support loading unpacked/temporary extensions in Firefox the way it does
for Chromium, so this repo's existing e2e harness can't drive it. Recommend the same 5-minute manual smoke test
suggested for Reload Until/Color Picker after AMO approves the first version.

Listing: `projects/ext-cookie-crate-listing/amo.json`, screenshots already in that directory (same PNGs as
Chrome), categories **Web Development** + **Privacy & Security**, privacy policy
https://attooo12.github.io/cookie-crate/privacy.html, support https://github.com/attooo12/cookie-crate/issues.

## What changed for Firefox (for your own reference / if a reviewer asks)
- `manifest.json`: `background.service_worker` → `background.scripts` + `type: "module"` (Firefox's MV3
  background is an event page, not a service worker); added `browser_specific_settings.gecko` (id, min
  version, `data_collection_permissions: {required: ["none"]}`, required by Mozilla policy since Nov 2025);
  dropped `minimum_chrome_version` and (for Reload Until) the now-unused `offscreen` permission.
- `ext-kit/firefox-shims/reload-until-offscreen-shim.js` (~25 lines): Firefox's background page already has a
  real DOM (`AudioContext`), so there's no offscreen-document API and none is needed. It polyfills the 3
  `chrome.offscreen.*` calls `sw.js` makes, loads the same beep code (`offscreen.js`, unmodified) as a second
  background script, and delivers the beep/beepDone messages to the page's own listeners (a page never receives
  its own `runtime.sendMessage`). Before wake #7 offscreen.js wasn't loaded, so the Firefox beep never played.
- `ext-kit/firefox-shims/color-picker-capture-shim.js` (background, ~10 lines) +
  `ext-kit/firefox-shims/eyedropper-polyfill.js` (content script + popup, ~140 lines): the EyeDropper fallback
  described above. `pick.js` and `popup.js` are byte-identical to Chrome — they already handle a rejected
  `EyeDropper().open()` (AbortError/OperationError) the same way for the native and fallback implementations,
  so no logic there needed to branch on browser.
- Nothing else differs: same HTML/CSS, same `color.js`/`store.js`/`license.js`/`config.js`, same icons.
- Cookie Crate needed no shim file at all — just the same manifest transform, since it has no background page
  and doesn't touch `chrome.offscreen` or `EyeDropper`. See "3. Cookie Crate" above for the API-compatibility
  reasoning (partitionKey/CHIPS, storeId, scripting).

## Known lint warnings (expected, not blocking)
`web-ext lint` returns **0 errors** on both zips. Remaining warnings and why they're fine:
- `UNSUPPORTED_API`: offscreen.hasDocument/createDocument/closeDocument — the linter statically flags
  `chrome.offscreen.*` in `sw.js` because Firefox doesn't implement that namespace; it can't see that the
  shim polyfills it at runtime. Real behavior was confirmed by loading the built extension as a temporary
  add-on in a real (headless) Firefox build with no console errors.
- `UNSAFE_VAR_ASSIGNMENT` (innerHTML): pre-existing in the shared `options.js`/`popup.js` (the string is built
  with a local `esc()` HTML-escaper before assignment); same code Chrome already ships, not Firefox-specific.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` / `ANDROID_INCOMPATIBLE_API`: about Firefox for Android,
  which isn't targeted for this submission (see the Android note above).

## What was verified vs. what's unverified
- Verified: `web-ext lint` is clean (0 errors, both zips); both zips install successfully as temporary add-ons
  in a real headless Firefox 156 build with no extension-related console errors; both Chrome extensions' full
  existing Playwright test suites (`test/e2e.mjs`, `test/unit.mjs`, 34/34 and 63/63 + 44/44) still pass
  unmodified, confirming the Firefox build step didn't touch the Chrome source.
- Not independently verified: the actual click-to-pick flow of the screenshot-based EyeDropper fallback, and
  the background-page beep, inside a real interactive Firefox session. Playwright's Firefox support doesn't
  extend to loading unpacked/temporary extensions the way it does for Chromium (`--load-extension` has no
  Firefox equivalent Playwright can drive), so this couldn't be automated end-to-end the way the existing
  Chrome tests are. Recommend a 5-minute manual smoke test after AMO approves the first version: install from
  about:debugging or the AMO listing, try a pick on a normal page (main path) and the picker-window message on
  a restricted page, and check that the "condition met" beep plays on Reload Until.

## Publishing via API (superseded the "Optional" note below — see "Self-publish (preferred)" at the top)
This used to say "give me a key/secret later and I'll ship updates with `web-ext sign`." That's now built:
`projects/ext-kit/amo-publish.mjs` does the full first submission (not just version bumps) — upload, listing
metadata and screenshots — for any of the four extensions once `AMO_JWT_ISSUER`/`AMO_JWT_SECRET` exist. The one
manual step that remains even after that (see point 4 in "Self-publish (preferred)"): AMO's API has no
`support_url` field, so the support link has to be typed into the web UI once per extension after the first
submission.
