// OPTIONAL real-input test: headful Chromium on Xvfb, driven with real X11 mouse/keyboard events (XTEST), so the
// native EyeDropper really opens and samples screen pixels. Uses the UNMODIFIED extension (no host permissions,
// production key): access comes from activeTab only, exactly like a real install.
// Setup once:  python3 -m venv --system-site-packages /tmp/xvenv && /tmp/xvenv/bin/pip install python-xlib
// Run:         XPY=/tmp/xvenv/bin/python node test/headful-xvfb.mjs
import { createRequire } from 'node:module';
import { cpSync, rmSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/')('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const DISPLAY = ':97';
const PORT = 8767;
const PY = process.env.XPY || '/tmp/xvenv/bin/python';
const X = (...a) => execFileSync(PY, [join(HERE, 'xinput.py'), ...a.map(String)], { env: { ...process.env, DISPLAY } }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
// Finds the full-width "Pick a colour" button inside a region: the accent-coloured tab strip sits above it, so scan
// a narrow column near the right edge (where the selected "Pick" tab isn't) for the accent colour.
const findPickButton = (x0, y0, x1, y1) => {
  const all = X('bbox', '2563EB', x0, y0, x1, y1);
  if (all === 'none') return null;
  const [ax0, ay0, ax1] = all.split(' ').map(Number);
  const col = X('bbox', '2563EB', ax1 - 24, ay0, ax1 - 20, ay0 + 160);
  if (col === 'none') return null;
  const [, cy0, , cy1] = col.split(' ').map(Number);
  return [Math.round((ax0 + ax1) / 2), Math.round((cy0 + cy1) / 2)];
};
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
await sleep(800);
const tmp = mkdtempSync(join(tmpdir(), 'cp-hf-'));
const ext = join(tmp, 'ext');
cpSync(join(HERE, '..'), ext, { recursive: true, filter: (p) => !p.includes('/test') });
// Unpacked extension id = sha256(path) mapped to a-p. Pin it so its toolbar icon can be clicked.
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
mkdirSync(join(tmp, 'profile', 'Default'), { recursive: true });
writeFileSync(join(tmp, 'profile', 'Default', 'Preferences'), JSON.stringify({ extensions: { pinned_extensions: [id] } }));
const PAGE = '<!doctype html><title>Two colours</title><style>html,body{margin:0;height:100%}#a,#b{position:fixed;top:0;width:50%;height:100%}' +
  '#a{left:0;background:#336699}#b{right:0;background:#CC3300}</style><div id=a></div><div id=b></div><script>clicks=0;addEventListener("click",()=>clicks++)</script>';
const server = createServer((q, s) => { s.setHeader('Content-Type', 'text/html'); s.end(PAGE); }).listen(PORT, '127.0.0.1');

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome', headless: false, viewport: null,
  env: { ...process.env, DISPLAY },
  args: ['--window-position=0,0', '--window-size=1280,800', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  check('extension loaded (pinned id matches)', new URL(sw.url()).host === id);
  const history = () => sw.evaluate(async () => (await chrome.storage.local.get('history')).history || []);
  const sc = (await sw.evaluate(() => chrome.commands.getAll())).find((c) => c.name === 'pick-color')?.shortcut;
  check('suggested shortcut Alt+Shift+E is assigned', sc === 'Alt+Shift+E', JSON.stringify(sc));

  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.bringToFront();
  await sleep(800);
  const toast = () => page.evaluate(() => document.querySelector('aloneai-color-picker')?.shadowRoot?.querySelector('.toast')?.textContent || '');

  // 1) keyboard shortcut -> EyeDropper -> real click on the blue half
  X('click', 300, 400);
  await sleep(5500); // let the click's user activation expire
  const clicks0 = await page.evaluate(() => clicks);
  X('key', 'Alt+Shift+E');
  await sleep(900);
  X('shot', join(HERE, 'headful-eyedropper.png'));
  const overlay = await page.evaluate(() => !!document.querySelector('aloneai-color-picker')?.shadowRoot?.querySelector('.overlay'));
  if (overlay) { X('click', 300, 400); await sleep(800); } // fallback path: one click starts the EyeDropper
  X('click', 300, 400);
  await sleep(900);
  check(`shortcut: real EyeDropper picked the blue half (${overlay ? 'via overlay click' : 'opened directly'})`, (await history())[0]?.hex === '#336699', JSON.stringify((await history())[0]));
  check('shortcut: toast confirms copy', /#336699 copied/.test(await toast()), await toast());
  check('shortcut: the picking click never reached the page', (await page.evaluate(() => clicks)) === clicks0, `${clicks0} -> ${await page.evaluate(() => clicks)}`);

  // 2) toolbar icon -> popup -> "Pick a colour" -> real click on the red half
  await sleep(4000);
  const icon = X('find', '7C3AED', 900, 40, 1280, 110);
  check('toolbar icon found', icon !== 'none', icon);
  const [ix, iy] = icon.split(' ').map(Number);
  X('click', ix, iy);
  await sleep(1200);
  X('shot', join(HERE, 'headful-popup.png'));
  const btn = findPickButton(600, 80, 1280, 800);
  check('popup opened ("Pick a colour" button found)', !!btn, JSON.stringify(btn));
  X('click', ...btn);
  await sleep(1000);
  const popupGone = X('bbox', '2563EB', 600, 80, 1280, 800) === 'none';
  X('click', 900, 400);
  await sleep(900);
  check('popup: closed after starting the pick', popupGone);
  check('popup: real EyeDropper picked the red half (at a point the popup had covered)', (await history())[0]?.hex === '#CC3300', JSON.stringify((await history())[0]));

  // 3) chrome:// page: shortcut opens the picker window; its EyeDropper picks from anywhere on screen
  await page.goto('chrome://version');
  await sleep(800);
  X('click', 1100, 700);
  await sleep(5500);
  X('key', 'Alt+Shift+E');
  await sleep(1500);
  const win = ctx.pages().find((p) => p.url().includes('popup.html?window=1'));
  check('restricted page: shortcut opened the picker window', !!win);
  if (win) {
    const wb = await sw.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['popup'] }))[0]);
    X('shot', join(HERE, 'headful-window.png'));
    const wbtn = findPickButton(Math.max(0, wb.left), Math.max(0, wb.top), Math.min(1280, wb.left + wb.width), Math.min(800, wb.top + wb.height));
    const target = [wb.left > 400 ? 150 : Math.min(1270, wb.left + wb.width + 150), 650];
    const expected = X('pixel', ...target);
    X('click', ...wbtn);
    await sleep(1000);
    X('click', ...target);
    await sleep(900);
    check(`picker window: EyeDropper picked the chrome:// page pixel (${expected})`, (await history())[0]?.hex === expected, JSON.stringify((await history())[0]));
    check('picker window shows the pick', (await win.textContent('#f-hex')) === expected);
    await win.close();
  }

  // 4) fallback: shortcut while the address bar has focus -> overlay -> click starts the EyeDropper -> click picks
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.bringToFront();
  await sleep(6000);
  X('key', 'Ctrl+l');
  await sleep(300);
  X('key', 'Alt+Shift+E');
  await sleep(900);
  X('shot', join(HERE, 'headful-overlay.png'));
  const hasOverlay = await page.evaluate(() => !!document.querySelector('aloneai-color-picker')?.shadowRoot?.querySelector('.overlay'));
  check('address bar focused: overlay asks for a click', hasOverlay);
  X('click', 1000, 300);
  await sleep(900);
  X('click', 1000, 300);
  await sleep(900);
  check('address bar focused: click, then pick works (red half)', (await history())[0]?.hex === '#CC3300', JSON.stringify((await history())[0]));
} catch (e) {
  console.error(e); check('test run threw', false, String(e));
} finally {
  await ctx.close(); server.close(); xvfb.kill(); rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\nheadful: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
