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
  const watchConsole = (w) => w.on?.('console', (m) => { if (m.type() === 'error' || /sound failed/.test(m.text())) errors.push(m.text()); });
  watchConsole(sw);
  ctx.on('serviceworker', watchConsole); // restarted workers
  const extId = new URL(sw.url()).host;
  check('service worker started', !!extId, extId);

  // Extension page used as a driver (same message path as the popup).
  const drv = await ctx.newPage();
  drv.on('pageerror', (e) => errors.push('options: ' + e.message));
  await drv.goto(`chrome-extension://${extId}/options.html`);
  const send = (msg) => drv.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const watches = () => drv.evaluate(async () => (await chrome.storage.session.get('watches')).watches || {});
  const tabIdOf = (urlPat) => drv.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, urlPat);
  const waitFor = async (fn, ms) => { const t = Date.now(); let v; while (Date.now() - t < ms) { if ((v = await fn())) return v; await sleep(300); } return v; };
  const cdp = await ctx.newCDPSession(drv);
  const killWorker = async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const t = targetInfos.find((x) => x.type === 'service_worker' && x.url.includes(extId));
    return t ? (await cdp.send('Target.closeTarget', { targetId: t.targetId })).success : false;
  };

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
      lineBreaks: await L.verifyToken(' ' + good.slice(0, 40) + '\r\n' + good.slice(40, 95) + ' \n ' + good.slice(95) + '\n', testPub),
      prodKeyRejects: await L.verifyToken(good, '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w='),
      isProBefore: await L.isPro()
    };
  }, { good, testPub });
  check('license: valid test token verifies', lt.good && lt.defaultKey);
  check('license: tampered payload rejected', lt.tamperedPayload === false);
  check('license: tampered signature rejected', lt.tamperedSig === false);
  check('license: garbage rejected', lt.garbage === false);
  check('license: key with line breaks and spaces (pasted from an email) accepted', lt.lineBreaks === true);
  check('license: prod key rejects test token', lt.prodKeyRejects === false);
  check('license: isPro false without key', lt.isProBefore === false);
  const wrongProduct = await drv.evaluate(async ({ t, testPub }) => (await import('./license.js')).verifyToken(t, testPub), { t: makeToken(pem, 'a@b.c', 'other-product'), testPub });
  check('license: wrong product rejected', wrongProduct === false);

  // ---- free plan: two starts for different tabs at the same moment must not both succeed ----
  const pR1 = await ctx.newPage(); await pR1.goto(`http://127.0.0.1:${PORT}/count?r1`);
  const pR2 = await ctx.newPage(); await pR2.goto(`http://127.0.0.1:${PORT}/count?r2`);
  const [tR1, tR2] = [await tabIdOf(`http://127.0.0.1/count?r1`), await tabIdOf(`http://127.0.0.1/count?r2`)];
  const rTooLong = await send({ type: 'start', tabId: tR1, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3000000, mode: 'none' } });
  check('interval over 7 days refused (page timer would overflow and reload nonstop)', rTooLong.ok === false && /Maximum/.test(rTooLong.error), JSON.stringify(rTooLong));
  await sleep(2100); // past the double-start dedupe window
  const rRace = await drv.evaluate(({ ids, origin }) => Promise.all(ids.map((id) => chrome.runtime.sendMessage({ type: 'start', tabId: id, origin, cfg: { intervalSec: 30, mode: 'none' } }))),
    { ids: [tR1, tR2], origin: `http://127.0.0.1:${PORT}` });
  const wRace = await watches();
  check('free: simultaneous starts on two tabs, only one wins', rRace.filter((r) => r.ok).length === 1 && Object.keys(wRace).length === 1, JSON.stringify(rRace));
  await send({ type: 'stop', tabId: tR1 }); await send({ type: 'stop', tabId: tR2 });
  await pR1.close(); await pR2.close();

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

  // popup: the free limit is checked before any site access prompt
  const popF = await ctx.newPage();
  popF.on('pageerror', (e) => errors.push('popup: ' + e.message));
  await popF.goto(`chrome-extension://${extId}/popup.html?tab=${tabB}`);
  await popF.waitForSelector('#toggle:not([disabled])');
  await popF.selectOption('#mode', 'appears'); await popF.fill('#text', 'in stock'); await popF.click('#toggle');
  await sleep(300);
  const pendingF = await drv.evaluate(async () => (await chrome.storage.session.get('pending')).pending);
  check('popup: free limit shown before asking for site access', /1 tab/.test(await popF.textContent('#status')) && !pendingF);
  await popF.close();

  // ---- pro ----
  await drv.evaluate(() => {
    window.__beeped = false; window.__beeps = 0;
    chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'beepDone') { window.__beeped = true; window.__beeps++; } });
  });
  await drv.fill('#license', good.slice(0, 50) + '\n' + good.slice(50, 120) + '\n  ' + good.slice(120));
  await drv.click('#save');
  await sleep(300);
  const stored = await drv.evaluate(async () => (await chrome.storage.sync.get('license')).license);
  check('options: key wrapped over lines saves (without the line breaks)', stored === good && /Saved/.test(await drv.textContent('#msg')), await drv.textContent('#msg'));
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

  // ---- two conditions met at the same moment: both beeps play, to the end ----
  const pN1 = await ctx.newPage(); await pN1.goto(`http://127.0.0.1:${PORT}/nbsp?1`);
  const pN2 = await ctx.newPage(); await pN2.goto(`http://127.0.0.1:${PORT}/nbsp?2`);
  const [tN1, tN2] = [await tabIdOf(`http://127.0.0.1/nbsp?1`), await tabIdOf(`http://127.0.0.1/nbsp?2`)];
  await drv.evaluate(() => { window.__beeps = 0; });
  const rBeep = await Promise.all([tN1, tN2].map((id) =>
    send({ type: 'start', tabId: id, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'stock', notify: false, sound: true } })));
  await sleep(4000);
  check('two alerts at once: both beeps play to the end', rBeep.every((r) => r.ok) && await drv.evaluate(() => window.__beeps) === 2, `beeps=${await drv.evaluate(() => window.__beeps)}`);

  // ---- text matching: &nbsp; and line breaks ----
  const rN = await Promise.all([[tN1, 'In stock'], [tN2, 'ships today']].map(([id, text]) =>
    send({ type: 'start', tabId: id, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text, notify: false, sound: false } })));
  const wN = await watches();
  check('plain text matches across &nbsp; and line breaks', rN.every((r) => r.ok) && wN[tN1]?.status === 'met' && wN[tN1].text === 'In stock' && wN[tN2]?.status === 'met', JSON.stringify([wN[tN1]?.status, wN[tN2]?.status]));
  await sleep(2100); // past the double-start dedupe window

  // ---- "Start again" with other settings right after a start is not swallowed by the double-start guard ----
  const rS1 = await send({ type: 'start', tabId: tN1, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'ships', notify: false, sound: false } });
  const rS2 = await send({ type: 'start', tabId: tN1, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'never shown text', notify: false, sound: false } });
  const wS = (await watches())[tN1];
  check('start with changed settings within 2s uses the new settings', rS1.ok && rS2.ok && wS?.text === 'never shown text' && wS.status === 'watching', JSON.stringify([wS?.text, wS?.status]));
  await send({ type: 'stop', tabId: tN1 });
  await pN1.close(); await pN2.close();

  // ---- hidden text (display:none) inside the selector does not count ----
  const pH = await ctx.newPage(); await pH.goto(`http://127.0.0.1:${PORT}/hidden`);
  const tH = await tabIdOf(`http://127.0.0.1/hidden`);
  const rH = await send({ type: 'start', tabId: tH, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 60, mode: 'appears', text: 'in stock', selector: '#b', notify: false, sound: false } });
  check('text in a hidden element is not reported as appeared', rH.ok && (await watches())[tH]?.status === 'watching', JSON.stringify((await watches())[tH]?.status));
  await send({ type: 'stop', tabId: tH }); await pH.close();

  // ---- "disappears" on a page that renders its text after the load event: no false alert ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pP = await ctx.newPage(); await pP.goto(`http://127.0.0.1:${PORT}/spa`); await sleep(1600);
  const tP = await tabIdOf(`http://127.0.0.1/spa`);
  const rP = await send({ type: 'start', tabId: tP, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'disappears', text: 'sold out', notify: false, sound: false } });
  await waitFor(async () => ((await watches())[tP]?.count || 0) >= 3 || (await watches())[tP]?.status !== 'watching', 25000);
  const wP = (await watches())[tP];
  check('"disappears" waits for late-rendered text after each reload', rP.ok && wP?.status === 'watching' && wP.count >= 3, `status=${wP?.status} count=${wP?.count}`);
  await send({ type: 'stop', tabId: tP }); await pP.close();

  // ---- text inside a same-origin iframe ----
  const pI = await ctx.newPage(); await pI.goto(`http://127.0.0.1:${PORT}/framed`);
  const tI = await tabIdOf(`http://127.0.0.1/framed`);
  const rI = await send({ type: 'start', tabId: tI, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'in stock', notify: false, sound: false } });
  const wI = await waitFor(async () => { const w = (await watches())[tI]; return w?.status === 'met' && w; }, 30000);
  check('text inside a same-origin iframe is found', rI.ok && wI?.count === 2, `count=${wI?.count}`);
  await pI.close();

  // ---- popup Start click (full user-gesture path), then the tab navigates to another site ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pD = await ctx.newPage();
  await pD.goto(`http://127.0.0.1:${PORT}/stock?d`);
  const tabD = await tabIdOf(`http://127.0.0.1/stock?d`);
  const popD = await ctx.newPage();
  popD.on('pageerror', (e) => errors.push('popup: ' + e.message));
  await popD.goto(`chrome-extension://${extId}/popup.html?tab=${tabD}`);
  await popD.waitForSelector('#toggle:not([disabled])');
  await popD.fill('#custom', '3'); await popD.selectOption('#mode', 'appears'); await popD.fill('#text', 'never shown text');
  await popD.click('#toggle');
  const wD = await waitFor(async () => (await watches())[tabD], 5000);
  const pendD = await drv.evaluate(async () => (await chrome.storage.session.get('pending')).pending);
  check('popup: Start click starts the watch and clears the pending request', wD?.status === 'watching' && wD.hasHost && !pendD, JSON.stringify(pendD));
  check('watched tab is not auto-discardable', (await drv.evaluate((id) => chrome.tabs.get(id), tabD)).autoDiscardable === false);
  await popD.close();
  await sleep(1000);
  await pD.goto(`http://localhost:${PORT}/count`);
  const goneD = await waitFor(async () => !(await watches())[tabD], 5000);
  const notesD = await drv.evaluate(() => new Promise((r) => chrome.notifications.getAll(r)));
  const tD = await drv.evaluate((id) => chrome.tabs.get(id), tabD);
  const badgeD = await drv.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabD);
  check('navigating to another site stops the watch with a notice', goneD && !!notesD['stopped:' + tabD] && badgeD === '' && tD.autoDiscardable === true);
  const countBefore = (await (await fetch(`http://127.0.0.1:${PORT}/hits`)).json()).count;
  await sleep(5000);
  const countAfter = (await (await fetch(`http://127.0.0.1:${PORT}/hits`)).json()).count;
  check('the other site is not reloaded', countAfter === countBefore, `${countBefore} -> ${countAfter}`);
  await pD.close();

  // ---- service worker killed mid-watch: state lives in storage, the watch still completes ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pE = await ctx.newPage();
  await pE.goto(`http://127.0.0.1:${PORT}/stock?e`);
  const tabE = await tabIdOf(`http://127.0.0.1/stock?e`);
  const rE = await send({ type: 'start', tabId: tabE, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'in stock', notify: false, sound: false } });
  const killed = await killWorker();
  const killed2 = await waitFor(killWorker, 10000); // again, once the reload has woken it up
  const wE = await waitFor(async () => { const w = (await watches())[tabE]; return w?.status === 'met' && w; }, 40000);
  check('service worker restarts mid-watch do not lose the watch', rE.ok && killed && killed2 && wE?.count === 3, `count=${wE?.count}`);
  await pE.close();

  // ---- network error page: the watch recovers (injection fails there, alarm fallback reloads) ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pF = await ctx.newPage();
  await pF.goto(`http://127.0.0.1:${PORT}/flaky`);
  const tabF = await tabIdOf(`http://127.0.0.1/flaky`);
  const rF = await send({ type: 'start', tabId: tabF, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'online', notify: false, sound: false } });
  await fetch(`http://127.0.0.1:${PORT}/down`);
  const onErrorPage = await waitFor(() => drv.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id }, func: () => 1 }).then(() => false, (e) => /error page/i.test(e.message)), tabF), 15000);
  await sleep(4000); // stay offline for a few more reload attempts
  await fetch(`http://127.0.0.1:${PORT}/up`);
  const tF = Date.now();
  const wF = await waitFor(async () => { const w = (await watches())[tabF]; return w?.status === 'met' && w; }, 90000);
  const hitsF = (await (await fetch(`http://127.0.0.1:${PORT}/hits`)).json()).flaky;
  check('recovers from a network error page', rF.ok && onErrorPage && wF?.status === 'met', `errorPage=${onErrorPage} hits=${hitsF} recovered ${Math.round((Date.now() - tF) / 1000)}s after the server came back`);
  await pF.close();

  // ---- a page that never finishes loading, and a watch whose first schedule was lost: the watchdog checks/revives ----
  await fetch(`http://127.0.0.1:${PORT}/reset`);
  const pL = await ctx.newPage(); await pL.goto(`http://127.0.0.1:${PORT}/slowimg`, { waitUntil: 'domcontentloaded' });
  const tL = await tabIdOf(`http://127.0.0.1/slowimg`);
  const rL = await send({ type: 'start', tabId: tL, origin: `http://127.0.0.1:${PORT}`, cfg: { intervalSec: 3, mode: 'appears', text: 'in stock', notify: false, sound: false } });
  const pY = await ctx.newPage(); await pY.goto(`http://127.0.0.1:${PORT}/stock?y`);
  const tY = await tabIdOf(`http://127.0.0.1/stock?y`);
  await drv.evaluate(async ({ tY, origin }) => {
    const { watches = {} } = await chrome.storage.session.get('watches');
    watches[tY] = { tabId: tY, origin, hasHost: true, intervalSec: 3, jitterPct: 0, mode: 'appears', text: 'in stock', regex: false, selector: '',
      notify: false, sound: false, focus: false, status: 'watching', count: 0, startedAt: Date.now() - 60000, lastChecked: null, nextAt: null };
    await chrome.storage.session.set({ watches });
  }, { tY, origin: `http://127.0.0.1:${PORT}` });
  await sleep(38000); // past the watchdog's grace period (interval + 30s)
  const loadingL = (await drv.evaluate((id) => chrome.tabs.get(id), tL)).status === 'loading';
  await drv.evaluate(() => chrome.alarms.create('watchdog', { when: Date.now() + 100 }));
  const wL = await waitFor(async () => { const w = (await watches())[tL]; return w?.status === 'met' && w; }, 20000);
  check('page that never finishes loading: the watchdog checks it before reloading', rL.ok && loadingL && wL?.status === 'met', `loading=${loadingL} status=${(await watches())[tL]?.status}`);
  const wY = await waitFor(async () => { const w = (await watches())[tY]; return w?.count >= 1 && w; }, 15000);
  check('watch that never got its first reload scheduled is revived by the watchdog', wY?.count >= 1, `count=${(await watches())[tY]?.count}`);
  await drv.evaluate(() => chrome.alarms.create('watchdog', { periodInMinutes: 1 }));
  await send({ type: 'stop', tabId: tY }); await pY.close(); await pL.close();

  // ---- alarm path result ----
  let wA = (await watches())[tabA];
  while ((wA?.count || 0) < 1 && Date.now() - tStartA < 50000) { wA = (await watches())[tabA]; if ((wA?.count || 0) >= 1) break; await sleep(1000); }
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
