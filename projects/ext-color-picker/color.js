// Pure colour maths: parsing, formatting (HEX/RGB/HSL/OKLCH), WCAG contrast, palette exports.
// No DOM, no chrome.* : importable from the popup, the service worker and Node tests.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 0) => { const f = 10 ** d; const r = Math.round((x + Number.EPSILON) * f) / f; return Object.is(r, -0) ? 0 : r; };
const trimNum = (x, d) => String(round(x, d)); // drops trailing zeros

// ---------- parsing ----------
// Returns { r, g, b, a } with r/g/b in 0..255 (integers) and a in 0..1, or null.
export function parseColor(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  const hex = s.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? round(parseInt(h.slice(6, 8), 16) / 255, 3) : 1 };
  }
  const fn = s.match(/^(rgba?|hsla?|oklch)\(\s*([^)]*)\)$/);
  if (!fn) return null;
  const args = fn[2].replace(/\s*\/\s*/, ' / ').split(/\s*,\s*|\s+/).filter(Boolean);
  let alpha = 1;
  const slash = args.indexOf('/');
  if (slash !== -1) { alpha = parseAlpha(args[slash + 1]); args.splice(slash); }
  else if (args.length === 4) alpha = parseAlpha(args.pop());
  if (args.length !== 3 || Number.isNaN(alpha)) return null;
  const kind = fn[1];
  if (kind.startsWith('rgb')) {
    const v = args.map((a) => (a.endsWith('%') ? (parseFloat(a) / 100) * 255 : parseFloat(a)));
    if (v.some(Number.isNaN)) return null;
    return { r: Math.round(clamp(v[0], 0, 255)), g: Math.round(clamp(v[1], 0, 255)), b: Math.round(clamp(v[2], 0, 255)), a: alpha };
  }
  if (kind.startsWith('hsl')) {
    const h = parseHue(args[0]); const sat = parseFloat(args[1]); const l = parseFloat(args[2]);
    if ([h, sat, l].some(Number.isNaN)) return null;
    return { ...hslToRgb(h, sat, l), a: alpha };
  }
  // oklch(L C H): L as % or 0..1, C as number (or % of 0.4), H in degrees
  let L = args[0].endsWith('%') ? parseFloat(args[0]) / 100 : parseFloat(args[0]);
  const C = args[1].endsWith('%') ? (parseFloat(args[1]) / 100) * 0.4 : args[1] === 'none' ? 0 : parseFloat(args[1]);
  const H = args[2] === 'none' ? 0 : parseHue(args[2]);
  if ([L, C, H].some(Number.isNaN)) return null;
  L = clamp(L, 0, 1);
  return { ...oklchToRgb(L, Math.max(0, C), H), a: alpha };
}

function parseAlpha(a) {
  if (a == null) return NaN;
  return clamp(a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a), 0, 1);
}
function parseHue(h) {
  const v = parseFloat(h);
  if (h.endsWith('turn')) return v * 360;
  if (h.endsWith('grad')) return v * 0.9;
  if (h.endsWith('rad')) return (v * 180) / Math.PI;
  return v;
}

// ---------- HEX / RGB / HSL ----------
const hex2 = (n) => n.toString(16).padStart(2, '0');
export function toHex({ r, g, b }, upper = true) {
  const s = '#' + hex2(r) + hex2(g) + hex2(b);
  return upper ? s.toUpperCase() : s;
}
// Normalises anything parseable to "#RRGGBB" (alpha dropped), or null.
export function normalizeHex(input) {
  const c = parseColor(input);
  return c ? toHex(c) : null;
}

export function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

// ---------- OKLCH (Björn Ottosson's OKLab) ----------
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, Bb);
  let H = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < 1e-4 ? 0 : H };
}

export function oklchToRgb(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const A = C * Math.cos(hr), Bb = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  // Out-of-gamut values are clipped to sRGB.
  return { r: Math.round(clamp(fromLinear(R), 0, 255)), g: Math.round(clamp(fromLinear(G), 0, 255)), b: Math.round(clamp(fromLinear(B), 0, 255)) };
}

// ---------- display strings ----------
export function formats(input, { upper = true } = {}) {
  const c = typeof input === 'string' ? parseColor(input) : input;
  if (!c) return null;
  const hsl = rgbToHsl(c);
  const ok = rgbToOklch(c);
  return {
    hex: toHex(c, upper),
    rgb: `rgb(${c.r}, ${c.g}, ${c.b})`,
    hsl: `hsl(${Math.round(hsl.h) % 360}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`,
    // Precision (L 2dp, C 5dp, H 2dp) round-trips all 16,777,216 sRGB colours back to the same HEX (checked exhaustively).
    oklch: `oklch(${trimNum(ok.l * 100, 2)}% ${trimNum(ok.c, 5)} ${trimNum(ok.h, 2)})`
  };
}

// ---------- WCAG 2.x contrast ----------
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
export function contrastRatio(a, b) {
  const ca = typeof a === 'string' ? parseColor(a) : a;
  const cb = typeof b === 'string' ? parseColor(b) : b;
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca), lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Pass/fail uses the unrounded ratio. The display value is truncated (never rounded up), so "4.50:1" always passes AA.
export function wcag(ratio) {
  return {
    ratio,
    display: (Math.floor(ratio * 100) / 100).toFixed(2) + ':1',
    aaNormal: ratio >= 4.5, aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5
  };
}

// ---------- palette exports ----------
export function slug(name, fallback = 'palette') {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(s) ? s : s ? 'c-' + s : fallback;
}

export function exportPalette(palette, kind) {
  const name = slug(palette.name);
  const colors = (palette.colors || []).map((h) => normalizeHex(h)).filter(Boolean).map((h) => h.toLowerCase());
  switch (kind) {
    case 'css':
      return `:root {\n${colors.map((h, i) => `  --${name}-${i + 1}: ${h};`).join('\n')}\n}\n`;
    case 'tailwind4':
      return `@theme {\n${colors.map((h, i) => `  --color-${name}-${i + 1}: ${h};`).join('\n')}\n}\n`;
    case 'tailwind3':
      return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n        '${name}': {\n${colors.map((h, i) => `          ${i + 1}: '${h}',`).join('\n')}\n        }\n      }\n    }\n  }\n};\n`;
    case 'json':
      return JSON.stringify({ name: palette.name, colors: colors.map((h) => ({ ...formats(h, { upper: false }) })) }, null, 2) + '\n';
    default:
      throw new Error('Unknown export format: ' + kind);
  }
}
