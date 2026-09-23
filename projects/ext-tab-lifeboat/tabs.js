// Reading the open windows (capture) and reopening sessions (restore). Uses chrome.tabs / tabGroups / windows.
import { isRestorableUrl } from './schema.js';

const OWN = () => chrome.runtime.getURL('');

// Returns { windows: [{ tabs, groups }], ids: [windowId...] } for one window or all normal, non-incognito windows.
// Our own extension pages are left out.
export async function captureWindows({ windowId, all = false } = {}) {
  const wins = all
    ? await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
    : [await chrome.windows.get(windowId, { populate: true })];
  const windows = [];
  const ids = [];
  for (const w of wins) {
    if (!w || w.incognito || (w.type && w.type !== 'normal')) continue;
    const groupsRaw = await chrome.tabGroups.query({ windowId: w.id }).catch(() => []);
    const groupIndex = new Map();
    const groups = [];
    const tabs = [];
    for (const t of [...(w.tabs || [])].sort((a, b) => a.index - b.index)) {
      const url = t.url || t.pendingUrl || '';
      if (!url || url.startsWith(OWN())) continue;
      const tab = { url, title: t.title || '' };
      if (t.pinned) tab.pinned = true;
      else if (t.groupId >= 0) {
        if (!groupIndex.has(t.groupId)) {
          const g = groupsRaw.find((x) => x.id === t.groupId);
          groupIndex.set(t.groupId, groups.length);
          groups.push({ title: g?.title || '', color: g?.color || 'grey', collapsed: !!g?.collapsed });
        }
        tab.group = groupIndex.get(t.groupId);
      }
      tabs.push(tab);
    }
    if (tabs.length) { windows.push({ tabs, groups }); ids.push(w.id); }
  }
  return { windows, ids };
}

// Waits until the tab's URL has committed (or a timeout), so it can be discarded safely.
function whenCommitted(tabId, timeout = 8000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(l); clearTimeout(timer); resolve(); };
    const l = (id, change) => { if (id === tabId && change.status === 'complete') done(); };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') done(); }, done); // already loaded (or gone)
  });
}

// Opens one saved window as a new browser window. Returns { windowId, opened, failed }.
export async function restoreWindow(w, { focused = true, lazy = false } = {}) {
  const tabs = w.tabs.filter((t) => isRestorableUrl(t.url));
  let failed = w.tabs.length - tabs.length;
  const created = []; // [{ id, src }]
  let win = null;
  let start = 0;
  while (!win && start < tabs.length) {
    try {
      win = await chrome.windows.create({ url: tabs[start].url, focused });
      created.push({ id: win.tabs[0].id, src: tabs[start] });
    } catch {
      failed++;
    }
    start++;
  }
  if (!win) return { windowId: null, opened: 0, failed };
  for (let i = start; i < tabs.length; i++) {
    const t = tabs[i];
    try {
      const tab = await chrome.tabs.create({ windowId: win.id, url: t.url, pinned: !!t.pinned, active: false });
      created.push({ id: tab.id, src: t });
    } catch {
      failed++;
    }
  }
  if (created[0]?.src.pinned) await chrome.tabs.update(created[0].id, { pinned: true }).catch(() => {});
  // Tab groups: title, colour, collapsed.
  const byGroup = new Map();
  for (const c of created) if (c.src.group !== undefined && !c.src.pinned) {
    if (!byGroup.has(c.src.group)) byGroup.set(c.src.group, []);
    byGroup.get(c.src.group).push(c.id);
  }
  const collapse = [];
  for (const [gi, tabIds] of byGroup) {
    const g = w.groups[gi] || { title: '', color: 'grey', collapsed: false };
    try {
      const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: win.id } });
      await chrome.tabGroups.update(groupId, { title: g.title, color: g.color });
      if (g.collapsed) collapse.push(groupId);
    } catch { /* group could not be created: the tabs are still open */ }
  }
  for (const gid of collapse) await chrome.tabGroups.update(gid, { collapsed: true }).catch(() => {});
  // Experimental: unload background tabs once their URL has committed, so they load when clicked.
  if (lazy) {
    for (const c of created.slice(1)) {
      await whenCommitted(c.id);
      await chrome.tabs.discard(c.id).catch(() => {});
    }
  }
  return { windowId: win.id, opened: created.length, failed };
}

// Opens every window of a session (or just one of them) as new windows.
export async function restoreSession(session, { windowIndex, lazy = false } = {}) {
  const list = windowIndex === undefined ? session.windows : [session.windows[windowIndex]].filter(Boolean);
  let opened = 0, failed = 0;
  const windowIds = [];
  for (let i = 0; i < list.length; i++) {
    const r = await restoreWindow(list[i], { focused: i === list.length - 1, lazy });
    opened += r.opened; failed += r.failed;
    if (r.windowId) windowIds.push(r.windowId);
  }
  return { opened, failed, windowIds };
}
