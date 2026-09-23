// End-to-end test (headless Chromium, real extension). Run: node test/e2e.mjs
// Loads a TEST COPY of the extension: license.js patched with the TEST ONLY public key, and "downloads" moved from
// optional to required permissions (a permission prompt can't be clicked headlessly). The shipped files are untouched.
// Not covered here: the experimental "load tabs on click" restore (chrome.tabs.discard crashes the Chrome for
// Testing build used here, see README), and real Chrome restarts/crashes (simulated by clearing storage.session).
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from './make-license.mjs';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '..');
const PORT = 8767;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROD_KEY = '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w=';
if (!existsSync(join(HERE, 'TEST_ONLY_private_key.pem'))) execFileSync('node', [join(HERE, 'keygen.mjs')]);
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'tv-e2e-'));
const extCopy = join(tmp, 'ext');
cpSync(EXT, extCopy, { recursive: true, filter: (p) => !p.includes('/test') });
const man = JSON.parse(readFileSync(join(extCopy, 'manifest.json'), 'utf8'));
man.permissions.push('downloads');
delete man.optional_permissions;
writeFileSync(join(extCopy, 'manifest.json'), JSON.stringify(man, null, 2));
const testPub = readFileSync(join(HERE, 'TEST_ONLY_public_key.txt'), 'utf8').trim();
writeFileSync(join(extCopy, 'license.js'), readFileSync(join(extCopy, 'license.js'), 'utf8').replace(/export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`));
const pem = readFileSync(join(HERE, 'TEST_ONLY_private_key.pem'), 'utf8');

const server = createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1).split('?')[0]) || 'home';
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>Page ${name}</title><h1>${name}</h1>`);
}).listen(PORT, '127.0.0.1');

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  viewport: { width: 1000, height: 800 },
  acceptDownloads: true,
  args: ['--headless=new', `--disable-extensions-except=${extCopy}`, `--load-extension=${extCopy}`]
});
const errors = [];
const watch = (p, label) => {
  p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
  return p;
};

