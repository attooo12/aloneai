// Service worker: automatic crash-safety snapshots, restore, and the Pro scheduled backup. No network requests.
import { captureWindows, restoreSession } from './tabs.js';
import { addAutoSnapshot, updateLive, getLive, getSession, getSettings, checkIntegrity, archivePreviousSession } from './store.js';
import { runBackup, backupIfDue } from './backup.js';
import { isPro } from './license.js';
import { isRestorableUrl } from './schema.js';

// ---------- alarms ----------
async function ensureAlarms({ reset = false } = {}) {
  const { autoMinutes } = await getSettings();
  const snap = await chrome.alarms.get('snapshot');
  if (reset || !snap || snap.periodInMinutes !== autoMinutes) {
    await chrome.alarms.create('snapshot', { delayInMinutes: autoMinutes, periodInMinutes: autoMinutes });
  }
  if (!(await chrome.alarms.get('backup'))) await chrome.alarms.create('backup', { delayInMinutes: 2, periodInMinutes: 60 });
}

// ---------- live state + snapshots ----------
async function refreshLive() {
  const cap = await captureWindows({ all: true });
  await updateLive({ windows: cap.windows }, cap.ids);
  return cap;
}
async function periodicSnapshot(reason = 'periodic') {
  const cap = await refreshLive();
  return addAutoSnapshot({ windows: cap.windows }, reason, 'all');
}

let liveTimer = null;
function scheduleLive() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { refreshLive().catch(() => {}); }, 1500);
}
const scheduleLiveIf = (fn) => (...a) => { if (fn(...a)) scheduleLive(); };

chrome.tabs.onCreated.addListener(scheduleLive);
chrome.tabs.onUpdated.addListener(scheduleLiveIf((id, ch) => 'url' in ch || 'title' in ch || 'pinned' in ch || 'groupId' in ch));
chrome.tabs.onRemoved.addListener(scheduleLiveIf((id, info) => !info.isWindowClosing));
chrome.tabs.onMoved.addListener(scheduleLive);
chrome.tabs.onAttached.addListener(scheduleLive);
chrome.tabs.onDetached.addListener(scheduleLive);
chrome.tabGroups.onCreated.addListener(scheduleLive);
chrome.tabGroups.onUpdated.addListener(scheduleLive);
chrome.tabGroups.onRemoved.addListener(scheduleLive);

// A window was closed: keep what it contained (from the last live state) as a "Closed window" snapshot.
// The live state itself is not changed here, so if this is Chrome shutting down, the whole session survives
// as the "Previous browser session" snapshot on the next start.
async function onWindowClosed(windowId) {
  const live = await getLive();
  if (!live) return { skipped: 'no-live' };
  const i = live.ids.indexOf(windowId);
  if (i < 0 || !live.session.windows[i]) return { skipped: 'unknown-window' };
  return addAutoSnapshot({ windows: [live.session.windows[i]] }, 'window-closed', 'window');
}
chrome.windows.onRemoved.addListener((windowId) => { onWindowClosed(windowId).catch(() => {}); });

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'snapshot') periodicSnapshot().catch(() => {});
  if (a.name === 'backup') backupIfDue().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  (async () => { await archivePreviousSession(); await ensureAlarms(); await refreshLive(); })().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  (async () => { await checkIntegrity(); await archivePreviousSession(); await ensureAlarms(); await refreshLive(); })().catch(() => {});
});

// ---------- messages from the popup / options page ----------
async function handle(msg) {
  switch (msg?.type) {
    case 'restore': {
      const s = await getSession(msg.id);
      if (!s) return { ok: false, error: 'This session could not be read.' };
      if (msg.windowIndex !== undefined && !s.windows[msg.windowIndex]) return { ok: false, error: 'No such window.' };
      const { lazy } = await getSettings();
      return { ok: true, ...(await restoreSession(s, { windowIndex: msg.windowIndex, lazy })) };
    }
    case 'openTab': { // Pro: open a single saved tab
      if (!(await isPro())) return { ok: false, error: 'pro_required' };
      if (!isRestorableUrl(msg.url)) return { ok: false, error: 'This address cannot be opened.' };
      const tab = await chrome.tabs.create({ url: msg.url, windowId: msg.windowId, active: msg.active !== false });
      return { ok: true, tabId: tab.id };
    }
    case 'snapshotNow': {
      const r = await periodicSnapshot('manual');
      return { ok: true, ...r };
    }
    case 'backupNow': return runBackup();
    case 'settingsChanged': await ensureAlarms({ reset: true }); return { ok: true };
    default: return { ok: false, error: 'unknown message' };
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true;
});

ensureAlarms().catch(() => {});

// Exposed for tests.
globalThis.__tv = { refreshLive, periodicSnapshot, onWindowClosed, ensureAlarms, backupIfDue };
