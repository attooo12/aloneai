// Reload Until: service worker. No network requests; all state is local.
import { isPro } from './license.js';
import { MIN_INTERVAL_SEC, ALARM_MIN_SEC } from './config.js';

const WATCHDOG = 'watchdog';
const RELOAD_PREFIX = 'reload:';
const COLOR_WATCHING = '#2563eb';
const COLOR_MET = '#16a34a';

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

// ---------- injected functions (run in the page's isolated world) ----------
function pageCheck(text, isRegex, selector) {
  let content = '';
  if (selector) {
    content = Array.from(document.querySelectorAll(selector)).map((el) => el.innerText || el.textContent || '').join('\n');
  } else if (document.body) {
    content = document.body.innerText || document.body.textContent || '';
  }
  if (isRegex) return new RegExp(text, 'i').test(content);
  return content.toLowerCase().includes(String(text).toLowerCase());
}

function pageSchedule(ms, cond) {
  // cond: null or {text, regex, selector, mode}
  if (window.__reloadUntilTimer) clearTimeout(window.__reloadUntilTimer);
  window.__reloadUntilTimer = setTimeout(() => {
    if (cond) {
      try {
        let content = '';
        if (cond.selector) {
          content = Array.from(document.querySelectorAll(cond.selector)).map((el) => el.innerText || el.textContent || '').join('\n');
        } else if (document.body) {
          content = document.body.innerText || document.body.textContent || '';
        }
        const found = cond.regex ? new RegExp(cond.text, 'i').test(content) : content.toLowerCase().includes(cond.text.toLowerCase());
        const met = cond.mode === 'appears' ? found : !found;
        if (met) {
          // Content changed without a reload (dynamic page): tell the service worker instead of reloading.
          chrome.runtime.sendMessage({ type: 'conditionMet' });
          return;
        }
      } catch (e) { /* fall through to reload */ }
    }
    location.reload();
  }, ms);
}

function pageCancel() {
  if (window.__reloadUntilTimer) clearTimeout(window.__reloadUntilTimer);
  window.__reloadUntilTimer = null;
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

// ---------- scheduling ----------
async function scheduleNext(tabId) {
  const w = await getWatch(tabId);
  if (!w || w.status !== 'watching') return;
  let delay = jittered(w);
  let injected = false;
  if (w.hasHost) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: pageSchedule, args: [delay, condOf(w)] });
      injected = true;
    } catch { /* error page, or no access: fall back to alarm */ }
  }
  if (!injected) {
    delay = Math.max(delay, w.hasHost ? MIN_INTERVAL_SEC * 1000 : ALARM_MIN_SEC * 1000);
    await chrome.alarms.create(RELOAD_PREFIX + tabId, { when: Date.now() + delay });
  } else {
    await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  }
  await mutate((ws) => { if (ws[tabId]) ws[tabId].nextAt = Date.now() + delay; });
  ensureTicker();
}

async function evaluate(tabId, w) {
  // Returns true (met), false (not met) or null (could not check).
  if (w.mode === 'none' || !w.hasHost) return null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageCheck, args: [w.text, !!w.regex, w.selector || ''] });
    if (typeof res?.result !== 'boolean') return null;
    return w.mode === 'appears' ? res.result : !res.result;
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
async function playSound() {
  try {
    const has = await chrome.offscreen.hasDocument?.();
    if (!has) {
      creatingOffscreen ??= chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play a short alert beep when the watched condition is met.'
      }).finally(() => { creatingOffscreen = null; });
      await creatingOffscreen;
    }
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'beep' });
  } catch (e) {
    console.warn('sound failed', e);
  }
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
  try { await chrome.scripting.executeScript({ target: { tabId }, func: pageCancel }); } catch {}
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
const recentStarts = new Map(); // tabId -> timestamp, dedupes popup + permissions.onAdded double start

