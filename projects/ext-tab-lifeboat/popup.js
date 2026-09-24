import { isPro } from './license.js';
import { FREE_SESSION_LIMIT } from './config.js';
import { captureWindows } from './tabs.js';
import { getIndex, getSession, getSessions, saveNamed, renameSession, deleteSession, deleteSessions, undoDelete, getTrash, mergeInto, setProtected, keepAsNamed, IDX } from './store.js';
import { toMarkdown, toHtml, matches, searchText } from './schema.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PAGE = 100; // rows rendered at a time
const TAB_PAGE = 300; // tabs shown per session detail before "show all"
const BIG_RESTORE = 100; // restoring more tabs than this asks for confirmation first

const state = {
  kind: 'named', // or 'auto'
  index: { named: [], auto: [] },
  pro: false,
  windowId: null,
  q: '',
  shown: PAGE,
  open: new Set(), // expanded session ids
  selected: new Set(),
  texts: new Map(), // id -> search text (loaded on first tab-level search)
  undo: null
};

// ---------- helpers ----------
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const host = (u) => { try { const x = new URL(u); return x.host || x.protocol.replace(':', ''); } catch { return ''; } };
const REASON = { periodic: 'Auto snapshot', 'window-closed': 'Closed window', 'previous-session': 'Previous browser session', manual: 'Snapshot' };

let statusTimer = null;
function status(msg, { kind = '', action = null, ms = 6000 } = {}) {
  const s = $('status');
  s.replaceChildren(el('span', { class: kind, text: msg }), ...(action ? [el('button', { type: 'button', text: action.label, onclick: action.run })] : []));
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => s.replaceChildren(), ms);
}
function proNeeded(what) {
  status(`${what} is part of Pro (one-time payment).`, { action: { label: 'See Pro', run: () => chrome.runtime.openOptionsPage() }, ms: 8000 });
}
const send = (msg) => chrome.runtime.sendMessage(msg);

// ---------- header / save ----------
async function refreshCounts() {
  const [inWin, all] = await Promise.all([
    chrome.tabs.query({ windowId: state.windowId }),
    chrome.tabs.query({ windowType: 'normal' })
  ]);
  const own = chrome.runtime.getURL('');
  const n = (list) => list.filter((t) => !(t.url || '').startsWith(own) && !t.incognito).length;
  $('count-window').textContent = `(${n(inWin)})`;
  $('count-all').textContent = `(${n(all)})`;
}

function renderPlan() {
  $('plan').textContent = state.pro ? 'Pro' : 'Free';
  $('plan').classList.toggle('pro', state.pro);
  const used = state.index.named.length;
  $('cap').textContent = state.pro ? '' : `${Math.min(used, 9999)} of ${FREE_SESSION_LIMIT} free saved sessions used. Auto snapshots don't count.`;
}

async function save(all) {
  const name = $('name').value.trim();
  try {
    if (!state.pro && state.index.named.length >= FREE_SESSION_LIMIT) { // same check as the store, before capturing
      throw Object.assign(new Error(`The Free plan keeps ${FREE_SESSION_LIMIT} saved sessions. Delete one, or get Pro for unlimited sessions.`), { code: 'limit' });
    }
    const cap = await captureWindows(all ? { all: true } : { windowId: state.windowId });
    const e = await saveNamed({ windows: cap.windows }, name);
    $('name').value = '';
    status(`Saved "${e.name}": ${plural(e.tabs, 'tab')}${e.windows > 1 ? ` in ${e.windows} windows` : ''}.`, { kind: 'ok' });
    await switchKind('named');
  } catch (err) {
    if (err.code === 'limit') status(err.message, { kind: 'error', action: { label: 'See Pro', run: () => chrome.runtime.openOptionsPage() }, ms: 0 });
    else status(err.message || String(err), { kind: 'error' });
  }
}

// ---------- list ----------
function filtered() {
  const list = [...state.index[state.kind]].reverse(); // newest first
  if (!state.q) return list;
  return list.filter((e) => matches(e.name, state.q) || (state.texts.has(e.id) && matches(state.texts.get(e.id), state.q)));
}

