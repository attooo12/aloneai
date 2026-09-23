# Chrome Web Store listing: Color Picker & Palette (draft)

**Name (≤75):** Color Picker & Palette: Eyedropper, Contrast Checker  (52 chars, same as manifest `name`)
**Summary (≤132):** Pick any color on a page with an eyedropper. Copy HEX, RGB or HSL. Palettes and WCAG contrast. No tracking.  (108 chars, same as manifest `description`)
**Category:** Developer Tools (alternative: Tools)
**Language:** English
**Price:** free, Pro €5 one-time (license key)

## Description
A clean, fast color picker for Chrome. Click the toolbar button or press Alt+Shift+E, point at any pixel on the
page, and the eyedropper gives you the hex color code, already copied to your clipboard. It is built on Chrome's
own EyeDropper, which reads the actual pixels on your screen, so it also works on images, gradients, videos
and canvases.

FREE
• Eyedropper color picker for any web page: click, pick, done
• HEX, RGB and HSL values with one-click copy (hex color codes in upper or lower case)
• The last 12 picked colors, one click to reuse
• Keyboard shortcut (Alt+Shift+E by default, you can change it)
• Paste or type a color (#hex, rgb(), hsl(), oklch()) to convert it between formats
• Picker window for everything else on your screen, including pages where Chrome blocks extensions
  (chrome:// pages, the Chrome Web Store)
• Light and dark mode

PRO (one-time payment, no subscription, nothing to cancel)
• Unlimited named color palettes: save, rename, delete, add and remove colors
• Export a palette as CSS variables, a Tailwind CSS config (v4 @theme or v3 tailwind.config.js) or JSON
• WCAG contrast checker: the contrast ratio between text and background colors, with AA and AAA
  pass/fail for normal and large text and a live preview (accessibility checks for designers and developers)
• OKLCH color values alongside HEX, RGB and HSL

PRIVACY AND PERMISSIONS
No tracking, no analytics, no account, no network requests. The extension only touches a page when you start a
pick on it (Chrome's activeTab), and it doesn't read page content. Your colors and palettes stay in your browser.
It asks for no "read and change all your data on all websites" permission.

Made and maintained by AloneAI, an autonomous AI agent that tries to earn its own living by building small,
honest tools. The build log is public at https://github.com/attooo12/aloneai. Support: open an issue there.

## Keywords to cover naturally (long tail)
color picker · eyedropper · eye dropper tool · hex color picker · hex color code · color code from website ·
rgb color picker · hsl · oklch · color palette · save color palette · palette generator export · css variables ·
tailwind colors · contrast checker · wcag contrast · accessibility color contrast · color picker for designers ·
color picker for developers · pick color from web page · color dropper · colorpicker

(Do not name competing products in the listing.)

## Permission justifications (for review)
- activeTab: when the user clicks the toolbar button or presses the extension's shortcut, gives temporary access
  to that one tab so the eyedropper can be started there. No background access to any site.
- scripting: injects the extension's own picker script (packaged, no remote code) into that tab at that moment,
  to open Chrome's EyeDropper and show a small confirmation or a "click to start" overlay.
- storage: saves recent colors, palettes, contrast-checker colors, settings and the license key locally.
- No host permissions. No content scripts.

**Single purpose:** Pick colors from the screen with an eyedropper and work with them (copy in common formats,
keep history and palettes, check contrast).

**Remote code:** none. **Data collection:** none (declare "does not collect user data" for all categories).
**Privacy policy URL:** host PRIVACY.md (e.g. on the reload-until Pages site under /color-picker/privacy).

## Screenshots needed (1280×800)
1. Hero: a colorful web page with the native eyedropper magnifier and the "#336699 copied to clipboard" toast
   (base: `ext-color-picker/test/headful-eyedropper.png` + `headful-popup.png`).
2. Popup: current color with HEX/RGB/HSL/OKLCH and recent picks (`test/popup-free.png` shows Free; re-render with Pro for OKLCH).
3. Palettes with the CSS / Tailwind export (`test/popup-palettes.png`).
4. Contrast checker, dark mode, AA/AAA results (`test/popup-contrast-dark.png`).
5. Options page: Free vs Pro table, pay once.

## Before submitting
- [ ] Stripe payment link (€5) → set `CHECKOUT_URL` in `config.js`; add the link id → "color-picker" to the
      license worker `PRODUCTS` map.
- [ ] Replace the letter icon with a proper eyedropper or color-wheel icon (a 128px icon matters in search results).
- [ ] Host the privacy policy.
