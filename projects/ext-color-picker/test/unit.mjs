// Unit tests for color.js (pure maths). Run: node test/unit.mjs   (FULL=1 checks all 16.7M colours, ~2 min)
import * as C from '../color.js';
import { RESTRICTED_URL } from '../config.js';
import { explainInjectError, RESTRICTED_MESSAGE } from '../pick.js';

const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- parsing ----
const P = (s) => { const c = C.parseColor(s); return c && C.toHex(c); };
check('parse #abc shorthand', P('#abc') === '#AABBCC');
check('parse hex without # and upper case', P('1A2B3C') === '#1A2B3C');
check('parse #rrggbbaa keeps alpha', eq(C.parseColor('#ff000080'), { r: 255, g: 0, b: 0, a: 0.502 }));
check('parse rgb() comma syntax', P('rgb(26, 43, 60)') === '#1A2B3C');
check('parse rgb() space + slash alpha', eq(C.parseColor('rgb(26 43 60 / 50%)'), { r: 26, g: 43, b: 60, a: 0.5 }));
check('parse rgba() and percentages', P('rgba(100%, 0%, 0%, 0.3)') === '#FF0000');
check('parse hsl()', P('hsl(210, 40%, 17%)') === '#1A2B3D' && P('hsla(0, 100%, 50%, .5)') === '#FF0000');
check('parse hsl() with deg/turn units', P('hsl(210deg 40% 17%)') === '#1A2B3D' && P('hsl(0.5turn 100% 50%)') === '#00FFFF');
check('parse oklch() percent and number L', P('oklch(62.8% 0.2577 29.23)') === '#FF0000' && P('oklch(0.628 0.2577 29.23)') === '#FF0000');
check('parse named white/black', P('white') === '#FFFFFF' && P('BLACK') === '#000000');
check('reject invalid input', ['', '  ', 'nope', '#12', '#12345', 'rgb(1,2)', 'hsl(x, 1%, 1%)', 'rgb(1,2,3,4,5)', null, undefined].every((s) => C.parseColor(s) === null));
check('normalizeHex', C.normalizeHex(' #a1b2c3 ') === '#A1B2C3' && C.normalizeHex('zzz') === null);

// ---- known conversions ----
const f = (s) => C.formats(s);
check('red formats', eq(f('#ff0000'), { hex: '#FF0000', rgb: 'rgb(255, 0, 0)', hsl: 'hsl(0, 100%, 50%)', oklch: 'oklch(62.8% 0.25768 29.23)' }), JSON.stringify(f('#ff0000')));
check('#1A2B3C -> rgb/hsl', f('#1A2B3C').rgb === 'rgb(26, 43, 60)' && f('#1A2B3C').hsl === 'hsl(210, 40%, 17%)');
check('#FF8000 -> hsl(30, 100%, 50%)', f('#FF8000').hsl === 'hsl(30, 100%, 50%)');
check('grey has zero saturation and hue', f('#808080').hsl === 'hsl(0, 0%, 50%)');
check('lower-case HEX option', C.formats('#ABCDEF', { upper: false }).hex === '#abcdef');
// Reference OKLCH values from CSS Color 4 / Ottosson (sRGB primaries).
const ok = (hex) => C.rgbToOklch(C.parseColor(hex));
const refs = [['#FF0000', 0.62796, 0.25768, 29.2339], ['#00FF00', 0.86644, 0.29483, 142.4953], ['#0000FF', 0.45201, 0.31321, 264.052]];
check('OKLCH matches reference values for sRGB primaries', refs.every(([h, L, Cc, H]) => { const o = ok(h); return near(o.l, L, 5e-5) && near(o.c, Cc, 5e-5) && near(o.h, H, 5e-3); }));
check('OKLCH white = L 1, C 0; black = L 0', near(ok('#FFFFFF').l, 1, 1e-6) && ok('#FFFFFF').c < 1e-4 && ok('#FFFFFF').h === 0 && ok('#000000').l === 0);
check('OKLCH achromatic string', f('#FFFFFF').oklch === 'oklch(100% 0 0)' && f('#000000').oklch === 'oklch(0% 0 0)');