async function loadSearchTexts() {
  const missing = state.index[state.kind].filter((e) => !state.texts.has(e.id)).map((e) => e.id);
  if (!missing.length) return;
  const sessions = await getSessions(missing);
  missing.forEach((id, i) => state.texts.set(id, sessions[i] ? searchText(sessions[i]) : ''));
}

function metaText(e) {
  const bits = [plural(e.tabs, 'tab')];
  if (e.windows > 1) bits.push(plural(e.windows, 'window'));
  if (e.groups) bits.push(plural(e.groups, 'group'));
  bits.push(ago(e.created));
  return bits.join(' · ');
}

function renderList() {
  const list = filtered();
  const ul = $('list');
  const frag = document.createDocumentFragment();
  for (const e of list.slice(0, state.shown)) frag.append(row(e));
  ul.replaceChildren(frag);
  $('more').hidden = list.length <= state.shown;
  $('more').textContent = `Show more (${list.length - state.shown} more)`;
  const empty = $('empty');
  empty.hidden = list.length > 0;
  empty.textContent = state.q ? 'Nothing matches your search.'
    : state.kind === 'named' ? 'No saved sessions yet. Save this window to start. Automatic snapshots are already on: see "Auto snapshots".'
      : 'No automatic snapshots yet. The first one is taken a few minutes after you install.';
  $('n-named').textContent = `(${state.index.named.length})`;
  $('n-auto').textContent = `(${state.index.auto.length})`;
  $('auto-note').hidden = state.kind !== 'auto';
  renderSelbar();
}

