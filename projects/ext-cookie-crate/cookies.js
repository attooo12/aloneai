// chrome.* operations: cookies, host permissions, page storage (via chrome.scripting), protection, profiles.
import { baseDomain, parentDomains, appliesToHost, cookieUrl, cookieKey, protectKey, sortCookies, toSetDetails, normalizeCookie } from './cookielib.js';

// ---------- host permissions ----------
// The cookies API only returns/changes cookies for hosts the extension has host permission for (activeTab is not
// enough, see README). We ask for the tab's host and its parent domains, so parent-domain cookies (.example.com) work.
export function originsForHost(host) {
  return parentDomains(host).map((d) => `*://${d.includes(':') ? `[${d}]` : d}/*`);
}
export const ALL_SITES = ['<all_urls>'];
export const hasOrigins = (origins) => chrome.permissions.contains({ origins }).catch(() => false);
export const requestOrigins = (origins) => chrome.permissions.request({ origins }).catch(() => false);

// ---------- cookies ----------
async function getAll(details) {
  // partitionKey: {} returns partitioned (CHIPS) cookies from every partition as well as unpartitioned ones.
  try { return await chrome.cookies.getAll({ ...details, partitionKey: {} }); } catch { return chrome.cookies.getAll(details); }
}
export async function storeIdForTab(tabId) {
  const stores = await chrome.cookies.getAllCookieStores();
  return (stores.find((s) => s.tabIds.includes(tabId)) || stores[0] || {}).id;
}
// Every cookie the browser could send to any page of `host` (all paths, Secure or not, parent domains, partitions).
export async function siteCookies(host, storeId) {
  const out = new Map();
  for (const c of await getAll({ domain: baseDomain(host), ...(storeId ? { storeId } : {}) })) if (appliesToHost(c, host)) out.set(cookieKey(c), c);
  return sortCookies([...out.values()]);
}
export async function allCookies() {
  const out = [];
  for (const s of await chrome.cookies.getAllCookieStores()) out.push(...(await getAll({ storeId: s.id })));
  return sortCookies(out);
}

export async function setCookie(c, storeId = c.storeId) {
  let r;
  try { r = await chrome.cookies.set(toSetDetails(c, storeId)); } catch (e) { throw new Error(e.message || String(e)); }
  if (!r) throw new Error(chrome.runtime.lastError?.message || 'Chrome refused this cookie (check domain, Secure and SameSite).');
  return r;
}

// chrome.cookies.remove() works by URL + name, which can also hit a same-named cookie on a parent domain or
// shorter path. Take a snapshot first and put back anything that was removed collaterally.
export async function removeCookie(c) {
  const url = cookieUrl(c);
  const sid = c.storeId ? { storeId: c.storeId } : {};
  const before = (await getAll({ url, name: c.name, ...sid })).filter((x) => cookieKey(x) !== cookieKey(c));
  await chrome.cookies.remove({ url, name: c.name, ...sid, ...(c.partitionKey ? { partitionKey: c.partitionKey } : {}) });
  const after = new Set((await getAll({ url, name: c.name, ...sid })).map(cookieKey));
  for (const x of before) if (!after.has(cookieKey(x))) await setCookie(x).catch(() => {});
}

// Replace `oldC` by `newC` (a changed name/domain/path/partition means a different cookie, so remove the old one).
export async function saveCookie(newC, oldC, storeId) {
  const set = await setCookie(newC, storeId);
  if (oldC && cookieKey({ ...oldC, storeId: '' }) !== cookieKey({ ...set, storeId: '' })) await removeCookie(oldC);
  return set;
}

export async function getProtected() {
  const { protected: p } = await chrome.storage.local.get('protected');
  return new Set(Array.isArray(p) ? p : []);
}
export async function setProtected(c, on) {
  const p = await getProtected();
  if (on) p.add(protectKey(c)); else p.delete(protectKey(c));
  await chrome.storage.local.set({ protected: [...p] });
  return p;
}