try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;
  check('service worker started', !!extId);
  const EXT_URL = `chrome-extension://${extId}`;
  const drv = watch(await ctx.newPage(), 'options');
  await drv.goto(`${EXT_URL}/options.html`, { waitUntil: 'load' });
  await drv.waitForSelector('body[data-ready]');
  const store = (fn, arg) => drv.evaluate(fn, arg);
  const idx = (kind) => store(async (k) => (await import('./store.js')).getIndex(k), kind);
  const setLicense = (token) => store(async (t) => { if (t) await chrome.storage.sync.set({ license: t }); else await chrome.storage.sync.remove('license'); }, token);

  // ---------- license ----------
  const good = makeToken(pem);
  const [gb, gs] = good.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ product: 'tab-lifeboat', email_hash: 'x', sid: 'y', iat: 1 })).toString('base64url') + '.' + gs;
  const tamperedSig = gb + '.' + gs.slice(0, 5) + (gs[5] === 'A' ? 'B' : 'A') + gs.slice(6);
  const lt = await store(async (a) => {
    const L = await import('./license.js');
    return {
      product: L.PRODUCT,
      good: await L.verifyToken(a.good),
      tamperedPayload: await L.verifyToken(a.tamperedPayload),
      tamperedSig: await L.verifyToken(a.tamperedSig),
      garbage: await L.verifyToken('nonsense.token'),
      reloadUntil: await L.verifyToken(a.reloadUntil),
      colorPicker: await L.verifyToken(a.colorPicker),
      prodKey: await L.verifyToken(a.good, a.prod)
    };
  }, { good, tamperedPayload, tamperedSig, reloadUntil: makeToken(pem, 'a@b.c', 'reload-until'), colorPicker: makeToken(pem, 'a@b.c', 'color-picker'), prod: PROD_KEY });
  check('license: PRODUCT is tab-lifeboat', lt.product === 'tab-lifeboat');
  check('license: valid token verifies', lt.good === true);
  check('license: tampered payload rejected', lt.tamperedPayload === false);
  check('license: tampered signature rejected', lt.tamperedSig === false);
  check('license: garbage rejected', lt.garbage === false);
  check('license: Reload Until token rejected (wrong product)', lt.reloadUntil === false);
  check('license: Color Picker token rejected (wrong product)', lt.colorPicker === false);
  check('license: production key rejects the test token', lt.prodKey === false);
  check('shipped license.js uses the production key and product id', /PUBLIC_KEY = '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w='/.test(readFileSync(join(EXT, 'license.js'), 'utf8')) && /PRODUCT = 'tab-lifeboat'/.test(readFileSync(join(EXT, 'license.js'), 'utf8')));
  // license UI: wrong-product key refused in the options page
  await drv.fill('#license', makeToken(pem, 'a@b.c', 'reload-until'));
  await drv.click('#save');
  await drv.waitForFunction(() => document.querySelector('#msg').textContent.length > 0);
  check('options: wrong-product key refused, not stored', /not valid/.test(await drv.textContent('#msg')) && !(await store(async () => (await chrome.storage.sync.get('license')).license)));
  check('options: buy button shown when CHECKOUT_URL is set', (await drv.isVisible('#buy-wrap')) && (await drv.isHidden('#soon')));

  const pop = watch(await ctx.newPage(), 'popup'); // opened before the test window, so it lives in the default window
  // ---------- build a test window: 6 tabs, 1 pinned, 2 groups (one collapsed) ----------
  const W = await sw.evaluate(async (origin) => {
    const w = await chrome.windows.create({ url: origin + '/pinned-home', focused: true });
    const ids = [w.tabs[0].id];
    for (const p of ['alpha', 'beta', 'gamma', 'delta', 'plain']) ids.push((await chrome.tabs.create({ windowId: w.id, url: `${origin}/${p}`, active: false })).id);
    await chrome.tabs.update(ids[0], { pinned: true });
    const g1 = await chrome.tabs.group({ tabIds: [ids[1], ids[2]], createProperties: { windowId: w.id } });
    await chrome.tabGroups.update(g1, { title: 'Work', color: 'blue' });
    const g2 = await chrome.tabs.group({ tabIds: [ids[3], ids[4]], createProperties: { windowId: w.id } });
    await chrome.tabGroups.update(g2, { title: 'Reading', color: 'red', collapsed: true });
    return w.id;
  }, ORIGIN);
  await sw.evaluate(async (wid) => {
    for (let i = 0; i < 50; i++) { const t = await chrome.tabs.query({ windowId: wid }); if (t.every((x) => x.status === 'complete' && x.title.startsWith('Page'))) return; await new Promise((r) => setTimeout(r, 100)); }
  }, W);

  // ---------- popup: save this window ----------
  await pop.goto(`${EXT_URL}/popup.html?window=${W}`, { waitUntil: 'load' });
  await pop.waitForSelector('body[data-ready]');
  check('popup: counts tabs in this window', (await pop.textContent('#count-window')) === '(6)', await pop.textContent('#count-window'));
  check('popup: Free plan and cap shown', (await pop.textContent('#plan')) === 'Free' && /0 of 10 free/.test(await pop.textContent('#cap')));
  check('popup: empty state', /No saved sessions yet/.test(await pop.textContent('#empty')));
  await pop.fill('#name', 'Project research');
  await pop.press('#name', 'Enter');
  await pop.waitForSelector('#list .item');
  check('popup: saved via Enter, row shows counts', /Project research/.test(await pop.textContent('#list .item .nm')) && /6 tabs · 2 groups/.test(await pop.textContent('#list .item .meta')), await pop.textContent('#list .item'));
  check('popup: status confirms', /Saved "Project research": 6 tabs/.test(await pop.textContent('#status')));
  const saved = (await idx('named'))[0];
  const savedSession = await store(async (id) => (await import('./store.js')).getSession(id), saved.id);
  const w0 = savedSession.windows[0];
  check('saved session: URLs in order', w0.tabs.map((t) => t.url.replace(ORIGIN, '')).join(',') === '/pinned-home,/alpha,/beta,/gamma,/delta,/plain', JSON.stringify(w0.tabs.map((t) => t.url)));
  check('saved session: pinned + titles', w0.tabs[0].pinned === true && w0.tabs[1].title === 'Page alpha');
  check('saved session: groups with name, colour, collapsed', JSON.stringify(w0.groups) === JSON.stringify([{ title: 'Work', color: 'blue', collapsed: false }, { title: 'Reading', color: 'red', collapsed: true }]) && w0.tabs[1].group === 0 && w0.tabs[3].group === 1 && w0.tabs[5].group === undefined, JSON.stringify(w0));

  // ---------- live state + closing the window => "Closed window" snapshot ----------
  await sw.evaluate(() => globalThis.__tv.refreshLive());
  await sw.evaluate((wid) => chrome.windows.remove(wid), W);
  let closed = null;
  for (let i = 0; i < 40 && !closed; i++) { await sleep(100); closed = (await idx('auto')).find((e) => e.reason === 'window-closed'); }
  check('closing a window stores a "Closed window" snapshot', closed && closed.tabs === 6 && closed.groups === 2, JSON.stringify(closed));
  const liveAfter = await store(async () => (await import('./store.js')).getLive());
  check('live state keeps the closed window until the next refresh (so a shutdown loses nothing)', liveAfter.session.windows.some((w) => w.tabs.some((t) => t.url.endsWith('/alpha'))));

  // ---------- restore (all tabs, pinned, groups) ----------
  const before = await sw.evaluate(async () => (await chrome.windows.getAll()).map((w) => w.id));
  await pop.click('#list .item .restore');
  let newWin = null;
  for (let i = 0; i < 50 && !newWin; i++) { await sleep(100); newWin = await sw.evaluate(async (b) => (await chrome.windows.getAll()).map((w) => w.id).find((id) => !b.includes(id)), before); }
  await sleep(800);
  const restored = await sw.evaluate(async (wid) => {
    const tabs = await chrome.tabs.query({ windowId: wid });
    const groups = await chrome.tabGroups.query({ windowId: wid });
    return { tabs: tabs.map((t) => ({ url: t.url || t.pendingUrl, pinned: t.pinned, group: groups.find((g) => g.id === t.groupId)?.title || null })), groups: groups.map((g) => ({ title: g.title, color: g.color, collapsed: g.collapsed })) };
  }, newWin);
  check('restore: new window with all 6 tabs in order', restored.tabs.map((t) => t.url.replace(ORIGIN, '')).join(',') === '/pinned-home,/alpha,/beta,/gamma,/delta,/plain', JSON.stringify(restored.tabs));
  check('restore: pinned tab pinned', restored.tabs[0].pinned && restored.tabs.slice(1).every((t) => !t.pinned));
  check('restore: tab groups recreated with name/colour/collapsed', JSON.stringify(restored.groups.sort((a, b) => a.title.localeCompare(b.title))) === JSON.stringify([{ title: 'Reading', color: 'red', collapsed: true }, { title: 'Work', color: 'blue', collapsed: false }]) && restored.tabs[1].group === 'Work' && restored.tabs[2].group === 'Work' && restored.tabs[3].group === 'Reading' && restored.tabs[5].group === null, JSON.stringify(restored));

  // restore a closed-window snapshot (Auto tab in the popup)
  await pop.click('#tab-auto');
  await pop.waitForSelector('#list .item');
  check('popup: auto tab lists the closed window snapshot', /Closed window/.test(await pop.textContent('#list')));
  const restoreViaMsg = await pop.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'restore', id }), closed.id);
  check('restore: closed-window snapshot reopens 6 tabs', restoreViaMsg?.ok && restoreViaMsg.opened === 6 && restoreViaMsg.failed === 0, JSON.stringify(restoreViaMsg));
  await sw.evaluate(async (keep) => { for (const w of await chrome.windows.getAll()) if (!keep.includes(w.id)) await chrome.windows.remove(w.id); }, before);
  // the test window is gone: from now on the popup belongs to the default window, like a real popup
  await pop.goto(`${EXT_URL}/popup.html`, { waitUntil: 'load' });
  await pop.waitForSelector('body[data-ready]');

  // ---------- rename / delete + undo / keyboard / search (UI) ----------
  await pop.focus('#q');
  await pop.keyboard.press('ArrowDown');
  check('keyboard: ArrowDown from search focuses the first row', await pop.evaluate(() => document.activeElement.classList.contains('main')));
  await pop.keyboard.press('Enter');
  await pop.waitForSelector('.details .actions');
  check('keyboard: Enter expands the row (aria-expanded)', (await pop.getAttribute('#list .item .main', 'aria-expanded')) === 'true');
  check('details: shows groups and tabs', /Work/.test(await pop.textContent('.details')) && /Reading \(collapsed\)/.test(await pop.textContent('.details')) && (await pop.locator('.details .tl button').count()) === 6);
  await pop.click('.details .actions button:has-text("Rename")');
  await pop.fill('.rename input', 'Renamed research');
  await pop.press('.rename input', 'Enter');
  await pop.waitForFunction(() => /Renamed research/.test(document.querySelector('#list .item .nm').textContent));
  check('rename via UI', (await idx('named'))[0].name === 'Renamed research');
  await pop.click('.details .actions button:has-text("Delete")');
  await pop.waitForFunction(() => /Deleted/.test(document.querySelector('#status').textContent));
  check('delete via UI removes it', (await idx('named')).length === 0);
  await pop.click('#status button:has-text("Undo")');
  await pop.waitForFunction(() => document.querySelectorAll('#list .item').length === 1);
  check('undo brings it back intact', (await idx('named')).length === 1 && (await store(async (id) => (await import('./store.js')).getSession(id), saved.id)).windows[0].tabs.length === 6);
  // single-tab open and Markdown are Pro
  await pop.click('#list .item .main');
  await pop.click('.details .tl button >> nth=1');
  await pop.waitForFunction(() => /part of Pro/.test(document.querySelector('#status').textContent));
  check('free: opening a single saved tab asks for Pro', true);
  const openTabFree = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'openTab', url: 'http://127.0.0.1:8767/x' }));
  check('free: service worker also refuses openTab without Pro', openTabFree.ok === false && openTabFree.error === 'pro_required');

  // ---------- free cap (10) + license gating ----------
  await store(async () => {
    const S = await import('./store.js');
    for (let i = 0; i < 9; i++) await S.saveNamed({ windows: [{ tabs: [{ url: `http://127.0.0.1:8767/cap${i}`, title: 'cap ' + i }] }] }, 'Cap ' + i);
  });
  await pop.fill('#name', 'Eleventh');
  await pop.click('#save-window');
  await pop.waitForFunction(() => /Free plan keeps 10/.test(document.querySelector('#status').textContent));
  check('free cap: 11th save refused with a clear message', (await idx('named')).length === 10);
  for (const [label, token] of [['tampered', tamperedPayload], ['Reload Until', makeToken(pem, 'a@b.c', 'reload-until')], ['Color Picker', makeToken(pem, 'a@b.c', 'color-picker')]]) {
    await setLicense(token);
    const r = await store(async () => { try { await (await import('./store.js')).saveNamed({ windows: [{ tabs: [{ url: 'https://example.com/' }] }] }, 'x'); return 'saved'; } catch (e) { return e.code; } });
    check(`free cap: ${label} token does not unlock`, r === 'limit', r);
  }
  await setLicense(good);
  await pop.reload({ waitUntil: 'load' });
  await pop.waitForSelector('body[data-ready]');
  check('popup: Pro pill with a valid token, cap text hidden', (await pop.textContent('#plan')) === 'Pro' && (await pop.textContent('#cap')) === '');
  await pop.fill('#name', 'Eleventh');
  await pop.click('#save-all');
  await pop.waitForFunction(() => /Saved "Eleventh"/.test(document.querySelector('#status').textContent));
  check('Pro: 11th session saved ("Save all windows")', (await idx('named')).length === 11);
  const openTabPro = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'openTab', url: 'http://127.0.0.1:8767/single', active: false }));
  check('Pro: open a single saved tab', openTabPro.ok === true);
  await sw.evaluate((id) => chrome.tabs.remove(id), openTabPro.tabId);

  // merge (Pro) via selection bar
  const cbs = pop.locator('#list .item input[type=checkbox]');
  await cbs.nth(1).check();
  await cbs.nth(2).check();
  check('selection bar appears', await pop.isVisible('#selbar') && /2 selected/.test(await pop.textContent('#selcount')));
  await pop.fill('#name', 'Merged caps');
  await pop.click('#merge');
  await pop.waitForFunction(() => /Merged into "Merged caps"/.test(document.querySelector('#status').textContent));
  const mergedE = (await idx('named')).at(-1);
  check('Pro: merge creates a new session with both tabs', mergedE.name === 'Merged caps' && mergedE.tabs === 2);

  // search: by tab URL (tab-level, loaded on demand) and by name
  await pop.fill('#q', 'cap3');
  await pop.waitForFunction(() => document.querySelectorAll('#list .item').length === 1);
  check('search: finds a session by a tab address', /Cap 3/.test(await pop.textContent('#list .item .nm')));
  await pop.fill('#q', 'zzz-nothing');
  await pop.waitForFunction(() => !document.querySelector('#empty').hidden);
  check('search: empty result message', /Nothing matches/.test(await pop.textContent('#empty')));
  await pop.press('#q', 'Escape');
  check('search: Escape clears', (await pop.inputValue('#q')) === '' && (await pop.locator('#list .item').count()) === 12);

  // ---------- snapshots in the real service worker ----------
  const empty0 = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshotNow' }));
  check('snapshot now: nothing stored while only blank/extension pages are open', empty0.skipped === 'empty', JSON.stringify(empty0));
  const web = watch(await ctx.newPage(), 'web');
  await web.goto(`${ORIGIN}/snapshot-me`, { waitUntil: 'load' });
  const s1 = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshotNow' }));
  const s2 = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshotNow' }));
  check('snapshot now: stored, then skipped when unchanged', s1.ok && s1.added && s2.skipped === 'unchanged', JSON.stringify([s1, s2]));
  const guard = await store(async () => (await import('./store.js')).updateLive({ windows: [] }, []));
  check('guard: empty live capture never overwrites the stored state', guard.skipped === 'empty');
  // simulate a browser restart: storage.session is cleared, the next live refresh archives the previous state
  const web2 = watch(await ctx.newPage(), 'web2');
  await web2.goto(`${ORIGIN}/opened-after-last-snapshot`, { waitUntil: 'load' });
  await sw.evaluate(() => globalThis.__tv.refreshLive());
  const autosBefore = (await idx('auto')).length;
  await sw.evaluate(() => chrome.storage.session.clear());
  await sw.evaluate(() => globalThis.__tv.refreshLive());
  const prevSession = (await idx('auto')).find((e) => e.reason === 'previous-session');
  await sw.evaluate(() => globalThis.__tv.refreshLive());
  check('restart: "Previous browser session" snapshot archived once, with the latest tabs', !!prevSession && prevSession.tabs >= 2 && (await idx('auto')).length === autosBefore + 1, JSON.stringify(prevSession));
  // big drop -> the previous full snapshot gets protected
  await store(async (origin) => {
    const S = await import('./store.js');
    await S.addAutoSnapshot({ windows: [{ tabs: Array.from({ length: 30 }, (_, i) => ({ url: `${origin}/many${i}` })) }] }, 'periodic', 'all');
    await S.addAutoSnapshot({ windows: [{ tabs: [{ url: `${origin}/lonely` }] }] }, 'periodic', 'all');
  }, ORIGIN);
  const autos = await idx('auto');
  check('guard: a collapse from 30 tabs to 1 protects the 30-tab snapshot', autos.find((e) => e.tabs === 30)?.keep === true);
  await pop.click('#tab-auto');
  await pop.waitForFunction(() => /protected/.test(document.querySelector('#list').textContent));
  check('popup: protected badge shown in Auto snapshots', true);
  await pop.click('#tab-named');

  // ---------- options: export, malformed imports, import ----------
  await drv.reload({ waitUntil: 'load' });
  await drv.waitForSelector('body[data-ready]');
  const [dl] = await Promise.all([drv.waitForEvent('download'), drv.click('#export-json')]);
  const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  check('export all: JSON download with every session', exported.format === 'tab-lifeboat-export' && exported.schema === 1 && exported.sessions.length === (await idx('named')).length + (await idx('auto')).length, `${exported.sessions?.length}`);
  const namedBefore = (await idx('named')).length;
  const importFile = async (name, text) => {
    await drv.setInputFiles('#import-file', { name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
    await drv.waitForFunction(() => document.querySelector('#data-result').textContent.startsWith('Nothing') || /Imported/.test(document.querySelector('#data-result').textContent));
    const t = await drv.textContent('#data-result');
    await drv.evaluate(() => document.querySelector('#data-result').replaceChildren());
    return t;
  };
  const bad = [
    ['truncated.json', JSON.stringify(exported).slice(0, 500), /not valid JSON/],
    ['other.json', '{"bookmarks": []}', /not a Tab Lifeboat backup/],
    ['nothing-valid.json', JSON.stringify({ format: 'tab-lifeboat-export', schema: 1, sessions: [{ tabs: [{ url: 'javascript:alert(1)' }] }, 7] }), /No valid sessions/],
    ['future.json', JSON.stringify({ format: 'tab-lifeboat-export', schema: 9, sessions: [] }), /newer version/],
    ['empty.json', '', /empty/],
    ['binary.bin', '\u0000\u0001\u0002PK\u0003', /No JSON backup/]
  ];
  for (const [name, text, re] of bad) {
    const t = await importFile(name, text);
    check(`import malformed ${name}: refused with a clear message`, re.test(t) && /^Nothing was imported/.test(t), t);
  }
  check('import malformed: nothing changed', (await idx('named')).length === namedBefore);
  const t1 = await importFile('same.json', JSON.stringify(exported));
  check('import own export again: all duplicates skipped', /Imported 0 sessions/.test(t1) && (await idx('named')).length === namedBefore, t1);
  // fresh profile scenario: delete everything, then import the export
  await store(async () => { const keep = await chrome.storage.local.get('settings'); await chrome.storage.local.clear(); await chrome.storage.local.set(keep); });
  const t2 = await importFile('backup.json', JSON.stringify(exported));
  const namedAfter = await idx('named');
  check('import into an empty profile: everything back (auto snapshots become saved sessions)', new RegExp(`Imported ${exported.sessions.length} sessions`).test(t2) && namedAfter.length === exported.sessions.length, t2);
  const t3 = await importFile('links.txt', `${ORIGIN}/t1 | First\n${ORIGIN}/t2\njavascript:alert(1)\n\n${ORIGIN}/t3`);
  check('import plain URL list', /Imported 2 sessions/.test(t3) && /1 line/.test(t3), t3);
  const withEvil = structuredClone(exported);
  withEvil.sessions = [{ id: 'evil1', name: 'Mixed', tabs: [{ url: `${ORIGIN}/ok` }, { url: 'javascript:alert(document.cookie)' }, { url: 'data:text/html,<script>alert(1)</script>' }] }];
  const t4 = await importFile('mixed.json', JSON.stringify(withEvil));
  check('import drops javascript:/data: tabs and says so', /Imported 1 session/.test(t4) && /2 tab\(s\)/.test(t4), t4);

  // ---------- Pro exports + scheduled backup ----------
  const [mdDl] = await Promise.all([drv.waitForEvent('download'), drv.click('#export-md')]);
  const md = readFileSync(await mdDl.path(), 'utf8');
  check('Pro: export all as Markdown', /^# /m.test(md) && md.includes(`](${ORIGIN}/alpha)`) && md.includes('**Work** (blue)'));
  await store(async () => (await import('./store.js')).setSettings({ backup: 'daily', backupLast: 0 }));
  const due = await sw.evaluate(() => globalThis.__tv.backupIfDue());
  const dlInfo = due.ok ? await sw.evaluate(async (id) => { for (let i = 0; i < 30; i++) { const [d] = await chrome.downloads.search({ id }); if (d.state !== 'in_progress') return { state: d.state, filename: d.filename, bytes: d.fileSize }; await new Promise((r) => setTimeout(r, 100)); } return null; }, due.downloadId) : null;
  check('Pro backup: runs when due and writes a file', due.ok && dlInfo?.state === 'complete' && dlInfo.bytes > 100, JSON.stringify([due, dlInfo]));
  const notDue = await sw.evaluate(() => globalThis.__tv.backupIfDue());
  check('Pro backup: not repeated before it is due', notDue.skipped === 'not-due');
  const name = await store(async () => (await import('./backup.js')).backupFileName(Date.UTC(2026, 8, 23, 12, 0)));
  check('backup file goes to "Tab Lifeboat backups/"', /^Tab Lifeboat backups\/tab-lifeboat-backup-2026-09-23-\d{4}\.json$/.test(name), name);
  await setLicense(null);
  const freeBackup = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'backupNow' }));
  check('Free: backup refused (Pro)', freeBackup.ok === false && freeBackup.error === 'pro_required');
  const freeMerge = await store(async () => { try { await (await import('./store.js')).mergeInto([{ id: 'a' }, { id: 'b' }], 'x'); return 'merged'; } catch (e) { return e.code; } });
  check('Free: merge refused in the store too', freeMerge === 'pro_required');

  // ---------- performance: 250 sessions ----------
  await setLicense(good);
  await store(async () => {
    const S = await import('./store.js');
    const all = [];
    for (let i = 0; i < 250; i++) all.push({ name: 'Bulk session ' + i, created: Date.now() - i * 60000, windows: [{ tabs: Array.from({ length: 25 }, (_, j) => ({ url: `https://example.com/${i}/${j}`, title: `Bulk ${i} tab ${j}` })) }] });
    await S.importSessions(all);
  });
  const perf = watch(await ctx.newPage(), 'popup-perf');
  const t0 = Date.now();
  await perf.goto(`${EXT_URL}/popup.html`, { waitUntil: 'load' });
  await perf.waitForSelector('body[data-ready]');
  const openMs = Date.now() - t0;
  const rows = await perf.locator('#list .item').count();
  check(`perf: popup with ${(await idx('named')).length} sessions ready in < 1500 ms (${openMs} ms), paged rows`, openMs < 1500 && rows === 100 && await perf.isVisible('#more'), `${openMs} ms, ${rows} rows`);
  const s0 = Date.now();
  await perf.fill('#q', 'Bulk 137 tab 3');
  await perf.waitForFunction(() => document.querySelectorAll('#list .item').length === 1);
  check(`perf: tab-level search over 250+ sessions (${Date.now() - s0} ms)`, Date.now() - s0 < 1500);
  await perf.fill('#q', '');
  await perf.click('#more');
  check('perf: "Show more" adds the next page', (await perf.locator('#list .item').count()) === 200);
  await perf.close();

  check('no page errors or console errors', errors.length === 0, errors.join('\n'));
} catch (e) {
  check('unexpected exception', false, e.stack);
} finally {
  await ctx.close().catch(() => {});
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
process.exit(failed.length ? 1 : 0);
