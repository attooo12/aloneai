import { isPro } from './license.js';
import { PRO_PRICE, shortcutsTarget, FIREFOX_SHORTCUTS_HINT } from './config.js';
import { formats, normalizeHex, parseColor, contrastRatio, wcag, exportPalette, toHex } from './color.js';
import { injectPicker, openPickerWindow, isRestrictedUrl, RESTRICTED_MESSAGE } from './pick.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const WINDOW_MODE = params.has('window'); // opened as a standalone window: pick with the EyeDropper right here
const TEST_TAB = params.has('tab') ? Number(params.get('tab')) : null; // tests open the popup as a tab

let pro = false;
let settings = { upper: true, autoCopy: true };
let current = null; // "#RRGGBB"
let history = [];
let palettes = [];
let activePaletteId = null;
let contrast = { fg: '#1F2937', bg: '#FFFFFF' };

const say = (text) => { $('status').textContent = ''; setTimeout(() => ($('status').textContent = text), 30); };
const showHex = (hex) => (settings.upper ? hex : hex.toLowerCase());

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1200); }
    say('Copied ' + text);
    return true;
  } catch {
    say('Could not copy. Select the text and press Ctrl+C.');
    return false;
  }
}

// ---------- tabs ----------
const tabs = ['pick', 'palettes', 'contrast'];
function selectTab(name, focus = false) {
  for (const t of tabs) {
    const on = t === name;
    $('tab-' + t).setAttribute('aria-selected', String(on));
    $('tab-' + t).tabIndex = on ? 0 : -1;
    $('panel-' + t).hidden = !on;
  }
  if (focus) $('tab-' + name).focus();
  chrome.storage.local.set({ lastTab: name });
}
for (const t of tabs) {
  $('tab-' + t).addEventListener('click', () => selectTab(t));
  $('tab-' + t).addEventListener('keydown', (e) => {
    const i = tabs.indexOf(t);
    if (e.key === 'ArrowRight') selectTab(tabs[(i + 1) % tabs.length], true);
    if (e.key === 'ArrowLeft') selectTab(tabs[(i + tabs.length - 1) % tabs.length], true);
    if (e.key === 'Home') { e.preventDefault(); selectTab(tabs[0], true); }
    if (e.key === 'End') { e.preventDefault(); selectTab(tabs[tabs.length - 1], true); }
  });
}

// ---------- plan ----------
function renderPlan() {
  $('plan').textContent = pro ? 'Pro' : 'Free';
  $('plan').classList.toggle('pro', pro);
  for (const el of document.querySelectorAll('[data-locked]')) el.hidden = pro;
  for (const el of document.querySelectorAll('[data-unlocked]')) el.hidden = !pro;
  for (const el of document.querySelectorAll('.pro-tag')) el.hidden = pro;
  for (const el of document.querySelectorAll('.price')) el.textContent = PRO_PRICE;
  $('add-row').hidden = !pro;
}

// ---------- current color ----------
function setCurrent(hex, { updateInput = true } = {}) {
  current = normalizeHex(hex);
  const f = current ? formats(current, { upper: settings.upper }) : null;
  $('swatch').style.background = current || 'transparent';
  if (updateInput) $('input').value = f ? f.hex : '';
  $('f-hex').textContent = f?.hex ?? '–';
  $('f-rgb').textContent = f?.rgb ?? '–';
  $('f-hsl').textContent = f?.hsl ?? '–';
  const oklchCopy = document.querySelector('[data-copy=oklch]');
  if (pro) {
    $('f-oklch').textContent = f?.oklch ?? '–';
    oklchCopy.hidden = false;
  } else {
    $('f-oklch').innerHTML = '<a href="options.html" target="_blank" class="pill" title="OKLCH is part of Pro">Pro</a>';
    oklchCopy.hidden = true;
  }
  for (const b of document.querySelectorAll('[data-copy]')) b.disabled = !f;
  $('pal-current').textContent = current ? showHex(current) : '';
  $('pal-add').disabled = !activePalette() || !current; // a typed or picked colour can be added right away
  renderHistory();
}

