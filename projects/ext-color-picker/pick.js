// Starting a pick on the active tab. Used by the popup (button click) and the service worker (keyboard shortcut).
// The popup must call injectPicker() itself, inside the click handler: Chrome passes the click's user activation
// to the injected script, which lets it open the EyeDropper immediately. Without activation (e.g. from the
// shortcut) picker.js asks for one click on the page first.
import { RESTRICTED_URL } from './config.js';

export const RESTRICTED_MESSAGE =
  "Chrome doesn't let extensions run on this page (browser pages, the Chrome Web Store, other extensions). " +
  'Use the picker window instead: it can pick any color on your screen, including this page.';

export function isRestrictedUrl(url) {
  return !!url && RESTRICTED_URL.test(url);
}

// Maps a chrome.scripting error to a message a person can act on.
export function explainInjectError(message = '', url = '') {
  const m = String(message);
  if (isRestrictedUrl(url) || /cannot be scripted|chrome:\/\/|chrome-extension:\/\/|extensions gallery|about:/i.test(m)) return RESTRICTED_MESSAGE;
  if (/^file:/i.test(url) || /file:\/\//.test(m)) {
    return 'To pick on local files, turn on "Allow access to file URLs" for this extension in chrome://extensions, or use the picker window.';
  }
  if (/error page/i.test(m)) return "Chrome doesn't let extensions run on error pages. Use the picker window instead.";
  if (/No tab with id|Frame with ID|was removed|No current window/i.test(m)) return 'This tab is not available any more. Try again.';
  if (/permission|Cannot access/i.test(m)) {
    return "This page can't be accessed right now (Chrome only allows it right after you open the extension on it). Open the extension again, or use the picker window.";
  }
  return 'Could not start the eyedropper on this page. Use the picker window instead.';
}

// fromPopup: the picker waits for the popup to close (see picker.js). The popup must then call
// chrome.tabs.connect(tab.id, { name: 'color-picker-popup' }) and close itself.
export async function injectPicker(tab, { fromPopup = false } = {}) {
  if (!tab || tab.id == null) return { ok: false, message: 'No active tab.' };
  if (isRestrictedUrl(tab.url)) return { ok: false, restricted: true, message: RESTRICTED_MESSAGE };
  try {
    if (fromPopup) await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__aloneaiColorPickerFromPopup = true; } });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['picker.js'] });
    return { ok: true, state: res?.result };
  } catch (e) {
    return { ok: false, message: explainInjectError(e?.message, tab.url), raw: String(e?.message || e) };
  }
}

// A small extension window with the full UI. EyeDropper works there with a normal click and samples the whole
// screen, so it covers pages Chrome protects from extensions.
export async function openPickerWindow() {
  const url = chrome.runtime.getURL('popup.html?window=1');
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL('popup.html') + '*' });
  const w = existing.find((t) => t.url && t.url.includes('window=1'));
  if (w) {
    await chrome.windows.update(w.windowId, { focused: true });
    return w.windowId;
  }
  const win = await chrome.windows.create({ url, type: 'popup', width: 380, height: 640, focused: true });
  return win.id;
}
