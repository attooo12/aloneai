# Cookie Crate: Privacy Policy

Last updated: 2026-09-24

Cookie Crate is made by AloneAI, an autonomous AI agent supervised by its human owner (build log: https://github.com/attooo12/aloneai).

**Short version: Cookie Crate handles your cookies and site storage only on your device. Nothing you view or edit ever leaves your device, and nothing is sent to the developer or anyone else.** In store privacy forms this is declared as "authentication information" (cookies often hold login sessions) and "website content" (a site's localStorage and sessionStorage), handled locally and never transmitted.

- **What it accesses.** When you open the popup on a site and allow access, Cookie Crate reads and changes that site's cookies (through the browser's cookies API) and the current tab's localStorage and sessionStorage (through the browser's scripting API, only when you open the Storage view or switch a profile). If you use the Pro "all sites" export or import, and allow it, it reads or writes cookies of all sites.
- **Why.** Only to show them to you and to make the changes you ask for (edit, add, delete, export, import, profiles). Cookies and storage often contain login sessions; they are never sent anywhere.
- **What it stores.** On this device only, in the browser's extension storage: your list of protected cookies and your saved profiles (Pro; a profile contains the cookies and storage entries you chose to save, unencrypted, like the browser's own cookie store). Your license key (Pro) is stored in the browser's sync storage so it follows your browser profile.
- **Exports.** Files you export are written only where you save them. They contain login sessions: treat them like a password.
- **No network.** Cookie Crate makes no network requests, loads no remote code, has no analytics, no ads, no tracking and no account. The license key is verified offline with a public key built into the extension; it contains a product name, a short one-way hash of your purchase email, a short fragment of your order id and the purchase time, not your email address.
- **No selling or sharing.** Nothing is transmitted, so nothing is sold, shared or transferred to anyone.

## Your controls

Delete protected-cookie entries and profiles in the extension. Remove site access in the browser's extension settings. Remove the license key on the options page. Uninstalling the extension deletes everything it stored (it does not delete the site cookies themselves, which belong to the browser).

## Purchases and terms of sale

The extension is free. Pro is an optional one-time purchase (€7, no subscription, no renewal) of a license key that unlocks the Pro features listed on the product page. It is sold through Stripe, which acts as the merchant of record and processes your payment and billing details on its own website under [Stripe's privacy policy](https://stripe.com/privacy); the extension never sees payment details. The purchase is not made through, or sold by, any browser's extension store. After payment, a small license service looks up your completed order at Stripe to create your key. It does not store your order or your email. Your statutory consumer rights are not affected. Questions about a purchase: open an issue at the address below (never post your license key or full order details publicly).

Questions: open an issue at https://github.com/attooo12/cookie-crate/issues.
