import { isPro } from './license.js';
import { normalizeCookie, parseImport, toExportJSON, toNetscape, filterCookies, appliesToHost, cookieKey, protectKey, partitionSite, formatExpiry, toLocalInput, fromLocalInput, SAMESITE, SAMESITE_LABEL } from './cookielib.js';
import { originsForHost, hasOrigins, requestOrigins, storeIdForTab, siteCookies, saveCookie, removeCookie, getProtected, setProtected, deleteAll, importCookies, readStorage, writeStorage, getProfiles, saveProfile, deleteProfile, applyProfile } from './cookies.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k !== null && k !== undefined)); return e; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const stamp = () => new Date().toISOString().slice(0, 10);

let tab;
let host = '';
let storeId;
let pro = false;
let cookies = [];
let prot = new Set();
let openKey = null; // cookie being edited ('' = new cookie)
let storage = { local: [], session: [] };
let openSKey = null;

function say(id, text, kind = '') { const s = $(id); s.className = 'status ' + kind; s.replaceChildren(...[].concat(text)); }
function download(text, type, name) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = el('textarea', { value: text }); document.body.append(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}
// Two-step confirmation for destructive buttons (no modal dialogs in popups).
function armed(btn, label, fn) {
  const orig = btn.textContent;
  btn.addEventListener('click', async () => {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; await fn(); return; }
    btn.dataset.armed = '1'; btn.textContent = label();
    setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; } }, 5000);
  });
}

// ---------- startup ----------
async function init() {
  const tabId = Number(new URLSearchParams(location.search).get('tabId'));
  tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  pro = await isPro();
  $('plan').textContent = pro ? 'Pro' : 'Free';
  $('plan').classList.toggle('pro', pro);
  let url;
  try { url = new URL(tab.url); } catch { url = null; }
  if (!url || !/^https?:$/.test(url.protocol) || url.hostname === 'chromewebstore.google.com' || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) { $('unsupported').hidden = false; return; }
  host = url.hostname;
  $('host').textContent = host; $('host').title = url.origin;
  const origins = originsForHost(host);
  if (!(await hasOrigins(origins))) {
    $('noaccess').hidden = false;
    $('grant-origins').textContent = `The browser will ask to allow: ${origins.map((o) => o.replace('*://', '').replace('/*', '')).join(', ')} (the site and its parent domains, whose cookies also apply here). Nothing else. You can revoke it any time in your browser's extensions settings. If this popup closes while the browser asks, just open it again.`;
    $('grant').onclick = async () => {
      if (await requestOrigins(origins)) { $('noaccess').hidden = true; await start(); } else $('noaccess-msg').textContent = 'Access was not granted, so Cookie Crate cannot show this site\'s cookies.';
    };
    return;
  }
  await start();
}
async function start() {
  storeId = await storeIdForTab(tab.id);
  $('main').hidden = false;
  if (!pro) { $('p-save').disabled = true; $('p-name').disabled = true; }
  await loadCookies();
  document.body.dataset.ready = '1';
}

