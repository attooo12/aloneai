// Pure helpers (no chrome.* calls): site matching, validation, JSON and Netscape cookies.txt import/export.
// Cookie objects use Chrome's chrome.cookies.Cookie shape:
//   { name, value, domain, hostOnly, path, secure, httpOnly, sameSite, session, expirationDate?, storeId?, partitionKey? }

export const SAMESITE = ['unspecified', 'no_restriction', 'lax', 'strict'];
export const SAMESITE_LABEL = { unspecified: 'Not set', no_restriction: 'None', lax: 'Lax', strict: 'Strict' };

// Common two-label public suffixes (a full Public Suffix List isn't bundled). Only used to avoid asking for
// permission on e.g. "co.uk"; which cookies apply is always decided by appliesToHost().
const SUFFIX2 = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'co.in', 'co.za', 'co.id', 'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'com.tw', 'com.hk', 'com.sg', 'com.my', 'com.ph', 'com.vn', 'com.pl', 'com.ua', 'co.il', 'github.io', 'herokuapp.com', 'vercel.app', 'netlify.app', 'pages.dev', 'web.app', 'firebaseapp.com', 'appspot.com', 'blogspot.com']);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const bare = (d) => String(d || '').replace(/^\./, '').toLowerCase();

// Shortest domain (at least two labels, or the host itself for IPs / single-label hosts) whose cookies may apply
// to `host`. One chrome.cookies.getAll({domain}) with it returns a superset of everything that applies.
export function baseDomain(host) {
  host = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (IPV4.test(host) || host.includes(':')) return host;
  const labels = host.split('.');
  const n = labels.length > 2 && SUFFIX2.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.length <= n ? host : labels.slice(-n).join('.');
}

// Every domain from the host itself up to its two-label parent, e.g. sub.a.test -> [sub.a.test, a.test].
export function parentDomains(host) {
  host = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (IPV4.test(host) || host.includes(':')) return [host];
  const base = baseDomain(host);
  const labels = host.split('.');
  const out = [];
  for (let i = 0; i < labels.length; i++) { const d = labels.slice(i).join('.'); out.push(d); if (d === base) break; }
  return out;
}

// Would the browser send cookie `c` to some page on `host` (ignoring path and Secure)?
export function appliesToHost(c, host) {
  const d = bare(c.domain);
  host = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (!d) return false;
  if (c.hostOnly) return d === host;
  return host === d || host.endsWith('.' + d);
}

export function cookieUrl(c) {
  return (c.secure ? 'https' : 'http') + '://' + bare(c.domain) + (c.path || '/');
}
export const partitionSite = (c) => (c.partitionKey && c.partitionKey.topLevelSite) || '';
export const cookieKey = (c) => [c.storeId || '', partitionSite(c), String(c.domain).toLowerCase(), c.path || '/', c.name].join('|');
// Protection is per (domain, path, name), independent of cookie store / partition.
export const protectKey = (c) => [String(c.domain).toLowerCase(), c.path || '/', c.name].join('|');

export function sortCookies(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name) || bare(a.domain).localeCompare(bare(b.domain)) || (a.path || '').localeCompare(b.path || ''));
}

export function filterCookies(list, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.name.toLowerCase().includes(q) || String(c.value).toLowerCase().includes(q) || String(c.domain).toLowerCase().includes(q));
}