// ---- out-of-gamut OKLCH (CSS Color 4: reduce chroma, keep L and H; L 100% = white, 0% = black) ----
check('OKLCH L=100% is white and L=0% is black regardless of chroma', P('oklch(100% 0.2 30)') === '#FFFFFF' && P('oklch(0% 0.2 30)') === '#000000' && P('oklch(120% 0.1 0)') === '#FFFFFF');
check('out-of-gamut OKLCH keeps its hue (chroma reduced, not per-channel clipped)', (() => {
  for (const [L, Cc, H] of [[0.7, 0.4, 150], [0.9, 0.3, 100], [0.5, 0.3, 264], [0.6, 0.37, 330], [0.4, 0.3, 30]]) {
    const o = C.rgbToOklch(C.parseColor(`oklch(${L} ${Cc} ${H})`));
    if (Math.abs(o.l - L) > 0.01) return false;
    const dh = Math.abs(((o.h - H + 540) % 360) - 180);
    if (dh > 3) return false;
  }
  return true;
})());
check('export drops duplicate colours', C.exportPalette({ name: 'x', colors: ['#abc', '#AABBCC', 'aabbcc'] }, 'css') === ':root {\n  --x-1: #aabbcc;\n}\n');

// ---- round trips ----
let hslBad = 0, okBad = 0, n = 0;
const STEP = process.env.FULL ? 1 : 3;
for (let r = 0; r < 256; r += STEP) for (let g = 0; g < 256; g += STEP) for (let b = 0; b < 256; b += STEP) {
  n++;
  const c = { r, g, b };
  const h = C.rgbToHsl(c);
  if (C.toHex(C.hslToRgb(h.h, h.s, h.l)) !== C.toHex(c)) hslBad++;
  if (P(C.formats(c).oklch) !== C.toHex(c)) okBad++;
}
// Colours with a channel at 0/1/2 were the hardest cases for OKLCH precision: check all of them.
for (let x = 0; x < 256; x++) for (let y = 0; y < 256; y++) for (const z of [0, 1, 2]) for (const c of [{ r: z, g: x, b: y }, { r: x, g: z, b: y }, { r: x, g: y, b: z }]) {
  n++;
  if (P(C.formats(c).oklch) !== C.toHex(c)) okBad++;
}
check(`HSL (full precision) round-trips (${STEP === 1 ? 'all' : 'sampled'} colours)`, hslBad === 0, `bad=${hslBad}`);
check(`OKLCH display string round-trips to the same HEX (${n} colours${STEP === 1 ? ', exhaustive' : ''})`, okBad === 0, `bad=${okBad}`);
check('HSL display string (whole numbers) comes back within 3 per channel', (() => {
  for (let i = 0; i < 20000; i++) {
    const c = { r: (i * 97) % 256, g: (i * 57) % 256, b: (i * 31) % 256 };
    const back = C.parseColor(C.formats(c).hsl);
    if (Math.abs(back.r - c.r) > 3 || Math.abs(back.g - c.g) > 3 || Math.abs(back.b - c.b) > 3) return false;
  }
  return true;
})());

// ---- WCAG contrast (values as reported by the WebAIM contrast checker) ----
const R = (a, b) => C.contrastRatio(a, b);
const W = (a, b) => C.wcag(R(a, b));
check('black on white = 21:1', near(R('#000', '#fff'), 21, 1e-9) && W('#000', '#fff').display === '21.00:1');
check('same colour = 1:1', near(R('#777', '#777'), 1, 1e-12) && W('#777', '#777').display === '1.00:1');
check('ratio is symmetric', R('#123456', '#fedcba') === R('#fedcba', '#123456'));
check('#767676 on white = 4.54:1, passes AA', W('#767676', '#fff').display === '4.54:1' && W('#767676', '#fff').aaNormal && !W('#767676', '#fff').aaaNormal);
check('#777777 on white = 4.47:1, fails AA normal, passes AA large', W('#777777', '#fff').display === '4.47:1' && !W('#777777', '#fff').aaNormal && W('#777777', '#fff').aaLarge);
check('#595959 on white = 7.00:1, passes AAA', W('#595959', '#fff').display === '7.00:1' && W('#595959', '#fff').aaaNormal);
check('#FF0000 on white = 3.99:1 (AA large only)', W('#f00', '#fff').display === '3.99:1' && W('#f00', '#fff').aaLarge && !W('#f00', '#fff').aaNormal);
check('#0000FF on white = 8.59:1', W('#00f', '#fff').display === '8.59:1');
check('#949494 on white passes AA large (3.03:1), fails AA normal', W('#949494', '#fff').display === '3.03:1' && W('#949494', '#fff').aaLarge && !W('#949494', '#fff').aaNormal);
check('display never rounds a failing ratio up', C.wcag(4.4999).display === '4.49:1' && !C.wcag(4.4999).aaNormal && C.wcag(6.999).display === '6.99:1' && !C.wcag(6.999).aaaNormal);
check('contrast of invalid input is null', R('nope', '#fff') === null);

