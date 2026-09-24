// Reload Until: service worker. No network requests; all state is local.
import { isPro } from './license.js';
import { MIN_INTERVAL_SEC, MAX_INTERVAL_SEC, ALARM_MIN_SEC } from './config.js';
import { pageRun } from './page.js';

const WATCHDOG = 'watchdog';
const RELOAD_PREFIX = 'reload:';
const COLOR_WATCHING = '#2563eb';
const COLOR_MET = '#16a34a';
const SETTLE_MS = 3000; // "disappears": how long a page may take to render the text after loading
const FREE_LIMIT = 'Free version watches 1 tab at a time. Stop the other tab or get Pro.';

// ---------- state (chrome.storage.session, key "watches": {tabId: watch}) ----------
let queue = Promise.resolve();
function mutate(fn) {
  // Serialize read-modify-write cycles so concurrent events don't clobber each other.
  const run = queue.then(async () => {
    const { watches = {} } = await chrome.storage.session.get('watches');
    const result = await fn(watches);
    await chrome.storage.session.set({ watches });
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
async function getWatches() {
  await queue;
  const { watches = {} } = await chrome.storage.session.get('watches');
  return watches;
}
async function getWatch(tabId) {
  return (await getWatches())[tabId];
}

// ---------- helpers ----------
function jittered(w) {
  const base = w.intervalSec * 1000;
  const j = Math.max(0, Math.min(50, w.jitterPct || 0)) / 100;
  const factor = 1 + (Math.random() * 2 - 1) * j;
  return Math.max(MIN_INTERVAL_SEC * 1000, Math.round(base * factor));
}

function condOf(w) {
  return w.mode === 'none' ? null : { text: w.text, regex: !!w.regex, selector: w.selector || '', mode: w.mode };
}

function badgeText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.ceil(s / 60) + 'm';
  return Math.ceil(s / 3600) + 'h';
}

async function setBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (color) await chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch { /* tab gone */ }
}

// ---------- badge ticker ----------
let ticker = null;
async function tick() {
  const watches = await getWatches();
  const now = Date.now();
  let active = false;
  for (const [id, w] of Object.entries(watches)) {
    const tabId = Number(id);
    if (w.status === 'met') setBadge(tabId, '✓', COLOR_MET);
    else if (w.status === 'watching') {
      active = true;
      setBadge(tabId, w.nextAt ? badgeText(w.nextAt - now) : '…', COLOR_WATCHING);
    }
  }
  if (!active && ticker) { clearInterval(ticker); ticker = null; }
}
function ensureTicker() {
  if (!ticker) ticker = setInterval(tick, 1000);
  tick();
}

// ---------- navigation away from the watched site ----------
function hostOf(origin) { try { return new URL(origin).host; } catch { return origin; } }

// True when the tab is no longer on the watched origin. With site access the URL is always visible while
// the tab is on that origin (error pages keep the attempted URL), so a hidden URL means it left.
// Without site access the URL is usually hidden, and then we cannot tell: keep going.
function leftSite(w, tab) {
  if (!w.origin) return false;
  if (!tab?.url) return !!w.hasHost;
  try { return new URL(tab.url).origin !== w.origin; } catch { return true; }
}

async function stopWithNotice(tabId, why) {
  const w = await getWatch(tabId);
  await stop(tabId);
  if (w?.notify) {
    chrome.notifications.create('stopped:' + tabId, {
      type: 'basic', iconUrl: 'icons/icon128.png', title: 'Reload Until stopped', message: why, priority: 1
    });
  }
}

// Returns false (and stops the watch) if the tab is gone or has moved to another site.
async function stillWatchable(tabId, w) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { await stop(tabId); return false; }
  if (!leftSite(w, tab)) return true;
  await stopWithNotice(tabId, `The watched tab left ${hostOf(w.origin)}, so reloading stopped.`);
  return false;
}

// ---------- scheduling ----------
async function scheduleNext(tabId) {
  const w = await getWatch(tabId);
  if (!w || w.status !== 'watching') return;
  let delay = jittered(w);
  let injected = false;
  if (w.hasHost) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: pageRun, args: ['schedule', condOf(w), delay] });
      injected = true;
    } catch { /* error page, or no access: fall back to alarm */ }
  }
  let nextAt = Date.now() + delay;
  if (!injected) {
    delay = Math.max(delay, w.hasHost ? MIN_INTERVAL_SEC * 1000 : ALARM_MIN_SEC * 1000);
    await chrome.alarms.create(RELOAD_PREFIX + tabId, { when: Date.now() + delay });
    // Packed extensions clamp alarms to 30s; use the real time for the badge and the watchdog.
    nextAt = (await chrome.alarms.get(RELOAD_PREFIX + tabId))?.scheduledTime || Date.now() + delay;
  } else {
    await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  }
  await mutate((ws) => { if (ws[tabId]) ws[tabId].nextAt = nextAt; });
  ensureTicker();
}

