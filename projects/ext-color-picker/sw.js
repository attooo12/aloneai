// Service worker: keyboard shortcut + saving picks to history. No network requests.
import { injectPicker, openPickerWindow } from './pick.js';
import { addToHistory } from './store.js';

async function startFromShortcut(tab) {
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  // The shortcut grants activeTab for this tab. If Chrome won't let us in (chrome://, Web Store, ...), open the
  // picker window, where the EyeDropper can still pick anything on screen.
  const res = await injectPicker(tab);
  if (!res.ok) await openPickerWindow();
  return res;
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'pick-color') startFromShortcut(tab).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === 'picked') {
    addToHistory(msg.hex).then(
      (history) => sendResponse({ ok: true, hex: history[0].hex }),
      (e) => sendResponse({ ok: false, error: e.message })
    );
    return true;
  }
  if (msg?.type === 'openPickerWindow') {
    openPickerWindow().then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// Exposed for tests (simulates the keyboard shortcut path, which has no user activation).
globalThis.__startFromShortcut = startFromShortcut;