// ---------- tabs ----------
const tabs = ['cookies', 'storage', 'profiles'];
function selectTab(name) {
  for (const t of tabs) {
    const b = $('tab-' + t); const on = t === name;
    b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; $('view-' + t).hidden = !on;
  }
  if (name === 'storage') loadStorage();
  if (name === 'profiles') loadProfiles();
}
for (const t of tabs) {
  $('tab-' + t).addEventListener('click', () => selectTab(t));
  $('tab-' + t).addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = tabs[(tabs.indexOf(t) + d + tabs.length) % tabs.length];
    selectTab(next); $('tab-' + next).focus();
  });
}
$('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ---------- cookies ----------
async function loadCookies() {
  [cookies, prot] = await Promise.all([siteCookies(host, storeId), getProtected()]);
  renderCookies();
}
function renderCookies() {
  const shown = filterCookies(cookies, $('q').value);
  $('count').textContent = `(${cookies.length})`;
  const items = [];
  if (openKey === '') items.push(cookieItem(null));
  for (const c of shown) items.push(cookieItem(c));
  $('list').replaceChildren(...items);
  $('empty').hidden = cookies.length > 0 || openKey === '';
  $('empty').textContent = 'No cookies for this site.';
  if (cookies.length && !shown.length) { $('empty').hidden = false; $('empty').textContent = 'No cookies match the filter.'; }
}
function cookieItem(c) {
  const key = c ? cookieKey(c) : '';
  const isOpen = openKey === key;
  const locked = c && prot.has(protectKey(c));
  const li = el('li', { className: 'item' });
  li.dataset.name = c ? c.name : '';
  li.dataset.domain = c ? c.domain : '';
  if (c) {
    const head = el('button', { type: 'button', className: 'head' },
      locked ? el('span', { className: 'lock', title: 'Protected: never deleted by "Delete all"', textContent: '🔒' }) : null,
      el('span', { className: 'nm mono', textContent: c.name || '(no name)' }),
      el('span', { className: 'val mono', textContent: c.value }),
      partitionSite(c) ? el('span', { className: 'badge', textContent: 'partitioned', title: 'Partitioned (CHIPS) under ' + partitionSite(c) }) : null,
      el('span', { className: 'dom', textContent: c.domain + (c.path !== '/' ? c.path : '') }));
    head.setAttribute('aria-expanded', isOpen);
    head.setAttribute('aria-label', `${locked ? 'Protected cookie ' : 'Cookie '}${c.name} on ${c.domain}${c.path}`);
    head.addEventListener('click', () => { openKey = isOpen ? null : key; renderCookies(); if (!isOpen) document.querySelector('.editor [name=value]')?.focus(); });
    li.append(head);
  }
  if (isOpen) li.append(editor(c, locked));
  return li;
}
function field(label, input) { const id = 'f-' + input.name; input.id = id; return [el('label', { htmlFor: id, textContent: label }), input]; }
function editor(c, locked) {
  const isNew = !c;
  c = c || { name: '', value: '', domain: host, hostOnly: true, path: '/', secure: false, httpOnly: false, sameSite: 'lax', session: false, expirationDate: Date.now() / 1000 + 365 * 86400 };
  const form = el('form', { className: 'editor' });
  const f = {
    name: el('input', { type: 'text', name: 'name', value: c.name, className: 'mono', spellcheck: false }),
    value: el('textarea', { name: 'value', value: c.value, className: 'mono', spellcheck: false }),
    domain: el('input', { type: 'text', name: 'domain', value: c.hostOnly ? c.domain : c.domain.replace(/^\./, '.'), className: 'mono', spellcheck: false }),
    path: el('input', { type: 'text', name: 'path', value: c.path, className: 'mono' }),
    expires: el('input', { type: 'datetime-local', name: 'expires', value: c.session ? '' : toLocalInput(c.expirationDate) }),
    session: el('input', { type: 'checkbox', name: 'session', checked: !!c.session }),
    hostOnly: el('input', { type: 'checkbox', name: 'hostOnly', checked: !!c.hostOnly }),
    secure: el('input', { type: 'checkbox', name: 'secure', checked: !!c.secure }),
    httpOnly: el('input', { type: 'checkbox', name: 'httpOnly', checked: !!c.httpOnly }),
    sameSite: el('select', { name: 'sameSite' }, ...SAMESITE.map((s) => el('option', { value: s, textContent: SAMESITE_LABEL[s], selected: s === (c.sameSite || 'unspecified') }))),
    partition: el('input', { type: 'text', name: 'partition', value: partitionSite(c), className: 'mono', placeholder: 'Not partitioned (e.g. https://example.com)' })
  };
  for (const input of Object.values(f)) input.id = 'f-' + input.name;
  f.expires.disabled = f.session.checked;
  f.session.addEventListener('change', () => { f.expires.disabled = f.session.checked; if (!f.session.checked && !f.expires.value) f.expires.value = toLocalInput(Date.now() / 1000 + 365 * 86400); });
  const chk = (input, label) => el('label', {}, input, label);
  const err = el('div', { className: 'err small error', role: 'alert' });
  form.append(...field('Name', f.name), ...field('Value', f.value), ...field('Domain', f.domain), ...field('Path', f.path),
    ...field('Expires', f.expires),
    el('span'), el('div', { className: 'checks' }, chk(f.session, 'Session (deleted when the browser closes)')),
    el('span', { className: 'small muted', textContent: 'Flags' }), el('div', { className: 'checks' }, chk(f.hostOnly, 'Host only'), chk(f.secure, 'Secure'), chk(f.httpOnly, 'HttpOnly')),
    ...field('SameSite', f.sameSite), ...field('Partition', f.partition), err);
  if (!isNew) form.append(el('span', { className: 'small muted', textContent: 'Store' }), el('span', { className: 'small muted mono', textContent: `${c.storeId || ''} · ${formatExpiry(c)}` }));
  const btn = (text, fn, cls = '') => { const b = el('button', { type: 'button', textContent: text, className: cls }); b.addEventListener('click', fn); return b; };
  const save = el('button', { type: 'submit', className: 'primary', textContent: isNew ? 'Add cookie' : 'Save' });
  const btns = el('div', { className: 'btns' }, save);
  if (!isNew) {
    btns.append(btn('Copy value', async () => say('status', (await copy(c.value)) ? `Copied the value of "${c.name}".` : 'Copy failed.', 'ok')));
    const del = btn('Delete', async () => { await removeCookie(c); openKey = null; say('status', `Deleted "${c.name}".`, 'ok'); await loadCookies(); }, 'danger');
    if (locked) { del.disabled = true; del.title = 'Protected. Unprotect it first.'; }
    btns.append(del);
    btns.append(btn(locked ? 'Unprotect' : 'Protect 🔒', async () => {
      if (!pro) { say('status', ['Protected cookies are part of Pro. ', optionsLink()], 'error'); return; }
      prot = await setProtected(c, !locked);
      say('status', locked ? `"${c.name}" is no longer protected.` : `"${c.name}" is protected: "Delete all" and profile switches will keep it.`, 'ok');
      renderCookies();
    }));
  }
  btns.append(btn('Cancel', () => { openKey = null; renderCookies(); }));
  form.append(btns);
  form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); openKey = null; renderCookies(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.session.checked && !f.expires.value) { err.textContent = 'Set an expiry date or tick "Session".'; return; }
    let domain = f.domain.value.trim().toLowerCase();
    // The date field has minute precision: keep the exact original expiry unless it was changed. Likewise keep the
    // full partition key (incl. hasCrossSiteAncestor) unless the partition site was changed.
    const expires = !isNew && !c.session && !f.session.checked && f.expires.value === toLocalInput(c.expirationDate) ? c.expirationDate : fromLocalInput(f.expires.value);
    const part = f.partition.value.trim();
    const partitionKey = !part ? undefined : !isNew && part === partitionSite(c) ? c.partitionKey : part;
    if (!f.hostOnly.checked && !domain.startsWith('.')) domain = '.' + domain;
    const r = normalizeCookie({
      name: f.name.value, value: f.value.value, domain, hostOnly: f.hostOnly.checked, path: f.path.value.trim(),
      secure: f.secure.checked, httpOnly: f.httpOnly.checked, sameSite: f.sameSite.value, session: f.session.checked,
      expirationDate: f.session.checked ? undefined : expires, partitionKey
    });
    if (r.error) { err.textContent = r.error; return; }
    if (!appliesToHost(r.cookie, host)) { err.textContent = `The domain must be ${host} or one of its parent domains.`; return; }
    try {
      await saveCookie(r.cookie, isNew ? null : c, storeId);
      if (!isNew && prot.has(protectKey(c)) && protectKey(c) !== protectKey(r.cookie)) { await setProtected(c, false); await setProtected(r.cookie, true); }
    } catch (x) { err.textContent = x.message; return; }
    openKey = null;
    say('status', isNew ? `Added "${r.cookie.name}".` : `Saved "${r.cookie.name}".`, 'ok');
    await loadCookies();
  });
  return form;
}
function optionsLink() { const a = el('a', { href: '#', textContent: 'See Pro' }); a.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); }); return a; }