async function start(tabId, cfg, origin) {
  const last = recentStarts.get(tabId);
  if (last && Date.now() - last < 2000) return { ok: true, deduped: true };

  const intervalSec = Math.round(Number(cfg.intervalSec));
  if (!Number.isFinite(intervalSec) || intervalSec < MIN_INTERVAL_SEC) return { ok: false, error: `Minimum interval is ${MIN_INTERVAL_SEC} seconds.` };
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
  if (!pro && others.length >= 1) return { ok: false, error: 'Free version watches 1 tab at a time. Stop the other tab or get Pro.' };

  let hasHost = false;
  if (origin) {
    try { hasHost = await chrome.permissions.contains({ origins: [origin + '/*'] }); } catch {}
  }
  const needHost = mode !== 'none' || intervalSec < ALARM_MIN_SEC;
  if (needHost && !hasHost) return { ok: false, error: 'Site access is needed for text checks and intervals under 30s.' };

  recentStarts.set(tabId, Date.now());
  const w = {
    tabId, origin: origin || '', hasHost,
    intervalSec, jitterPct: Math.max(0, Math.min(50, Number(cfg.jitterPct) || 0)),
    mode, text, regex: !!cfg.regex && pro, selector: pro ? String(cfg.selector || '').trim() : '',
    notify: !!cfg.notify, sound: !!cfg.sound, focus: !!cfg.focus,
    status: 'watching', count: 0, startedAt: Date.now(), lastChecked: null, nextAt: null
  };
  await mutate((ws) => { ws[tabId] = w; });
  await chrome.storage.session.remove('pending:' + tabId);
  chrome.notifications.clear('met:' + tabId);
  await ensureWatchdog();
  // Check immediately (condition may already hold), then schedule the first reload.
  await onPageReady(tabId, false);
  return { ok: true };
}

async function stop(tabId) {
  await mutate((ws) => { delete ws[tabId]; });
  await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  try { await chrome.scripting.executeScript({ target: { tabId }, func: pageCancel }); } catch {}
  await setBadge(tabId, '', null);
  recentStarts.delete(tabId);
  return { ok: true };
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
    if (w.nextAt && now - w.nextAt > grace) {
      // Overdue (e.g. error page where injection failed): force a reload.
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
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const w = await getWatch(tabId);
  if (w && w.status === 'watching') onPageReady(tabId, true);
  else if (w && w.status === 'met') setBadge(tabId, '✓', COLOR_MET);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const w = await getWatch(tabId);
  if (w) {
    await mutate((ws) => { delete ws[tabId]; });
    await chrome.alarms.clear(RELOAD_PREFIX + tabId);
  }
  chrome.storage.session.remove('pending:' + tabId);
});

chrome.tabs.onReplaced.addListener(async (added, removed) => {
  await mutate((ws) => {
    if (ws[removed]) { ws[added] = { ...ws[removed], tabId: added }; delete ws[removed]; }
  });
  await chrome.alarms.clear(RELOAD_PREFIX + removed);
  scheduleNext(added);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === WATCHDOG) return watchdog();
  if (alarm.name.startsWith(RELOAD_PREFIX)) {
    const tabId = Number(alarm.name.slice(RELOAD_PREFIX.length));
    const w = await getWatch(tabId);
    if (!w || w.status !== 'watching') return;
    try { await chrome.tabs.reload(tabId); } catch { await stop(tabId); }
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('met:')) focusTab(Number(id.slice(4)));
  chrome.notifications.clear(id);
});

// Popup may close while the permission prompt is shown; finish the start here.
chrome.permissions.onAdded.addListener(async (perms) => {
  const all = await chrome.storage.session.get(null);
  for (const [key, p] of Object.entries(all)) {
    if (!key.startsWith('pending:')) continue;
    if (!perms.origins?.some((o) => o === p.origin + '/*' || o === '<all_urls>')) continue;
    if (Date.now() - (p.at || 0) > 5 * 60 * 1000) { chrome.storage.session.remove(key); continue; }
    start(Number(key.slice(8)), p.cfg, p.origin);
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
        try { await chrome.offscreen.closeDocument(); } catch {}
        return { ok: true };
      default: return { ok: false, error: 'unknown message' };
    }
  };
  handle().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => { getWatches().then((ws) => { if (Object.keys(ws).length) ensureWatchdog(); }); });
chrome.runtime.onStartup.addListener(() => chrome.storage.session.clear());

// Resume badge ticker whenever the worker wakes up with active watches.
getWatches().then((ws) => { if (Object.values(ws).some((w) => w.status === 'watching')) ensureTicker(); });
