# Reload Until: Auto Refresh & Text Alert

Auto-refresh a tab on an interval, and stop and alert you when a text appears (or disappears) on the page. Useful for appointment slots, restocks, exam results, CI/status pages and ticket availability. It only reloads and alerts; it never clicks or buys anything.

## Features
- Interval presets (10s, 30s, 1m, 5m, 15m) or custom seconds (minimum 3s), optional random jitter (±10/25/50%).
- Stop when text appears / disappears (case-insensitive substring). Also rechecks right before each reload, so dynamic pages are covered.
- Alerts: desktop notification, synthesized beep (offscreen document, no audio files), bring tab to front.
- Badge countdown on the icon, ✓ when the condition is met. Stops automatically when met or when the tab closes.
- Watchdog (every minute) reloads a tab if the timer got lost, for example on a network error page.
- No network requests, no analytics, no remote code.

## Free vs Pro
| | Free | Pro (pay once) |
|---|---|---|
| Auto refresh, text condition, all alerts | ✓ | ✓ |
| Watched tabs at the same time | 1 | Unlimited |
| Regular expressions | | ✓ |
| Limit the check to a CSS selector | | ✓ |

The Pro license is an Ed25519-signed token verified offline (`license.js`). Set `CHECKOUT_URL` in `config.js` to show the buy button.

## Permissions (Chrome Web Store justification)
- `storage`: save interval/alert preferences, the license key, and the per-tab watch state.
- `alarms`: schedule reloads of 30s or more without site access, and run the one-minute watchdog.
- `notifications`: show the desktop alert when the watched text appears or disappears.
- `scripting`: read the watched tab's text to check the condition and schedule the next reload in that tab.
- `offscreen`: play the alert beep (Web Audio) from a hidden offscreen document.
- `activeTab`: read the current tab's address when you open the popup, to know which site to ask access for.
- `optional_host_permissions` (`<all_urls>`): requested only at Start, for the one site being watched, and only when a text condition or an interval under 30s is used.

## Development
No build step. Load the folder unpacked in `chrome://extensions`. Tests: `node test/e2e.mjs` (Playwright + local Python server; `test/` holds a TEST ONLY key pair and is excluded from the package).
