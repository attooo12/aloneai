// Local storage for sessions, snapshots and settings. Everything stays in chrome.storage.local on this device.
//
// Layout (chrome.storage.local, "unlimitedStorage"):
//   schema       -> SCHEMA_VERSION
//   idx:named    -> [summary]       saved sessions, oldest first (the popup shows newest first)
//   idx:auto     -> [summary]       automatic snapshots, oldest first; summary.keep = protected from rotation
//   s:<id>       -> session         one key per session, so a write never rewrites the other sessions
//   live         -> { t, ids, session }   last known state of all windows (source of "window closed" and
//                                   "previous browser session" snapshots)
//   settings     -> DEFAULT_SETTINGS patch
// A session and its index entry are always written in the same storage.set() call. Every mutation runs under
// one cross-context Web Lock ("tab-vault-store"), so the popup, options page and service worker never interleave.
import { isPro } from './license.js';
import { cleanSession, summarize, isValidIndexEntry, countTabs, fingerprint, mergeSessions, newId, SCHEMA_VERSION } from './schema.js';
import { FREE_SESSION_LIMIT, DEFAULT_SETTINGS, DROP_MIN, DROP_RATIO, PROTECTED_MAX } from './config.js';

export const IDX = { named: 'idx:named', auto: 'idx:auto' };
export const sKey = (id) => 's:' + id;
const local = () => chrome.storage.local;

export class ProRequiredError extends Error {
  constructor(message = 'This is part of Pro.', code = 'pro_required') { super(message); this.name = 'ProRequiredError'; this.code = code; }
}
export class EmptySessionError extends Error {
  constructor() { super('There are no tabs to save.'); this.name = 'EmptySessionError'; this.code = 'empty'; }
}

// ---------- locking ----------
const chains = {};
function lock(name, fn) {
  if (globalThis.navigator?.locks?.request) return navigator.locks.request(name, () => fn());
  const run = (chains[name] || Promise.resolve()).then(fn, fn); // fallback (tests in Node): per-context queue
  chains[name] = run.catch(() => {});
  return run;
}
export const withLock = (fn) => lock('tab-vault-store', fn);

// ---------- indexes ----------
// Reads an index. A missing index is empty; a damaged one (not an array, bad entries) is rebuilt from the s:* keys.
// readIndex is for use inside withLock(); getIndex is the public, lock-safe version.
async function rawIndex(kind) {
  const v = (await local().get(IDX[kind]))[IDX[kind]];
  if (v === undefined) return [];
  return Array.isArray(v) && v.every(isValidIndexEntry) ? v : null;
}
async function readIndex(kind) {
  return (await rawIndex(kind)) ?? (await rebuildIndexesLocked())[kind];
}
export async function getIndex(kind) {
  return (await rawIndex(kind)) ?? (await rebuildIndexes())[kind];
}

async function rebuildIndexesLocked() {
  const all = await local().get(null);
  const out = { named: [], auto: [] };
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('s:')) continue;
    const r = cleanSession(v);
    if (r.session && r.session.id === k.slice(2)) out[r.session.kind].push(summarize(r.session));
  }
  // Keep protected flags that survive in a damaged index, where possible.
  const oldAuto = Array.isArray(all[IDX.auto]) ? all[IDX.auto] : [];
  for (const e of out.auto) if (oldAuto.some((o) => o && o.id === e.id && o.keep)) e.keep = true;
  for (const list of Object.values(out)) list.sort((a, b) => a.created - b.created);
  await local().set({ [IDX.named]: out.named, [IDX.auto]: out.auto, schema: SCHEMA_VERSION });
  return out;
}
export const rebuildIndexes = () => withLock(rebuildIndexesLocked);

