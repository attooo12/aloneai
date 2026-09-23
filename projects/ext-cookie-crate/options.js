import { isPro, verifyToken } from './license.js';
import { CHECKOUT_URL, PRO_PRICE } from './config.js';
import { parseImport, toExportJSON, toNetscape } from './cookielib.js';
import { ALL_SITES, hasOrigins, requestOrigins, allCookies, importCookies, getProtected } from './cookies.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const stamp = () => new Date().toISOString().slice(0, 10);
let pro = false;

function download(text, type, name) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function result(kind, text, list = []) {
  const kids = [el('span', { className: kind, textContent: text })];
  if (list.length) { const ul = el('ul'); for (const p of list.slice(0, 20)) ul.append(el('li', { textContent: p })); if (list.length > 20) ul.append(el('li', { textContent: `…and ${list.length - 20} more` })); kids.push(ul); }
  $('all-result').replaceChildren(...kids);
}

async function refresh() {
  pro = await isPro();
  $('plan-status').innerHTML = pro ? '<b class="ok">Pro is active.</b> Thank you for supporting an independent tool.' : 'You are on the <b>Free</b> plan.';
  $('buy-wrap').hidden = !CHECKOUT_URL || pro;
  $('soon').hidden = pro || !!CHECKOUT_URL;
  for (const id of ['all-json', 'all-txt', 'all-import-btn']) $(id).disabled = !pro;
  const prot = [...(await getProtected())].sort();
  $('prot-list').replaceChildren(...(prot.length ? prot.map((k) => {
    const [domain, path, name] = k.split('|');
    const b = el('button', { type: 'button', textContent: 'Unprotect' });
    b.addEventListener('click', async () => { const p = await getProtected(); p.delete(k); await chrome.storage.local.set({ protected: [...p] }); refresh(); });
    return el('li', {}, el('code', { textContent: `${name}  (${domain}${path})` }), b);
  }) : [el('li', { className: 'muted small', textContent: 'No protected cookies yet.' })]));
}
for (const e of document.querySelectorAll('.price')) e.textContent = PRO_PRICE;
$('buy').addEventListener('click', () => { if (CHECKOUT_URL) chrome.tabs.create({ url: CHECKOUT_URL }); });

$('save').addEventListener('click', async () => {
  const key = $('license').value.trim();
  if (!(await verifyToken(key))) { $('msg').innerHTML = '<span class="error">This license key is not valid for Cookie Crate.</span>'; return; }
  await chrome.storage.sync.set({ license: key });
  $('msg').innerHTML = '<span class="ok">Saved. Pro unlocked.</span>';
  refresh();
});
$('remove').addEventListener('click', async () => {
  await chrome.storage.sync.remove('license');
  $('license').value = '';
  $('msg').textContent = 'Removed.';
  refresh();
});

async function allSitesAccess() {
  if (await hasOrigins(ALL_SITES)) return true;
  if (await requestOrigins(ALL_SITES)) return true;
  result('error', 'Chrome did not grant access to all sites, so only sites you allowed earlier could be included. Nothing was done.');
  return false;
}
for (const [id, fmt] of [['all-json', 'json'], ['all-txt', 'txt']]) {
  $(id).addEventListener('click', async () => {
    if (!(await isPro())) return result('error', 'All-sites export is part of Pro.');
    if (!(await allSitesAccess())) return;
    const all = await allCookies();
    if (fmt === 'json') download(JSON.stringify(toExportJSON(all), null, 2), 'application/json', `cookies-all-sites-${stamp()}.json`);
    else download(toNetscape(all), 'text/plain', `cookies-all-sites-${stamp()}.txt`);
    const sites = new Set(all.map((c) => c.domain.replace(/^\./, ''))).size;
    result('ok', `Exported ${all.length} cookies from ${sites} domains. Keep the file private.`);
  });
}
$('all-import-btn').addEventListener('click', () => $('all-import-file').click());
$('all-import-file').addEventListener('change', async () => {
  const file = $('all-import-file').files[0]; $('all-import-file').value = '';
  if (file) await importAll(await file.text());
});
async function importAll(text) {
  if (!(await isPro())) return result('error', 'All-sites import is part of Pro.');
  const p = parseImport(text);
  if (p.error) return result('error', 'Nothing imported. ' + p.error, p.problems || []);
  if (!(await allSitesAccess())) return;
  const r = await importCookies(p.cookies);
  const notes = [...(p.expired ? [`${p.expired} expired cookies skipped`] : []), ...p.problems, ...r.failed];
  result(r.added ? 'ok' : 'error', `Imported ${r.added} of ${p.cookies.length} cookies.`, notes);
  return r;
}

chrome.storage.sync.get('license').then(({ license }) => { if (license) $('license').value = license; });
chrome.storage.onChanged.addListener((c) => { if (c.protected || c.license) refresh(); });
refresh().then(() => { document.body.dataset.ready = '1'; });
