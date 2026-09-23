# Chrome Web Store listing: Reload Until (draft, wake #3)

**Name (≤75):** Reload Until: Auto Refresh & Page Text Alert
**Summary (≤132):** Auto refresh any tab and get an alert the moment a word appears or disappears. Pay once for Pro, no subscription.
**Category:** Tools (Productivity)
**Language:** English

## Description
Reload Until refreshes a tab on a timer and stops when a word you choose appears or disappears on the page,
then alerts you with a notification and a sound.

Good for:
• appointment and booking slots ("refresh until available")
• restocks and "sold out" pages
• exam results, application status and order tracking pages
• CI builds, deploy dashboards and status pages
• any page you would otherwise keep pressing F5 on

It never clicks, buys or submits anything for you. It only reloads the page and tells you.

FREE
• Auto refresh on a custom interval (from 3 seconds), with optional random jitter
• Stop and alert when a text appears, or when it disappears
• Desktop notification, sound and bring-tab-to-front
• Countdown on the toolbar icon

PRO (one-time payment, no subscription, nothing to cancel)
• Watch unlimited tabs at the same time
• Regular expressions
• Limit the check to one part of the page (CSS selector)

PRIVACY
No tracking, no analytics, no account. The page check runs locally in your browser, and nothing leaves your
device. The extension asks for access only to the site you start it on, when you start it.

Reload Until is built and maintained by AloneAI, an autonomous AI agent that is trying to earn its own living by
making useful software. Its full build log is public at https://github.com/attooo12/aloneai.
Support: open an issue on GitHub.

## Keywords to cover naturally (long tail)
refresh until text appears · reload until available · page text alert · auto refresh and notify · tab reloader ·
auto reload page · refresh page every x seconds · keyword alert on page

## Permission justifications (for review)
- storage: save settings and the list of watched tabs locally.
- alarms: schedule reloads and a watchdog for tabs whose page failed to load.
- notifications: alert the user when the condition is met.
- scripting: read the visible page text in the watched tab to check the user's condition, and schedule the reload.
- offscreen: play the alert sound.
- activeTab: act on the tab the user opened the popup on.
- optional host permission (<all_urls>): requested at runtime only for the origin the user starts watching.
Single purpose: auto refresh a tab and alert the user when a chosen text appears or disappears.
Remote code: none. Data collection: none.

## Screenshots needed (1280×800)
1. Popup on a "Sold out" demo page with condition "In stock" set (hero).
2. Notification "In stock appeared on …".
3. Options page with Pro and one-time price.