// Delete every cookie that applies to the site, except protected ones.
export async function deleteAll(cookies) {
  const prot = await getProtected();
  let deleted = 0;
  let kept = 0;
  for (const c of cookies) {
    if (prot.has(protectKey(c))) { kept++; continue; }
    await removeCookie(c);
    deleted++;
  }
  return { deleted, kept };
}

// Import validated cookies. If `host` is given, only cookies that apply to it are imported.
export async function importCookies(cookies, { host, storeId } = {}) {
  let added = 0;
  const skipped = [];
  const failed = [];
  for (const c of cookies) {
    if (host && !appliesToHost(c, host)) { skipped.push(`${c.name} (${c.domain})`); continue; }
    try { await setCookie(c, storeId || c.storeId); added++; } catch (e) { failed.push(`${c.name} (${c.domain}): ${e.message}`); }
  }
  return { added, skipped, failed };
}

// ---------- localStorage / sessionStorage of the tab (top frame) ----------
function pageStorageOp(op) {
  try {
    const areas = { local: localStorage, session: sessionStorage };
    if (op.type === 'write') {
      const s = areas[op.area];
      if (op.clear) s.clear();
      for (const k of op.remove || []) s.removeItem(k);
      for (const [k, v] of op.set || []) s.setItem(k, v);
    }
    const dump = (s) => { const o = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); o.push([k, s.getItem(k)]); } return o.sort((a, b) => a[0].localeCompare(b[0])); };
    return { local: dump(localStorage), session: dump(sessionStorage), origin: location.origin };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}
async function runInTab(tabId, op) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: pageStorageOp, args: [op] });
  if (!r || !r.result) throw new Error('The page did not answer.');
  if (r.result.error) throw new Error(r.result.error);
  return r.result;
}
export const readStorage = (tabId) => runInTab(tabId, { type: 'read' });
export const writeStorage = (tabId, area, { set, remove, clear } = {}) => runInTab(tabId, { type: 'write', area, set, remove, clear });

// ---------- profiles (Pro): a named snapshot of a site's cookies + storage ----------
export async function getProfiles() {
  const { profiles } = await chrome.storage.local.get('profiles');
  return profiles && typeof profiles === 'object' ? profiles : {};
}
const profileId = (host, name) => host + '\n' + name;
export async function saveProfile(name, host, tabId, storeId) {
  const cookies = await siteCookies(host, storeId);
  let storage = { local: [], session: [] };
  try { storage = await readStorage(tabId); } catch { /* pages like the new tab page have no storage */ }
  const profiles = await getProfiles();
  profiles[profileId(host, name)] = { name, host, savedAt: Date.now(), cookies, local: storage.local, session: storage.session };
  await chrome.storage.local.set({ profiles });
  return profiles[profileId(host, name)];
}
export async function deleteProfile(host, name) {
  const profiles = await getProfiles();
  delete profiles[profileId(host, name)];
  await chrome.storage.local.set({ profiles });
}
// Switch the site to a profile: delete its (unprotected) cookies, set the profile's cookies, replace storage.
export async function applyProfile(p, tabId, storeId) {
  const del = await deleteAll(await siteCookies(p.host, storeId));
  const now = Date.now() / 1000;
  const valid = [];
  let expired = 0;
  for (const c of p.cookies) { const r = normalizeCookie(c, { now }); if (r.cookie) valid.push(r.cookie); else if (r.expired) expired++; }
  const imp = await importCookies(valid, { host: p.host, storeId });
  let storageOk = true;
  try {
    await writeStorage(tabId, 'local', { clear: true, set: p.local || [] });
    await writeStorage(tabId, 'session', { clear: true, set: p.session || [] });
  } catch { storageOk = false; }
  return { ...imp, deleted: del.deleted, kept: del.kept, expired, storageOk };
}
