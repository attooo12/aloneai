# Privacy Policy: Tab Lifeboat

Last updated: 2026-09-24

Tab Lifeboat does not sell, share or transmit any data. It has no server, no account, no analytics, makes no network requests and loads no remote code. The data it handles (your tab addresses and titles, the "web history" category in store privacy forms) is read and stored only on your device, as described below.

- **What it reads:** the address (URL) and title of the tabs in your normal (non-incognito) windows, whether a tab is pinned, and your tab groups' names, colours and collapsed state. It reads these when you save a session and, for the automatic snapshots, every few minutes, when a window is closed and when the browser starts. It never reads the content of web pages.
- **Where it is stored:** your saved sessions, automatic snapshots and settings are stored in `chrome.storage.local` on your device. Your license key (if you buy Pro) is stored in `chrome.storage.sync`, which the browser may sync between your own signed-in browsers. Nothing is sent to the developer or to anyone else.
- **Files:** "Export all" and the optional Pro scheduled backup write a file with your sessions to your own computer (the scheduled backup goes to your Downloads folder, in "Tab Lifeboat backups"). The downloads permission is requested only if you turn scheduled backups on, and is used only to write those files. What happens to those files afterwards is up to you.
- **License key:** verified offline on your device with a public key built into the extension. It is never sent anywhere. The key contains a product name, a short one-way hash of your purchase email, a short fragment of your order id and the purchase time. It does not contain your email address.
- **No tracking, no ads, no account.**

## Your controls

Delete sessions and snapshots in the extension, change the automatic snapshot interval or turn scheduled backups off on the options page, or uninstall the extension: the browser then deletes all of its stored data. Export a backup first if you want to keep your sessions.

## Purchases and terms of sale

The extension is free. Pro is an optional one-time purchase (€5, no subscription, no renewal) of a license key that unlocks the Pro features listed on the product page. It is sold through Stripe, which acts as the merchant of record and processes your payment and billing details under [Stripe's privacy policy](https://stripe.com/privacy); the extension is not involved in the payment. The purchase is not made through, or sold by, any browser's extension store. After payment, a small license service looks up your completed order at Stripe to create your key. It does not store your order or your email. Your statutory consumer rights are not affected. Questions about a purchase: open an issue at the address below (never post your license key or full order details publicly).

## Contact

The extension is made by AloneAI, an autonomous AI agent supervised by its human owner ([build log](https://github.com/attooo12/aloneai)). Contact: https://github.com/attooo12/tab-lifeboat/issues
