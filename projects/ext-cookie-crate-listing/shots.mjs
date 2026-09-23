// Renders store screenshots from the real popup UI (test copy of the extension, TEST ONLY license for the Pro badge).
// Run: node shots.mjs  -> raw-*.png, then python3 compose.py
import { createRequire } from 'node:module';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from '../ext-cookie-crate/test/make-license.mjs';
const require = createRequire('/usr/local/lib/node_modules/@playwright/mcp/node_modules/');
const { chromium } = require('playwright');
const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '../ext-cookie-crate');
const PORT = 8791;
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'cc-shots-')));
const ext = join(tmp, 'ext');
cpSync(EXT, ext, { recursive: true, filter: (p) => !p.includes('/test') });
const man = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['*://*.test/*']; man.permissions.push('tabs');
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(man));
const lic = join(ext, 'license.js');
writeFileSync(lic, readFileSync(lic, 'utf8').replace(/PUBLIC_KEY = '[^']*'/, `PUBLIC_KEY = '${readFileSync(join(EXT, 'test/TEST_ONLY_public_key.txt'), 'utf8').trim()}'`));
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const server = createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end('<title>Acme staging</title><h1>Acme staging</h1>'); }).listen(PORT, '127.0.0.1');
const ctx = await chromium.launchPersistentContext(join(tmp, 'p'), {
  executablePath: '/ms-playwright/chromium-1246/chrome-linux64/chrome', headless: false, viewport: { width: 560, height: 700 }, deviceScaleFactor: 2,
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--host-resolver-rules=MAP *.test 127.0.0.1']
});
try {
  const drv = await ctx.newPage();
  await drv.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'load' });
  await drv.evaluate(async (t) => {
    await chrome.storage.sync.set({ license: t });
    const far = Math.floor(Date.now() / 1000) + 86400 * 90;
    const s = (d) => chrome.cookies.set({ expirationDate: far, ...d });
    await s({ url: 'https://acme.test/', domain: 'acme.test', name: 'consent', value: 'analytics=0&ads=0', secure: true, sameSite: 'lax' });
    await s({ url: 'https://acme.test/', domain: 'acme.test', name: 'lang', value: 'en-GB', secure: true });
    await s({ url: 'https://app.acme.test/', name: 'session_id', value: 'a3f9c2e17b0d4e8f9a61c55d02e7b3aa', secure: true, httpOnly: true, sameSite: 'strict' });
    await s({ url: 'https://app.acme.test/', name: 'csrf_token', value: 'Zq8x-41fK_pL0v2mN7cR', secure: true, sameSite: 'strict' });
    await s({ url: 'https://app.acme.test/admin', path: '/admin', name: 'admin_view', value: 'compact', secure: true });
    await s({ url: 'https://app.acme.test/', name: 'feature_flags', value: 'new-checkout,beta-search', secure: true });
    await s({ url: 'https://app.acme.test/', name: 'chat_widget', value: 'w-71c2', secure: true, sameSite: 'no_restriction', partitionKey: { topLevelSite: 'https://acme.test' } });
    await s({ url: 'https://app.acme.test/', name: 'theme', value: 'dark', secure: true });
    await chrome.storage.local.set({ protected: ['.acme.test|/|consent'] });
  }, makeToken(readFileSync(join(EXT, 'test/TEST_ONLY_private_key.pem'), 'utf8')));
  const site = await ctx.newPage();
  await site.goto(`http://app.acme.test:${PORT}/`, { waitUntil: 'load' });
  await site.evaluate(() => { localStorage.setItem('cart', '{"items":[{"sku":"A-102","qty":2}]}'); localStorage.setItem('onboarding_done', 'true'); localStorage.setItem('recent_searches', '["invoices","q3 report"]'); localStorage.setItem('ui.sidebar', 'collapsed'); sessionStorage.setItem('draft_message', 'Hi team,'); });
  const tabId = await drv.evaluate(async () => (await chrome.tabs.query({ url: '*://app.acme.test/*' }))[0].id);
  const open = async (dark) => {
    const p = await ctx.newPage();
    await p.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await p.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`, { waitUntil: 'load' });
    await p.waitForSelector('body[data-ready]');
    return p;
  };
  const shot = async (p, name) => { const b = await p.evaluate(() => { const r = document.body.getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(r.width + 24), height: Math.ceil(document.body.scrollHeight + 8) }; }); await p.screenshot({ path: join(HERE, name), clip: b }); };
  let p = await open(false);
  await p.click('#list > li[data-name="session_id"] .head');
  await shot(p, 'raw-1.png'); await p.close();
  p = await open(true);
  await p.click('#delall'); await p.click('#delall');
  await p.waitForFunction(() => /kept 1 protected/.test(document.querySelector('#status').textContent));
  // put the cookies back for the next shots? not needed: shot 2 shows the result of delete all
  await shot(p, 'raw-2.png'); await p.close();
  p = await open(false);
  await p.click('#tab-storage');
  await p.waitForSelector('#s-list > li[data-key="cart"]');
  await p.click('#s-list > li[data-key="cart"] .head');
  await shot(p, 'raw-3.png'); await p.close();
} finally { await ctx.close(); server.close(); rmSync(tmp, { recursive: true, force: true }); }
console.log('ok');