// Startup check: every index entry must have its session, every session key must be in an index.
export function checkIntegrity() {
  return withLock(async () => {
    const all = await local().get(null);
    const ok = (k) => Array.isArray(all[IDX[k]]) && all[IDX[k]].every(isValidIndexEntry);
    const indexed = new Set([...(ok('named') ? all[IDX.named] : []), ...(ok('auto') ? all[IDX.auto] : [])].map((e) => e.id));
    const keys = Object.keys(all).filter((k) => k.startsWith('s:')).map((k) => k.slice(2));
    const consistent = ok('named') || all[IDX.named] === undefined;
    const consistentA = ok('auto') || all[IDX.auto] === undefined;
    if (consistent && consistentA && keys.every((id) => indexed.has(id)) && [...indexed].every((id) => keys.includes(id))) return { repaired: false };
    const out = await rebuildIndexesLocked();
    return { repaired: true, named: out.named.length, auto: out.auto.length };
  });
}

// ---------- sessions ----------
// Returns the validated session, or null if it is missing or unreadable (the raw value is left untouched).
export async function getSession(id) {
  const got = await local().get(sKey(id));
  const r = cleanSession(got[sKey(id)]);
  return r.session && r.session.id === id ? r.session : null;
}
export async function getSessions(ids) {
  if (!ids.length) return [];
  const got = await local().get(ids.map(sKey));
  return ids.map((id) => { const r = cleanSession(got[sKey(id)]); return r.session && r.session.id === id ? r.session : null; });
}

export async function namedLimitReached() {
  return (await getIndex('named')).length >= FREE_SESSION_LIMIT && !(await isPro());
}

// Save a capture ({windows}) as a named session. Refuses empty captures; enforces the Free limit.
export function saveNamed(capture, name) {
  return withLock(async () => {
    const r = cleanSession({ ...capture, name, created: Date.now(), updated: Date.now() }, { kind: 'named', keepId: false });
    if (r.error) throw new EmptySessionError();
    const idx = await readIndex('named');
    if (idx.length >= FREE_SESSION_LIMIT && !(await isPro())) {
      throw new ProRequiredError(`The Free plan keeps ${FREE_SESSION_LIMIT} saved sessions. Delete one, or get Pro for unlimited sessions.`, 'limit');
    }
    const e = summarize(r.session);
    await local().set({ [sKey(e.id)]: r.session, [IDX.named]: [...idx, e] });
    return e;
  });
}

export function renameSession(kind, id, name) {
  return withLock(async () => {
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean) throw new Error('The name cannot be empty.');
    const idx = await readIndex(kind);
    const e = idx.find((x) => x.id === id);
    const s = await getSession(id);
    if (!e || !s) throw new Error('Session not found.');
    s.name = e.name = clean;
    s.updated = e.updated = Date.now();
    await local().set({ [sKey(id)]: s, [IDX[kind]]: idx });
    return e;
  });
}

// Deletes and returns the session, so the UI can offer "Undo".
export function deleteSession(kind, id) {
  return withLock(async () => {
    const idx = await readIndex(kind);
    const s = await getSession(id);
    const e = idx.find((x) => x.id === id);
    await local().set({ [IDX[kind]]: idx.filter((x) => x.id !== id) });
    await local().remove(sKey(id));
    if (s && e?.keep) s.keep = true;
    return s;
  });
}

// Puts a deleted session back (Undo). Not subject to the Free limit: it was already saved.
export function undoDelete(session) {
  return withLock(async () => {
    const r = cleanSession(session);
    if (r.error) throw new Error('Cannot undo: ' + r.error);
    const kind = r.session.kind;
    const idx = (await readIndex(kind)).filter((x) => x.id !== r.session.id);
    const e = summarize(r.session);
    if (session.keep) e.keep = true;
    idx.push(e);
    idx.sort((a, b) => a.created - b.created);
    await local().set({ [sKey(e.id)]: r.session, [IDX[kind]]: idx });
    return e;
  });
}