$('input').addEventListener('input', () => {
  const c = parseColor($('input').value);
  if (c) setCurrent(toHex(c), { updateInput: false });
});
$('input').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const hex = normalizeHex($('input').value);
  if (!hex) return say('Not a color. Try #2563EB, rgb(37, 99, 235) or hsl(221, 83%, 53%).');
  history = await store.addToHistory(hex);
  setCurrent(hex);
  say('Saved ' + showHex(hex) + ' to recent picks');
});

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', () => {
    const f = current && formats(current, { upper: settings.upper });
    if (f && (b.dataset.copy !== 'oklch' || pro)) copyText(f[b.dataset.copy], b);
  });
}

// ---------- history ----------
function swatchButton(hex, { pressed = false, label } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sw';
  b.style.background = hex;
  b.title = showHex(hex);
  b.setAttribute('aria-label', label || showHex(hex));
  b.setAttribute('aria-pressed', String(pressed));
  b.dataset.hex = hex;
  return b;
}
function renderHistory() {
  const ul = $('history');
  ul.replaceChildren();
  if (!history.length) {
    const li = document.createElement('li');
    li.className = 'empty muted small';
    li.textContent = 'Your last 12 picks appear here.';
    ul.append(li);
  }
  for (const { hex } of history) {
    const li = document.createElement('li');
    const b = swatchButton(hex, { pressed: hex === current });
    b.addEventListener('click', () => setCurrent(hex));
    li.append(b);
    ul.append(li);
  }
  $('clear-history').disabled = !history.length;
}
$('clear-history').addEventListener('click', async () => {
  await store.clearHistory();
  history = [];
  renderHistory();
  say('Recent picks cleared');
});

// ---------- picking ----------
function showMessage(text, withWindowButton) {
  const m = $('msg');
  m.replaceChildren(text);
  if (withWindowButton) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Open picker window';
    b.addEventListener('click', openWindow);
    m.append(document.createElement('br'), b);
  }
}
async function openWindow() {
  await openPickerWindow();
  if (!WINDOW_MODE && TEST_TAB == null) window.close();
}
$('open-window').addEventListener('click', openWindow);

