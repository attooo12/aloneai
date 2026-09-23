// Generates Chrome Web Store assets into ../assets/. Run: node assets-src/make-assets.mjs
// Uses the REAL extension UI (a temporary copy with site access pre-granted) and a real watch on a fictional
// demo shop page (served through Playwright routing, reserved .example domain). Then composites 1280x800 layouts.
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '../../ext-reload-until');
const OUT = join(HERE, '../assets');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- temp copy: site access pre-granted, placeholder checkout URL so the options page shows its buy button ---
const tmp = mkdtempSync(join(tmpdir(), 'ru-assets-'));
const ext = join(tmp, 'ext');
cpSync(EXT, ext, { recursive: true, filter: (p) => !p.includes('/test') });
const man = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['<all_urls>'];
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(man));
writeFileSync(join(ext, 'config.js'), readFileSync(join(ext, 'config.js'), 'utf8').replace(/CHECKOUT_URL = '[^']*'/, "CHECKOUT_URL = 'https://checkout.example/'"));

// --- fictional demo shop ---
const SHOP = 'http://pine-and-pedal.example/bikes/trailblazer-29';
let loads = 0;
const FLIP_AFTER = 6; // page says "Sold out" for the first loads, then "In stock"
function shopHtml(inStock) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Trailblazer 29 · Pine &amp; Pedal (demo)</title><style>
  body{margin:0;font:15px/1.5 "Liberation Sans",Arial,sans-serif;color:#1f2937;background:#fff}
  header{display:flex;align-items:center;gap:28px;padding:16px 40px;border-bottom:1px solid #e5e7eb}
  .logo{font-weight:700;font-size:20px;color:#14532d;letter-spacing:.2px}
  nav a{color:#4b5563;margin-right:18px;text-decoration:none}
  main{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:34px 40px}
  .img{background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:14px;height:330px;display:flex;align-items:center;justify-content:center}
  .crumb{color:#6b7280;font-size:13px} h1{font-size:30px;margin:6px 0 4px} .price{font-size:24px;font-weight:700;margin:6px 0 14px}
  .status{display:inline-block;font-weight:700;padding:5px 12px;border-radius:999px;font-size:15px}
  .out{background:#fee2e2;color:#b91c1c} .in{background:#dcfce7;color:#15803d}
  .sizes{display:flex;gap:8px;margin:16px 0} .sizes span{border:1px solid #d1d5db;border-radius:8px;padding:6px 14px;color:${inStock ? '#111827' : '#9ca3af'}}
  .btn{display:block;width:100%;padding:13px;border-radius:10px;border:0;font:inherit;font-weight:700;font-size:16px}
  .buy{background:#15803d;color:#fff} .dis{background:#e5e7eb;color:#6b7280}
  .note{color:#6b7280;font-size:13px;margin-top:10px}
  </style></head><body>
  <header><span class="logo">Pine &amp; Pedal</span><nav><a>Bikes</a><a>Parts</a><a>Service</a></nav><span style="margin-left:auto;color:#6b7280;font-size:13px">Demo store · fictional</span></header>
  <main><div class="img"><svg width="300" height="190" viewBox="0 0 300 190" fill="none" stroke="#166534" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="70" cy="130" r="50"/><circle cx="230" cy="130" r="50"/><path d="M70 130 L120 60 L200 60 L230 130 M120 60 L150 130 L200 60 M150 130 L70 130 M110 45 L135 45 M200 60 L192 38 L215 38"/></svg></div>
  <div><div class="crumb">Bikes / Trail</div><h1>Trailblazer 29 Trail Bike</h1><div class="price">€1,249</div>
  <span class="status ${inStock ? 'in' : 'out'}">${inStock ? 'In stock' : 'Sold out'}</span>
  <div class="sizes"><span>S</span><span>M</span><span>L</span><span>XL</span></div>
  <button class="btn ${inStock ? 'buy' : 'dis'}">${inStock ? 'Add to cart' : 'Currently unavailable'}</button>
  <p class="note">${inStock ? 'Ships in 2 to 3 days.' : 'This model is sold out. Please check back later.'}</p></div></main></body></html>`;
}

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  deviceScaleFactor: 2, // everything is captured at 2x; layouts are downsampled to the exact store size
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--force-color-profile=srgb']
});
await ctx.route('http://pine-and-pedal.example/**', (route) => {
  loads++;
  route.fulfill({ status: 200, contentType: 'text/html', body: shopHtml(loads > FLIP_AFTER) });
});

const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const icon = b64(readFileSync(join(EXT, 'icons/icon128.png')));
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const drv = await ctx.newPage();
  await drv.goto(`chrome-extension://${extId}/options.html`);

  // the tab that gets watched
  const shop = await ctx.newPage();
  await shop.goto(SHOP);
  const tabId = await drv.evaluate(async () => (await chrome.tabs.query({ url: 'http://pine-and-pedal.example/*' }))[0].id);
  // Capture a page (2x, via the context's device scale factor).
  async function capture(url, width, height, prep, { css = '', element } = {}) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width, height });
    await p.goto(url);
    if (prep) await prep(p);
    await p.addStyleTag({ content: 'html{scrollbar-width:none}' + css });
    await sleep(500);
    const buf = element ? await p.locator(element).screenshot() : await p.screenshot();
    await p.close();
    return buf;
  }
  const PAGE_W = 1120, PAGE_H = 560;

  // 1) popup, configured but not started (hero)
  await drv.evaluate(() => chrome.storage.sync.set({ defaults: { intervalSec: 10, jitterPct: 0, mode: 'appears', text: 'In stock', regex: false, selector: '', notify: true, sound: true, focus: true } }));
  // The "Made by" footer is left out so the popup fits the 800px-high screenshot at a legible size.
  const popupHero = await capture(`chrome-extension://${extId}/popup.html?tab=${tabId}`, 330, 900, (p) => p.waitForSelector('#toggle:not([disabled])'), { css: 'footer{display:none}#status{min-height:0}', element: 'body' });
  const pageSoldOut = await capture(SHOP, PAGE_W, PAGE_H);
  loads = 0; // reset the demo counter for the real watch below

  // 2) real watch until "In stock" appears
  const res = await drv.evaluate((m) => chrome.runtime.sendMessage(m), { type: 'start', tabId, origin: 'http://pine-and-pedal.example', cfg: { intervalSec: 3, mode: 'appears', text: 'In stock', notify: true, sound: false, focus: false } });
  if (!res.ok) throw new Error('start failed: ' + JSON.stringify(res));
  let w; const t0 = Date.now();
  while (Date.now() - t0 < 60000) { w = (await drv.evaluate(async () => (await chrome.storage.session.get('watches')).watches))[tabId]; if (w?.status === 'met') break; await sleep(500); }
  if (w?.status !== 'met') throw new Error('watch did not complete');
  const badge = await drv.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  const title = await drv.evaluate(async (id) => (await chrome.tabs.get(id)).title, tabId);
  const pageInStock = await capture(SHOP, PAGE_W, PAGE_H);
  const metTime = new Date(w.metAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // exactly the notification text the service worker builds
  const noteMsg = `"${w.text}" appeared after ${w.count || 0} reload(s).`;

  // 3) options page (Free plan, buy button visible)
  const options = await capture(`chrome-extension://${extId}/options.html`, 600, 580, (p) => p.waitForSelector('#buy-wrap:not([hidden])'));

  // ---------- layouts ----------
  const css = `*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:"Liberation Sans",Arial,sans-serif;color:#0f172a;
    background:linear-gradient(160deg,#eef4ff 0%,#f8fafc 60%,#eefcf3 100%)}
    .cap{position:absolute;left:0;right:0;top:28px;text-align:center}
    .cap h2{margin:0;font-size:40px;letter-spacing:-.5px} .cap p{margin:8px 0 0;font-size:19px;color:#475569}
    .win{position:absolute;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.08);overflow:hidden}
    .tabs{height:36px;background:#dee3ea;display:flex;align-items:flex-end;padding:0 10px;gap:6px}
    .dots{display:flex;gap:7px;align-self:center;margin-right:10px}.dots i{width:12px;height:12px;border-radius:50%;background:#c3cad4;display:block}
    .tab{background:#fff;border-radius:9px 9px 0 0;height:29px;padding:0 14px;display:flex;align-items:center;font-size:13px;color:#334155;max-width:300px;white-space:nowrap;overflow:hidden}
    .bar{height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #e2e8f0}
    .nav{color:#94a3b8;font-size:18px;width:18px;text-align:center}
    .url{flex:1;height:30px;border-radius:15px;background:#f1f5f9;display:flex;align-items:center;padding:0 14px;font-size:14px;color:#334155}
    .url b{font-weight:400;color:#0f172a}
    .ext{position:relative;width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center}
    .ext.on{background:#e2e8f0}.ext img{width:18px;height:18px;border-radius:4px}
    .badge{position:absolute;right:-5px;bottom:-3px;min-width:18px;padding:0 4px;height:15px;border-radius:4px;color:#fff;font-size:10.5px;font-weight:700;line-height:15px;text-align:center}
    .popup{position:absolute;background:#fff;border-radius:10px;box-shadow:0 14px 40px rgba(15,23,42,.28),0 0 0 1px rgba(15,23,42,.10);overflow:hidden}
    .popup img,.content img{display:block;width:100%}
    .note{position:absolute;width:390px;background:#fff;border-radius:12px;box-shadow:0 16px 40px rgba(15,23,42,.25),0 0 0 1px rgba(15,23,42,.08);padding:16px 18px;display:flex;gap:14px}
    .note img{width:44px;height:44px;border-radius:9px}.note .t{font-weight:700;font-size:15px}.note .m{font-size:14px;color:#334155;margin-top:3px;line-height:1.4}
    .note .s{font-size:12px;color:#64748b;margin-bottom:4px}`;
  const chrome_ = ({ tab, url, badge, active }) => `<div class="tabs"><div class="dots"><i></i><i></i><i></i></div><div class="tab">${tab}</div></div>
    <div class="bar"><span class="nav">&#8592;</span><span class="nav">&#8594;</span><span class="nav">&#8635;</span><div class="url">${url}</div>
    <div class="ext ${active ? 'on' : ''}"><img src="${icon}">${badge || ''}</div></div>`;

  async function compose(html, file, w = 1280, h = 800) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html, { waitUntil: 'load' });
    await sleep(200);
    const raw = join(tmp, file);
    await p.screenshot({ path: raw });
    await p.close();
    // Flatten to 24-bit RGB (no alpha), as the Chrome Web Store asks.
    execFileSync('python3', ['-c', 'import sys;from PIL import Image;w,h=int(sys.argv[3]),int(sys.argv[4]);Image.open(sys.argv[1]).convert("RGB").resize((w,h),Image.LANCZOS).save(sys.argv[2],optimize=True)', raw, join(OUT, file), String(w), String(h)]);
    console.log('wrote', join(OUT, file));
  }

  const tabTitle = 'Trailblazer 29 · Pine &amp; Pedal (demo)';
  const urlHtml = '<span style="color:#64748b">pine-and-pedal.example</span>/bikes/trailblazer-29';

  // Screenshot 1: hero
  await compose(`<style>${css}</style>
    <div class="cap"><h2>Refresh until &ldquo;In stock&rdquo; appears</h2><p>Auto refresh any tab and get alerted the moment a word appears or disappears.</p></div>
    <div class="win" style="left:80px;top:136px;width:1120px;height:640px">
      ${chrome_({ tab: tabTitle, url: urlHtml, active: true })}
      <div class="content"><img src="${b64(pageSoldOut)}"></div>
    </div>
    <div class="popup" style="left:800px;top:212px;width:368px"><img src="${b64(popupHero)}"></div>`, 'screenshot-1-hero.png');

  // Screenshot 2: the alert
  await compose(`<style>${css}</style>
    <div class="cap"><h2>Alerted the moment it changes</h2><p>Reloading stops, the icon turns green, and you get a notification and a sound.</p></div>
    <div class="win" style="left:80px;top:136px;width:1120px;height:640px">
      ${chrome_({ tab: tabTitle, url: urlHtml, badge: `<span class="badge" style="background:#16a34a">${badge}</span>` })}
      <div class="content"><img src="${b64(pageInStock)}"></div>
    </div>
    <div class="note" style="right:48px;bottom:40px">
      <img src="${icon}"><div><div class="s">Reload Until · ${metTime}</div><div class="t">Reload Until: condition met</div>
      <div class="m">${noteMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}<br>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></div>
    </div>`, 'screenshot-2-alert.png');

  // Screenshot 3: Free vs Pro
  const card = (title, price, items, accent) => `<div style="background:#fff;border-radius:14px;padding:22px 24px;box-shadow:0 10px 30px rgba(15,23,42,.10),0 0 0 1px ${accent ? '#2563eb' : 'rgba(15,23,42,.08)'};margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:22px">${title}</b><b style="font-size:26px;color:${accent ? '#2563eb' : '#0f172a'}">${price}</b></div>
    <ul style="margin:12px 0 0;padding-left:20px;font-size:16px;line-height:1.7;color:#334155">${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
  await compose(`<style>${css}</style>
    <div class="cap"><h2>Free for one tab. Pro is a one-time &euro;9.</h2><p>No subscription, no account. The license key is verified offline on your device.</p></div>
    <div class="win" style="left:60px;top:136px;width:700px;height:640px">
      ${chrome_({ tab: 'Reload Until: License &amp; Options', url: '<span style="color:#64748b">Reload Until</span> &nbsp;options' })}
      <div class="content" style="width:600px;margin:0 auto"><img src="${b64(options)}"></div>
    </div>
    <div style="position:absolute;left:800px;top:170px;width:420px">
      ${card('Free', '&euro;0', ['Auto refresh from 3 seconds', 'Stop when text appears or disappears', 'Notification, sound, bring tab to front', '1 watched tab at a time'])}
      ${card('Pro', '&euro;9 once', ['Unlimited watched tabs', 'Regular expressions', 'Limit the check to a CSS selector', 'Pay once, no subscription'], true)}
    </div>`, 'screenshot-3-free-vs-pro.png');

  // Small promo tile 440x280
  await compose(`<style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;font-family:"Liberation Sans",Arial,sans-serif;color:#fff;
      background:linear-gradient(140deg,#1d4ed8 0%,#2563eb 55%,#16a34a 140%);display:flex;flex-direction:column;justify-content:center;padding:0 36px}</style>
    <div style="display:flex;align-items:center;gap:16px"><img src="${icon}" style="width:64px;height:64px;border-radius:14px;box-shadow:0 0 0 3px rgba(255,255,255,.85)">
    <div style="font-size:36px;font-weight:700;letter-spacing:-.5px">Reload Until</div></div>
    <div style="font-size:22px;margin-top:22px;line-height:1.3;font-weight:700">Refresh until the text appears.</div>
    <div style="font-size:16px;margin-top:8px;opacity:.9">Auto refresh + page text alert. No tracking.</div>`, 'promo-small-440x280.png', 440, 280);
} finally {
  await ctx.close();
  rmSync(tmp, { recursive: true, force: true });
}
