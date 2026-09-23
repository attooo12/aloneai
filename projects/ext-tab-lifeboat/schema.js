// Session data model, validation, import parsing and export formats. Pure functions: no chrome.* calls, so this
// file is unit-tested directly in Node.
//
// Session (schema v1):
// { v: 1, id, name, kind: 'named' | 'auto', reason?, scope?, created, updated,
//   windows: [ { tabs: [ { url, title, pinned?: true, group?: <index into groups> } ],
//                groups: [ { title, color, collapsed } ] } ] }

export const SCHEMA_VERSION = 1;
export const EXPORT_FORMAT = 'tab-lifeboat-export';
export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export const AUTO_REASONS = ['periodic', 'window-closed', 'previous-session', 'manual'];
export const LIMITS = { name: 120, title: 500, groupTitle: 120, url: 65536, tabsPerWindow: 5000, windows: 200, groups: 500, importBytes: 200 * 1024 * 1024 };

// Schemes Chrome can reopen from an extension. javascript:, data:, blob: and anything unknown are dropped.
const URL_OK = /^(https?|file|ftp|chrome|chrome-extension|about|view-source|edge|brave|vivaldi|opera):/i;
// Tabs that carry no information: they are saved, but don't count as "real" tabs for the snapshot guard.
const BLANK_URL = /^(?:(?:chrome|edge|brave|vivaldi|opera):\/\/(?:newtab|new-tab-page)\/?|about:(?:blank|newtab))$/i;
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// Cut to `max` UTF-16 units without leaving half of a surrogate pair (emoji) at the end.
const str = (x, max) => (typeof x === 'string' ? x : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[\ud800-\udbff]$/, '');
const validTime = (x, now) => (Number.isFinite(x) && x > 946684800000 && x < now + 86400e3 ? Math.floor(x) : null); // 2000-01-01 .. now+1d

export function newId() {
  return (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, '');
}

export function isRestorableUrl(url) {
  return typeof url === 'string' && url.length > 0 && url.length <= LIMITS.url && URL_OK.test(url) && !/\s/.test(url);
}
export const isBlankUrl = (url) => BLANK_URL.test(url);

function cleanGroup(g) {
  if (!isObj(g)) return { title: '', color: 'grey', collapsed: false };
  return { title: str(g.title, LIMITS.groupTitle), color: GROUP_COLORS.includes(g.color) ? g.color : 'grey', collapsed: g.collapsed === true };
}

function cleanTab(t, groupCount) {
  if (!isObj(t) || !isRestorableUrl(t.url)) return null;
  const tab = { url: t.url, title: str(t.title, LIMITS.title) };
  if (t.pinned === true) tab.pinned = true;
  else if (Number.isInteger(t.group) && t.group >= 0 && t.group < groupCount) tab.group = t.group; // pinned tabs can't be grouped
  return tab;
}

// Drop groups that no tab uses and renumber the rest in order of first use.
function pruneGroups(tabs, groups) {
  const map = new Map();
  const out = [];
  for (const t of tabs) {
    if (t.group === undefined) continue;
    if (!map.has(t.group)) { map.set(t.group, out.length); out.push(groups[t.group]); }
    t.group = map.get(t.group);
  }
  return out;
}

// Validates and normalises anything that claims to be a session (from storage, an import file or a capture).
// Returns { session, dropped } or { error }. Never throws.
export function cleanSession(raw, { now = Date.now(), kind, keepId = true } = {}) {
  try {
    if (!isObj(raw)) return { error: 'not an object' };
    if (Number.isFinite(raw.v) && raw.v > SCHEMA_VERSION) return { error: `made by a newer version (schema ${raw.v})` };
    const windowsIn = Array.isArray(raw.windows) ? raw.windows : Array.isArray(raw.tabs) ? [{ tabs: raw.tabs, groups: raw.groups }] : null;
    if (!windowsIn) return { error: 'no windows or tabs' };
    let dropped = 0;
    const windows = [];
    for (const w of windowsIn.slice(0, LIMITS.windows)) {
      if (!isObj(w) || !Array.isArray(w.tabs)) { dropped++; continue; }
      const groupsIn = (Array.isArray(w.groups) ? w.groups : []).slice(0, LIMITS.groups).map(cleanGroup);
      const tabs = [];
      for (const t of w.tabs.slice(0, LIMITS.tabsPerWindow)) {
        const c = cleanTab(t, groupsIn.length);
        if (c) tabs.push(c); else dropped++;
      }
      dropped += Math.max(0, w.tabs.length - LIMITS.tabsPerWindow);
      if (tabs.length) windows.push({ tabs, groups: pruneGroups(tabs, groupsIn) });
    }
    if (!windows.length) return { error: 'no valid tabs' };
    const k = kind || (raw.kind === 'auto' ? 'auto' : 'named');
    const created = validTime(raw.created, now) ?? now;
    const session = {
      v: SCHEMA_VERSION,
      id: keepId && typeof raw.id === 'string' && ID_OK.test(raw.id) ? raw.id : newId(),
      name: str(raw.name, LIMITS.name) || defaultName(created),
      kind: k,
      created,
      updated: Math.max(created, validTime(raw.updated, now) ?? created),
      windows
    };
    if (k === 'auto') {
      session.reason = AUTO_REASONS.includes(raw.reason) ? raw.reason : 'manual';
      session.scope = raw.scope === 'window' ? 'window' : 'all';
    }
    return { session, dropped };
  } catch (e) {
    return { error: 'unreadable: ' + (e?.message || e) };
  }
}

