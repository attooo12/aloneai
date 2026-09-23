// Generates Chrome Web Store assets into ../assets/. Run: node assets-src/make-assets.mjs
// Uses the REAL extension UI (a temporary copy) rendered in headless Chromium. The temp copy's license.js is
// pointed at a TEST ONLY key pair (same mechanism as test/e2e.mjs) so the popup can be captured in its Pro state;
// the shipped extension files are never modified. Recent picks, a palette and the contrast pair are written
// straight into chrome.storage (still via the real store.js/color.js code paths for rendering), not faked pixels.
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from '../../ext-color-picker/test/make-license.mjs';

const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '../../ext-color-picker');
const OUT = join(HERE, '../assets');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- temp copy: license.js patched to a TEST ONLY public key, so a locally-signed token unlocks Pro for the
// screenshots. Never touches the shipped ext-color-picker/license.js or its production public key. ---
const tmp = mkdtempSync(join(tmpdir(), 'cp-assets-'));
const ext = join(tmp, 'ext');
cpSync(EXT, ext, { recursive: true, filter: (p) => !p.includes('/test') });
const testPub = readFileSync(join(EXT, 'test/TEST_ONLY_public_key.txt'), 'utf8').trim();
const licSrc = readFileSync(join(ext, 'license.js'), 'utf8').replace(/export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`);
writeFileSync(join(ext, 'license.js'), licSrc);
const pem = readFileSync(join(EXT, 'test/TEST_ONLY_private_key.pem'), 'utf8');
const proToken = makeToken(pem, 'demo@example.com', 'color-picker');

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome',
  headless: false,
  deviceScaleFactor: 2, // everything captured at 2x; layouts are downsampled to the exact store size
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--force-color-profile=srgb']
});

const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const icon = b64(readFileSync(join(EXT, 'icons/icon128.png')));

try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const EXT_URL = `chrome-extension://${extId}`;
  const drv = await ctx.newPage();
  await drv.goto(`${EXT_URL}/options.html`);

  // Seed real state through the real storage APIs (history, one palette, a contrast pair, Pro license).
  await drv.evaluate(async ({ proToken }) => {
    await chrome.storage.sync.set({ license: proToken, settings: { upper: true, autoCopy: true } });
    await chrome.storage.local.set({
      history: [
        { hex: '#F97316', t: Date.now() },
        { hex: '#2563EB', t: Date.now() - 1000 },
        { hex: '#10B981', t: Date.now() - 2000 },
        { hex: '#EC4899', t: Date.now() - 3000 },
        { hex: '#8B5CF6', t: Date.now() - 4000 },
        { hex: '#F59E0B', t: Date.now() - 5000 }
      ],
      palettes: [
        { id: 'p1', name: 'Brand', colors: ['#2563EB', '#7C3AED', '#F59E0B', '#10B981', '#EC4899'], created: Date.now(), updated: Date.now() }
      ],
      activePaletteId: 'p1',
      exportKind: 'css',
      contrast: { fg: '#2563EB', bg: '#FFFFFF' }
    });
  }, { proToken });

  // Capture a popup page (2x, via the context's device scale factor). Each tab hides the others' panels
  // (see popup.js selectTab), so the selector to wait for depends on which tab ends up selected.
  const TAB_READY_SELECTOR = { pick: '#swatch', palettes: '#pal-select', contrast: '#c-fg' };
  async function capturePopup(lastTab, { css = '' } = {}) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 380, height: 900 });
    await drv.evaluate(async (tab) => { await chrome.storage.local.set({ lastTab: tab }); }, lastTab || 'pick');
    await p.goto(`${EXT_URL}/popup.html`);
    await p.waitForSelector(TAB_READY_SELECTOR[lastTab] || '#swatch');
    await p.addStyleTag({ content: 'html{scrollbar-width:none}' + css });
    await sleep(300);
    const buf = await p.locator('body').screenshot();
    await p.close();
    return buf;
  }

  // #msg would show the "Chrome doesn't let extensions run on this page" hint here only because the active tab
  // in this headless render is the popup's own chrome-extension:// URL, never true for a real user on a real page.
  const popupPick = await capturePopup('pick', { css: '#msg{display:none}' });
  const popupPalettes = await capturePopup('palettes');
  const popupContrast = await capturePopup('contrast');

  // ---------- a fictional, colourful demo page used as the browser content behind the popup ----------
  const demoHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Prism Studio · brand kit (demo)</title><style>
  body{margin:0;font:15px/1.5 "Liberation Sans",Arial,sans-serif;color:#1f2937;background:#fff}
  header{display:flex;align-items:center;gap:28px;padding:16px 40px;border-bottom:1px solid #e5e7eb}
  .logo{font-weight:700;font-size:20px;letter-spacing:.2px;background:linear-gradient(90deg,#2563eb,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent}
  nav a{color:#4b5563;margin-right:18px;text-decoration:none}
  main{padding:34px 40px}
  h1{font-size:28px;margin:0 0 6px}
  .sub{color:#6b7280;margin:0 0 26px}
  .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
  .swatch{border-radius:14px;height:120px;box-shadow:0 8px 20px rgba(15,23,42,.10);display:flex;align-items:flex-end;padding:10px;color:#fff;font-weight:700;font-size:13px;font-family:ui-monospace,monospace}
  </style></head><body>
  <header><span class="logo">Prism Studio</span><nav><a>Kits</a><a>Gradients</a><a>Docs</a></nav><span style="margin-left:auto;color:#6b7280;font-size:13px">Demo site · fictional</span></header>
  <main><h1>Spring 2026 brand kit</h1><p class="sub">A colourful reference page used only to render the screenshot behind the popup.</p>
  <div class="grid">
    <div class="swatch" style="background:#2563EB">#2563EB</div>
    <div class="swatch" style="background:#7C3AED">#7C3AED</div>
    <div class="swatch" style="background:#EC4899">#EC4899</div>
    <div class="swatch" style="background:#F97316">#F97316</div>
    <div class="swatch" style="background:#F59E0B">#F59E0B</div>
    <div class="swatch" style="background:#10B981">#10B981</div>
  </div></main></body></html>`;
  const PAGE_W = 1120, PAGE_H = 560;
  async function captureHtml(html, width, height) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width, height });
    await p.setContent(html, { waitUntil: 'load' });
    await sleep(150);
    const buf = await p.screenshot();
    await p.close();
    return buf;
  }
  const demoPage = await captureHtml(demoHtml, PAGE_W, PAGE_H);

  // ---------- layouts ----------
  const css = `*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:"Liberation Sans",Arial,sans-serif;color:#0f172a;
    background:linear-gradient(160deg,#fdf4ff 0%,#f8fafc 55%,#eef4ff 100%)}
    .cap{position:absolute;left:0;right:0;top:28px;text-align:center}
    .cap h2{margin:0;font-size:40px;letter-spacing:-.5px} .cap p{margin:8px 0 0;font-size:19px;color:#475569}
    .win{position:absolute;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.08);overflow:hidden}
    .tabs{height:36px;background:#dee3ea;display:flex;align-items:flex-end;padding:0 10px;gap:6px}
    .dots{display:flex;gap:7px;align-self:center;margin-right:10px}.dots i{width:12px;height:12px;border-radius:50%;background:#c3cad4;display:block}
    .tab{background:#fff;border-radius:9px 9px 0 0;height:29px;padding:0 14px;display:flex;align-items:center;font-size:13px;color:#334155;max-width:300px;white-space:nowrap;overflow:hidden}
    .bar{height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #e2e8f0}
    .nav{color:#94a3b8;font-size:18px;width:18px;text-align:center}
    .url{flex:1;height:30px;border-radius:15px;background:#f1f5f9;display:flex;align-items:center;padding:0 14px;font-size:14px;color:#334155}
    .ext{position:relative;width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center}
    .ext img{width:18px;height:18px;border-radius:4px}
    .popup{position:absolute;background:#fff;border-radius:10px;box-shadow:0 14px 40px rgba(15,23,42,.28),0 0 0 1px rgba(15,23,42,.10);overflow:hidden}
    .popup img,.content img{display:block;width:100%}`;
  const chrome_ = ({ tab, url }) => `<div class="tabs"><div class="dots"><i></i><i></i><i></i></div><div class="tab">${tab}</div></div>
    <div class="bar"><span class="nav">&#8592;</span><span class="nav">&#8594;</span><span class="nav">&#8635;</span><div class="url">${url}</div>
    <div class="ext"><img src="${icon}"></div></div>`;

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

  const tabTitle = 'Prism Studio · brand kit (demo)';
  const urlHtml = '<span style="color:#64748b">prism-studio.example</span>/brand-kit';

  // Screenshot 1: pick + history
  await compose(`<style>${css}</style>
    <div class="cap"><h2>Pick any colour on the page</h2><p>Click the toolbar icon or press Alt+Shift+E, then click any pixel. HEX is copied for you.</p></div>
    <div class="win" style="left:60px;top:136px;width:1120px;height:640px">
      ${chrome_({ tab: tabTitle, url: urlHtml })}
      <div class="content"><img src="${b64(demoPage)}"></div>
    </div>
    <div class="popup" style="left:786px;top:200px;width:380px"><img src="${b64(popupPick)}"></div>`, 'screenshot-1-pick.png');

  // Screenshot 2: palettes + export
  await compose(`<style>${css}</style>
    <div class="cap"><h2>Unlimited named palettes</h2><p>Save colours into palettes and export them as CSS variables, Tailwind or JSON.</p></div>
    <div class="popup" style="left:450px;top:110px;width:380px"><img src="${b64(popupPalettes)}"></div>`, 'screenshot-2-palettes.png');

  // Screenshot 3: contrast checker
  await compose(`<style>${css}</style>
    <div class="cap"><h2>WCAG contrast checker</h2><p>See the exact ratio and AA / AAA pass or fail for normal and large text.</p></div>
    <div class="popup" style="left:450px;top:110px;width:380px"><img src="${b64(popupContrast)}"></div>`, 'screenshot-3-contrast.png');

  // Small promo tile 440x280
  await compose(`<style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;font-family:"Liberation Sans",Arial,sans-serif;color:#fff;
      background:linear-gradient(140deg,#4f46e5 0%,#7c3aed 55%,#ec4899 140%);display:flex;flex-direction:column;justify-content:center;padding:0 36px}</style>
    <div style="display:flex;align-items:center;gap:16px"><img src="${icon}" style="width:64px;height:64px;border-radius:14px;box-shadow:0 0 0 3px rgba(255,255,255,.85)">
    <div style="font-size:32px;font-weight:700;letter-spacing:-.5px">Color Picker &amp; Palette</div></div>
    <div style="font-size:22px;margin-top:22px;line-height:1.3;font-weight:700">Eyedropper, palettes, contrast checker.</div>
    <div style="font-size:16px;margin-top:8px;opacity:.9">HEX, RGB, HSL, OKLCH. No tracking.</div>`, 'promo-small-440x280.png', 440, 280);
} finally {
  await ctx.close();
  rmSync(tmp, { recursive: true, force: true });
}
