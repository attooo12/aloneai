// End-to-end test. Run: node test/e2e.mjs
// Loads a TEST COPY of the extension: host_permissions pre-granted for 127.0.0.1 only (so localhost exercises the
// no-permission alarm path) and license.js patched with the TEST ONLY public key.
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from './make-license.mjs';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '..');
const PORT = 8765;
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'ru-ext-'));
const extCopy = join(tmp, 'ext');
cpSync(EXT, extCopy, { recursive: true, filter: (p) => !p.includes('/test') });
const man = JSON.parse(readFileSync(join(extCopy, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
writeFileSync(join(extCopy, 'manifest.json'), JSON.stringify(man, null, 2));
const testPub = readFileSync(join(HERE, 'TEST_ONLY_public_key.txt'), 'utf8').trim();
const lic = readFileSync(join(extCopy, 'license.js'), 'utf8').replace(/export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`);
writeFileSync(join(extCopy, 'license.js'), lic);
const pem = readFileSync(join(HERE, 'TEST_ONLY_private_key.pem'), 'utf8');

const server = spawn('python3', [join(HERE, 'server.py'), String(PORT)], { stdio: 'inherit' });
await sleep(500);

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  args: ['--headless=new', `--disable-extensions-except=${extCopy}`, `--load-extension=${extCopy}`]
});
const errors = [];
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  sw.on?.('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const extId = new URL(sw.url()).host;
  check('service worker started', !!extId, extId);

  // Extension page used as a driver (same message path as the popup).
  const drv = await ctx.newPage();
  drv.on('pageerror', (e) => errors.push('options: ' + e.message));
  await drv.goto(`chrome-extension://${extId}/options.html`);
  const send = (msg) => drv.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const watches = () => drv.evaluate(async () => (await chrome.storage.session.get('watches')).watches || {});
  const tabIdOf = (urlPat) => drv.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, urlPat);

  // ---- license ----
  const good = makeToken(pem);
  const lt = await drv.evaluate(async ({ good, testPub }) => {
    const L = await import('./license.js');
    const [b, s] = good.split('.');
    const tamperedBody = btoa(JSON.stringify({ product: 'reload-until', email_hash: 'x', sid: 'y', iat: 1 })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const flip = s[5] === 'A' ? 'B' : 'A';
    return {
      good: await L.verifyToken(good, testPub),
      defaultKey: await L.verifyToken(good),
      tamperedPayload: await L.verifyToken(tamperedBody + '.' + s, testPub),
      tamperedSig: await L.verifyToken(b + '.' + s.slice(0, 5) + flip + s.slice(6), testPub),
      garbage: await L.verifyToken('nonsense', testPub),
      prodKeyRejects: await L.verifyToken(good, '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w='),
      isProBefore: await L.isPro()
    };
  }, { good, testPub });
  check('license: valid test token verifies', lt.good && lt.defaultKey);
  check('license: tampered payload rejected', lt.tamperedPayload === false);
  check('license: tampered signature rejected', lt.tamperedSig === false);
  check('license: garbage rejected', lt.garbage === false);
  check('license: prod key rejects test token', lt.prodKeyRejects === false);
  check('license: isPro false without key', lt.isProBefore === false);
  const wrongProduct = await drv.evaluate(async ({ t, testPub }) => (await import('./license.js')).verifyToken(t, testPub), { t: makeToken(pem, 'a@b.c', 'other-product'), testPub });
  check('license: wrong product rejected', wrongProduct === false);

  // ---- free plan: interval reload on localhost (no host permission -> alarm path, 30s) ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pA = await ctx.newPage();
  await pA.goto(`http://localhost:${PORT}/count`);
  const tabA = await drv.evaluate(async () => (await chrome.tabs.query({})).find((t) => !t.url || t.url.startsWith('http://localhost'))?.id);
  const hostA = await drv.evaluate((o) => chrome.permissions.contains({ origins: [o + '/*'] }), `http://localhost:${PORT}`);
  check('no host permission for localhost (alarm path)', hostA === false);
  const rA = await send({ type: 'start', tabId: tabA, origin: `http://localhost:${PORT}`, cfg: { intervalSec: 30, mode: 'none' } });
  check('start interval-only watch without host permission', rA.ok, JSON.stringify(rA));
  await sleep(2100); // past the double-start dedupe window
  const rA2 = await send({ type: 'start', tabId: tabA, origin: `http://localhost:${PORT}`, cfg: { intervalSec: 10, mode: 'none' } });
  check('<30s without host permission refused', rA2.ok === false, JSON.stringify(rA2));
  const tStartA = Date.now();

  // ---- free limit: second tab refused ----
  const pB = await ctx.newPage();
  await pB.goto(`http://127.0.0.1:${PORT}/stock`);
  const tabB = await tabIdOf(`http://127.0.0.1/stock*`);
  const cfgB = { intervalSec: 3, mode: 'appears', text: 'in stock', notify: true, sound: true, focus: true };
  const rB = await send({ type: 'start', tabId: tabB, origin: `http://127.0.0.1:${PORT}`, cfg: cfgB });
  check('free: second simultaneous tab refused', rB.ok === false && /1 tab/.test(rB.error), rB.error);
  const rRegex = await send({ type: 'start', tabId: tabB, origin: `http://127.0.0.1:${PORT}`, cfg: { ...cfgB, regex: true } });
  check('free: regex refused', rRegex.ok === false && /Pro/.test(rRegex.error));

  // ---- pro ----
  await drv.evaluate((k) => {
    window.__beeped = false;
    chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'beepDone') window.__beeped = true; });
    return chrome.storage.sync.set({ license: k });
  }, good);
  const proNow = await drv.evaluate(async () => (await import('./license.js')).isPro());
  check('isPro true after storing test license', proNow === true);
  const rB2 = await send({ type: 'start', tabId: tabB, origin: `http://127.0.0.1:${PORT}`, cfg: { ...cfgB, text: 'in\\s+stock', regex: true, selector: '#s' } });
  check('pro: second tab with regex + selector starts', rB2.ok, JSON.stringify(rB2));

  let wB; const t0 = Date.now();
  while (Date.now() - t0 < 40000) { wB = (await watches())[tabB]; if (wB?.status === 'met') break; await sleep(500); }
  const hits = await (await fetch(`http://127.0.0.1:${PORT}/hits`)).json();
  check('tab reloaded until "IN STOCK" and stopped', wB?.status === 'met' && wB.count === 3 && hits.stock === 4, `count=${wB?.count} serverHits=${hits.stock} in ${Date.now() - t0}ms`);
  const badge = await drv.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabB);
  check('badge shows ✓ when met', badge === '✓', JSON.stringify(badge));
  const notes = await drv.evaluate(() => new Promise((r) => chrome.notifications.getAll(r)));
  check('notification created', !!notes['met:' + tabB], JSON.stringify(Object.keys(notes)));
  await sleep(4000);
  check('offscreen beep played (beepDone received)', await drv.evaluate(() => window.__beeped));
  const hits2 = await (await fetch(`http://127.0.0.1:${PORT}/hits`)).json();
  check('no further reloads after condition met', hits2.stock === 4, `hits=${hits2.stock}`);

  // popup render against the met tab
  const pop = await ctx.newPage();
  pop.on('pageerror', (e) => errors.push('popup: ' + e.message));
  await pop.setViewportSize({ width: 340, height: 600 });
  await pop.goto(`chrome-extension://${extId}/popup.html?tab=${tabB}`);
  await sleep(800);
  const popStatus = await pop.textContent('#status');
  check('popup shows met status', /appeared/.test(popStatus), popStatus.trim());
  await pop.screenshot({ path: join(HERE, 'popup-met.png') });
  await pop.goto(`chrome-extension://${extId}/popup.html?tab=${tabA}`);
  await sleep(1200);
  check('popup shows countdown for watching tab', /Next reload in/.test(await pop.textContent('#status')), (await pop.textContent('#status')).trim());
  await pop.screenshot({ path: join(HERE, 'popup-watching.png') });

  // ---- disappears mode ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pC = await ctx.newPage();
  await pC.goto(`http://127.0.0.1:${PORT}/stock?c`);
  const tabC = await tabIdOf(`http://127.0.0.1/stock?c`);
  const rC = await send({ type: 'start', tabId: tabC, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, jitterPct: 25, mode: 'disappears', text: 'sold out', notify: false, sound: false } });
  let wC; const t1 = Date.now();
  while (Date.now() - t1 < 40000) { wC = (await watches())[tabC]; if (wC?.status === 'met') break; await sleep(500); }
  check('"until disappears" mode with jitter', rC.ok && wC?.status === 'met' && wC.count === 3, `count=${wC?.count}`);

  // ---- alarm path result ----
  let wA; 
  while (Date.now() - tStartA < 50000) { wA = (await watches())[tabA]; if ((wA?.count || 0) >= 1) break; await sleep(1000); }
  check('interval-only (alarm) reload happened', wA?.count >= 1, `count=${wA?.count} after ${Math.round((Date.now() - tStartA) / 1000)}s`);

  // ---- stop + tab close ----
  const rStop = await send({ type: 'stop', tabId: tabA });
  check('stop removes watch', rStop.ok && !(await watches())[tabA] && (await drv.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabA)) === '');
  await pB.close(); await sleep(500);
  check('closing tab removes its watch', !(await watches())[tabB]);

  check('no page/SW errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.error(e); check('test run threw', false, String(e));
} finally {
  await ctx.close(); server.kill(); rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