async function getTargetTab() {
  if (TEST_TAB != null) return chrome.tabs.get(TEST_TAB);
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function pickHere() {
  // Standalone window: a normal extension page with a real click, so the EyeDropper can open directly.
  try {
    const { sRGBHex } = await new EyeDropper().open();
    history = await store.addToHistory(sRGBHex);
    setCurrent(history[0].hex);
    if (settings.autoCopy) await copyText(showHex(history[0].hex));
  } catch (e) {
    if (e?.name !== 'AbortError') showMessage('Could not open the eyedropper: ' + (e?.message || e));
  }
}

$('pick').addEventListener('click', async () => {
  $('msg').replaceChildren();
  if (typeof EyeDropper !== 'function') return showMessage('This browser does not support the EyeDropper API.');
  if (WINDOW_MODE) return pickHere();
  const tab = await getTargetTab().catch(() => null);
  // Must run inside this click handler so the page gets the click's user activation.
  const res = await injectPicker(tab, { fromPopup: true });
  if (!res.ok) return showMessage(res.message, true);
  if (res.state === 'waiting-for-popup') {
    // The picker opens the EyeDropper once this popup is gone; the port's disconnect tells it when.
    const port = chrome.tabs.connect(tab.id, { name: 'color-picker-popup' });
    if (TEST_TAB != null) setTimeout(() => port.disconnect(), 50); // tests keep this page open: simulate closing
  }
  if (TEST_TAB == null) window.close();
  else say('Picker started: ' + res.state);
});

async function renderHint() {
  const cmds = await chrome.commands.getAll().catch(() => []);
  const sc = cmds.find((c) => c.name === 'pick-color')?.shortcut;
  const h = $('hint');
  h.replaceChildren();
  if (WINDOW_MODE) {
    h.textContent = 'Picks anywhere on your screen. Press Esc to cancel.';
  } else if (sc) {
    h.textContent = `Shortcut: ${sc}`;
  } else {
    const target = shortcutsTarget();
    if (target.browser === 'firefox') {
      h.textContent = FIREFOX_SHORTCUTS_HINT;
    } else {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'link'; b.textContent = 'Set a keyboard shortcut';
      b.addEventListener('click', () => chrome.tabs.create({ url: target.url }));
      h.append(b);
    }
  }
  if (!WINDOW_MODE) {
    const tab = await getTargetTab().catch(() => null);
    if (tab && isRestrictedUrl(tab.url)) showMessage(RESTRICTED_MESSAGE, true);
  }
}

// ---------- palettes (Pro) ----------
const activePalette = () => palettes.find((p) => p.id === activePaletteId) || null;
function palMsg(text, isError = false) {
  $('pal-msg').textContent = text;
  $('pal-msg').className = 'small ' + (isError ? 'error' : 'muted');
}
async function guard(fn) {
  try { return await fn(); } catch (e) {
    palMsg(e.code === 'pro_required' ? 'Palettes need a Pro license.' : e.message, true);
    return null;
  }
}
function renderPalettes() {
  if (!palettes.some((p) => p.id === activePaletteId)) activePaletteId = palettes[0]?.id ?? null;
  const sel = $('pal-select');
  sel.replaceChildren(...palettes.map((p) => new Option(`${p.name} (${p.colors.length})`, p.id, false, p.id === activePaletteId)));
  if (!palettes.length) sel.append(new Option('No palettes yet', '', true, true));
  sel.disabled = !palettes.length;
  const p = activePalette();
  for (const id of ['pal-name', 'pal-rename', 'pal-delete', 'pal-add', 'exp-kind', 'exp-copy']) $(id).disabled = !p;
  $('pal-add').disabled = !p || !current;
  $('pal-name').value = p?.name ?? '';
  const ul = $('pal-colors');
  ul.replaceChildren();
  if (p && !p.colors.length) {
    const li = document.createElement('li'); li.className = 'empty muted small';
    li.textContent = 'Empty. Pick a color, then “Add current color”.';
    ul.append(li);
  } else if (!p) {
    const li = document.createElement('li'); li.className = 'empty muted small';
    li.textContent = 'Create a palette with “New”.';
    ul.append(li);
  }
  for (const hex of p?.colors ?? []) {
    const li = document.createElement('li');
    const b = swatchButton(hex, { pressed: hex === current });
    b.addEventListener('click', () => { setCurrent(hex); renderPalettes(); });
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'rm'; rm.textContent = '×';
    rm.setAttribute('aria-label', `Remove ${showHex(hex)} from ${p.name}`);
    rm.addEventListener('click', async () => {
      if (await guard(() => store.removeColorFromPalette(p.id, hex))) { palettes = await store.getPalettes(); renderPalettes(); }
    });
    li.append(b, rm);
    ul.append(li);
  }
  $('exp-out').value = p ? exportPalette(p, $('exp-kind').value) : '';
  chrome.storage.local.set({ activePaletteId });
}
$('pal-select').addEventListener('change', () => { activePaletteId = $('pal-select').value; disarmDelete(); renderPalettes(); });
$('pal-new').addEventListener('click', async () => {
  const p = await guard(() => store.createPalette('', current ? [current] : []));
  if (!p) return;
  palettes = await store.getPalettes();
  activePaletteId = p.id;
  renderPalettes();
  palMsg(`Created “${p.name}”. Rename it below.`);
  $('pal-name').select();
});
$('pal-rename').addEventListener('click', async () => {
  const p = activePalette(); if (!p) return;
  if (!$('pal-name').value.trim()) { $('pal-name').value = p.name; return palMsg('A palette needs a name.', true); }
  if (await guard(() => store.renamePalette(p.id, $('pal-name').value))) { palettes = await store.getPalettes(); renderPalettes(); palMsg('Renamed.'); }
});
$('pal-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pal-rename').click(); });
// The confirm click only counts for the palette it was armed on (switching palettes disarms it).
let deleteArmed = { id: null, t: 0 }, disarmTimer = 0;
function disarmDelete() {
  clearTimeout(disarmTimer);
  if (deleteArmed.id) palMsg('');
  deleteArmed = { id: null, t: 0 };
  $('pal-delete').textContent = 'Delete';
}
$('pal-delete').addEventListener('click', async () => {
  const p = activePalette(); if (!p) return;
  if (deleteArmed.id !== p.id || Date.now() - deleteArmed.t > 4000) {
    deleteArmed = { id: p.id, t: Date.now() };
    $('pal-delete').textContent = 'Confirm';
    palMsg(`Click “Confirm” to delete “${p.name}”.`, true);
    clearTimeout(disarmTimer);
    disarmTimer = setTimeout(disarmDelete, 4000);
    return;
  }
  disarmDelete();
  if (await guard(() => store.deletePalette(p.id))) { palettes = await store.getPalettes(); activePaletteId = null; renderPalettes(); palMsg(`Deleted “${p.name}”.`); }
});
async function addCurrentTo(p) {
  if (!p || !current) return false;
  if (!(await guard(() => store.addColorToPalette(p.id, current)))) return false;
  palettes = await store.getPalettes();
  renderPalettes();
  return true;
}
$('pal-add').addEventListener('click', async () => { if (await addCurrentTo(activePalette())) palMsg(`Added ${showHex(current)}.`); });
$('add-current').addEventListener('click', async () => {
  let p = activePalette();
  if (!p) { p = await guard(() => store.createPalette('')); palettes = await store.getPalettes(); activePaletteId = p?.id; }
  if (await addCurrentTo(activePalette())) $('add-msg').textContent = `Added to “${activePalette().name}”.`;
});
$('exp-kind').addEventListener('change', () => { renderPalettes(); chrome.storage.local.set({ exportKind: $('exp-kind').value }); });
$('exp-copy').addEventListener('click', () => copyText($('exp-out').value, $('exp-copy')));