function normSameSite(v) {
  if (v === undefined || v === null || v === '') return 'unspecified';
  const s = String(v).toLowerCase().replace(/[\s-]/g, '_');
  if (s === 'none' || s === 'no_restriction') return 'no_restriction';
  if (s === 'lax' || s === 'strict' || s === 'unspecified') return s;
  return null;
}
const bool = (v) => v === true || v === 'true' || v === 'TRUE' || v === 1;
const BAD_NAME = /[\x00-\x1f\x7f;=]/;
const BAD_VALUE = /[\x00-\x08\x0a-\x1f\x7f;]/;
const DOMAIN_RE = /^\.?([a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*\.?$/i;

// Validate/normalise one cookie from any supported source (editor form, our JSON, other editors' JSON arrays,
// Playwright/Puppeteer storage state). Returns { cookie } or { error }.
export function normalizeCookie(o, { now = Date.now() / 1000, defaultDomain = '' } = {}) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'not a cookie object' };
  const name = o.name;
  if (typeof name !== 'string') return { error: 'missing "name"' };
  if (BAD_NAME.test(name)) return { error: `name "${name.slice(0, 40)}" contains ; = or control characters` };
  const value = o.value === undefined || o.value === null ? '' : typeof o.value === 'number' || typeof o.value === 'boolean' ? String(o.value) : o.value;
  if (typeof value !== 'string') return { error: `"${name}": value must be text` };
  if (BAD_VALUE.test(value)) return { error: `"${name}": value contains ; or control characters` };
  if (!name && !value) return { error: 'cookie has neither a name nor a value' };
  let domain = typeof o.domain === 'string' && o.domain.trim() ? o.domain.trim().toLowerCase() : defaultDomain.toLowerCase();
  if (!domain) return { error: `"${name}": missing "domain"` };
  if (!DOMAIN_RE.test(domain) && !IPV4.test(domain)) return { error: `"${name}": invalid domain "${domain}"` };
  domain = domain.replace(/\.$/, '');
  const hostOnly = typeof o.hostOnly === 'boolean' ? o.hostOnly : !domain.startsWith('.');
  domain = hostOnly ? bare(domain) : '.' + bare(domain);
  const path = o.path === undefined || o.path === null || o.path === '' ? '/' : String(o.path);
  if (!path.startsWith('/') || /[\x00-\x1f;]/.test(path)) return { error: `"${name}": path must start with "/"` };
  let exp = o.expirationDate ?? o.expires ?? o.expiry;
  if (typeof exp === 'string' && exp.trim() !== '') exp = /^\d+(\.\d+)?$/.test(exp.trim()) ? Number(exp) : Date.parse(exp) / 1000;
  if (exp === '' || exp === null || exp === undefined || exp === -1 || exp === 0) exp = undefined;
  if (exp !== undefined && (typeof exp !== 'number' || !Number.isFinite(exp) || exp < 0)) return { error: `"${name}": invalid expiry` };
  if (exp !== undefined && exp > 1e11) exp = exp / 1000; // milliseconds -> seconds
  const session = o.session === true || exp === undefined;
  if (!session && exp <= now) return { error: `"${name}": already expired`, expired: true };
  const sameSite = normSameSite(o.sameSite);
  if (!sameSite) return { error: `"${name}": invalid sameSite "${o.sameSite}"` };
  const secure = bool(o.secure);
  let pk = o.partitionKey;
  if (typeof pk === 'string') pk = pk ? { topLevelSite: pk } : undefined;
  if (pk && (typeof pk !== 'object' || (pk.topLevelSite !== undefined && typeof pk.topLevelSite !== 'string'))) return { error: `"${name}": invalid partitionKey` };
  if (pk && !pk.topLevelSite) pk = undefined;
  if (pk && !/^https?:\/\/[^/]+$/.test(pk.topLevelSite)) return { error: `"${name}": partition site must look like https://example.com` };
  if (sameSite === 'no_restriction' && !secure) return { error: `"${name}": SameSite=None requires Secure` };
  if (pk && !secure) return { error: `"${name}": partitioned cookies require Secure` };
  if (/^__(Secure|Host)-/.test(name) && !secure) return { error: `"${name}": __Secure-/__Host- cookies require Secure` };
  const cookie = { name, value, domain, hostOnly, path, secure, httpOnly: bool(o.httpOnly), sameSite, session };
  if (!session) cookie.expirationDate = exp;
  if (pk) cookie.partitionKey = { topLevelSite: pk.topLevelSite, ...(typeof pk.hasCrossSiteAncestor === 'boolean' ? { hasCrossSiteAncestor: pk.hasCrossSiteAncestor } : {}) };
  if (typeof o.storeId === 'string' && o.storeId) cookie.storeId = o.storeId;
  return { cookie };
}

// Details for chrome.cookies.set().
export function toSetDetails(c, storeId) {
  const d = { url: cookieUrl(c), name: c.name, value: c.value, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly };
  if (!c.hostOnly) d.domain = bare(c.domain);
  if (!c.session && c.expirationDate) d.expirationDate = c.expirationDate;
  if (c.sameSite && c.sameSite !== 'unspecified') d.sameSite = c.sameSite;
  if (c.partitionKey && c.partitionKey.topLevelSite) d.partitionKey = { ...c.partitionKey };
  if (storeId) d.storeId = storeId;
  return d;
}

