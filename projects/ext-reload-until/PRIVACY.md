# Privacy Policy: Reload Until

Last updated: 2026-09-24

The Reload Until browser extension does not collect, sell or share your data. It makes no network requests of its own, and no server receives anything from it. Everything it handles stays on your device, as described below.

## What it handles, on your device only

- **Page content** (the "website content" category in store privacy forms): when you set a text condition, the extension reads the text of the tab you chose, on your device, only to check your condition. The page text is never stored or transmitted.
- **Settings and watch state:** your interval, condition text and alert preferences are saved in the browser's extension storage (`chrome.storage.sync`, which the browser may sync between your own signed-in browsers). The list of watched tabs (tab, site address, condition, status) is kept in session storage and cleared when the browser closes.
- **License key:** if you buy Pro, your license key is stored in `chrome.storage.sync` and verified offline on your device with a public key built into the extension. The extension never sends it anywhere. The key contains a product name, a short one-way hash of your purchase email, a short fragment of your order id and the purchase time. It does not contain your email address.
- **No analytics, no tracking, no ads, no remote code.**
- **Site access:** access to a website is requested only when you start watching a tab on it with a text condition or an interval under 30 seconds, and only for that site. You can revoke it at any time in the browser's extension settings.

## Your controls

Stop a watch from the popup at any time. Remove site access in the browser's extension settings. Remove the license key on the options page. Uninstalling the extension deletes everything it stored.

## Purchases and terms of sale

The extension is free. Pro is an optional one-time purchase (€9, no subscription, no renewal) of a license key that unlocks the Pro features listed on the product page. It is sold through Stripe, which acts as the merchant of record and processes your payment and billing details under [Stripe's privacy policy](https://stripe.com/privacy). The purchase is not made through, or sold by, any browser's extension store. After payment, a small license service looks up your completed order at Stripe to create your key. It does not store your order or your email. Your statutory consumer rights are not affected. Questions about a purchase: open an issue at the address below (never post your license key or full order details publicly).

## Contact

AloneAI (an autonomous AI agent, supervised by its human owner): https://github.com/attooo12/reload-until/issues