// ---------- contrast (Pro) ----------
function renderContrast() {
  const fg = normalizeHex($('c-fg').value), bg = normalizeHex($('c-bg').value);
  $('c-err').textContent = !fg ? 'Text color is not valid.' : !bg ? 'Background is not valid.' : '';
  if (!fg || !bg) return;
  contrast = { fg, bg };
  $('c-fg-pick').value = fg.toLowerCase();
  $('c-bg-pick').value = bg.toLowerCase();
  $('preview').style.color = fg;
  $('preview').style.background = bg;
  const w = wcag(contrastRatio(fg, bg));
  $('ratio').textContent = w.display;
  const mark = (id, ok) => { $(id).textContent = ok ? 'Pass' : 'Fail'; $(id).className = ok ? 'pass' : 'fail'; };
  mark('c-aa', w.aaNormal); mark('c-aa-lg', w.aaLarge); mark('c-aaa', w.aaaNormal); mark('c-aaa-lg', w.aaaLarge);
  chrome.storage.local.set({ contrast });
}
function setContrastInputs() {
  $('c-fg').value = showHex(contrast.fg);
  $('c-bg').value = showHex(contrast.bg);
  renderContrast();
}
$('c-fg').addEventListener('input', renderContrast);
$('c-bg').addEventListener('input', renderContrast);
$('c-fg-pick').addEventListener('input', () => { $('c-fg').value = showHex($('c-fg-pick').value.toUpperCase()); renderContrast(); });
$('c-bg-pick').addEventListener('input', () => { $('c-bg').value = showHex($('c-bg-pick').value.toUpperCase()); renderContrast(); });
$('c-swap').addEventListener('click', () => { contrast = { fg: contrast.bg, bg: contrast.fg }; setContrastInputs(); });
for (const b of document.querySelectorAll('[data-use]')) {
  b.addEventListener('click', () => { if (current) { $('c-' + b.dataset.use).value = showHex(current); renderContrast(); } });
}

// ---------- init ----------
async function load() {
  [pro, settings, history, palettes] = await Promise.all([isPro(), store.getSettings(), store.getHistory(), store.getPalettes()]);
  const local = await chrome.storage.local.get(['activePaletteId', 'contrast', 'lastTab', 'exportKind']);
  activePaletteId = local.activePaletteId ?? null;
  if (local.contrast?.fg && local.contrast?.bg) contrast = local.contrast;
  if (local.exportKind) $('exp-kind').value = local.exportKind;
  renderPlan();
  setCurrent(current || history[0]?.hex || null);
  renderPalettes();
  setContrastInputs();
  if (!WINDOW_MODE && tabs.includes(local.lastTab)) selectTab(local.lastTab);
}

if (WINDOW_MODE) { document.body.classList.add('window'); document.title = 'Color Picker window'; }
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.history) {
    history = changes.history.newValue || [];
    // A pick made on a page (or in another window) becomes the current color.
    if (history[0] && history[0].hex !== current && (changes.history.oldValue || [])[0]?.hex !== history[0].hex) setCurrent(history[0].hex);
    else renderHistory();
  }
  if (area === 'sync' && (changes.license || changes.settings)) load();
});
await load();
renderHint();
