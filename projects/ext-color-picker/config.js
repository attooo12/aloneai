// Checkout page for the one-time Pro purchase. Empty string => "Pro coming soon" (buy button hidden).
export const CHECKOUT_URL = 'https://buy.stripe.com/00wdR90Tzaxh3zC6AGfIs01';
export const PRO_PRICE = '€5';
export const HISTORY_MAX = 12;
export const PALETTE_NAME_MAX = 60;
export const PALETTE_COLORS_MAX = 64;
export const DEFAULT_SETTINGS = {
  upper: true, // HEX in upper case (#1A2B3C) or lower case (#1a2b3c)
  autoCopy: true // copy the HEX to the clipboard right after a pick on a page
};
// Pages where Chrome never allows extensions to run scripts.
export const RESTRICTED_URL = /^(chrome|chrome-extension|chrome-search|chrome-untrusted|devtools|edge|brave|opera|vivaldi|about|view-source|data|javascript):|^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)(\/|$)/i;

// Where (if anywhere) the "change keyboard shortcut" button should send the user: each Chromium browser has its
// own internal settings page for it, and Firefox has none an extension is allowed to open at all (about:addons
// is a privileged page). Used by both options.js and popup.js, which share this one source of truth.
export function shortcutsTarget() {
  const ua = navigator.userAgent || '';
  if (/Firefox\//.test(ua)) return { browser: 'firefox' };
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const isEdge = brands.some((b) => /Edg/i.test(b.brand)) || /\bEdg\//.test(ua);
  return { browser: isEdge ? 'edge' : 'chrome', url: isEdge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' };
}
export const FIREFOX_SHORTCUTS_HINT = 'Change it in about:addons → ⚙ → Manage Extension Shortcuts';