function row(e) {
  const name = state.kind === 'auto' ? `${REASON[e.reason] || e.name}` : e.name;
  const li = el('li', { class: 'item', 'data-id': e.id });
  const open = state.open.has(e.id);
  const main = el('button', { type: 'button', class: 'main', 'aria-expanded': String(open), title: 'Show tabs and actions', onclick: () => toggle(e.id) },
    el('span', { class: 'nm' }, name, e.keep ? el('span', { class: 'badge', text: 'protected' }) : null),
    el('span', { class: 'meta', text: state.kind === 'auto' ? `${metaText(e)} · ${new Date(e.created).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : metaText(e) }));
  const cb = el('input', { type: 'checkbox', 'aria-label': `Select ${name}`, checked: state.selected.has(e.id), onchange: (ev) => { ev.target.checked ? state.selected.add(e.id) : state.selected.delete(e.id); renderSelbar(); } });
  const restore = el('button', { type: 'button', class: 'restore', 'aria-label': `Restore ${name}`, text: 'Restore', onclick: () => restoreSession(e) });
  li.append(el('div', { class: 'head' }, cb, main, restore));
  if (open) li.append(details(e));
  return li;
}

function toggle(id) {
  state.open.has(id) ? state.open.delete(id) : state.open.add(id);
  renderList();
  document.querySelector(`.item[data-id="${CSS.escape(id)}"] .main`)?.focus();
}

// Details are built from the full session, loaded on demand.
function details(e) {
  const box = el('div', { class: 'details' }, el('p', { class: 'small muted', text: 'Loading…' }));
  getSession(e.id).then((s) => {
    if (!s) { box.replaceChildren(el('p', { class: 'small error', text: 'This session could not be read. "Export all" in Settings still includes its raw data.' }), actions(e, null)); return; }
    box.replaceChildren(actions(e, s), ...tabsView(s, box));
  });
  return box;
}

function actions(e, s) {
  const a = el('div', { class: 'actions' });
  if (e.kind === 'named') a.append(el('button', { type: 'button', text: 'Rename', onclick: () => startRename(e, a) }));
  if (e.kind === 'auto') {
    a.append(el('button', { type: 'button', text: 'Keep as saved session', onclick: () => keepSnapshot(e) }));
    a.append(el('button', { type: 'button', text: e.keep ? 'Unprotect' : 'Protect', title: 'Protected snapshots are not rotated out', onclick: () => protect(e) }));
  }
  if (s) {
    a.append(el('button', { type: 'button', text: 'Copy as Markdown', onclick: () => copyMarkdown(s) }));
    a.append(el('button', { type: 'button', text: 'Save as HTML', onclick: () => saveHtml(s) }));
  }
  a.append(el('button', { type: 'button', text: 'Delete', onclick: () => removeOne(e) }));
  return a;
}

function tabsView(s, box) {
  const out = [];
  let shown = 0;
  const limit = box.dataset.all ? Infinity : TAB_PAGE;
  s.windows.forEach((w, wi) => {
    if (s.windows.length > 1) {
      out.push(el('div', { class: 'win-h' }, `Window ${wi + 1} · ${plural(w.tabs.length, 'tab')}`,
        el('button', { type: 'button', text: 'Open this window', onclick: () => restoreSession({ ...summaryOf(s), id: s.id }, wi) })));
    }
    let ul = null;
    let current;
    for (const t of w.tabs) {
      if (shown >= limit) break;
      if (t.group !== current || !ul) {
        current = t.group;
        const g = t.group === undefined ? null : w.groups[t.group];
        if (g) out.push(el('div', { class: 'grp' }, el('span', { class: `gdot g-${g.color}`, 'aria-hidden': 'true' }), g.title || 'Unnamed group', g.collapsed ? el('span', { class: 'muted', text: ' (collapsed)' }) : null));
        ul = el('ul', { class: 'tl' + (g ? ' grouped' : '') });
        out.push(ul);
      }
      ul.append(el('li', {}, el('button', { type: 'button', title: `${t.title}\n${t.url}`, onclick: () => openTab(t.url) },
        t.pinned ? el('span', { class: 'pin', text: '📌', 'aria-label': 'pinned' }) : null, t.title || t.url, el('span', { class: 'host', text: host(t.url) }))));
      shown++;
    }
  });
  const total = s.windows.reduce((n, w) => n + w.tabs.length, 0);
  if (shown < total) out.push(el('button', { type: 'button', text: `Show all ${total} tabs`, onclick: () => { box.dataset.all = '1'; box.replaceChildren(actions(indexEntry(s.id), s), ...tabsView(s, box)); } }));
  return out;
}
const indexEntry = (id) => state.index[state.kind].find((x) => x.id === id);
const summaryOf = (s) => indexEntry(s.id) || { id: s.id, name: s.name, tabs: s.windows.reduce((n, w) => n + w.tabs.length, 0) };

function startRename(e, actionsBox) {
  const input = el('input', { type: 'text', value: e.name, maxlength: '120', 'aria-label': 'New name' });
  const done = async (commit) => {
    if (commit) {
      try { await renameSession(e.kind, e.id, input.value); status('Renamed.', { kind: 'ok' }); } catch (err) { status(err.message, { kind: 'error' }); }
    }
    await reload();
    document.querySelector(`.item[data-id="${CSS.escape(e.id)}"] .main`)?.focus();
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); done(true); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done(false); }
  });
  const form = el('div', { class: 'rename' }, input, el('button', { type: 'button', text: 'Save', onclick: () => done(true) }), el('button', { type: 'button', text: 'Cancel', onclick: () => done(false) }));
  actionsBox.before(form);
  input.focus();
  input.select();
}

// ---------- actions ----------
async function restoreSession(e, windowIndex, confirmed = false) {
  const n = windowIndex === undefined ? e.tabs : (await getSession(e.id))?.windows[windowIndex]?.tabs.length || 0;
  if (n > BIG_RESTORE && !confirmed) {
    status(`This opens ${n} tabs at once, which can slow the browser down for a while.`, { action: { label: `Open ${n} tabs`, run: () => restoreSession(e, windowIndex, true) }, ms: 0 });
    $('status').querySelector('button')?.focus();
    return;
  }
  status(`Opening ${windowIndex === undefined ? plural(e.tabs, 'tab') : `window ${windowIndex + 1}`}…`, { ms: 0 });
  // intoWindowId: if this window only has a New Tab page, the tabs open here instead of in an extra window.
  const r = await send({ type: 'restore', id: e.id, windowIndex, intoWindowId: state.windowId });
  // The popup usually closes when the new window takes focus; this is shown if it stays open.
  if (r?.ok) status(`Opened ${plural(r.opened, 'tab')}${r.failed ? `; ${r.failed} could not be opened by the browser` : ''}.`, { kind: r.failed ? '' : 'ok' });
  else status(r?.error || 'Could not restore this session.', { kind: 'error' });
}

async function openTab(url) {
  if (!state.pro) return proNeeded('Opening a single saved tab');
  const r = await send({ type: 'openTab', url, windowId: state.windowId, active: false });
  if (r?.ok) status('Opened in a new background tab.', { kind: 'ok' });
  else status(r?.error === 'pro_required' ? 'Opening a single tab is part of Pro.' : r?.error || 'Could not open this tab.', { kind: 'error' });
}

async function copyMarkdown(s) {
  if (!state.pro) return proNeeded('Markdown export');
  await navigator.clipboard.writeText(toMarkdown([s]));
  status('Copied the link list as Markdown.', { kind: 'ok' });
}
function saveHtml(s) {
  if (!state.pro) return proNeeded('HTML export');
  const blob = new Blob([toHtml([s], { title: s.name })], { type: 'text/html' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${s.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'session'}.html` });
  document.body.append(a);
  a.click();
  a.remove();
  status('HTML link list saved to your downloads.', { kind: 'ok' });
}

async function removeOne(e) {
  const s = await deleteSession(e.kind, e.id);
  state.open.delete(e.id);
  state.selected.delete(e.id);
  await reload();
  if (s) status(`Deleted "${e.kind === 'auto' ? REASON[e.reason] || e.name : e.name}".`, { action: { label: 'Undo', run: () => undo([s]) }, ms: 12000 });
  focusList();
}
async function removeSelected() {
  const ids = [...state.selected].filter((id) => indexEntry(id));
  const deleted = await deleteSessions(state.kind, ids);
  state.selected.clear();
  await reload();
  status(`Deleted ${plural(deleted.length, 'session')}.`, { action: { label: 'Undo', run: () => undo(deleted) }, ms: 12000 });
  focusList();
}
async function undo(list) {
  await undoDelete(list);
  await reload();
  status(`Restored ${plural(list.length, 'session')}.`, { kind: 'ok' });
}

async function merge() {
  if (!state.pro) return proNeeded('Merging sessions');
  const refs = [...state.selected].map((id) => indexEntry(id)).filter(Boolean);
  try {
    const e = await mergeInto(refs, $('name').value.trim());
    $('name').value = '';
    state.selected.clear();
    status(`Merged into "${e.name}" (${plural(e.tabs, 'tab')}).`, { kind: 'ok' });
    await switchKind('named');
  } catch (err) { status(err.message, { kind: 'error' }); }
}

async function keepSnapshot(e) {
  try {
    const n = await keepAsNamed(e.id);
    status(`Saved as "${n.name}".`, { kind: 'ok' });
    await reload();
  } catch (err) {
    if (err.code === 'limit') status(err.message, { kind: 'error', action: { label: 'See Pro', run: () => chrome.runtime.openOptionsPage() }, ms: 0 });
    else status(err.message, { kind: 'error' });
  }
}
async function protect(e) {
  await setProtected(e.id, !e.keep);
  await reload();
  status(e.keep ? 'Snapshot unprotected: it will rotate out normally.' : 'Snapshot protected: it will not be rotated out.', { kind: 'ok' });
}

function renderSelbar() {
  const n = [...state.selected].filter((id) => indexEntry(id)).length;
  $('selbar').hidden = n === 0;
  $('selcount').textContent = `${n} selected`;
  $('merge').disabled = n < 2;
  $('merge').title = state.pro ? 'Combine the selected sessions into one new saved session' : 'Pro: combine the selected sessions into one new saved session';
}

// ---------- tabs (Saved / Auto) ----------
async function switchKind(kind) {
  state.kind = kind;
  state.shown = PAGE;
  state.selected.clear();
  for (const k of ['named', 'auto']) {
    const b = $(`tab-${k}`);
    b.setAttribute('aria-selected', String(k === kind));
    b.tabIndex = k === kind ? 0 : -1;
  }
  $('panel').setAttribute('aria-labelledby', `tab-${kind}`);
  await reload();
}

async function reload() {
  const [named, auto] = await Promise.all([getIndex('named'), getIndex('auto')]);
  state.index = { named, auto };
  renderPlan();
  renderList();
}

function focusList() {
  (document.querySelector('#list .main') || $('q')).focus();
}

// ---------- keyboard ----------
document.addEventListener('keydown', (ev) => {
  const t = ev.target;
  if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (t.classList?.contains('main') || t.id === 'q')) {
    const mains = [...document.querySelectorAll('#list .main')];
    const i = mains.indexOf(t);
    const next = t.id === 'q' ? (ev.key === 'ArrowDown' ? mains[0] : null) : mains[i + (ev.key === 'ArrowDown' ? 1 : -1)] || (ev.key === 'ArrowUp' ? $('q') : null);
    if (next) { ev.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  }
  if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && t.getAttribute?.('role') === 'tab') {
    ev.preventDefault();
    const k = state.kind === 'named' ? 'auto' : 'named';
    switchKind(k).then(() => $(`tab-${k}`).focus());
  }
  if (ev.key === '/' && t.tagName !== 'INPUT') { ev.preventDefault(); $('q').focus(); }
});