// Pro: merge several sessions (named or auto) into a new named session.
export async function mergeInto(refs, name) {
  if (!(await isPro())) throw new ProRequiredError('Merging sessions is part of Pro.');
  if (refs.length < 2) throw new Error('Select at least two sessions to merge.');
  const sessions = (await getSessions(refs.map((r) => r.id))).filter(Boolean);
  if (sessions.length < 2) throw new Error('Some of these sessions could not be read.');
  const r = mergeSessions(sessions, name);
  if (r.error) throw new EmptySessionError();
  return withLock(async () => {
    const idx = await readIndex('named');
    const e = summarize(r.session);
    await local().set({ [sKey(e.id)]: r.session, [IDX.named]: [...idx, e] });
    return e;
  });
}

// Import (free, never limited: getting your own data back must always work). Duplicates (same id and same
// content) are skipped; an id clash with different content gets a new id. Imported auto snapshots become named
// sessions, so the rolling rotation can't delete them. One storage.set() for everything.
export function importSessions(sessions) {
  return withLock(async () => {
    const named = await readIndex('named');
    const auto = await readIndex('auto');
    const byId = new Map([...named, ...auto].map((e) => [e.id, e]));
    const fps = new Set([...named, ...auto].map((e) => e.fp));
    const write = {};
    let added = 0, duplicates = 0;
    for (const s0 of sessions) {
      const r = cleanSession(s0);
      if (r.error) continue;
      const s = r.session;
      const fp = fingerprint(s);
      const same = byId.get(s.id);
      if ((same && same.fp === fp) || (!same && fps.has(fp) && [...byId.values()].some((e) => e.fp === fp && e.name === s.name))) { duplicates++; continue; }
      if (same || write[sKey(s.id)]) s.id = newId();
      if (s.kind === 'auto') {
        s.kind = 'named';
        s.name = s.name.startsWith('Auto') ? s.name : `Auto snapshot: ${s.name}`;
        delete s.reason; delete s.scope;
      }
      const e = summarize(s);
      named.push(e);
      byId.set(s.id, e);
      fps.add(fp);
      write[sKey(s.id)] = s;
      added++;
    }
    if (added) {
      named.sort((a, b) => a.created - b.created);
      write[IDX.named] = named;
      await local().set(write);
    }
    return { added, duplicates };
  });
}

// Everything, validated, for "Export all" and the scheduled backup. Unreadable stored values are included raw
// under `unreadable`, so a backup never silently loses data.
export async function exportAllData() {
  const all = await local().get(null);
  const sessions = [];
  const unreadable = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('s:')) continue;
    const r = cleanSession(v);
    if (r.session) sessions.push(r.session); else unreadable.push({ key: k, error: r.error, raw: v });
  }
  sessions.sort((a, b) => (a.kind === b.kind ? a.created - b.created : a.kind === 'named' ? -1 : 1));
  return { sessions, unreadable };
}

// ---------- automatic snapshots ----------
const REASON_LABEL = { periodic: 'Auto snapshot', 'window-closed': 'Closed window', 'previous-session': 'Previous browser session', manual: 'Snapshot' };

// Adds a rolling snapshot, with the guards:
//  - never store an empty snapshot (0 real tabs);
//  - skip a snapshot identical to the latest one of the same scope (an idle browser doesn't churn the rotation);
//  - if the tab count collapses (< DROP_RATIO of the last full snapshot, which had >= DROP_MIN real tabs), that
//    last good snapshot is marked protected and is not rotated out (crash, accidental "close all", etc.);
//  - rotation only ever removes the oldest unprotected snapshots beyond `autoKeep`.
export function addAutoSnapshot(capture, reason = 'periodic', scope = 'all', { now = Date.now() } = {}) {
  return withLock(async () => {
    const r = cleanSession({ ...capture, name: `${REASON_LABEL[reason] || 'Snapshot'}`, reason, scope, created: now, updated: now }, { kind: 'auto', keepId: false, now });
    if (r.error) return { skipped: 'empty' };
    const s = r.session;
    const c = countTabs(s);
    if (c.real === 0) return { skipped: 'empty' };
    const idx = await readIndex('auto');
    const e = summarize(s);
    const sameScope = idx.filter((x) => (x.scope || 'all') === scope);
    const latest = sameScope[sameScope.length - 1];
    if (latest && latest.fp === e.fp) return { skipped: 'unchanged', id: latest.id };
    if (scope === 'window' && sameScope.slice(-10).some((x) => x.fp === e.fp)) return { skipped: 'unchanged' };
    let protectedId = null;
    if (scope === 'all' && latest && (latest.real ?? latest.tabs) >= DROP_MIN && c.real < (latest.real ?? latest.tabs) * DROP_RATIO) {
      latest.keep = true;
      protectedId = latest.id;
    }
    idx.push(e);
    const { autoKeep } = await getSettings();
    const unprotected = idx.filter((x) => !x.keep);
    const kept = idx.filter((x) => x.keep);
    const evict = new Set([
      ...unprotected.slice(0, Math.max(0, unprotected.length - autoKeep)).map((x) => x.id),
      ...kept.slice(0, Math.max(0, kept.length - PROTECTED_MAX)).map((x) => x.id)
    ]);
    const next = idx.filter((x) => !evict.has(x.id));
    await local().set({ [sKey(s.id)]: s, [IDX.auto]: next });
    if (evict.size) await local().remove([...evict].map(sKey));
    return { added: e, evicted: evict.size, protectedId };
  });
}