$('q').addEventListener('input', renderCookies);
$('add').addEventListener('click', () => { openKey = ''; renderCookies(); document.querySelector('.editor [name=name]')?.focus(); });
$('export').addEventListener('click', async () => {
  await loadCookies();
  download(JSON.stringify(toExportJSON(cookies), null, 2), 'application/json', `cookies-${host}-${stamp()}.json`);
  say('status', `Exported ${plural(cookies.length, 'cookie')}. The file contains login sessions: keep it private.`, 'ok');
});
$('export-txt').addEventListener('click', async () => {
  if (!pro) { say('status', ['cookies.txt export is part of Pro. ', optionsLink()], 'error'); return; }
  await loadCookies();
  download(toNetscape(cookies), 'text/plain', `cookies-${host}-${stamp()}.txt`);
  say('status', `Exported ${plural(cookies.length, 'cookie')} as cookies.txt. Keep it private.`, 'ok');
});
armed($('delall'), () => {
  const n = cookies.filter((c) => !prot.has(protectKey(c))).length;
  return `Really delete ${plural(n, 'cookie')}?`;
}, async () => {
  const r = await deleteAll(await siteCookies(host, storeId));
  openKey = null;
  say('status', `Deleted ${plural(r.deleted, 'cookie')}${r.kept ? `; kept ${r.kept} protected` : ''}.`, 'ok');
  await loadCookies();
});
$('import-toggle').addEventListener('click', () => {
  const box = $('import-box'); box.hidden = !box.hidden;
  $('import-toggle').setAttribute('aria-expanded', !box.hidden);
  if (!box.hidden) $('import-text').focus();
});
$('import-file-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0]; $('import-file').value = '';
  if (file) { $('import-text').value = await file.text(); await doImport(); }
});
$('import-go').addEventListener('click', doImport);
async function doImport() {
  const p = parseImport($('import-text').value, { defaultDomain: host });
  if (p.error) { say('status', [`Nothing imported. ${p.error}`, ...problemList(p.problems)], 'error'); return; }
  const r = await importCookies(p.cookies, { host, storeId });
  const notes = [...p.problems, ...r.failed];
  if (r.skipped.length) notes.unshift(`${plural(r.skipped.length, 'cookie')} for other sites skipped (import across all sites is in Settings, Pro)`);
  if (p.expired) notes.unshift(`${plural(p.expired, 'expired cookie')} skipped`);
  say('status', [`Imported ${plural(r.added, 'cookie')}.`, ...problemList(notes)], r.added ? 'ok' : 'error');
  if (r.added) $('import-text').value = '';
  await loadCookies();
}
function problemList(items = []) {
  if (!items.length) return [];
  const ul = el('ul', { className: 'small problems' });
  for (const p of items.slice(0, 8)) ul.append(el('li', { textContent: p }));
  if (items.length > 8) ul.append(el('li', { textContent: `…and ${items.length - 8} more` }));
  return [ul];
}

