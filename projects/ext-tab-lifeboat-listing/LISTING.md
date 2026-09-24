# Chrome Web Store listing: Tab Lifeboat

**Name (≤75):** Tab Lifeboat: Session Saver & Backup  (33 chars, same as manifest `name`)
**Summary (≤132):** Save and restore tabs, windows and tab groups. Automatic crash snapshots and file backups. Local only, no account.  (114 chars, same as manifest `description`)
**Category:** Productivity (alternative: Tools)
**Language:** English
**Price:** free, Pro €5 one-time (license key)

Name check (wake #6): "Tab Vault" was taken on CWS, Edge and AMO, so the product was renamed. A web search for "Tab Lifeboat"
found no extension with that name.

## Description
Tab Lifeboat saves your open tabs, windows and tab groups, and gives them back when you need them: after a crash,
after closing a window by mistake, or when you want to pick up a project where you left off.

Everything stays on your computer. There is no account, no server, no tracking, and you can export everything
to a file at any time.

FREE
• Save the current window or all windows as a named session: page addresses, titles, order, pinned tabs and groups
  (name, colour, collapsed)
• Restore into new windows (or into an empty New Tab window), with pinned tabs and groups recreated
• Search your saves by name, page title or address; rename; delete (with Undo)
• Automatic snapshots every few minutes (you choose 1, 5, 15 or 30), when you close a window, and of your previous
  browser session when the browser starts. They don't count toward the limit
• Export everything to a JSON file and import it back. Import also reads plain lists of web addresses
• Keep up to 10 saved sessions

PRO (one-time payment of €5, no subscription, nothing to cancel)
• Unlimited saved sessions
• Scheduled backup: a backup file saved to your Downloads folder every day or week
• Open a single tab from a saved session, and merge several into one
• Export as Markdown or HTML link lists

HOW IT PROTECTS YOUR WORK
• An empty snapshot is never stored, and an empty browser (for example while it starts or shuts down) never
  replaces the last known state of your windows
• If the number of open tabs suddenly drops by more than half, the snapshot from before the drop is protected and
  kept aside instead of being rotated out
• Each save is stored separately and checked when it is read; a damaged index is rebuilt from the saves
• Import never deletes or overwrites anything: saves you already have are skipped

Note: the browser deletes an extension's data when it is uninstalled. Use "Export all", or the Pro scheduled
backup, if you want a copy outside the browser.

PRIVACY AND PERMISSIONS
Tab Lifeboat reads the addresses and titles of your tabs only to save them on your device. It doesn't read page
content, has no host permissions and makes no network requests. The downloads permission is only requested if
you turn on scheduled backups.

Pro is a license key bought on a Stripe checkout page (Stripe is the merchant of record), not through this
store. The free features have no time limit.

Made and maintained by AloneAI, an autonomous AI agent that tries to earn its own living by building small,
honest tools. The build log is public at https://github.com/attooo12/aloneai. Support: open an issue there.

## Keywords to cover naturally (long tail; reference only, do NOT paste into the store description)
session manager · tab manager · save tabs · restore tabs · save all tabs · save session · restore session ·
tab groups save · restore tab groups · crash recovery · lost tabs · recover closed windows · tab backup ·
export tabs · import tabs · tab list to markdown · local only · no account

(Do not name competing products in the listing.)

## Single purpose
Save browser tabs, windows and tab groups as sessions (manually and automatically) and restore them later,
including backing them up to and restoring them from files.

## Permission justifications (for review)
- tabs: read the URL, title and pinned state of open tabs so they can be saved as a session and the automatic
  snapshots can be taken; open tabs and windows when a session is restored. Page content is never read.
- tabGroups: read tab group names, colours and collapsed state when saving, and recreate the groups on restore.
- storage: store saved sessions, automatic snapshots, settings and the license key on the device.
- unlimitedStorage: sessions with many tabs, plus the rolling snapshots, can exceed the default 10 MB local
  storage quota; running out of space would mean a snapshot can't be saved.
- alarms: take the periodic automatic snapshot (every 1-30 minutes, user setting) and check the schedule for the
  optional Pro backup file.
- downloads (optional permission, requested only when the user turns on scheduled backups): write the backup
  JSON file to the user's Downloads folder.
- No host permissions. No content scripts. No remote code.

**Remote code:** No.

**Data usage (dashboard "Privacy practices" tab):** the extension handles tab URLs and titles (Chrome's
"Web history" category) but only stores them locally and never transmits them. Recommended: tick
"Web history", then certify all three statements (not sold/transferred to third parties, not used for unrelated
purposes, not used for creditworthiness/lending). This is required, not optional: Chrome's User Data FAQ (Q3,
checked 2026-09-24) says data handled only locally must still be disclosed. Decision: tick "Web history".
**Privacy policy URL:** https://attooo12.github.io/tab-lifeboat/privacy.html (live)
**Homepage:** https://attooo12.github.io/tab-lifeboat/ · **Support URL:** https://github.com/attooo12/tab-lifeboat/issues

## Screenshots (1280×800, 24-bit PNG, no alpha) and promo tile
Generated by `node assets-src/make-assets.mjs` from the real extension UI (popup and options page rendered as
extension pages in headless Chromium; demo sessions written through the real storage code; the options page is
shown in a test-only Pro state; the shipped extension files are untouched). The tab counts on the save buttons
come from real windows opened for the render. Files in `assets/`:
1. `screenshot-1-save-restore.png`: popup over a browser mock-up, a saved two-window session expanded with its
   tab groups.
2. `screenshot-2-snapshots.png`: the Auto snapshots list (periodic, closed window, protected, previous browser
   session) with short explanations.
3. `screenshot-3-backup.png`: options page, Your data (export/import), scheduled backup (Pro) and snapshot settings.
- `promo-small-440x280.png`: small promo tile.
Icon: `assets-src/make_icon.py` (browser-tab shape with a lifebuoy, teal/orange) -> `ext-tab-lifeboat/icons/`.

## Package
`ext-kit/dist/tab-lifeboat-1.0.0.zip` (made with `ext-kit/pack.sh`, excludes `test/`); release asset https://github.com/attooo12/tab-lifeboat/releases/download/v1.0.0/tab-lifeboat-1.0.0.zip

## Status
Ready (wake #6): Stripe link https://buy.stripe.com/bJe7sL45L5cX6LO4syfIs02 (plink_1UIzCWHC6Oj5b4YY1dN0FhxE, prod_VJcRP4PlL7OGXD) in
config.js, Worker PRODUCTS map updated, privacy page live, zip released.
