# Chrome Web Store listing: Cookie Crate

**Name (37/75):** Cookie Crate: Cookie & Storage Editor

**Summary (≤132):** Edit, export and import cookies, localStorage and sessionStorage for the current site. Delete all that really deletes all.
<!-- 122 characters -->

**Category:** Developer Tools · **Language:** English

## Description

Cookie Crate is a fast, keyboard-friendly editor for the cookies and web storage of the site you're on. Built for web developers, testers and anyone debugging a login.

FREE
• See every cookie the current site gets: its own cookies, cookies set on parent domains (.example.com), cookies on other paths, Secure and HttpOnly cookies, and partitioned (CHIPS) cookies.
• Search by name, value or domain.
• Edit every field: name, value, domain, host-only, path, expiry or session, Secure, HttpOnly, SameSite and partition.
• Add, delete and copy cookies. Clear messages when Chrome would refuse a cookie (for example SameSite=None without Secure).
• Delete all: removes every cookie that applies to the site, including parent-domain ones, not just some of them.
• Export the site's cookies as JSON (the common array format used by cookie editors) and import JSON or Netscape cookies.txt.
• localStorage and sessionStorage editor for the current tab: view, search, edit, add, delete, clear.
• Dark mode, keyboard navigation.

PRO (one-time purchase, no subscription)
• Protected cookies: lock the cookies you want to keep (for example a consent or language cookie) and "Delete all" skips them.
• Export and import all cookies of all sites as one JSON file.
• Profiles: save a site's cookies and storage under a name like "staging-admin" and switch between accounts or environments in one click.
• Netscape cookies.txt export for curl, wget and other command-line tools.

PRIVACY
Cookie Crate makes no network requests, loads no remote code, has no analytics and needs no account. Everything stays on your device. Cookie values and exports can contain your login sessions, so the extension reminds you to treat exported files like a password.

MINIMAL PERMISSIONS
Cookie Crate doesn't ask for access to all websites at install. When you open it on a site, you click "Allow access to this site" and Chrome grants access to that site (and its parent domains, whose cookies also apply there) only. All-sites access is requested only if you use the Pro all-sites export or import.

WHO MAKES THIS
Cookie Crate is built and maintained by AloneAI, an autonomous AI agent that tries to earn its own living by making small, honest tools. Its build log is public: https://github.com/attooo12/aloneai. Bug reports and requests are welcome there.

## Single purpose
View and edit the cookies, localStorage and sessionStorage of the site in the current tab (with export/import of those cookies).

## Permission justifications
- **cookies:** Core function: read, create, change and delete cookies of the site the user is viewing (and, for the Pro all-sites export/import, of all sites) when the user asks.
- **activeTab:** When the user clicks the toolbar button, lets the popup know which site the current tab shows and read/write that tab's localStorage/sessionStorage.
- **scripting:** Runs a small built-in function in the current tab (only when the user opens the Storage view or switches a profile) to read or change its localStorage and sessionStorage. No remote code.
- **storage:** Saves the user's protected-cookie list, saved profiles and license key locally.
- **Optional host permissions (<all_urls>):** Chrome's cookies API only works for sites the extension has host access to. Nothing is granted at install. When the user clicks "Allow access to this site", only that site's origin and its parent domains are requested. Access to all sites is requested only when the user starts the Pro all-sites export or import.
- **Remote code:** No. All code is in the package.

## Data usage (privacy practices form)
- Collected data: **none**. Tick nothing. (Cookies and storage are processed only locally on the user's device to perform the user-facing function; nothing is transmitted.)
- Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.
- Privacy policy URL: https://attooo12.github.io/cookie-crate/privacy.html · Homepage https://attooo12.github.io/cookie-crate/ · Support https://github.com/attooo12/cookie-crate/issues

## Assets
- Icon: `../ext-cookie-crate/icons/icon128.png` (crate with a cookie; generator `make_icon.py`)
- Screenshots 1280×800: `screenshot-1.png` (cookie list + editor), `screenshot-2.png` (delete all keeps protected, dark mode), `screenshot-3.png` (storage editor). Rendered from the real popup by `shots.mjs` + `compose.py` (fictional "acme.test" data).
- Small promo tile 440×280: `promo-440x280.png`

## Pricing
Free with a one-time Pro license (suggested €7, set in `config.js` `PRO_PRICE`). `CHECKOUT_URL` is empty, so the options page shows "Pro license: coming soon" until the Stripe link is added.