async function evaluate(tabId, w) {
  // Returns true (met), false (not met) or null (could not check).
  if (w.mode === 'none' || !w.hasHost) return null;
  try {
    // Injection waits for the document to be parsed, which may never happen on a stalled page.
    const timeout = new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 10000, []));
    const [res] = await Promise.race([chrome.scripting.executeScript({ target: { tabId }, func: pageRun, args: ['check', condOf(w), SETTLE_MS] }), timeout]);
    return typeof res?.result === 'boolean' ? res.result : null;
  } catch {
    return null;
  }
}

async function onPageReady(tabId, countReload) {
  let w = await getWatch(tabId);
  if (!w || w.status !== 'watching') return;
  if (countReload) {
    w = await mutate((ws) => {
      const x = ws[tabId];
      if (x) { x.count = (x.count || 0) + 1; x.lastLoad = Date.now(); }
      return x;
    });
    if (!w) return;
  }
  const met = await evaluate(tabId, w);
  if (met !== null) await mutate((ws) => { if (ws[tabId]) ws[tabId].lastChecked = Date.now(); });
  if (met === true) return onMet(tabId);
  return scheduleNext(tabId);
}

// ---------- alerts ----------
let creatingOffscreen = null;
let closingOffscreen = null;
let beeping = 0; // beeps sent and not finished yet: the document closes only after the last one
async function playSound() {
  try {
    await closingOffscreen;
    beeping++;
    const has = await chrome.offscreen.hasDocument?.();
    if (!has) {
      creatingOffscreen ??= chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play a short alert beep when the watched condition is met.'
      }).finally(() => { creatingOffscreen = null; });
    }
    // hasDocument() is already true while another call is still creating it (its script not loaded yet).
    await creatingOffscreen;
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'beep' });
  } catch (e) {
    beeping = Math.max(0, beeping - 1); // no beepDone will come for this one
    console.warn('sound failed', e);
  }
}

function beepDone() {
  beeping = Math.max(0, beeping - 1);
  if (!beeping) closingOffscreen ??= chrome.offscreen.closeDocument().catch(() => {}).finally(() => { closingOffscreen = null; });
  return closingOffscreen;
}

async function onMet(tabId) {
  const w = await mutate((ws) => {
    const x = ws[tabId];
    if (!x || x.status !== 'watching') return null;
    x.status = 'met';
    x.metAt = Date.now();
    x.nextAt = null;
    return x;
  });
  if (!w) return; // already handled
  await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  try { await chrome.scripting.executeScript({ target: { tabId }, func: pageRun, args: ['cancel', null, 0] }); } catch {}
  await setBadge(tabId, '✓', COLOR_MET);
  const what = w.mode === 'appears' ? `"${w.text}" appeared` : `"${w.text}" disappeared`;
  if (w.notify) {
    let title = '';
    try { title = (await chrome.tabs.get(tabId)).title || ''; } catch {}
    chrome.notifications.create('met:' + tabId, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Reload Until: condition met',
      message: `${what} after ${w.count || 0} reload(s).${title ? '\n' + title : ''}`,
      requireInteraction: true,
      priority: 2
    });
  }
  if (w.sound) playSound();
  if (w.focus) focusTab(tabId);
  tick();
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
}

// ---------- start / stop ----------
// The popup and permissions.onAdded can both start the same tab (popup stays open through the prompt):
// a second call with the same settings within 2s, or while the first is still running, gets the first call's result.
const recentStarts = new Map(); // tabId -> {at, key, promise}

function start(tabId, cfg, origin) {
  const key = JSON.stringify([cfg, origin]);
  const r = recentStarts.get(tabId);
  if (r && r.key === key && Date.now() - r.at < 2000) return r.promise;
  const promise = doStart(tabId, cfg, origin);
  recentStarts.set(tabId, { at: Date.now(), key, promise });
  promise.then((res) => { if (!res.ok && recentStarts.get(tabId)?.promise === promise) recentStarts.delete(tabId); }, () => recentStarts.delete(tabId));
  return promise;
}