// ---- exports ----
const pal = { name: 'My Brand!', colors: ['#1A2B3C', 'ff8000', 'nope', '#FFFFFF'] };
check('slug', C.slug('My Brand!') === 'my-brand' && C.slug('2026 palette') === 'c-2026-palette' && C.slug('  ') === 'palette' && C.slug('Café Crème') === 'cafe-creme');
check('CSS variables export', C.exportPalette(pal, 'css') === ':root {\n  --my-brand-1: #1a2b3c;\n  --my-brand-2: #ff8000;\n  --my-brand-3: #ffffff;\n}\n', C.exportPalette(pal, 'css'));
check('Tailwind v4 @theme export', C.exportPalette(pal, 'tailwind4') === '@theme {\n  --color-my-brand-1: #1a2b3c;\n  --color-my-brand-2: #ff8000;\n  --color-my-brand-3: #ffffff;\n}\n');
const tw3 = C.exportPalette(pal, 'tailwind3');
const mod = { exports: null };
new Function('module', tw3)(mod);
check('Tailwind v3 config export is valid JS with the colours', eq(mod.exports, { theme: { extend: { colors: { 'my-brand': { 1: '#1a2b3c', 2: '#ff8000', 3: '#ffffff' } } } } }), tw3);
const js = JSON.parse(C.exportPalette(pal, 'json'));
check('JSON export', js.name === 'My Brand!' && js.colors.length === 3 && eq(js.colors[0], { hex: '#1a2b3c', rgb: 'rgb(26, 43, 60)', hsl: 'hsl(210, 40%, 17%)', oklch: C.formats('#1a2b3c').oklch }));
check('unknown export kind throws', (() => { try { C.exportPalette(pal, 'xml'); return false; } catch { return true; } })());

// ---- restricted URLs ----
const restricted = ['chrome://extensions', 'chrome://newtab/', 'chrome-extension://abc/popup.html', 'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/detail/x', 'view-source:https://a.com', 'about:blank', 'edge://settings', 'devtools://devtools/x'];
const allowed = ['https://example.com/', 'http://127.0.0.1:8000/', 'file:///tmp/a.html', 'https://chromewebstore.google.com.evil.example/', 'https://google.com/webstore'];
check('restricted URL detection', restricted.every((u) => RESTRICTED_URL.test(u)) && allowed.every((u) => !RESTRICTED_URL.test(u)));

check('inject errors: chrome:// and Web Store -> restricted message', explainInjectError('Cannot access a chrome:// URL') === RESTRICTED_MESSAGE && explainInjectError('The extensions gallery cannot be scripted.') === RESTRICTED_MESSAGE);
check('inject errors: file:// -> file access hint', /Allow access to file URLs/.test(explainInjectError('Cannot access contents of url "file:///tmp/a.html".', 'file:///tmp/a.html')));
check('inject errors: error page / no access / gone tab', /error pages/.test(explainInjectError('Frame with ID 0 is showing error page')) &&
  /can't be accessed right now/.test(explainInjectError('Cannot access contents of the page. Extension manifest must request permission to access the respective host.', 'https://a.com/')) &&
  /not available any more/.test(explainInjectError('No tab with id: 5.')));

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\nunit: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
