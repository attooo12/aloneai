// End-to-end test (headless Chromium). Run: node test/e2e.mjs
// Loads a TEST COPY of the extension with host_permissions for 127.0.0.1 (a popup opened as a tab gets no
// activeTab grant), the tabs permission (so it can read tab URLs like activeTab allows) and license.js patched with the TEST ONLY public key.
// Headless Chromium cancels a real EyeDropper immediately, so pick results come from a stub EyeDropper installed
// in the extension's isolated world; the real EyeDropper is still opened once to prove user activation reaches it.
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from './make-license.mjs';
import { formats, exportPalette } from '../color.js';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '..');
const PORT = 8766;
const PROD_KEY = '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w=';
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'cp-ext-'));
const extCopy = join(tmp, 'ext');
cpSync(EXT, extCopy, { recursive: true, filter: (p) => !p.includes('/test') });
const man = JSON.parse(readFileSync(join(extCopy, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
man.permissions.push('tabs'); // lets the popup-as-tab read tab URLs, as activeTab does for the real popup
writeFileSync(join(extCopy, 'manifest.json'), JSON.stringify(man, null, 2));
const testPub = readFileSync(join(HERE, 'TEST_ONLY_public_key.txt'), 'utf8').trim();
const lic = readFileSync(join(extCopy, 'license.js'), 'utf8').replace(/export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`);
writeFileSync(join(extCopy, 'license.js'), lic);
const pem = readFileSync(join(HERE, 'TEST_ONLY_private_key.pem'), 'utf8');

const PAGE = `<!doctype html><title>Test page</title><style>html,body{margin:0;height:100%;background:#336699}</style>
<h1 style="color:#fff">Colour test page</h1><script>window.clicks=0;document.addEventListener('click',()=>window.clicks++)</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); }).listen(PORT, '127.0.0.1');

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  viewport: { width: 900, height: 700 },
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
  check('service worker started', !!extId, extId);
  const EXT_URL = `chrome-extension://${extId}`;

  const drv = watch(await ctx.newPage(), 'options');
  await drv.goto(`${EXT_URL}/options.html`);
  const history = () => drv.evaluate(async () => (await chrome.storage.local.get('history')).history || []);
  const tabIdOf = (u) => drv.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, u);

  // ---------- license ----------
  const good = makeToken(pem);
  const tamperedPayload = (() => {
    const [, s] = good.split('.');
    const body = Buffer.from(JSON.stringify({ product: 'color-picker', email_hash: 'x', sid: 'y', iat: 1 })).toString('base64url');
    return body + '.' + s;
  })();
  const lt = await drv.evaluate(async ({ good, testPub, tamperedPayload, prod, otherProduct }) => {
    const L = await import('./license.js');
    const [b, s] = good.split('.');
    const flip = s[5] === 'A' ? 'B' : 'A';
    return {
      product: L.PRODUCT,
      good: await L.verifyToken(good, testPub),
      defaultKey: await L.verifyToken(good),
      tamperedPayload: await L.verifyToken(tamperedPayload, testPub),
      tamperedSig: await L.verifyToken(b + '.' + s.slice(0, 5) + flip + s.slice(6), testPub),
      garbage: await L.verifyToken('nonsense', testPub),
      prodKeyRejects: await L.verifyToken(good, prod),
      otherProduct: await L.verifyToken(otherProduct, testPub),
      isProBefore: await L.isPro()
    };
  }, { good, testPub, tamperedPayload, prod: PROD_KEY, otherProduct: makeToken(pem, 'a@b.c', 'reload-until') });
  check('license: PRODUCT is color-picker', lt.product === 'color-picker');
  check('license: valid test token verifies', lt.good && lt.defaultKey);
  check('license: tampered payload rejected', lt.tamperedPayload === false);
  check('license: tampered signature rejected', lt.tamperedSig === false);
  check('license: garbage rejected', lt.garbage === false);
  check('license: production key rejects test token', lt.prodKeyRejects === false);
  check('license: a Reload Until token does not unlock Color Picker', lt.otherProduct === false);
  check('license: isPro false without key', lt.isProBefore === false);
  const shippedKey = readFileSync(join(EXT, 'license.js'), 'utf8').match(/PUBLIC_KEY = '([^']*)'/)[1];
  check('shipped license.js uses the production public key', shippedKey === PROD_KEY);

  // ---------- store: gating + history ----------
  const gate = await drv.evaluate(async () => {
    const S = await import('./store.js');
    try { await S.createPalette('x'); return 'created'; } catch (e) { return e.code; }
  });
  check('free: createPalette refused (pro_required)', gate === 'pro_required', gate);
  const h = await drv.evaluate(async () => {
    const S = await import('./store.js');
    for (let i = 0; i < 14; i++) await S.addToHistory('#0000' + (i + 16).toString(16));
    const a = await S.getHistory();
    await S.addToHistory('#00001a'); // already present: moves to the front
    const b = await S.getHistory();
    let invalid = 'accepted';
    try { await S.addToHistory('not a colour'); } catch { invalid = 'rejected'; }
    return { lenA: a.length, first: a[0].hex, last: a[11].hex, lenB: b.length, bFirst: b[0].hex, dupes: b.filter((x) => x.hex === '#00001A').length, invalid };
  });
  check('history keeps the last 12, newest first', h.lenA === 12 && h.first === '#00001D' && h.last === '#000012', JSON.stringify(h));
  check('history: re-pick moves to front without duplicates', h.lenB === 12 && h.bFirst === '#00001A' && h.dupes === 1);
  check('history: invalid colour rejected', h.invalid === 'rejected');
  await drv.evaluate(async () => (await import('./store.js')).clearHistory());

  // ---------- pick from the popup (click => user activation passed to the page) ----------
  const page = watch(await ctx.newPage(), 'page');
  await page.goto(`http://127.0.0.1:${PORT}/`);
  const tabId = await tabIdOf(`http://127.0.0.1:${PORT}/*`);
  // Injected from the service worker: a Playwright page.evaluate would carry a user gesture into the page.
  const stub = (hex) => sw.evaluate(({ tabId, hex }) => chrome.scripting.executeScript({
    target: { tabId }, args: [hex],
    func: (hex) => {
      window.__ed = { calls: 0 };
      window.EyeDropper = class { async open() { window.__ed = { calls: window.__ed.calls + 1, activation: navigator.userActivation.isActive }; return { sRGBHex: hex }; } };
    }
  }), { tabId, hex });
  const edState = () => drv.evaluate(async (tabId) => (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.__ed })) [0].result, tabId);
  const shadowText = (sel) => page.evaluate((sel) => document.querySelector('aloneai-color-picker')?.shadowRoot?.querySelector(sel)?.textContent ?? null, sel);

  await stub('#336699');
  const pop = watch(await ctx.newPage(), 'popup');
  await pop.setViewportSize({ width: 364, height: 640 });
  await pop.goto(`${EXT_URL}/popup.html?tab=${tabId}`);
  await pop.waitForSelector('#f-hex', { state: 'attached' });
  check('popup: Free plan pill', (await pop.textContent('#plan')).trim() === 'Free');
  check('popup: shows shortcut hint', /Alt\+Shift\+E/.test(await pop.textContent('#hint')), await pop.textContent('#hint'));
  await pop.click('#pick');
  await sleep(800);
  check('popup click: picker injected, waits for the popup to close', /waiting-for-popup/.test(await pop.textContent('#status')), await pop.textContent('#status'));
  const ed1 = await edState();
  check('popup click: page had user activation when EyeDropper opened', ed1?.calls === 1 && ed1.activation === true, JSON.stringify(ed1));
  check('pick saved to history', (await history())[0]?.hex === '#336699');
  check('popup updates to the picked colour', (await pop.textContent('#f-hex')) === '#336699' && (await pop.textContent('#f-rgb')) === 'rgb(51, 102, 153)' && (await pop.textContent('#f-hsl')) === 'hsl(210, 50%, 40%)');
  check('in-page toast shows the HEX', /#336699/.test((await shadowText('.toast')) || ''), await shadowText('.toast'));

  // Real (unstubbed) EyeDropper: headless cancels it at once, but it must be opened (not refused for lack of activation).
  // Headless reports "not available" (no screen), which the picker treats like a missing focus: click-to-start overlay.
  await page.reload();
  await pop.click('#pick');
  await sleep(800);
  const realState = await pop.textContent('#status');
  const realToast = (await shadowText('.toast')) || '';
  const realOverlay = (await shadowText('.overlay')) !== null;
  check('real EyeDropper reached with activation (headless cannot show it -> overlay fallback)', /waiting-for-popup/.test(realState) && realOverlay && !/gesture/i.test(realToast), `${realState} / overlay=${realOverlay} ${realToast}`);
  await page.bringToFront();
  await page.keyboard.press('Escape');
  await pop.bringToFront();

  // ---------- keyboard-shortcut path (no user activation): overlay, then click ----------
  await page.bringToFront();
  await page.reload();
  await stub('#AA5500');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
  const tabObj = await drv.evaluate((id) => chrome.tabs.get(id), tabId);
  const sc = await sw.evaluate((t) => globalThis.__startFromShortcut(t), tabObj);
  check('shortcut: no activation -> overlay prompt shown', sc.ok && sc.state === 'prompt' && (await shadowText('.pill'))?.includes('start the eyedropper'), JSON.stringify(sc));
  await page.mouse.click(300, 300);
  await sleep(600);
  const ed2 = await edState();
  check('shortcut: click on overlay opens EyeDropper with activation', ed2?.calls === 1 && ed2.activation === true, JSON.stringify(ed2));
  check('shortcut: the click did not reach the page', (await page.evaluate(() => window.clicks)) === 0);
  check('shortcut: pick saved to history', (await history())[0]?.hex === '#AA5500');
  check('auto-copy: HEX on the clipboard + toast says copied', (await page.evaluate(() => navigator.clipboard.readText())) === '#AA5500' && /copied/.test((await shadowText('.toast')) || ''), await shadowText('.toast'));
  // Reload between runs: the click above left the page with fresh user activation (which would, correctly, skip the prompt).
  await page.reload();
  await stub('#AA5500');
  const sc2 = await sw.evaluate((t) => globalThis.__startFromShortcut(t), tabObj);
  await page.keyboard.press('Escape');
  await sleep(200);
  const ed3 = await edState();
  check('shortcut: Esc cancels the overlay', sc2.state === 'prompt' && (await shadowText('.overlay')) === null && ed3.calls === 0, JSON.stringify({ sc2, ed3 }));
  await page.reload();
  await stub('#123456');
  const sc3 = await sw.evaluate((t) => globalThis.__startFromShortcut(t), tabObj);
  await page.keyboard.press('Enter');
  await sleep(500);
  check('shortcut: Enter starts the EyeDropper (keyboard users)', sc3.state === 'prompt' && (await history())[0]?.hex === '#123456', JSON.stringify(sc3));

  // ---------- pages the extension can't run on ----------
  const sys = watch(await ctx.newPage(), 'sys');
  await sys.goto('chrome://version');
  const sysTab = await tabIdOf('chrome://version/*');
  const pop2 = watch(await ctx.newPage(), 'popup-restricted');
  await pop2.goto(`${EXT_URL}/popup.html?tab=${sysTab}`);
  await sleep(500);
  check('restricted page: message shown on open', /doesn't let extensions run on this page/.test(await pop2.textContent('#msg')), await pop2.textContent('#msg'));
  await pop2.click('#pick');
  await sleep(300);
  check('restricted page: Pick shows message + picker window button', /picker window/.test(await pop2.textContent('#msg')) && (await pop2.locator('#msg button').count()) === 1);
  await pop2.click('#msg button');
  await sleep(800);
  const winTabs = () => drv.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => t.url?.startsWith(u)).length, `${EXT_URL}/popup.html?window=1`);
  check('restricted page: "Open picker window" opens it', (await winTabs()) === 1);
  const sysObj = await drv.evaluate((id) => chrome.tabs.get(id), sysTab);
  const sc4 = await sw.evaluate((t) => globalThis.__startFromShortcut(t), sysObj);
  await sleep(500);
  check('restricted page: shortcut focuses the picker window instead (no duplicate)', sc4.ok === false && (await winTabs()) === 1);
  const other = watch(await ctx.newPage(), 'other');
  await other.goto(`http://localhost:${PORT}/`); // no host permission in the test copy
  const otherTab = await tabIdOf(`http://localhost:${PORT}/*`);
  await pop2.goto(`${EXT_URL}/popup.html?tab=${otherTab}`);
  await pop2.click('#pick');
  await sleep(300);
  check('page without access: clear message', /can't be accessed right now/.test(await pop2.textContent('#msg')), await pop2.textContent('#msg'));

  // ---------- picker window: EyeDropper directly in the extension page ----------
  const winPage = ctx.pages().find((p) => p.url().includes('popup.html?window=1'));
  watch(winPage, 'window');
  await winPage.evaluate(() => { window.EyeDropper = class { async open() { return { sRGBHex: '#0f0f0f' }; } }; });
  await winPage.click('#pick');
  await sleep(300);
  check('picker window: pick saved and shown', (await history())[0]?.hex === '#0F0F0F' && (await winPage.textContent('#f-hex')) === '#0F0F0F');
  await winPage.close();

  // ---------- popup (free) ----------
  await pop.bringToFront();
  await pop.reload();
  await pop.waitForSelector('#f-hex', { state: 'attached' });
  check('free: OKLCH is locked', (await pop.textContent('#f-oklch')).trim() === 'Pro' && await pop.locator('[data-copy=oklch]').isHidden());
  check('free: "Add to palette" hidden', await pop.locator('#add-row').isHidden());
  await pop.fill('#input', 'hsl(210, 40%, 17%)');
  await pop.press('#input', 'Enter');
  await sleep(200);
  check('typed colour converts and is saved', (await history())[0]?.hex === '#1A2B3D' && (await pop.textContent('#f-rgb')) === 'rgb(26, 43, 61)');
  const readClipboard = async () => { await page.bringToFront(); const t = await page.evaluate(() => navigator.clipboard.readText()); await pop.bringToFront(); return t; };
  await pop.click('[data-copy=rgb]');
  const copiedLabel = await pop.waitForFunction(() => document.querySelector('[data-copy=rgb]').textContent === 'Copied', null, { timeout: 1000 }).then(() => 'Copied', () => 'not shown');
  const clip = await readClipboard();
  check('copy button puts the value on the clipboard', clip === 'rgb(26, 43, 61)' && copiedLabel === 'Copied', `${clip} / ${copiedLabel}`);
  await pop.locator('#history button.sw').nth(1).click();
  check('clicking a history swatch makes it current', (await pop.textContent('#f-hex')) === '#0F0F0F');
  await pop.click('#tab-palettes');
  check('free: palettes tab is locked', await pop.locator('#panel-palettes [data-locked]').isVisible() && await pop.locator('#panel-palettes [data-unlocked]').isHidden());
  await pop.click('#tab-contrast');
  check('free: contrast tab is locked', await pop.locator('#panel-contrast [data-locked]').isVisible());
  await pop.click('#tab-pick');
  await pop.screenshot({ path: join(HERE, 'popup-free.png') });

  // ---------- options: license entry ----------
  await drv.bringToFront();
  await drv.fill('#license', 'garbage.key');
  await drv.click('#save');
  await sleep(100);
  check('options: invalid key rejected', /not valid/.test(await drv.textContent('#msg')));
  await drv.fill('#license', tamperedPayload);
  await drv.click('#save');
  await sleep(100);
  check('options: tampered key rejected', /not valid/.test(await drv.textContent('#msg')) && !(await drv.evaluate(async () => (await chrome.storage.sync.get('license')).license)));
  await drv.fill('#license', good);
  await drv.click('#save');
  await sleep(200);
  check('options: valid key unlocks Pro', /Pro unlocked/.test(await drv.textContent('#msg')) && /Pro is active/.test(await drv.textContent('#plan-status')));
  check('options: mentions AloneAI autonomous agent + repo', /autonomous AI agent/.test(await drv.textContent('body')) && (await drv.locator('a[href="https://github.com/attooo12/aloneai"]').count()) === 1);

  // ---------- popup (pro) ----------
  await pop.bringToFront();
  await pop.reload();
  await pop.waitForSelector('#f-hex', { state: 'attached' });
  await sleep(200);
  check('pro: plan pill shows Pro', (await pop.textContent('#plan')).trim() === 'Pro');
  const cur = (await history())[0].hex;
  check('pro: OKLCH shown', (await pop.textContent('#f-oklch')) === formats(cur).oklch, await pop.textContent('#f-oklch'));
  await pop.click('#tab-palettes');
  await pop.click('#pal-new');
  await sleep(150);
  await pop.fill('#pal-name', 'Brand Blue');
  await pop.click('#pal-rename');
  await sleep(150);
  await pop.click('#tab-pick');
  await pop.fill('#input', '#336699');
  await pop.press('#input', 'Enter');
  await pop.click('#add-current');
  await sleep(150);
  await pop.fill('#input', '#FFCC00');
  await pop.press('#input', 'Enter');
  await pop.click('#tab-palettes');
  await pop.click('#pal-add');
  await sleep(150);
  let pals = await drv.evaluate(async () => (await chrome.storage.local.get('palettes')).palettes);
  check('pro: palette created, renamed, colours added', pals.length === 1 && pals[0].name === 'Brand Blue' && JSON.stringify(pals[0].colors) === JSON.stringify([cur, '#336699', '#FFCC00']), JSON.stringify(pals));
  await pop.click('#pal-colors li:first-child button.rm');
  await sleep(150);
  pals = await drv.evaluate(async () => (await chrome.storage.local.get('palettes')).palettes);
  check('pro: remove colour from palette', JSON.stringify(pals[0].colors) === '["#336699","#FFCC00"]');
  let exportsOk = true;
  for (const kind of ['css', 'tailwind4', 'tailwind3', 'json']) {
    await pop.selectOption('#exp-kind', kind);
    if ((await pop.inputValue('#exp-out')) !== exportPalette(pals[0], kind)) exportsOk = false;
  }
  check('pro: all four exports rendered in the popup', exportsOk);
  await pop.selectOption('#exp-kind', 'css');
  await pop.click('#exp-copy');
  check('pro: export copied', (await readClipboard()) === ':root {\n  --brand-blue-1: #336699;\n  --brand-blue-2: #ffcc00;\n}\n');
  const many = await drv.evaluate(async () => {
    const S = await import('./store.js');
    for (let i = 0; i < 30; i++) await S.createPalette('Bulk ' + i, ['#' + (i * 7).toString(16).padStart(6, '0')]);
    return (await S.getPalettes()).length;
  });
  check('pro: palettes are unlimited (31 saved)', many === 31);
  await pop.reload();
  await pop.waitForSelector('#f-hex', { state: 'attached' });
  await pop.click('#tab-palettes');
  await pop.screenshot({ path: join(HERE, 'popup-palettes.png') });
  await pop.selectOption('#pal-select', { index: 5 });
  const delName = await pop.inputValue('#pal-name');
  await pop.click('#pal-delete');
  await sleep(100);
  const afterOne = (await drv.evaluate(async () => (await chrome.storage.local.get('palettes')).palettes)).length;
  await pop.click('#pal-delete');
  await sleep(150);
  pals = await drv.evaluate(async () => (await chrome.storage.local.get('palettes')).palettes);
  check('pro: delete needs a confirm click', afterOne === 31 && pals.length === 30 && !pals.some((p) => p.name === delName), `${afterOne} -> ${pals.length}`);

  // contrast
  await pop.click('#tab-contrast');
  await pop.fill('#c-fg', '#767676');
  await pop.fill('#c-bg', '#ffffff');
  const res = async () => [await pop.textContent('#ratio'), await pop.textContent('#c-aa'), await pop.textContent('#c-aa-lg'), await pop.textContent('#c-aaa'), await pop.textContent('#c-aaa-lg')].join(' ');
  check('contrast #767676/#fff = 4.54:1, AA pass, AAA fail', (await res()) === '4.54:1 Pass Pass Fail Pass', await res());
  await pop.fill('#c-fg', '#777777');
  check('contrast #777777/#fff = 4.47:1, AA normal fail, AA large pass', (await res()) === '4.47:1 Fail Pass Fail Fail', await res());
  await pop.fill('#c-fg', 'rgb(0, 0, 0)');
  check('contrast black/white = 21.00:1 all pass (rgb() input)', (await res()) === '21.00:1 Pass Pass Pass Pass', await res());
  await pop.fill('#c-fg', '#595959');
  await pop.click('#c-swap');
  check('contrast swap keeps the ratio (7.00:1 AAA)', (await pop.inputValue('#c-fg')) === '#FFFFFF' && (await res()) === '7.00:1 Pass Pass Pass Pass', await res());
  await pop.fill('#c-bg', 'nope');
  check('contrast: invalid input explained', /not valid/.test(await pop.textContent('#c-err')));
  await pop.fill('#c-bg', '#1E3A8A');
  await pop.click('[data-use=fg]');
  check('contrast: "Current" uses the current colour', (await pop.inputValue('#c-fg')) === '#FFCC00');
  await pop.emulateMedia({ colorScheme: 'dark' });
  await pop.screenshot({ path: join(HERE, 'popup-contrast-dark.png') });
  await pop.emulateMedia({ colorScheme: 'light' });

  // ---------- tampered license in storage: Pro locks again, data kept ----------
  await drv.evaluate((t) => chrome.storage.sync.set({ license: t }), tamperedPayload);
  await pop.reload();
  await pop.waitForSelector('#f-hex', { state: 'attached' });
  await sleep(200);
  const g2 = await drv.evaluate(async () => { try { await (await import('./store.js')).createPalette('x'); return 'created'; } catch (e) { return e.code; } });
  check('tampered stored license: back to Free, palettes locked, data kept', (await pop.textContent('#plan')).trim() === 'Free' && await pop.locator('#panel-palettes [data-locked]').count() === 1 && g2 === 'pro_required' && (await drv.evaluate(async () => (await chrome.storage.local.get('palettes')).palettes.length)) === 30, g2);
  await drv.evaluate(() => chrome.storage.sync.remove('license'));

  // ---------- settings ----------
  await drv.bringToFront();
  await drv.reload();
  await drv.uncheck('#upper');
  await sleep(150);
  await pop.bringToFront();
  await pop.reload();
  await pop.waitForSelector('#f-hex', { state: 'attached' });
  await pop.click('#tab-pick');
  check('setting: lower-case HEX', (await pop.textContent('#f-hex')) === '#ffcc00', await pop.textContent('#f-hex'));

  check('no page/SW errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.error(e); check('test run threw', false, String(e));
} finally {
  await ctx.close(); server.close(); rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\ne2e: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