// ---------- storage ----------
async function loadStorage() {
  try { storage = await readStorage(tab.id); $('s-origin').textContent = storage.origin; } catch (e) {
    storage = { local: [], session: [] }; say('s-status', `Can't read this page's storage: ${e.message}`, 'error');
  }
  renderStorage();
}
function renderStorage() {
  const area = $('area').value;
  const q = $('sq').value.trim().toLowerCase();
  const rows = storage[area].filter(([k, v]) => !q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  const items = [];
  if (openSKey === '') items.push(storageItem(null));
  for (const [k, v] of rows) items.push(storageItem([k, v]));
  $('s-list').replaceChildren(...items);
  $('s-empty').hidden = rows.length > 0 || openSKey === '';
}
function storageItem(entry) {
  const [k, v] = entry || ['', ''];
  const isOpen = openSKey === (entry ? k : '');
  const li = el('li', { className: 'item' });
  li.dataset.key = k;
  if (entry) {
    const head = el('button', { type: 'button', className: 'head' }, el('span', { className: 'nm mono', textContent: k }), el('span', { className: 'val mono', textContent: v }));
    head.setAttribute('aria-expanded', isOpen);
    head.addEventListener('click', () => { openSKey = isOpen ? null : k; renderStorage(); });
    li.append(head);
  }
  if (isOpen) {
    const area = $('area').value;
    const form = el('form', { className: 'editor' });
    const key = el('input', { type: 'text', name: 'skey', id: 's-key', value: k, className: 'mono', spellcheck: false });
    const val = el('textarea', { name: 'svalue', id: 's-value', value: v, className: 'mono', spellcheck: false });
    const b = (t, fn, cls = '') => { const x = el('button', { type: 'button', textContent: t, className: cls }); x.addEventListener('click', fn); return x; };
    const btns = el('div', { className: 'btns' }, el('button', { type: 'submit', className: 'primary', textContent: entry ? 'Save' : 'Add' }));
    if (entry) btns.append(b('Copy value', async () => say('s-status', (await copy(v)) ? 'Copied.' : 'Copy failed.', 'ok')), b('Delete', () => storageWrite(area, { remove: [k] }, `Deleted "${k}".`), 'danger'));
    btns.append(b('Cancel', () => { openSKey = null; renderStorage(); }));
    form.append(el('label', { htmlFor: 's-key', textContent: 'Key' }), key, el('label', { htmlFor: 's-value', textContent: 'Value' }), val, btns);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nk = key.value;
      if (!nk) { say('s-status', 'The key cannot be empty.', 'error'); return; }
      storageWrite(area, { set: [[nk, val.value]], remove: entry && nk !== k ? [k] : [] }, `Saved "${nk}".`);
    });
    li.append(form);
    setTimeout(() => (entry ? val : key).focus());
  }
  return li;
}
async function storageWrite(area, op, msg) {
  try { storage = await writeStorage(tab.id, area, op); openSKey = null; say('s-status', msg, 'ok'); } catch (e) { say('s-status', `Failed: ${e.message}`, 'error'); }
  renderStorage();
}
$('area').addEventListener('change', () => { openSKey = null; renderStorage(); });
$('sq').addEventListener('input', renderStorage);
$('s-add').addEventListener('click', () => { openSKey = ''; renderStorage(); });
$('s-refresh').addEventListener('click', loadStorage);
armed($('s-clear'), () => `Really clear ${$('area').value}Storage?`, () => storageWrite($('area').value, { clear: true }, `Cleared ${$('area').value}Storage.`));

