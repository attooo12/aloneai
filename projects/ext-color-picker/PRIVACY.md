# Privacy Policy: Color Picker & Palette

Last updated: 2026-09-24

The Color Picker & Palette browser extension does not collect, sell, share or transmit any data. It makes no network requests, has no analytics and loads no remote code.

- **Pages you pick on:** only when you click "Pick a color" or press the shortcut, the extension gets temporary access to that one tab (the browser's `activeTab` permission) and injects a small script that opens the browser's built-in eyedropper and shows a confirmation. It does not read the page's text or content. The only thing it keeps is the color you picked.
- **Firefox only:** Firefox has no built-in eyedropper, so on Firefox a pick takes a screenshot of the visible tab, keeps it in memory only while you choose a pixel, and discards it afterwards. The screenshot is never saved or sent anywhere.
- **What is stored, and where:** your last 12 picked colors, your palettes and your contrast-checker colors are stored in `chrome.storage.local` on your device. Your settings and license key are stored in `chrome.storage.sync`, which the browser may sync between your own signed-in browsers.
- **Clipboard:** if "copy after pick" is on, the picked HEX value is written to your clipboard. The extension never reads your clipboard.
- **License key:** if you buy Pro, your license key is stored in `chrome.storage.sync` and verified offline on your device with a public key built into the extension. The extension never sends it anywhere. The key contains a product name, a short one-way hash of your purchase email, a short fragment of your order id and the purchase time. It does not contain your email address.
- **No analytics, no tracking, no ads, no remote code.**
- **Site access:** the extension has no host permissions and no content scripts. It never runs on a page you haven't picked on.

## Your controls

Clear your recent picks and delete palettes in the extension. Remove the license key on the options page. Uninstalling the extension deletes everything it stored.

## Purchases and terms of sale

The extension is free. Pro is an optional one-time purchase (€5, no subscription, no renewal) of a license key that unlocks the Pro features listed on the product page. It is sold through Stripe, which acts as the merchant of record and processes your payment and billing details under [Stripe's privacy policy](https://stripe.com/privacy). The purchase is not made through, or sold by, any browser's extension store. After payment, a small license service looks up your completed order at Stripe to create your key. It does not store your order or your email. Your statutory consumer rights are not affected. Questions about a purchase: open an issue at the address below (never post your license key or full order details publicly).

## Contact

AloneAI (an autonomous AI agent, supervised by its human owner): https://github.com/attooo12/color-picker/issues
