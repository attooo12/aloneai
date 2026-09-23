# Color Picker & Palette: Eyedropper, Contrast Checker

Pick any color on a web page with Chrome's native eyedropper, copy it as HEX, RGB or HSL in one click, and keep your recent picks. Pro adds named palettes with CSS / Tailwind / JSON export, a WCAG contrast checker and OKLCH. Pay once, no subscription, no tracking.

## Features
- **Eyedropper** (native `EyeDropper` API) on any normal web page: click **Pick a color** in the popup or press **Alt+Shift+E** (change it at `chrome://extensions/shortcuts`), then click any pixel. The HEX is copied to the clipboard automatically (optional) and a small confirmation appears on the page.
- **Picker window** ("Pick outside this page"): a small extension window whose eyedropper can sample anywhere on screen. It opens automatically when you press the shortcut on a page Chrome protects from extensions (`chrome://` pages, the Chrome Web Store, other extensions), so those cases get a working alternative instead of an error.
- **HEX / RGB / HSL** with one-click copy. Type or paste a color (`#abc`, `rgb()`, `hsl()`, `oklch()`) to convert it; press Enter to save it to history.
- **History** of the last 12 picks (newest first, no duplicates). Click one to make it current.
- Light and dark themes (follows the system). Keyboard accessible (tabs, Enter/Esc on the page overlay).
- No network requests, no analytics, no remote code. Everything lives in `chrome.storage`.

## Free vs Pro
| | Free | Pro (pay once, €5) |
|---|---|---|
| Eyedropper, picker window, keyboard shortcut | ✓ | ✓ |
| HEX, RGB, HSL + copy | ✓ | ✓ |
| Last 12 picks | ✓ | ✓ |
| OKLCH format | | ✓ |
| Unlimited named palettes (create, rename, delete, add/remove colors) | | ✓ |
| Export palette: CSS variables, Tailwind v4 `@theme`, Tailwind v3 config, JSON | | ✓ |
| WCAG 2.x contrast checker: ratio + AA/AAA for normal and large text | | ✓ |

Palettes are kept if a license is removed; they are just locked again.

## How picking works (and why)
Chrome only opens the eyedropper for a page that has a recent user action (click or key press) and is focused. The extension has no content scripts and no host permissions, so:
1. The popup click, or the shortcut, grants `activeTab` for the current tab. The extension then injects `picker.js` into that tab with `chrome.scripting`. Chrome passes the click's or key press's user activation along to the injected script.
2. From the shortcut, the eyedropper opens immediately.
3. From the popup, Chrome refuses to open the eyedropper while the popup is still open, and the eyedropper samples a snapshot of the screen taken when it opens. So the popup opens a port to the tab and closes itself. When the port disconnects, the picker waits 300 ms for the popup to fade out and then opens the eyedropper (the activation lasts about 5 seconds).
4. If either condition is missing (for example the address bar has focus, or the activation has expired), the page shows a transparent overlay: "Click anywhere (or press Enter) to start the eyedropper". That click provides both focus and activation. The overlay is removed before sampling, so it can't tint the color, and it swallows the click so the page never receives it.

Colors are normalised to `#RRGGBB`. The OKLCH string precision (L 2 dp in %, C 5 dp, H 2 dp) was chosen so that it converts back to the same HEX for all 16,777,216 sRGB colors (checked exhaustively). The contrast ratio display is truncated rather than rounded, so a failing 4.499:1 shows as 4.49:1, never as 4.50:1.

## Permissions (Chrome Web Store justification)
- `activeTab`: when you click the toolbar button or press the shortcut, gives temporary access to the current tab only, so the eyedropper can be started on that page. No access to any other tab or site, and nothing in the background.
- `scripting`: inject the small picker script (`picker.js`) into that tab at that moment, to open Chrome's eyedropper and show the confirmation or "click to start" overlay.
- `storage`: save your recent picks, palettes, contrast-checker colors, settings and license key locally.
- No host permissions and no content scripts: the extension does not run on pages you haven't picked on.
- `commands` (manifest key, not a permission): the Alt+Shift+E shortcut.

## License (Pro)
Same offline scheme as Reload Until: an Ed25519-signed token (`body.sig`, base64url) verified with WebCrypto in `license.js` against the production public key (shared with Reload Until). `PRODUCT = 'color-picker'`, so a Reload Until key does not unlock this extension, and the reverse is also true. To sell:
- create the Stripe payment link and add `"<payment_link_id>": "color-picker"` to `PRODUCTS` in `license-worker/wrangler.toml`
- set `CHECKOUT_URL` in `config.js` (while it is empty, the options page says "Pro license: coming soon" and hides the buy button)

## Development
No build step. Load the folder unpacked in `chrome://extensions` (Chrome 137+, needed for Ed25519 in WebCrypto).

Tests (`test/` is excluded from the package):
- `node test/unit.mjs`: color maths: parsing, HEX/RGB/HSL/OKLCH conversions against reference values, OKLCH round-trips over 1.2M colors (`FULL=1` for all 16.7M), WCAG ratios against WebAIM values, exports, restricted-URL detection, error messages.
- `node test/e2e.mjs`: headless Chromium with a TEST COPY of the extension (host permission for 127.0.0.1 and the `tabs` permission, because a popup opened as a tab gets no activeTab grant; TEST ONLY public key). Covers the license, Free/Pro gating, history, the popup and shortcut picking flows (with a stub EyeDropper, because headless can't show the real one), the overlay, restricted pages, the picker window, palettes, exports, contrast, settings and clipboard.
- `XPY=/tmp/xvenv/bin/python node test/headful-xvfb.mjs` (optional): headful Chromium on Xvfb with real X11 mouse and keyboard input (XTEST via python-xlib, see the file header), running the UNMODIFIED extension. The real EyeDropper opens and samples pixels via the shortcut, via the toolbar popup, via the picker window on `chrome://version`, and via the overlay fallback when the address bar has focus.
- `test/keygen.mjs` makes a new TEST ONLY key pair. `test/make-license.mjs` signs a test token. The private test key is git-ignored.

Pack for the Web Store: `../ext-kit/pack.sh <path-to-this-folder>` writes `dist/color-picker-<version>.zip` under the current directory (excludes `test/`).
