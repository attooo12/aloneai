# addons.mozilla.org (AMO) submission: copy-paste sheet for the owner (~15 min per extension)

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
- Reload Until: https://github.com/attooo12/reload-until/releases/download/v1.0.1/reload-until-1.0.1-firefox.zip
- Color Picker & Palette: https://github.com/attooo12/color-picker/releases/download/v1.0.0/color-picker-1.0.0-firefox.zip
- Rebuild either at any time with `ext-kit/build-firefox.sh <extension-dir> --zip`.

## Account setup (once, free)
Any Firefox Account works; no developer fee. First submission asks you to accept the Firefox Add-on
Distribution Agreement.

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
- **Name**: same as Chrome, "Reload Until: Auto Refresh & Page Monitor" (41 characters, under AMO's 45-char
  cap on the manifest `name`).
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
- **Name**: shortened to "Color Picker & Palette: Eyedropper" for the Firefox manifest (AMO caps `name` at 45
  characters; the Chrome name is 52). The listing page's display title on AMO is a separate field and can use
  the full Chrome name/summary from `projects/ext-color-picker-listing/LISTING.md` if you prefer — only the
  manifest's internal `name` had to shrink.
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

## What changed for Firefox (for your own reference / if a reviewer asks)
- `manifest.json`: `background.service_worker` → `background.scripts` + `type: "module"` (Firefox's MV3
  background is an event page, not a service worker); added `browser_specific_settings.gecko` (id, min
  version, `data_collection_permissions: {required: ["none"]}`, required by Mozilla policy since Nov 2025);
  dropped `minimum_chrome_version` and (for Reload Until) the now-unused `offscreen` permission.
- `ext-kit/firefox-shims/reload-until-offscreen-shim.js` (6 lines): Firefox's background page already has a
  real DOM (`Audio`, `AudioContext`), so there's no offscreen-document API and none is needed — this just
  polyfills the 3 `chrome.offscreen.*` calls `sw.js` makes so the same beep code (`offscreen.js`, loaded
  unmodified as a second background script) runs in place.
- `ext-kit/firefox-shims/color-picker-capture-shim.js` (background, ~10 lines) +
  `ext-kit/firefox-shims/eyedropper-polyfill.js` (content script + popup, ~140 lines): the EyeDropper fallback
  described above. `pick.js` and `popup.js` are byte-identical to Chrome — they already handle a rejected
  `EyeDropper().open()` (AbortError/OperationError) the same way for the native and fallback implementations,
  so no logic there needed to branch on browser.
- Nothing else differs: same HTML/CSS, same `color.js`/`store.js`/`license.js`/`config.js`, same icons.

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

## Optional: publish updates via API later
AMO has a JWT-based Add-on API (`https://addons.mozilla.org/api/v5/`) using a key/secret pair from
https://addons.mozilla.org/developers/addon/api/key/. Same idea as the Chrome/Edge API notes: once the first
manual submission is approved, give me that key/secret and I can ship future version bumps (`web-ext sign`)
myself; listing/privacy edits stay with you.
