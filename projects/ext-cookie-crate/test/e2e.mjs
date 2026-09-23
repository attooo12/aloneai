// End-to-end test (headless Chromium, real extension). Run: node test/e2e.mjs
// Loads a TEST COPY of the extension: license.js uses the TEST ONLY public key, and host access to *.test is granted
// up front as a required permission (Chrome's permission prompt can't be clicked headlessly); the all-sites
// permission is narrowed to *.test for the same reason. c.example is NOT granted, to test the "Allow access" state.
// Test pages are served on a.test / sub.a.test / other.a.test / b.test / c.example, all mapped to 127.0.0.1.
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from './make-license.mjs';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '..');
const PORT = 8781;
const U = (host, path = '/page') => `http://${host}:${PORT}${path}`;
const PROD_KEY = '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w=';
if (!existsSync(join(HERE, 'TEST_ONLY_private_key.pem'))) execFileSync('node', [join(HERE, 'keygen.mjs')]);
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'cc-e2e-')));
const extCopy = join(tmp, 'ext');
cpSync(EXT, extCopy, { recursive: true, filter: (p) => !p.includes('/test') });
const man = JSON.parse(readFileSync(join(extCopy, 'manifest.json'), 'utf8'));
man.host_permissions = ['*://*.test/*'];
// Clicking the toolbar button grants activeTab, which lets the popup read the tab's URL; that click can't be done
// headlessly, so "tabs" stands in for it (URL visibility only; it grants no cookie or scripting access).
man.permissions.push('tabs');
writeFileSync(join(extCopy, 'manifest.json'), JSON.stringify(man, null, 2));
const testPub = readFileSync(join(HERE, 'TEST_ONLY_public_key.txt'), 'utf8').trim();
const patch = (file, re, to) => { const p = join(extCopy, file); const s = readFileSync(p, 'utf8'); if (!re.test(s)) throw new Error('patch failed: ' + file); writeFileSync(p, s.replace(re, to)); };
patch('license.js', /export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`);
patch('cookies.js', /export const ALL_SITES = \[[^\]]*\]/, "export const ALL_SITES = ['*://*.test/*']");
const pem = readFileSync(join(HERE, 'TEST_ONLY_private_key.pem'), 'utf8');
// Chrome's id for an unpacked extension: sha256 of its path, first 32 hex digits mapped 0-f -> a-p.
const extId = [...createHash('sha256').update(extCopy).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const EXT_URL = `chrome-extension://${extId}`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'text/html');
  const seed = url.searchParams.has('seed') ? `<script>document.cookie='pagecookie=1; path=/';</script>` : '';
  res.end(`<!doctype html><title>${req.headers.host}</title><h1>${req.headers.host}${url.pathname}</h1>${seed}`);
}).listen(PORT, '127.0.0.1');

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  viewport: { width: 1000, height: 800 },
  acceptDownloads: true,
  args: ['--headless=new', `--disable-extensions-except=${extCopy}`, `--load-extension=${extCopy}`, '--host-resolver-rules=MAP *.test 127.0.0.1, MAP c.example 127.0.0.1']
});
const errors = [];
const watch = (p, label) => {
  p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
  return p;
};

