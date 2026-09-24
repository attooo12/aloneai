// Local storage for history, palettes and settings. Everything stays in chrome.storage; nothing leaves the device.
// Palette writes are Pro-only and re-check the license here, not just in the UI.
import { isPro } from './license.js';
import { normalizeHex } from './color.js';
import { HISTORY_MAX, PALETTE_NAME_MAX, PALETTE_COLORS_MAX, DEFAULT_SETTINGS } from './config.js';

export class ProRequiredError extends Error {
  constructor(what = 'Palettes') { super(`${what} are part of Pro.`); this.name = 'ProRequiredError'; this.code = 'pro_required'; }
}

// ---------- settings (sync) ----------
export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

// ---------- history (local, last HISTORY_MAX picks, newest first, no duplicates) ----------
export async function getHistory() {
  const { history } = await chrome.storage.local.get('history');
  return Array.isArray(history) ? history : [];
}
export async function addToHistory(input) {
  const hex = normalizeHex(input);
  if (!hex) throw new Error('Not a valid color: ' + String(input).slice(0, 40));
  const list = (await getHistory()).filter((x) => x.hex !== hex);
  list.unshift({ hex, t: Date.now() });
  const history = list.slice(0, HISTORY_MAX);
  await chrome.storage.local.set({ history });
  return history;
}
export async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
}

// ---------- palettes (local, Pro) ----------
export async function getPalettes() {
  const { palettes } = await chrome.storage.local.get('palettes');
  return Array.isArray(palettes) ? palettes : [];
}
async function savePalettes(palettes) {
  await chrome.storage.local.set({ palettes });
  return palettes;
}
async function requirePro() {
  if (!(await isPro())) throw new ProRequiredError();
}
const cleanName = (name, fallback) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, PALETTE_NAME_MAX) || fallback;
const find = (palettes, id) => {
  const p = palettes.find((x) => x.id === id);
  if (!p) throw new Error('Palette not found.');
  return p;
};

// "Palette N" with the first N not already taken (deleting "Palette 1" must not lead to two "Palette 2").
function defaultName(palettes) {
  const taken = new Set(palettes.map((p) => p.name));
  let n = palettes.length + 1;
  while (taken.has(`Palette ${n}`)) n++;
  return `Palette ${n}`;
}
export async function createPalette(name, colors = []) {
  await requirePro();
  const palettes = await getPalettes();
  const p = {
    id: crypto.randomUUID(),
    name: cleanName(name, defaultName(palettes)),
    colors: [...new Set(colors.map(normalizeHex).filter(Boolean))].slice(0, PALETTE_COLORS_MAX),
    created: Date.now(),
    updated: Date.now()
  };
  palettes.push(p);
  await savePalettes(palettes);
  return p;
}
export async function renamePalette(id, name) {
  await requirePro();
  const palettes = await getPalettes();
  const p = find(palettes, id);
  p.name = cleanName(name, p.name);
  p.updated = Date.now();
  await savePalettes(palettes);
  return p;
}
export async function deletePalette(id) {
  await requirePro();
  const palettes = await getPalettes();
  find(palettes, id);
  return savePalettes(palettes.filter((x) => x.id !== id));
}
export async function addColorToPalette(id, input) {
  await requirePro();
  const hex = normalizeHex(input);
  if (!hex) throw new Error('Not a valid color.');
  const palettes = await getPalettes();
  const p = find(palettes, id);
  if (!p.colors.includes(hex)) {
    if (p.colors.length >= PALETTE_COLORS_MAX) throw new Error(`A palette holds up to ${PALETTE_COLORS_MAX} colors.`);
    p.colors.push(hex);
    p.updated = Date.now();
    await savePalettes(palettes);
  }
  return p;
}
export async function removeColorFromPalette(id, hex) {
  await requirePro();
  const palettes = await getPalettes();
  const p = find(palettes, id);
  p.colors = p.colors.filter((c) => c !== normalizeHex(hex));
  p.updated = Date.now();
  await savePalettes(palettes);
  return p;
}
