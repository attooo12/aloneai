// Generates Chrome Web Store assets into ../assets/. Run: node assets-src/make-assets.mjs
// Renders the REAL extension UI (a temporary copy) in headless Chromium. The copy's license.js points at the TEST ONLY
// key pair (as in test/e2e.mjs) so the options page can be captured in its Pro state; the shipped files are never
// modified. Sessions and snapshots are written through the real store.js code paths (import + addAutoSnapshot).
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from '../../ext-tab-lifeboat/test/make-license.mjs';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '../../ext-tab-lifeboat');
const OUT = join(HERE, '../assets');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'tv-assets-'));
const ext = join(tmp, 'ext');
cpSync(EXT, ext, { recursive: true, filter: (p) => !p.includes('/test') });
const testPub = readFileSync(join(EXT, 'test/TEST_ONLY_public_key.txt'), 'utf8').trim();
writeFileSync(join(ext, 'license.js'), readFileSync(join(ext, 'license.js'), 'utf8').replace(/export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`));
const proToken = makeToken(readFileSync(join(EXT, 'test/TEST_ONLY_private_key.pem'), 'utf8'), 'demo@example.com', 'tab-lifeboat');

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  deviceScaleFactor: 2,
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--force-color-profile=srgb']
});
const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const icon = b64(readFileSync(join(EXT, 'icons/icon128.png')));

// ---------- demo data (fictional sessions with realistic tabs) ----------
const T = (url, title, extra = {}) => ({ url, title, ...extra });
const H = 3600e3, D = 24 * H;
const now = Date.now();
const named = [
  { name: 'Thesis: literature review', created: now - 3 * D, windows: [{
    groups: [{ title: 'Papers', color: 'blue' }, { title: 'Notes', color: 'green' }, { title: 'Reference', color: 'purple', collapsed: true }],
    tabs: [
      T('https://mail.example.com/', 'Inbox', { pinned: true }),
      T('https://arxiv.org/abs/1706.03762', 'Attention Is All You Need', { group: 0 }),
      T('https://arxiv.org/abs/1810.04805', 'BERT: Pre-training of Deep Bidirectional Transformers', { group: 0 }),
      T('https://arxiv.org/abs/2005.14165', 'Language Models are Few-Shot Learners', { group: 0 }),
      T('https://docs.example.com/thesis-outline', 'Thesis outline (draft 3)', { group: 1 }),
      T('https://docs.example.com/reading-notes', 'Reading notes: chapter 2', { group: 1 }),
      T('https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)', 'Transformer (deep learning architecture) - Wikipedia', { group: 2 }),
      T('https://scholar.example.org/citations?user=x', 'Citations', { group: 2 }),
      T('https://www.zotero.org/', 'Zotero | Your personal research assistant')
    ] }] },
  { name: 'Trip to Lisbon', created: now - 26 * H, windows: [{ groups: [{ title: 'Flights', color: 'cyan' }, { title: 'Stay', color: 'orange' }], tabs: [
    T('https://flights.example.com/lis', 'Flights to Lisbon', { group: 0 }), T('https://flights.example.com/return', 'Return flights', { group: 0 }),
    T('https://stays.example.com/alfama', 'Apartment in Alfama', { group: 1 }), T('https://stays.example.com/baixa', 'Studio near Baixa', { group: 1 }),
    T('https://en.wikipedia.org/wiki/Lisbon', 'Lisbon - Wikipedia'), T('https://maps.example.com/lisbon', 'Lisbon - Map'), T('https://weather.example.com/lisbon', 'Lisbon 10-day forecast')] }] },
  { name: 'Frontend refactor', created: now - 5 * H, windows: [
    { groups: [{ title: 'PRs', color: 'purple' }, { title: 'Docs', color: 'blue' }], tabs: [
      T('https://github.com/example/app/pull/482', 'Refactor settings store #482', { group: 0 }), T('https://github.com/example/app/pull/479', 'Tab groups UI #479', { group: 0 }),
      T('https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', 'Web Locks API - MDN', { group: 1 }), T('https://developer.chrome.com/docs/extensions/reference/api/tabGroups', 'chrome.tabGroups | API', { group: 1 }),
      T('http://localhost:5173/', 'App (dev)')] },
    { groups: [], tabs: [T('https://ci.example.com/app/builds/9921', 'Build #9921 passed'), T('https://status.example.com/', 'Status'), T('https://calendar.example.com/', 'Calendar')] }] },
  { name: 'Recipes to try', created: now - 8 * D, windows: [{ groups: [], tabs: Array.from({ length: 12 }, (_, i) => T(`https://recipes.example.com/${i}`, ['Shakshuka', 'Pastéis de nata', 'Ramen', 'Dal', 'Focaccia', 'Pho', 'Paella', 'Gnocchi', 'Tacos al pastor', 'Bibimbap', 'Moussaka', 'Pierogi'][i])) }] },
  { name: 'Apartment hunting', created: now - 12 * D, windows: [{ groups: [{ title: 'Shortlist', color: 'red' }], tabs: Array.from({ length: 9 }, (_, i) => T(`https://homes.example.com/listing/${4000 + i}`, `2-room flat, listing ${4000 + i}`, i < 3 ? { group: 0 } : {})) }] },
  { name: 'Weekly reading', created: now - 16 * D, windows: [{ groups: [], tabs: Array.from({ length: 15 }, (_, i) => T(`https://news.example.com/story/${i}`, `Long read #${i + 1}`)) }] }
];

try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const EXT_URL = `chrome-extension://${new URL(sw.url()).host}`;
  const drv = await ctx.newPage();
  await drv.goto(`${EXT_URL}/options.html`, { waitUntil: 'load' });
  await drv.evaluate(async ({ named, now, H }) => {
    const S = await import('./store.js');
    await S.importSessions(named);
    const T = (u, t, e = {}) => ({ url: u, title: t, ...e });
    const big = named[0].windows[0].tabs.concat(named[2].windows[0].tabs, named[1].windows[0].tabs, named[3].windows[0].tabs.slice(0, 8));
    const base = { windows: [{ tabs: big, groups: named[0].windows[0].groups }] };
    await S.addAutoSnapshot(base, 'previous-session', 'all', { now: now - 20 * H });
    await S.addAutoSnapshot({ windows: [{ tabs: big.slice(0, 27), groups: base.windows[0].groups }] }, 'periodic', 'all', { now: now - 3 * H });
    await S.addAutoSnapshot({ windows: [{ tabs: big.slice(0, 29), groups: base.windows[0].groups }] }, 'periodic', 'all', { now: now - 2 * H });
    await S.addAutoSnapshot({ windows: [{ tabs: [T('https://news.example.com/', 'News')] }] }, 'periodic', 'all', { now: now - 110 * 60e3 }); // sudden drop -> previous one protected
    await S.addAutoSnapshot({ windows: named[1].windows }, 'window-closed', 'window', { now: now - 90 * 60e3 });
    await S.addAutoSnapshot({ windows: [{ tabs: big.slice(0, 24), groups: base.windows[0].groups }] }, 'periodic', 'all', { now: now - 40 * 60e3 });
    await S.addAutoSnapshot({ windows: [{ tabs: big.slice(0, 25), groups: base.windows[0].groups }] }, 'periodic', 'all', { now: now - 5 * 60e3 });
  }, { named, now, H });

  // Popup captures (as extension pages, 2x).
  async function capturePopup(query, prep) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 400, height: 900 });
    await p.goto(`${EXT_URL}/popup.html?${query}`, { waitUntil: 'load' });
    await p.waitForSelector('body[data-ready]');
    await p.addStyleTag({ content: 'html{scrollbar-width:none}' });
    if (prep) await prep(p);
    await sleep(400);
    const buf = await p.locator('body').screenshot();
    await p.close();
    return buf;
  }
  // Real open windows for the save-button counts: 14 tabs in the popup's window, 8 in another.
  const winId = await sw.evaluate(async () => {
    const mk = async (n) => { const w = await chrome.windows.create({ url: 'about:blank#1', focused: false }); for (let i = 2; i <= n; i++) await chrome.tabs.create({ windowId: w.id, url: 'about:blank#' + i, active: false }); return w.id; };
    const a = await mk(14);
    await mk(8);
    return a;
  });
  const counts = async () => {};
  const popupSaved = await capturePopup(`window=${winId}`, async (p) => {
    await counts(p);
    await p.click('#list .item:nth-child(1) .main');
    await p.waitForSelector('.details .tl');
    await p.evaluate(() => { const items = document.querySelectorAll('#list .item'); for (let i = 4; i < items.length; i++) items[i].remove(); });
  });
  const popupAuto = await capturePopup(`window=${winId}&view=auto`, async (p) => {
    await counts(p);
    await p.waitForSelector('#list .item');
  });

  // Options page, Pro state.
  await drv.evaluate(async (t) => { await chrome.storage.sync.set({ license: t }); const S = await import('./store.js'); await S.setSettings({ backup: 'daily', backupLast: Date.now() - 5 * 3600e3 }); }, proToken);
  const opt = await ctx.newPage();
  await opt.setViewportSize({ width: 660, height: 1400 });
  await opt.goto(`${EXT_URL}/options.html`, { waitUntil: 'load' });
  await opt.waitForSelector('body[data-ready]');
  await opt.addStyleTag({ content: 'html{scrollbar-width:none}' });
  await sleep(300);
  const box = await opt.evaluate(() => {
    const fs = [...document.querySelectorAll('fieldset')];
    const a = fs[2].getBoundingClientRect(), b = fs[4].getBoundingClientRect();
    return { x: 0, y: a.top - 6, width: 660, height: b.bottom - a.top + 18 };
  });
  const optionsShot = await opt.screenshot({ clip: box });
  await opt.close();

  // ---------- a demo page behind the popup ----------
  async function captureHtml(html, width, height) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width, height });
    await p.setContent(html, { waitUntil: 'load' });
    await sleep(150);
    const buf = await p.screenshot();
    await p.close();
    return buf;
  }
  const demoPage = await captureHtml(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;font:15px/1.6 "Liberation Serif",Georgia,serif;color:#1f2937;background:#fff}
    .bar{font:13px "Liberation Sans",Arial,sans-serif;color:#6b7280;padding:14px 48px;border-bottom:1px solid #e5e7eb}
    main{padding:28px 48px;max-width:640px} h1{font-size:28px;margin:0 0 4px} .by{color:#6b7280;font:13px "Liberation Sans",Arial,sans-serif;margin-bottom:18px}
    p{margin:0 0 14px}</style>
    <div class="bar">arxiv.org (demo rendering) · Computer Science › Computation and Language</div>
    <main><h1>Attention Is All You Need</h1><div class="by">Demo page rendered for this screenshot</div>
    <p>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism.</p>
    <p>We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.</p>
    <p>Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.</p></main>`, 1120, 560);

  // ---------- layouts ----------
  const css = `*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:"Liberation Sans",Arial,sans-serif;color:#0f172a;
    background:linear-gradient(160deg,#ecfdf5 0%,#f8fafc 55%,#eef6ff 100%)}
    .cap{position:absolute;left:0;right:0;top:28px;text-align:center}
    .cap h2{margin:0;font-size:40px;letter-spacing:-.5px} .cap p{margin:8px 0 0;font-size:19px;color:#475569}
    .win{position:absolute;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.08);overflow:hidden}
    .tabs{height:38px;background:#dee3ea;display:flex;align-items:flex-end;padding:0 10px;gap:4px}
    .dots{display:flex;gap:7px;align-self:center;margin-right:8px}.dots i{width:12px;height:12px;border-radius:50%;background:#c3cad4;display:block}
    .tab{background:#eef1f5;border-radius:9px 9px 0 0;height:30px;padding:0 12px;display:flex;align-items:center;font-size:12px;color:#334155;width:150px;white-space:nowrap;overflow:hidden}
    .tab.on{background:#fff}.tab.pin{width:40px;justify-content:center}
    .gl{height:22px;border-radius:6px;padding:0 8px;font-size:12px;font-weight:700;color:#fff;display:flex;align-items:center;align-self:center}
    .bar{height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #e2e8f0}
    .nav{color:#94a3b8;font-size:18px;width:18px;text-align:center}
    .url{flex:1;height:30px;border-radius:15px;background:#f1f5f9;display:flex;align-items:center;padding:0 14px;font-size:14px;color:#334155}
    .ext img{width:20px;height:20px;border-radius:4px;display:block}
    .popup{position:absolute;background:#fff;border-radius:10px;box-shadow:0 14px 40px rgba(15,23,42,.28),0 0 0 1px rgba(15,23,42,.10);overflow:hidden}
    .popup img,.content img,.panel img{display:block;width:100%}
    .panel{position:absolute;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(15,23,42,.16),0 0 0 1px rgba(15,23,42,.08);overflow:hidden}
    .note{position:absolute;font-size:17px;color:#334155;line-height:1.45}
    .note b{color:#0f766e}`;
  const browser = `<div class="tabs"><div class="dots"><i></i><i></i><i></i></div><div class="tab pin">✉</div>
      <div class="gl" style="background:#1a73e8">Papers</div><div class="tab on">Attention Is All You Need</div><div class="tab">BERT: Pre-training…</div>
      <div class="gl" style="background:#188038">Notes</div><div class="tab">Thesis outline</div><div class="gl" style="background:#a142f4">Reference</div></div>
    <div class="bar"><span class="nav">&#8592;</span><span class="nav">&#8594;</span><span class="nav">&#8635;</span><div class="url"><span style="color:#64748b">arxiv.org</span>/abs/1706.03762</div>
    <div class="ext"><img src="${icon}"></div></div>`;

  async function compose(html, file, w = 1280, h = 800) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html, { waitUntil: 'load' });
    await sleep(200);
    const raw = join(tmp, file);
    await p.screenshot({ path: raw });
    await p.close();
    execFileSync('python3', ['-c', 'import sys;from PIL import Image;w,h=int(sys.argv[3]),int(sys.argv[4]);Image.open(sys.argv[1]).convert("RGB").resize((w,h),Image.LANCZOS).save(sys.argv[2],optimize=True)', raw, join(OUT, file), String(w), String(h)]);
    console.log('wrote', join(OUT, file));
  }

  await compose(`<style>${css}</style>
    <div class="cap"><h2>Save your tabs. Get them back.</h2><p>Save a window or all windows, with pinned tabs and tab groups, and restore them in one click.</p></div>
    <div class="win" style="left:60px;top:136px;width:1120px;height:640px">${browser}<div class="content"><img src="${b64(demoPage)}"></div></div>
    <div class="popup" style="left:770px;top:186px;width:400px"><img src="${b64(popupSaved)}"></div>`, 'screenshot-1-save-restore.png');

  await compose(`<style>${css}</style>
    <div class="cap"><h2>Crashes don't take your tabs</h2><p>Automatic snapshots every few minutes, when a window closes and at browser start.</p></div>
    <div class="popup" style="left:170px;top:140px;width:400px"><img src="${b64(popupAuto)}"></div>
    <div class="note" style="left:640px;top:190px;width:520px">
      <p><b>Previous browser session</b><br>When Chrome starts, the tabs you had open last time are kept as a snapshot first.</p>
      <p><b>Protected snapshots</b><br>If your tabs suddenly drop (a crash, or "close all" by mistake), the snapshot from before is set aside and never rotated out.</p>
      <p><b>Never an empty snapshot</b><br>An empty browser is never saved over your tabs.</p>
      <p><b>Closed windows</b><br>Closing a window keeps what was in it.</p></div>`, 'screenshot-2-snapshots.png');

  await compose(`<style>${css}</style>
    <div class="cap"><h2>Your tabs, your files</h2><p>Export everything to a file and import it back. Pro saves a backup file for you every day or week.</p></div>
    <div class="panel" style="left:${(1280 - 660) / 2}px;top:130px;width:660px;height:${Math.min(650, Math.round(box.height))}px"><img src="${b64(optionsShot)}"></div>`, 'screenshot-3-backup.png');

  await compose(`<style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;font-family:"Liberation Sans",Arial,sans-serif;color:#fff;
      background:linear-gradient(140deg,#115e59 0%,#0f766e 55%,#14b8a6 140%);display:flex;flex-direction:column;justify-content:center;padding:0 36px}</style>
    <div style="display:flex;align-items:center;gap:16px"><img src="${icon}" style="width:64px;height:64px;border-radius:14px;box-shadow:0 0 0 3px rgba(255,255,255,.85)">
    <div style="font-size:34px;font-weight:700;letter-spacing:-.5px">Tab Lifeboat</div></div>
    <div style="font-size:22px;margin-top:22px;line-height:1.3;font-weight:700">Save and restore tabs, windows and tab groups.</div>
    <div style="font-size:16px;margin-top:8px;opacity:.92">Crash snapshots. File backups. Local only.</div>`, 'promo-small-440x280.png', 440, 280);
} finally {
  await ctx.close();
  rmSync(tmp, { recursive: true, force: true });
}