try {
  const drv = watch(await ctx.newPage(), 'options');
  await drv.goto(`${EXT_URL}/options.html`, { waitUntil: 'load' });
  await drv.waitForSelector('body[data-ready]');
  check('extension loaded (options page ready)', true);
  const ev = (fn, arg) => drv.evaluate(fn, arg);
  const setLicense = (t) => ev(async (t) => { if (t) await chrome.storage.sync.set({ license: t }); else await chrome.storage.sync.remove('license'); }, t);
  const cookiesAt = (details) => ev(async (d) => chrome.cookies.getAll({ ...d, partitionKey: {} }), details);
  const names = (list) => list.map((c) => c.name).sort().join(',');
  const readDownload = async (page, click) => { const [dl] = await Promise.all([page.waitForEvent('download'), click()]); return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') }; };

  // ---------- license ----------
  const good = makeToken(pem);
  const [gb, gs] = good.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ product: 'cookie-crate', email_hash: 'x', sid: 'y', iat: 1 })).toString('base64url') + '.' + gs;
  const tamperedSig = gb + '.' + gs.slice(0, 5) + (gs[5] === 'A' ? 'B' : 'A') + gs.slice(6);
  const lt = await ev(async (a) => {
    const L = await import('./license.js');
    return { product: L.PRODUCT, good: await L.verifyToken(a.good), tp: await L.verifyToken(a.tamperedPayload), ts: await L.verifyToken(a.tamperedSig), garbage: await L.verifyToken('nonsense.token'), wrong: await L.verifyToken(a.wrong), wrong2: await L.verifyToken(a.wrong2), prod: await L.verifyToken(a.good, a.prodKey) };
  }, { good, tamperedPayload, tamperedSig, wrong: makeToken(pem, 'a@b.c', 'tab-lifeboat'), wrong2: makeToken(pem, 'a@b.c', 'reload-until'), prodKey: PROD_KEY });
  check('license: PRODUCT is cookie-crate', lt.product === 'cookie-crate');
  check('license: valid token verifies', lt.good === true);
  check('license: tampered payload rejected', lt.tp === false);
  check('license: tampered signature rejected', lt.ts === false);
  check('license: garbage rejected', lt.garbage === false);
  check('license: other products\' tokens rejected (tab-lifeboat, reload-until)', lt.wrong === false && lt.wrong2 === false);
  check('license: production key rejects the test token', lt.prod === false);
  const shipped = readFileSync(join(EXT, 'license.js'), 'utf8');
  check('shipped license.js uses the production key and product id', shipped.includes(`PUBLIC_KEY = '${PROD_KEY}'`) && shipped.includes("PRODUCT = 'cookie-crate'"));
  check('shipped manifest: minimal permissions, optional <all_urls> only', (() => { const m = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')); return m.permissions.join() === 'cookies,storage,activeTab,scripting' && m.optional_host_permissions.join() === '<all_urls>' && !m.host_permissions && !m.content_scripts && !m.background; })());
  check('options: buy button shown (CHECKOUT_URL set), "coming soon" hidden', (await drv.isVisible('#buy-wrap')) && (await drv.isHidden('#soon')));
  await drv.fill('#license', makeToken(pem, 'a@b.c', 'tab-lifeboat'));
  await drv.click('#save');
  await drv.waitForFunction(() => document.querySelector('#msg').textContent.length > 0);
  check('options: wrong-product key refused and not stored', /not valid/.test(await drv.textContent('#msg')) && !(await ev(async () => (await chrome.storage.sync.get('license')).license)));
  check('options: all-sites buttons disabled on Free', (await drv.isDisabled('#all-json')) && (await drv.isDisabled('#all-import-btn')));
  await drv.fill('#license', good);
  await drv.click('#save');
  await drv.waitForFunction(() => /Pro is active/.test(document.querySelector('#plan-status').textContent));
  check('options: valid key unlocks Pro', !(await drv.isDisabled('#all-json')));
  await setLicense(null);

  // ---------- fixture cookies ----------
  const far = Math.floor(Date.now() / 1000) + 86400 * 30;
  const setErr = await ev(async (far) => {
    const errs = [];
    const s = async (d) => { try { const r = await chrome.cookies.set(d); if (!r) errs.push(d.name + ': null'); } catch (e) { errs.push(d.name + ': ' + e.message); } };
    await s({ url: 'http://a.test/', domain: 'a.test', name: 'parent', value: 'p1', expirationDate: far });
    await s({ url: 'http://a.test/', name: 'apexonly', value: 'x', expirationDate: far });
    await s({ url: 'http://sub.a.test/', name: 'sid', value: 'old', httpOnly: true, sameSite: 'lax', expirationDate: far });
    await s({ url: 'http://sub.a.test/admin', name: 'adm', value: 'A', path: '/admin' });
    await s({ url: 'http://other.a.test/', name: 'sibling', value: 's', expirationDate: far });
    await s({ url: 'http://b.test/', name: 'bcookie', value: 'b', expirationDate: far });
    await s({ url: 'https://sub.a.test/', name: 'sec', value: 'S', secure: true, expirationDate: far });
    await s({ url: 'https://sub.a.test/', name: 'chip', value: 'C', secure: true, sameSite: 'no_restriction', partitionKey: { topLevelSite: 'https://b.test' }, expirationDate: far });
    await s({ url: 'http://a.test/', domain: 'a.test', name: 'dup', value: 'parentdup', expirationDate: far });
    await s({ url: 'http://sub.a.test/', name: 'dup', value: 'hostdup', expirationDate: far });
    return errs;
  }, far);
  check('fixture cookies set (incl. secure and partitioned)', setErr.length === 0, setErr.join('; '));

  const target = watch(await ctx.newPage(), 'site');
  await target.goto(U('sub.a.test', '/page?seed=1'), { waitUntil: 'load' });
  await target.evaluate(() => { localStorage.setItem('theme', 'dark'); localStorage.setItem('token', 'abc'); sessionStorage.setItem('draft', 'hello'); });
  const tabId = await ev(async (u) => (await chrome.tabs.query({ url: u + '*' }))[0].id, U('sub.a.test', '/page'));
  const openPopup = async (id = tabId) => {
    const p = watch(await ctx.newPage(), 'popup');
    await p.goto(`${EXT_URL}/popup.html?tabId=${id}`, { waitUntil: 'load' });
    await p.waitForSelector('body[data-inited]');
    return p;
  };
  const rowNames = (p) => p.$$eval('#list > li', (ls) => ls.map((l) => l.dataset.name).sort().join(','));
  const row = (p, name, domain) => p.locator(`#list > li[data-name="${name}"]${domain ? `[data-domain="${domain}"]` : ''}`);

  let pop = await openPopup();
  await pop.waitForSelector('body[data-ready]');
  const EXPECTED = 'adm,chip,dup,dup,pagecookie,parent,sec,sid';
  check('list: all cookies sent to sub.a.test (parent-domain, other paths, secure, partitioned), not siblings/apex host-only/other sites', (await rowNames(pop)) === EXPECTED, await rowNames(pop));
  check('list: host shown, count shown', (await pop.textContent('#host')) === 'sub.a.test' && (await pop.textContent('#count')) === '(8)');
  check('list: partitioned cookie badged', /partitioned/.test(await row(pop, 'chip').textContent()));
  await pop.fill('#q', 'hostdup');
  check('filter by value', (await rowNames(pop)) === 'dup');
  await pop.fill('#q', 'sub.a');
  check('filter by domain', (await rowNames(pop)) === 'adm,chip,dup,pagecookie,sec,sid', await rowNames(pop));
  await pop.fill('#q', '');

  // edit value
  await row(pop, 'sid').locator('.head').click();
  check('editor opens with fields (httpOnly ticked, SameSite Lax)', (await pop.inputValue('#f-value')) === 'old' && (await pop.isChecked('#f-httpOnly')) && (await pop.inputValue('#f-sameSite')) === 'lax');
  await pop.fill('#f-value', 'new-value');
  await pop.click('.editor button[type=submit]');
  await pop.waitForFunction(() => /Saved "sid"/.test(document.querySelector('#status').textContent));
  let sid = (await cookiesAt({ url: 'http://sub.a.test/', name: 'sid' }))[0];
  check('edit: value saved, flags and expiry kept', sid.value === 'new-value' && sid.httpOnly && sid.sameSite === 'lax' && Math.abs(sid.expirationDate - far) < 61, JSON.stringify(sid));
  // rename + change path
  await row(pop, 'sid').locator('.head').click();
  await pop.fill('#f-name', 'sid2');
  await pop.click('.editor button[type=submit]');
  await pop.waitForFunction(() => /Saved "sid2"/.test(document.querySelector('#status').textContent));
  check('edit: rename replaces the cookie', (await cookiesAt({ domain: 'sub.a.test', name: 'sid' })).length === 0 && (await cookiesAt({ domain: 'sub.a.test', name: 'sid2' }))[0]?.value === 'new-value');
  // session toggle
  await row(pop, 'sid2').locator('.head').click();
  await pop.check('#f-session');
  await pop.click('.editor button[type=submit]');
  await pop.waitForFunction(() => /Saved "sid2"/.test(document.querySelector('#status').textContent));
  check('edit: make it a session cookie', (await cookiesAt({ domain: 'sub.a.test', name: 'sid2' }))[0]?.session === true);

  // add
  await pop.click('#add');
  await pop.fill('#f-name', 'added');
  await pop.fill('#f-value', 'v+1');
  await pop.fill('#f-domain', 'a.test');
  await pop.uncheck('#f-hostOnly');
  await pop.fill('#f-path', '/');
  await pop.click('.editor button[type=submit]');
  await pop.waitForFunction(() => /Added "added"/.test(document.querySelector('#status').textContent));
  const added = (await cookiesAt({ domain: 'a.test', name: 'added' }))[0];
  check('add: parent-domain cookie created', added && added.domain === '.a.test' && !added.hostOnly && added.value === 'v+1' && !added.session, JSON.stringify(added));
  await pop.click('#add');
  await pop.fill('#f-name', 'evil');
  await pop.fill('#f-value', '1');
  await pop.fill('#f-domain', 'b.test');
  await pop.click('.editor button[type=submit]');
  check('add: other-site domain refused', /must be sub\.a\.test or one of its parent/.test(await pop.textContent('.editor .err')));
  await pop.fill('#f-domain', 'sub.a.test');
  await pop.selectOption('#f-sameSite', 'no_restriction');
  await pop.click('.editor button[type=submit]');
  check('add: SameSite=None without Secure refused with a clear message', /requires Secure/.test(await pop.textContent('.editor .err')));
  await pop.keyboard.press('Escape');
  check('Escape closes the editor', (await pop.locator('.editor').count()) === 0);

  // delete one of two same-named cookies (collateral protection)
  await row(pop, 'dup', 'sub.a.test').locator('.head').click();
  await pop.click('.editor button:has-text("Delete")');
  await pop.waitForFunction(() => /Deleted "dup"/.test(document.querySelector('#status').textContent));
  const dups = await cookiesAt({ domain: 'a.test', name: 'dup' });
  check('delete: removes only the chosen cookie (same-named parent cookie survives)', dups.length === 1 && dups[0].value === 'parentdup', JSON.stringify(dups));
  // copy value
  await row(pop, 'parent').locator('.head').click();
  await pop.click('.editor button:has-text("Copy value")');
  await pop.waitForFunction(() => /Copied|Copy failed/.test(document.querySelector('#status').textContent));
  check('copy value reports success', /Copied the value of "parent"/.test(await pop.textContent('#status')));

  // export JSON (free)
  const ex = await readDownload(pop, () => pop.click('#export'));
  const exported = JSON.parse(ex.text);
  const siteNow = await ev(async () => (await import('./cookies.js')).siteCookies('sub.a.test'));
  check('export: file name + every site cookie in the array format', /^cookies-sub\.a\.test-\d{4}-\d\d-\d\d\.json$/.test(ex.name) && Array.isArray(exported) && exported.length === siteNow.length && names(exported) === names(siteNow), `${ex.name} ${names(exported)} vs ${names(siteNow)}`);
  check('export: partitionKey, secure, path kept', exported.find((c) => c.name === 'chip')?.partitionKey?.topLevelSite === 'https://b.test' && exported.find((c) => c.name === 'sec')?.secure && exported.find((c) => c.name === 'adm')?.path === '/admin');
  check('export: warning shown', /login sessions/.test(await pop.textContent('#status')));

  // Pro gates while Free (the "parent" editor is still open from the copy test)
  await pop.click('.editor button:has-text("Protect")');
  check('free: protect is Pro-only', /part of Pro/.test(await pop.textContent('#status')) && (await ev(async () => (await chrome.storage.local.get('protected')).protected)) === undefined);
  await pop.click('#export-txt');
  check('free: cookies.txt export is Pro-only', /part of Pro/.test(await pop.textContent('#status')));
  await pop.click('#tab-profiles');
  check('free: profiles disabled', (await pop.isDisabled('#p-save')) && /part of Pro/.test(await pop.textContent('#p-status')));
  await pop.click('#tab-cookies');
  await pop.close();

  // ---------- Pro: protect + delete all ----------
  await setLicense(good);
  pop = await openPopup();
  await pop.waitForSelector('body[data-ready]');
  check('popup shows Pro plan', (await pop.textContent('#plan')) === 'Pro');
  await row(pop, 'parent').locator('.head').click();
  await pop.click('.editor button:has-text("Protect")');
  await pop.waitForFunction(() => /is protected/.test(document.querySelector('#status').textContent));
  check('protect: lock shown on the row, delete disabled', (await row(pop, 'parent').locator('.lock').count()) === 1 && (await pop.isDisabled('.editor button:has-text("Delete")')));
  const nSite = (await rowNames(pop)).split(',').length;
  await pop.click('#delall');
  check('delete all asks for confirmation first', /Really delete \d+ cookies\?/.test(await pop.textContent('#delall')) && (await rowNames(pop)).split(',').length === nSite);
  await pop.click('#delall');
  await pop.waitForFunction(() => /Deleted \d+ cookies; kept 1 protected/.test(document.querySelector('#status').textContent));
  check('delete all: every site cookie gone except the protected one (incl. parent-domain, secure, partitioned, other path)', (await rowNames(pop)) === 'parent' && names(await ev(async () => (await import('./cookies.js')).siteCookies('sub.a.test'))) === 'parent', await rowNames(pop));
  check('delete all: other sites untouched (sibling, apex host-only, b.test)', (await cookiesAt({ domain: 'other.a.test' })).length === 1 && (await cookiesAt({ url: 'http://a.test/', name: 'apexonly' })).length === 1 && (await cookiesAt({ domain: 'b.test' })).length === 1);

  // import round trip (paste)
  await pop.click('#import-toggle');
  await pop.fill('#import-text', ex.text);
  await pop.click('#import-go');
  await pop.waitForFunction(() => /Imported/.test(document.querySelector('#status').textContent));
  const after = await ev(async () => (await import('./cookies.js')).siteCookies('sub.a.test'));
  const key = (c) => [c.name, c.domain, c.path, c.value, c.secure, c.httpOnly, c.sameSite, c.session, c.partitionKey?.topLevelSite || ''].join('|');
  check('import round trip: same cookies with same fields', after.map(key).sort().join('\n') === siteNow.map(key).sort().join('\n'), `\n${after.map(key).sort().join('\n')}\n--\n${siteNow.map(key).sort().join('\n')}`);
  check('import: status counts (parent already existed and is overwritten)', new RegExp(`Imported ${siteNow.length} cookies`).test(await pop.textContent('#status')), await pop.textContent('#status'));
  await pop.fill('#import-text', JSON.stringify([{ name: 'x1', value: '1', domain: 'b.test' }, { name: 'x2', value: '2', domain: '.a.test' }, { name: 'bad;', value: '1', domain: 'a.test' }]));
  await pop.click('#import-go');
  await pop.waitForFunction(() => /Imported 1 cookie\./.test(document.querySelector('#status').textContent));
  const st = await pop.textContent('#status');
  check('import: other-site cookie skipped, invalid reported', /1 cookie for other sites skipped/.test(st) && /#3/.test(st) && (await cookiesAt({ domain: 'b.test', name: 'x1' })).length === 0, st);
  await pop.fill('#import-text', '[{"name": ');
  await pop.click('#import-go');
  check('import: invalid JSON gives a clear error', /Nothing imported\. This is not valid JSON/.test(await pop.textContent('#status')));
  // cookies.txt import via file input
  await pop.setInputFiles('#import-file', { name: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from(`# Netscape HTTP Cookie File\n.a.test\tTRUE\t/\tFALSE\t${far}\tfromtxt\tT\n#HttpOnly_sub.a.test\tFALSE\t/\tFALSE\t0\ttxthttp\tH\n`) });
  await pop.waitForFunction(() => /Imported 2 cookies/.test(document.querySelector('#status').textContent));
  const ft = await cookiesAt({ domain: 'a.test', name: 'txthttp' });
  check('import cookies.txt from a file (httpOnly + session honoured)', ft[0]?.httpOnly && ft[0]?.session && (await cookiesAt({ domain: 'a.test', name: 'fromtxt' }))[0]?.domain === '.a.test');

  // cookies.txt export (Pro)
  const tx = await readDownload(pop, () => pop.click('#export-txt'));
  check('cookies.txt export (Pro)', /^cookies-sub\.a\.test-.*\.txt$/.test(tx.name) && tx.text.startsWith('# Netscape HTTP Cookie File') && tx.text.includes('.a.test\tTRUE\t/\tFALSE') && tx.text.includes('#HttpOnly_sub.a.test\tFALSE'));

  // ---------- storage editor ----------
  await pop.click('#tab-storage');
  await pop.waitForSelector('#s-list > li[data-key="theme"]');
  const sKeys = () => pop.$$eval('#s-list > li', (ls) => ls.map((l) => l.dataset.key).join(','));
  check('storage: localStorage listed with origin', (await sKeys()) === 'theme,token' && (await pop.textContent('#s-origin')) === `http://sub.a.test:${PORT}`);
  await pop.click('#s-list > li[data-key="theme"] .head');
  await pop.fill('#s-value', 'light');
  await pop.click('#view-storage .editor button[type=submit]');
  await pop.waitForFunction(() => /Saved "theme"/.test(document.querySelector('#s-status').textContent));
  check('storage: edit value written to the page', (await target.evaluate(() => localStorage.getItem('theme'))) === 'light');
  await pop.click('#s-add');
  await pop.fill('#s-key', 'newkey');
  await pop.fill('#s-value', '{"a":1}');
  await pop.click('#view-storage .editor button[type=submit]');
  await pop.waitForFunction(() => /Saved "newkey"/.test(document.querySelector('#s-status').textContent));
  check('storage: add entry', (await target.evaluate(() => localStorage.getItem('newkey'))) === '{"a":1}');
  await pop.click('#s-list > li[data-key="token"] .head');
  await pop.click('#view-storage .editor button:has-text("Delete")');
  await pop.waitForFunction(() => /Deleted "token"/.test(document.querySelector('#s-status').textContent));
  check('storage: delete entry', (await target.evaluate(() => localStorage.getItem('token'))) === null && (await sKeys()) === 'newkey,theme');
  await pop.selectOption('#area', 'session');
  check('storage: sessionStorage view', (await sKeys()) === 'draft');
  await pop.click('#s-clear');
  await pop.click('#s-clear');
  await pop.waitForFunction(() => /Cleared sessionStorage/.test(document.querySelector('#s-status').textContent));
  check('storage: clear sessionStorage (confirmed), localStorage untouched', (await target.evaluate(() => [sessionStorage.length, localStorage.length].join())) === '0,2');
  await target.evaluate(() => sessionStorage.setItem('draft', 'again'));

  // ---------- profiles (Pro) ----------
  await pop.click('#tab-profiles');
  await pop.fill('#p-name', 'staging-admin');
  await pop.click('#p-save');
  await pop.waitForFunction(() => /Saved "staging-admin"/.test(document.querySelector('#p-status').textContent));
  const profCookies = await ev(async () => (await import('./cookies.js')).siteCookies('sub.a.test'));
  // change state: delete all + different storage
  await ev(async () => { const C = await import('./cookies.js'); await C.deleteAll(await C.siteCookies('sub.a.test')); await chrome.cookies.set({ url: 'http://sub.a.test/', name: 'other_user', value: 'u2' }); });
  await target.evaluate(() => { localStorage.clear(); localStorage.setItem('user', 'guest'); sessionStorage.clear(); });
  await pop.click('#p-list > li[data-name="staging-admin"] button:has-text("Switch to")');
  await pop.waitForFunction(() => /Switched to "staging-admin"/.test(document.querySelector('#p-status').textContent));
  await target.waitForLoadState('load');
  await sleep(300);
  const restored = await ev(async () => (await import('./cookies.js')).siteCookies('sub.a.test'));
  check('profile switch: cookies restored exactly (other_user removed)', restored.map(key).sort().join('\n') === profCookies.map(key).sort().join('\n'), `${names(restored)} vs ${names(profCookies)}`);
  const stRestored = await target.evaluate(() => JSON.stringify([localStorage.getItem('theme'), localStorage.getItem('user'), sessionStorage.getItem('draft')]));
  check('profile switch: storage restored and tab reloaded', stRestored === '["light",null,"again"]', stRestored);
  await pop.click('#p-list > li[data-name="staging-admin"] button:has-text("Delete")');
  await pop.waitForFunction(() => /Deleted profile/.test(document.querySelector('#p-status').textContent));
  check('profile delete', (await pop.locator('#p-list > li').count()) === 0);
  // keyboard: arrow keys move between tabs
  await pop.focus('#tab-profiles');
  await pop.keyboard.press('ArrowRight');
  check('keyboard: arrow keys switch tabs', (await pop.getAttribute('#tab-cookies', 'aria-selected')) === 'true' && (await pop.evaluate(() => document.activeElement.id)) === 'tab-cookies');
  await pop.close();

  // ---------- all sites (Pro, options page) ----------
  await drv.reload({ waitUntil: 'load' });
  await drv.waitForSelector('body[data-ready]');
  check('options: protected cookie listed', /parent\s+\(\.a\.test\/\)/.test(await drv.textContent('#prot-list')));
  const all = await readDownload(drv, () => drv.click('#all-json'));
  const allJar = JSON.parse(all.text);
  check('all-sites export includes other sites (b.test, other.a.test, apex)', /^cookies-all-sites-/.test(all.name) && ['bcookie', 'sibling', 'apexonly', 'parent', 'chip'].every((n) => allJar.some((c) => c.name === n)), names(allJar));
  const allTxt = await readDownload(drv, () => drv.click('#all-txt'));
  check('all-sites cookies.txt export', allTxt.text.split('\n').filter((l) => l && !l.startsWith('# ')).length === allJar.length);
  await ev(async () => { for (const c of await chrome.cookies.getAll({ partitionKey: {} })) await chrome.cookies.remove({ url: (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path, name: c.name, ...(c.partitionKey ? { partitionKey: c.partitionKey } : {}) }); });
  check('(jar emptied for the import test)', (await cookiesAt({})).length === 0);
  await drv.setInputFiles('#all-import-file', { name: 'all.json', mimeType: 'application/json', buffer: Buffer.from(all.text) });
  await drv.waitForFunction(() => /Imported/.test(document.querySelector('#all-result').textContent));
  const reimported = await cookiesAt({});
  check('all-sites import restores the whole jar', reimported.length === allJar.length && names(reimported) === names(allJar), `${await drv.textContent('#all-result')} ${names(reimported)}`);
  await drv.click('#prot-list button');
  await drv.waitForFunction(() => /No protected/.test(document.querySelector('#prot-list').textContent));
  check('options: unprotect', (await ev(async () => (await chrome.storage.local.get('protected')).protected)).length === 0);

  // ---------- no access / unsupported ----------
  const cpage = watch(await ctx.newPage(), 'c.example');
  await cpage.goto(U('c.example', '/page?seed=1'), { waitUntil: 'load' });
  const cTab = await ev(async (u) => (await chrome.tabs.query({ url: u + '*' }))[0].id, U('c.example', '/page'));
  check('without host permission the cookies API sees nothing (page did set a cookie)', (await cpage.evaluate(() => document.cookie)).includes('pagecookie=1') && (await cookiesAt({ url: U('c.example', '/') })).length === 0);
  pop = await openPopup(cTab);
  check('no access: "Allow access to this site" shown with the exact origins', (await pop.isVisible('#grant')) && /c\.example/.test(await pop.textContent('#grant-origins')) && (await pop.isHidden('#main')));
  await pop.close();
  const blank = await ctx.newPage();
  await blank.goto('about:blank');
  const bTab = await ev(async () => (await chrome.tabs.query({ url: 'about:blank' }))[0]?.id);
  pop = await openPopup(bTab);
  check('unsupported page message', await pop.isVisible('#unsupported'));
  await pop.close();

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