// JSON export: a plain array of cookie objects in the widely used browser-extension format (Chrome's own cookie
// shape), so files can be imported by other cookie editors and back into this one.
export function toExportJSON(cookies) {
  return cookies.map((c) => {
    const o = { domain: c.domain };
    if (!c.session && c.expirationDate) o.expirationDate = c.expirationDate;
    Object.assign(o, { hostOnly: !!c.hostOnly, httpOnly: !!c.httpOnly, name: c.name, path: c.path || '/', sameSite: c.sameSite || 'unspecified', secure: !!c.secure, session: !!c.session, storeId: c.storeId || '0', value: c.value });
    if (c.partitionKey && c.partitionKey.topLevelSite) o.partitionKey = { ...c.partitionKey };
    return o;
  });
}

export function toNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', '# Exported by Cookie Crate. This file contains login sessions: treat it like a password.', ''];
  for (const c of cookies) {
    const domain = c.hostOnly ? bare(c.domain) : '.' + bare(c.domain);
    lines.push([(c.httpOnly ? '#HttpOnly_' : '') + domain, c.hostOnly ? 'FALSE' : 'TRUE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate), c.name, c.value].join('\t'));
  }
  return lines.join('\n') + '\n';
}

function parseNetscape(text) {
  const raw = [];
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) { httpOnly = true; line = line.slice(10); }
    if (!line.trim() || line.startsWith('#')) return;
    let f = line.split('\t');
    if (f.length < 6) f = line.trim().split(/\s+/);
    if (f.length < 6) { problems.push(`line ${i + 1}: expected 7 tab-separated fields`); return; }
    const [domain, sub, path, secure, expiry, name, ...rest] = f;
    const include = String(sub).toUpperCase() === 'TRUE';
    raw.push({ _line: i + 1, domain: include ? '.' + bare(domain) : bare(domain), hostOnly: !include, path, secure: String(secure).toUpperCase() === 'TRUE', expirationDate: Number(expiry) || undefined, name, value: rest.join('\t'), httpOnly });
  });
  return { raw, problems };
}

// Parse an import file (JSON array, {cookies:[...]} object, or Netscape cookies.txt).
// Returns { format, cookies, problems, expired } or { error }.
export function parseImport(text, opts = {}) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'The file is empty.' };
  const t = text.trim().replace(/^﻿/, '');
  let raw;
  let format;
  let problems = [];
  if (t[0] === '[' || t[0] === '{') {
    let data;
    try { data = JSON.parse(t); } catch (e) { return { error: 'This is not valid JSON: ' + e.message }; }
    if (Array.isArray(data)) raw = data;
    else if (data && Array.isArray(data.cookies)) raw = data.cookies;
    else return { error: 'Expected a JSON array of cookies (or an object with a "cookies" array).' };
    format = 'json';
  } else {
    ({ raw, problems } = parseNetscape(t));
    format = 'netscape';
    if (!raw.length && !problems.length) return { error: 'No cookies found. Expected JSON or a Netscape cookies.txt file.' };
  }
  const cookies = [];
  const seen = new Set();
  let expired = 0;
  raw.forEach((o, i) => {
    const r = normalizeCookie(o, opts);
    const where = format === 'netscape' ? `line ${o._line}` : `#${i + 1}`;
    if (r.expired) { expired++; return; }
    if (r.error) { problems.push(`${where}: ${r.error}`); return; }
    const k = cookieKey({ ...r.cookie, storeId: '' });
    if (seen.has(k)) { problems.push(`${where}: duplicate of an earlier cookie, skipped`); return; }
    seen.add(k);
    cookies.push(r.cookie);
  });
  if (!cookies.length) return { error: expired && !problems.length ? `All ${expired} cookies in the file have already expired.` : 'No valid cookies in the file.', problems, expired };
  return { format, cookies, problems, expired };
}

export function formatExpiry(c) {
  if (c.session || !c.expirationDate) return 'Session';
  return new Date(c.expirationDate * 1000).toLocaleString();
}
// <input type="datetime-local"> value (local time) <-> seconds since epoch
export function toLocalInput(sec) {
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (s) => { const t = new Date(s).getTime(); return Number.isFinite(t) ? t / 1000 : NaN; };