$('q').addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('q').value) { ev.preventDefault(); $('q').value = ''; onSearch(); } });
let searchSeq = 0;
async function onSearch() {
  state.q = $('q').value.trim();
  state.shown = PAGE;
  renderList(); // names first, instantly
  if (state.q) {
    const seq = ++searchSeq;
    await loadSearchTexts();
    if (seq === searchSeq) renderList();
  }
}
$('q').addEventListener('input', onSearch);
$('name').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(false); } });
$('save-window').addEventListener('click', () => save(false));
$('save-all').addEventListener('click', () => save(true));
$('tab-named').addEventListener('click', () => switchKind('named'));
$('tab-auto').addEventListener('click', () => switchKind('auto'));
$('more').addEventListener('click', () => { state.shown += PAGE; renderList(); });
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('merge').addEventListener('click', merge);
$('del-sel').addEventListener('click', removeSelected);
$('sel-clear').addEventListener('click', () => { state.selected.clear(); renderList(); });

// Keep the list current when the service worker adds a snapshot while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[IDX.named] || changes[IDX.auto])) {
    state.texts.clear();
    if (changes[IDX[state.kind]]) reload();
    else { // only the other list changed (e.g. a snapshot was taken): don't re-render, so an open rename box survives
      for (const k of ['named', 'auto']) if (changes[IDX[k]]) getIndex(k).then((ix) => { state.index[k] = ix; $(`n-${k}`).textContent = `(${ix.length})`; renderPlan(); });
    }
  }
  if (area === 'sync' && changes.license) isPro().then((p) => { state.pro = p; renderPlan(); });
});

// ---------- init ----------
(async () => {
  state.windowId = params.has('window') ? Number(params.get('window')) : (await chrome.windows.getCurrent()).id;
  if (params.get('view') === 'auto') state.kind = 'auto';
  const [pro] = await Promise.all([isPro(), switchKind(state.kind), refreshCounts()]);
  state.pro = pro;
  renderPlan();
  // A delete from a popup that has since closed can still be undone.
  const trash = await getTrash();
  if (trash) {
    const one = trash.sessions.length === 1 ? trash.sessions[0] : null;
    status(`Deleted ${one ? `"${one.kind === 'auto' ? REASON[one.reason] || one.name : one.name}"` : plural(trash.sessions.length, 'session')} ${ago(trash.t)}.`, { action: { label: 'Undo', run: () => undo(trash.sessions) }, ms: 15000 });
  }
  document.body.dataset.ready = '1';
})();