// Pin / unpin an auto snapshot (protected snapshots are not rotated out).
export function setProtected(id, keep) {
  return withLock(async () => {
    const idx = await readIndex('auto');
    const e = idx.find((x) => x.id === id);
    if (!e) throw new Error('Snapshot not found.');
    if (keep) e.keep = true; else delete e.keep;
    await local().set({ [IDX.auto]: idx });
    return e;
  });
}

// Pro-free helper: turn an auto snapshot into a named session (counts toward the Free limit).
export async function keepAsNamed(id) {
  const s = await getSession(id);
  if (!s) throw new Error('Snapshot not found.');
  return saveNamed({ windows: s.windows }, `${s.name} ${new Date(s.created).toLocaleString()}`);
}

// ---------- live state ----------
export async function getLive() {
  const { live } = await local().get('live');
  if (!live || typeof live !== 'object') return null;
  const r = cleanSession(live.session || {});
  return r.session ? { t: live.t, ids: Array.isArray(live.ids) ? live.ids : [], session: r.session } : null;
}

// Stores the current state of all windows. Never replaces a non-empty state with an empty one: an empty capture
// happens while Chrome is shutting down or starting up, and is exactly the moment the old state is needed.
// On the first write after a browser start (chrome.storage.session is empty then), the previous state is first
// archived as a "Previous browser session" snapshot.
export async function archivePreviousSession() {
  return lock('tab-vault-boot', async () => {
    if ((await chrome.storage.session.get('booted')).booted) return { skipped: 'already' };
    const prev = await getLive();
    const res = prev ? await addAutoSnapshot({ windows: prev.session.windows }, 'previous-session', 'all') : { skipped: 'none' };
    await chrome.storage.session.set({ booted: true });
    return res;
  });
}
export async function updateLive(capture, ids = []) {
  await archivePreviousSession();
  return withLock(async () => {
    const r = cleanSession({ ...capture, name: 'live' }, { kind: 'named', keepId: false });
    const real = r.session ? countTabs(r.session).real : 0;
    if (real === 0) {
      const prev = await getLive();
      if (prev && countTabs(prev.session).real > 0) return { skipped: 'empty' };
    }
    await local().set({ live: { t: Date.now(), ids, session: r.session || null } });
    return { saved: real };
  });
}

// ---------- settings ----------
export async function getSettings() {
  const { settings } = await local().get('settings');
  const s = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) };
  s.autoMinutes = Math.min(60, Math.max(1, Number(s.autoMinutes) || DEFAULT_SETTINGS.autoMinutes));
  s.autoKeep = Math.min(200, Math.max(3, Number(s.autoKeep) || DEFAULT_SETTINGS.autoKeep));
  if (!['off', 'daily', 'weekly'].includes(s.backup)) s.backup = 'off';
  return s;
}
export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await local().set({ settings: next });
  return next;
}