export function defaultName(t = Date.now()) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `Session ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function countTabs(session) {
  let tabs = 0, real = 0, groups = 0;
  for (const w of session.windows) {
    tabs += w.tabs.length;
    groups += w.groups.length;
    for (const t of w.tabs) if (!isBlankUrl(t.url)) real++;
  }
  return { tabs, real, groups, windows: session.windows.length };
}

// Fingerprint of the content (URLs, pins, groups): used to skip unchanged snapshots and duplicate imports.
export function fingerprint(session) {
  let h = 0x811c9dc5;
  const feed = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  for (const w of session.windows) {
    feed('\u0001');
    for (const g of w.groups) feed(`g${g.title}\u0002${g.color}`);
    for (const t of w.tabs) feed(`\u0003${t.pinned ? 'p' : ''}${t.group ?? ''}\u0004${t.url}`);
  }
  return h.toString(36) + ':' + countTabs(session).tabs;
}

// Index entry: everything the popup list needs without loading the full session.
export function summarize(session) {
  const c = countTabs(session);
  const e = { id: session.id, name: session.name, kind: session.kind, created: session.created, updated: session.updated, tabs: c.tabs, real: c.real, windows: c.windows, groups: c.groups, fp: fingerprint(session) };
  if (session.kind === 'auto') { e.reason = session.reason; e.scope = session.scope; }
  return e;
}

export function isValidIndexEntry(e) {
  return isObj(e) && typeof e.id === 'string' && ID_OK.test(e.id) && typeof e.name === 'string' && Number.isFinite(e.created) && Number.isFinite(e.tabs);
}

// ---------- import ----------
// Accepts: a Tab Lifeboat export ({format:'tab-lifeboat-export', sessions:[...]}), a bare array of sessions, a single
// session object, or plain text with one URL per line ("URL" or "URL | title"; a blank line starts a new session).
export function parseImport(text, { now = Date.now() } = {}) {
  if (typeof text !== 'string') return { error: 'The file could not be read as text.' };
  if (text.length > LIMITS.importBytes) return { error: 'The file is too large (over 200 MB).' };
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) return { error: 'The file is empty.' };
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    let data;
    try { data = JSON.parse(trimmed); } catch (e) { return { error: 'This is not valid JSON: ' + String(e.message).slice(0, 120) }; }
    let list;
    if (Array.isArray(data)) list = data;
    else if (isObj(data) && data.format === EXPORT_FORMAT) {
      if (Number.isFinite(data.schema) && data.schema > SCHEMA_VERSION) return { error: 'This backup was made by a newer version of Tab Lifeboat. Please update the extension first.' };
      if (!Array.isArray(data.sessions)) return { error: 'This backup has no sessions list.' };
      list = data.sessions;
    } else if (isObj(data) && (Array.isArray(data.windows) || Array.isArray(data.tabs))) list = [data];
    else return { error: 'This JSON file is not a Tab Lifeboat backup.' };
    const sessions = [];
    const problems = [];
    let droppedTabs = 0;
    list.forEach((raw, i) => {
      const r = cleanSession(raw, { now });
      if (r.error) problems.push(`#${i + 1}${isObj(raw) && typeof raw.name === 'string' ? ` "${str(raw.name, 40)}"` : ''}: ${r.error}`);
      else { sessions.push(r.session); droppedTabs += r.dropped; }
    });
    if (!sessions.length) return { error: `No valid sessions found in this file${problems.length ? ` (${problems.length} unreadable)` : ''}.`, problems };
    return { sessions, problems, droppedTabs, format: 'json' };
  }
  // Plain text URL list.
  const blocks = trimmed.split(/\r?\n\s*\r?\n/);
  const sessions = [];
  let ignored = 0;
  for (const block of blocks) {
    const tabs = [];
    for (const line of block.split(/\r?\n/)) {
      const l = line.trim();
      if (!l) continue;
      const m = l.match(/^(\S+)(?:\s+\|\s*(.*))?$/);
      if (m && isRestorableUrl(m[1])) tabs.push({ url: m[1], title: m[2] || '' });
      else ignored++;
    }
    if (tabs.length) {
      const r = cleanSession({ name: `Imported list ${sessions.length + 1}`, created: now, tabs }, { now, keepId: false });
      if (r.session) sessions.push(r.session);
    }
  }
  if (!sessions.length) return { error: 'No JSON backup and no web addresses (one per line) were found in this file.' };
  return { sessions, problems: ignored ? [`${ignored} line(s) without a usable web address were ignored`] : [], droppedTabs: 0, format: 'text' };
}