async function doStart(tabId, cfg, origin) {
  const intervalSec = Math.round(Number(cfg.intervalSec));
  if (!Number.isFinite(intervalSec) || intervalSec < MIN_INTERVAL_SEC) return { ok: false, error: `Minimum interval is ${MIN_INTERVAL_SEC} seconds.` };
  if (intervalSec > MAX_INTERVAL_SEC) return { ok: false, error: 'Maximum interval is 7 days.' };
  const mode = ['none', 'appears', 'disappears'].includes(cfg.mode) ? cfg.mode : 'none';
  const text = String(cfg.text || '').trim();
  if (mode !== 'none' && !text) return { ok: false, error: 'Enter the text to watch for.' };

  const pro = await isPro();
  if (!pro && (cfg.regex || cfg.selector)) return { ok: false, error: 'Regex and CSS selector scope are Pro features.' };
  if (cfg.regex) {
    try { new RegExp(text, 'i'); } catch { return { ok: false, error: 'Invalid regular expression.' }; }
  }
  if (cfg.selector) {
    // Validate selector syntax without a DOM (service worker): defer to page; basic sanity only.
    if (/[{}]/.test(cfg.selector)) return { ok: false, error: 'Invalid CSS selector.' };
  }
  const watches = await getWatches();
  const others = Object.values(watches).filter((x) => x.status === 'watching' && x.tabId !== tabId);
  if (!pro && others.length >= 1) return { ok: false, error: FREE_LIMIT };

  let hasHost = false;
  if (origin) {
    try { hasHost = await chrome.permissions.contains({ origins: [origin + '/*'] }); } catch {}
  }
  const needHost = mode !== 'none' || intervalSec < ALARM_MIN_SEC;
  if (needHost && !hasHost) return { ok: false, error: 'Site access is needed for text checks and intervals under 30s.' };
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return { ok: false, error: 'The tab was closed.' }; }
  // E.g. the tab navigated elsewhere while the permission prompt was open.
  if (leftSite({ origin, hasHost }, tab)) return { ok: false, error: `The tab is no longer on ${hostOf(origin)}.` };
  const w = {
    tabId, origin: origin || '', hasHost,
    intervalSec, jitterPct: Math.max(0, Math.min(50, Number(cfg.jitterPct) || 0)),
    mode, text, regex: !!cfg.regex && pro, selector: pro ? String(cfg.selector || '').trim() : '',
    notify: !!cfg.notify, sound: !!cfg.sound, focus: !!cfg.focus,
    status: 'watching', count: 0, startedAt: Date.now(), lastChecked: null, nextAt: null
  };
  // Check the free limit again in the same storage transaction: two starts for different tabs can overlap.
  const refused = await mutate((ws) => {
    if (!pro && Object.values(ws).some((x) => x.status === 'watching' && x.tabId !== tabId)) return true;
    ws[tabId] = w;
  });
  if (refused) return { ok: false, error: FREE_LIMIT };
  await clearPending(tabId);
  chrome.notifications.clear('met:' + tabId);
  chrome.notifications.clear('stopped:' + tabId);
  // Keep Memory Saver from discarding the watched tab (a discarded tab has no page timer).
  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  await ensureWatchdog();
  // Check immediately (condition may already hold), then schedule the first reload.
  await onPageReady(tabId, false);
  return { ok: true };
}

async function stop(tabId) {
  await mutate((ws) => { delete ws[tabId]; });
  await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  try { await chrome.scripting.executeScript({ target: { tabId }, func: pageRun, args: ['cancel', null, 0] }); } catch {}
  await setBadge(tabId, '', null);
  chrome.tabs.update(tabId, { autoDiscardable: true }).catch(() => {});
  recentStarts.delete(tabId);
  return { ok: true };
}

async function clearPending(tabId) {
  const { pending } = await chrome.storage.session.get('pending');
  if (pending?.tabId === tabId) await chrome.storage.session.remove('pending');
}

async function ensureWatchdog() {
  const a = await chrome.alarms.get(WATCHDOG);
  if (!a) await chrome.alarms.create(WATCHDOG, { periodInMinutes: 1 });
}

