# Chrome Web Store submission: copy-paste sheet for the owner (~10 min per extension)

Dashboard: https://chrome.google.com/webstore/devconsole → **New item** → upload the zip → fill the tabs below → **Submit for review**.
Zips are GitHub release downloads; screenshots are in the public aloneai repo (github.com/attooo12/aloneai, same paths).
The listing name comes from `manifest.json` (Reload Until is now "Reload Until: Auto Refresh & Page Monitor"; the release zip is rebuilt). Everything else is copy-paste from the LISTING.md files.

## Account-level (once)
- Developer name shown publicly: **AloneAI** (suggested). Contact email: yours (it must be verified).
- EU trader declaration (DSA): this is your call as the legal seller. Sales go through Stripe Managed Payments (Stripe is the merchant of record).

Every extension also has an optional **marquee tile** (1400×560) next to its promo tile: `marquee-1400x560.png`. Upload it too; the store only features items that have one.

## 1. Reload Until (ready)
- Zip: https://github.com/attooo12/reload-until/releases/download/v1.0.2/reload-until-1.0.2.zip (workspace: `projects/ext-kit/dist/`)
- **Store listing** tab: copy from `projects/ext-reload-until-listing/LISTING.md` (description, summary, category Tools, English).
  Screenshots: `projects/ext-reload-until-listing/assets/screenshot-{1,2,3}-*.png`. Small promo tile: `assets/promo-small-440x280.png`.
  Homepage: https://attooo12.github.io/reload-until/ · Support: https://github.com/attooo12/reload-until/issues
- **Privacy** tab:
  - Single purpose: "Auto refresh a tab and alert the user when a chosen text appears or disappears on the page."
  - Permission justifications: the "Permission justifications" list in LISTING.md, one per field (storage, alarms, notifications,
    scripting, offscreen, activeTab, host permission).
  - Remote code: **No**.
  - Data usage: tick **nothing** (no data collected). Tick the three certification boxes.
  - Privacy policy URL: https://attooo12.github.io/reload-until/privacy.html
- **Distribution**: Free (Pro is a separate one-time Stripe purchase), all regions, Public.

## 2. Color Picker & Palette (ready)
- Zip: https://github.com/attooo12/color-picker/releases/download/v1.0.1/color-picker-1.0.1.zip
- Listing + justifications: `projects/ext-color-picker-listing/LISTING.md`, assets in `projects/ext-color-picker-listing/assets/`.
- Privacy policy URL: https://attooo12.github.io/color-picker/privacy.html · Support: https://github.com/attooo12/color-picker/issues
- Single purpose: "Pick colors from web pages and manage them (formats, history, palettes, contrast)."
- Permissions: activeTab, scripting, storage only. Remote code: No. Data usage: nothing.

## 3. Tab Lifeboat: Session Saver & Backup (ready, wake #6)
- Zip: https://github.com/attooo12/tab-lifeboat/releases/download/v1.0.1/tab-lifeboat-1.0.1.zip
- Listing + justifications: `projects/ext-tab-lifeboat-listing/LISTING.md`, assets in `projects/ext-tab-lifeboat-listing/assets/`.
  Category Productivity. Homepage https://attooo12.github.io/tab-lifeboat/ · Support https://github.com/attooo12/tab-lifeboat/issues
- Privacy policy URL: https://attooo12.github.io/tab-lifeboat/privacy.html
- Single purpose: "Save browser tabs, windows and tab groups as sessions (manually and automatically) and restore them later."
- Permissions: tabs, tabGroups, storage, unlimitedStorage, alarms (+ optional downloads). Remote code: No.
  Data usage: tick **Web history** (tab URLs/titles, stored only on the device), then the three certifications.

## 4. Cookie Crate: Cookie & Storage Editor (ready, wake #6)
- Zip: https://github.com/attooo12/cookie-crate/releases/download/v1.0.1/cookie-crate-1.0.1.zip
- Listing, justifications, data answers: `projects/ext-cookie-crate-listing/LISTING.md`; screenshots `screenshot-{1,2,3}.png`, promo `promo-440x280.png`
  in the same folder. Category **Developer Tools**. Homepage https://attooo12.github.io/cookie-crate/ · Support https://github.com/attooo12/cookie-crate/issues
- Privacy policy URL: https://attooo12.github.io/cookie-crate/privacy.html · Remote code: No · Data usage: nothing (local only).

## Optional: let me ship updates myself (saves you every future upload)
Google Cloud console → enable "Chrome Web Store API" → OAuth client (Desktop) → get a refresh token for scope
`https://www.googleapis.com/auth/chromewebstore` → put `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` in my env.
Then I can upload and publish new versions of existing items via the API. Listing and privacy edits stay with you.

## Before going live: license delivery
Pro purchases need the Cloudflare Worker (ask 0dsn: Workers API token + a read-only Stripe key with Checkout Sessions read).
Until then the thanks page tells buyers to bookmark it or open a GitHub issue with the last 6 characters of their order id,
and I issue the key by hand at my next wake with `projects/license-worker/issue.mjs`. That works, but it's slow.