// ---------- export ----------
export function buildExport(sessions, { now = Date.now(), unreadable = [] } = {}) {
  const out = { format: EXPORT_FORMAT, schema: SCHEMA_VERSION, app: 'Tab Lifeboat', exported: new Date(now).toISOString(), sessions };
  if (unreadable.length) out.unreadable = unreadable;
  return out;
}

const mdText = (s) => s.replace(/([\\`*_{}\[\]()#+!|<>])/g, '\\$1');
const mdUrl = (u) => u.replace(/[()<> ]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dateStr = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

function walk(session, onWindow, onGroup, onTab) {
  session.windows.forEach((w, wi) => {
    onWindow(w, wi);
    let current; // undefined: no list open yet in this window
    for (const t of w.tabs) {
      const g = t.group === undefined ? null : t.group;
      if (g !== current) { current = g; onGroup(g === null ? null : w.groups[g]); }
      onTab(t);
    }
  });
}

export function toMarkdown(sessions) {
  const lines = [];
  for (const s of sessions) {
    const c = countTabs(s);
    lines.push(`# ${mdText(s.name)}`, '', `_${c.tabs} tabs, saved ${dateStr(s.created)} UTC_`, '');
    walk(s,
      (w, wi) => { if (s.windows.length > 1) lines.push(`## Window ${wi + 1}`, ''); },
      (g) => { if (g) lines.push('', `**${mdText(g.title || 'Unnamed group')}** (${g.color})`, ''); else lines.push(''); },
      (t) => lines.push(`- ${t.pinned ? '📌 ' : ''}[${mdText(t.title || t.url)}](${mdUrl(t.url)})`));
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toHtml(sessions, { title = 'Tab Lifeboat export' } = {}) {
  const parts = [`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>`,
    '<style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem}li{margin:2px 0}.g{font-weight:600;margin-top:.6rem}.m{color:#666}</style></head><body>'];
  for (const s of sessions) {
    const c = countTabs(s);
    parts.push(`<h1>${esc(s.name)}</h1><p class="m">${c.tabs} tabs, saved ${esc(dateStr(s.created))} UTC</p>`);
    let open = false;
    const close = () => { if (open) { parts.push('</ul>'); open = false; } };
    walk(s,
      (w, wi) => { close(); if (s.windows.length > 1) parts.push(`<h2>Window ${wi + 1}</h2>`); },
      (g) => { close(); if (g) parts.push(`<p class="g">${esc(g.title || 'Unnamed group')} <span class="m">(${esc(g.color)})</span></p>`); parts.push('<ul>'); open = true; },
      (t) => parts.push(`<li>${t.pinned ? '📌 ' : ''}<a href="${esc(t.url)}">${esc(t.title || t.url)}</a></li>`));
    close();
  }
  parts.push('</body></html>');
  return parts.join('\n');
}

// Merge several sessions into one window: groups are kept (renumbered), exact duplicate URLs are dropped.
export function mergeSessions(sessions, name, { now = Date.now() } = {}) {
  const seen = new Set();
  const tabs = [];
  const groups = [];
  for (const s of sessions) {
    for (const w of s.windows) {
      const base = groups.length;
      groups.push(...w.groups.map((g) => ({ ...g })));
      for (const t of w.tabs) {
        if (seen.has(t.url)) continue;
        seen.add(t.url);
        const nt = { url: t.url, title: t.title };
        if (t.pinned) nt.pinned = true;
        else if (t.group !== undefined) nt.group = base + t.group;
        tabs.push(nt);
      }
    }
  }
  // Pinned tabs first (Chrome keeps them at the start of a window anyway).
  tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return cleanSession({ name: name || `Merged ${sessions.length} sessions`, created: now, windows: [{ tabs, groups }] }, { now, kind: 'named', keepId: false });
}

// Plain-text search over names, titles and URLs. `query` words must all match (case-insensitive).
export function matches(haystack, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const h = haystack.toLowerCase();
  return words.every((w) => h.includes(w));
}
export function searchText(session) {
  const parts = [session.name];
  for (const w of session.windows) {
    for (const g of w.groups) parts.push(g.title);
    for (const t of w.tabs) parts.push(t.title, t.url);
  }
  return parts.join('\n');
}