async function watchdog() {
  const watches = await getWatches();
  const now = Date.now();
  let any = false;
  for (const w of Object.values(watches)) {
    if (w.status !== 'watching') continue;
    any = true;
    const grace = Math.min(w.intervalSec, 120) * 1000 + 30000;
    const due = w.nextAt || w.startedAt; // nextAt is still null if the worker died before the first schedule
    if (due && now - due > grace) {
      // Overdue (e.g. error page where injection failed, or a page that never finishes loading): force a reload.
      if (!(await stillWatchable(w.tabId, w))) continue;
      // The load never completed, so nothing checked this page yet: the text may well be there.
      if ((await evaluate(w.tabId, w)) === true) { await onMet(w.tabId); continue; }
      try {
        await mutate((ws) => { if (ws[w.tabId]) ws[w.tabId].nextAt = now + w.intervalSec * 1000; });
        await chrome.tabs.reload(w.tabId);
      } catch {
        await stop(w.tabId);
      }
    }
  }
  if (any) ensureTicker();
  else await chrome.alarms.clear(WATCHDOG);
}

// ---------- events ----------
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  const w = await getWatch(tabId);
  if (w && w.status === 'watching') {
    if (leftSite(w, tab)) return stopWithNotice(tabId, `The watched tab left ${hostOf(w.origin)}, so reloading stopped.`);
    onPageReady(tabId, true);
  }
  else if (w && w.status === 'met') setBadge(tabId, '✓', COLOR_MET);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const w = await getWatch(tabId);
  if (w) {
    await mutate((ws) => { delete ws[tabId]; });
    await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  }
  clearPending(tabId);
});

chrome.tabs.onReplaced.addListener(async (added, removed) => {
  await mutate((ws) => {
    if (ws[removed]) { ws[added] = { ...ws[removed], tabId: added }; delete ws[removed]; }
  });
  await chrome.alarms.clear(RELOAD_PREFIX + removed);
  if (await getWatch(added)) chrome.tabs.update(added, { autoDiscardable: false }).catch(() => {});
  scheduleNext(added);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === WATCHDOG) return watchdog();
  if (alarm.name.startsWith(RELOAD_PREFIX)) {
    const tabId = Number(alarm.name.slice(RELOAD_PREFIX.length));
    const w = await getWatch(tabId);
    if (!w || w.status !== 'watching') return;
    if (!(await stillWatchable(tabId, w))) return;
    try { await chrome.tabs.reload(tabId); } catch { await stop(tabId); }
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('met:') || id.startsWith('stopped:')) focusTab(Number(id.split(':')[1]));
  chrome.notifications.clear(id);
});

// The popup usually closes while the permission prompt is shown; finish the start here.
// Only the latest request is kept ("pending") and it expires, so an old denied prompt cannot start a watch later.
chrome.permissions.onAdded.addListener(async (perms) => {
  const { pending: p } = await chrome.storage.session.get('pending');
  if (!p || !perms.origins?.some((o) => o === p.origin + '/*' || o === '<all_urls>')) return;
  await chrome.storage.session.remove('pending');
  if (Date.now() - (p.at || 0) > 5 * 60 * 1000) return;
  start(p.tabId, p.cfg, p.origin);
});

chrome.permissions.onRemoved.addListener(async () => {
  for (const w of Object.values(await getWatches())) {
    if (w.status !== 'watching' || !w.hasHost) continue;
    let still = false;
    try { still = await chrome.permissions.contains({ origins: [w.origin + '/*'] }); } catch {}
    if (!still) await stopWithNotice(w.tabId, `Site access to ${hostOf(w.origin)} was removed, so reloading stopped.`);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  if (msg.type === 'conditionMet' && sender.tab) {
    onMet(sender.tab.id);
    return false;
  }
  if (sender.id !== chrome.runtime.id || sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  const handle = async () => {
    switch (msg.type) {
      case 'start': return start(msg.tabId, msg.cfg || {}, msg.origin);
      case 'stop': return stop(msg.tabId);
      case 'beepDone':
        await beepDone();
        return { ok: true };
      default: return { ok: false, error: 'unknown message' };
    }
  };
  handle().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

// Watches never resume after a browser restart or an extension update (tab ids change, session storage is
// cleared). Also drop leftover alarms so nothing fires for a stale tab id.
chrome.runtime.onInstalled.addListener(() => chrome.alarms.clearAll());
chrome.runtime.onStartup.addListener(() => { chrome.storage.session.clear(); chrome.alarms.clearAll(); });

// Resume badge ticker whenever the worker wakes up with active watches.
getWatches().then((ws) => { if (Object.values(ws).some((w) => w.status === 'watching')) ensureTicker(); });
