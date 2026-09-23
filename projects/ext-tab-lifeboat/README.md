# Tab Lifeboat: Session Saver & Backup

Save your open tabs, windows and tab groups as named sessions and restore them later. Automatic crash-safety
snapshots, export/import to a file you own, and (Pro) scheduled backup files. Local only: no account, no server,
no tracking. Built and maintained by AloneAI, an autonomous AI agent.

## Features
**Free**
- Save the current window or all windows: URLs, titles, order, pinned tabs, tab groups (name, colour, collapsed).
- List (newest first), search (names, tab titles and addresses), restore into new windows (one window of a
  multi-window session, or all), rename, delete with Undo, bulk select + delete. 10 saved sessions.
- Automatic snapshots (not counted in the limit): every N minutes (1/5/15/30, default 5) via `chrome.alarms`,
  when a window is closed, and at browser start ("Previous browser session"). Rolling, keep last 10/20/50.
- Export all sessions to JSON and import it back; import also accepts plain-text URL lists (`URL` or `URL | title`
  per line, blank line = new session).

**Pro (one-time €5, offline license key)**
- Unlimited saved sessions. Scheduled backup file (daily/weekly) to `Downloads/Tab Lifeboat backups/` via the
  optional `downloads` permission. Open single tabs from a session, merge sessions. Markdown/HTML link lists.

## Data safety design
- `chrome.storage.local` + `unlimitedStorage`. One key per session (`s:<id>`) plus small indexes (`idx:named`,
  `idx:auto`); a session and its index entry are written in one `storage.set()` call. All writes are serialised
  across the popup, options page and service worker with a Web Lock.
- Versioned schema (`v: 1`); everything read from storage or a file goes through `cleanSession()` (URL scheme
  allowlist, lengths, group colours, indices). A damaged index is rebuilt from the session keys; an integrity check
  runs on install/update. Unreadable stored values are never deleted and are included raw in "Export all".
- Snapshot guards: never store a snapshot with 0 real tabs; skip unchanged snapshots; the live window state is
  never replaced by an empty capture (shutdown/startup); if the tab count drops below half of the previous full
  snapshot (which had ≥ 4 tabs), that snapshot is protected from rotation (max 10 protected). The live state is
  archived as "Previous browser session" on the first write after each browser start (detected via
  `chrome.storage.session`, which Chrome clears on restart).
- Import never replaces or deletes: duplicates are skipped, id clashes get a new id, imported auto snapshots
  become saved sessions, and the Free limit never blocks an import.

## Permissions
`tabs` (read tab URLs/titles to save them), `tabGroups` (save/recreate groups), `storage` + `unlimitedStorage`
(local session storage), `alarms` (periodic snapshots, backup schedule). Optional: `downloads` (Pro scheduled
backup, requested only when turned on). No host permissions, no content scripts, no network requests, no remote code.

## Known limitation
"Unload restored background tabs" (off by default, experimental) uses `chrome.tabs.discard`. In the Chrome for
Testing 154 build used for automated tests here, `tabs.discard` crashes the browser, so this path is untested.

## Tests
`node test/unit.mjs` (schema, validation, import parsing, store with a fake `chrome.storage`) and
`node test/e2e.mjs` (headless Chromium with the real extension). Both use a TEST ONLY key pair
(`test/keygen.mjs` regenerates it; the private key is git-ignored).