// ---------- profiles (Pro) ----------
async function loadProfiles() {
  if (!pro) { say('p-status', ['Profiles are part of Pro. ', optionsLink()], 'muted'); }
  const all = Object.values(await getProfiles()).filter((p) => p.host === host).sort((a, b) => a.name.localeCompare(b.name));
  $('p-list').replaceChildren(...all.map((p) => {
    const li = el('li', { className: 'item' });
    li.dataset.name = p.name;
    const b = (t, fn, cls = '') => { const x = el('button', { type: 'button', textContent: t, className: cls, disabled: !pro }); x.addEventListener('click', fn); return x; };
    li.append(el('div', { className: 'head' },
      el('span', { className: 'nm', textContent: p.name }),
      el('span', { className: 'val small', textContent: `${plural(p.cookies.length, 'cookie')}, ${plural(p.local.length + p.session.length, 'storage entry').replace('entrys', 'entries')} · ${new Date(p.savedAt).toLocaleString()}` }),
      b('Switch to', async () => {
        const r = await applyProfile(p, tab.id, storeId);
        await chrome.tabs.reload(tab.id);
        say('p-status', `Switched to "${p.name}": ${r.deleted} removed, ${plural(r.added, 'cookie')} set${r.kept ? `, ${r.kept} protected kept` : ''}${r.expired ? `, ${r.expired} expired skipped` : ''}${r.failed.length ? `, ${r.failed.length} failed` : ''}${r.storageOk ? '' : `; storage was not restored (${r.storageError})`}. Tab reloaded.`, r.failed.length ? 'error' : 'ok');
        await loadCookies();
      }),
      b('Update', async () => { await saveProfile(p.name, host, tab.id, storeId); say('p-status', `Updated "${p.name}" from the current state.`, 'ok'); loadProfiles(); }),
      b('Delete', async () => { await deleteProfile(host, p.name); say('p-status', `Deleted profile "${p.name}".`, 'ok'); loadProfiles(); }, 'danger')));
    return li;
  }));
}
$('p-save').addEventListener('click', async () => {
  if (!pro) return;
  const name = $('p-name').value.trim();
  if (!name) { say('p-status', 'Give the profile a name first.', 'error'); $('p-name').focus(); return; }
  const p = await saveProfile(name, host, tab.id, storeId);
  $('p-name').value = '';
  say('p-status', `Saved "${name}" (${plural(p.cookies.length, 'cookie')}). Profiles are stored unencrypted on this device, like the cookies themselves.`, 'ok');
  loadProfiles();
});
$('p-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('p-save').click(); });

init().catch((e) => { document.body.append(el('p', { className: 'error', textContent: 'Error: ' + e.message })); }).finally(() => { document.body.dataset.inited = '1'; });
