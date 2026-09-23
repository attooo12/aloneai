import { isPro } from './license.js';
import { DEFAULTS, MIN_INTERVAL_SEC, ALARM_MIN_SEC } from './config.js';

const $ = (id) => document.getElementById(id);
const els = {
  form: $('form'), site: $('site'), plan: $('plan'), custom: $('custom'), jitter: $('jitter'), mode: $('mode'),
  cond: $('cond'), text: $('text'), regex: $('regex'), selector: $('selector'), notify: $('notify'),
  sound: $('sound'), focus: $('focus'), hint: $('hint'), toggle: $('toggle'), status: $('status'), presets: $('presets')
};

let tab = null;
let origin = '';
let pro = false;
let watch = null;
let watches = {};
let errorMsg = '';

function setInterval_(sec) {
  els.custom.value = sec;
  for (const b of els.presets.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.sec) === Number(sec)));
}

function readForm() {
  return {
    intervalSec: Math.round(Number(els.custom.value)),
    jitterPct: Number(els.jitter.value),
    mode: els.mode.value,
    text: els.text.value.trim(),
    regex: pro && els.regex.checked,
    selector: pro ? els.selector.value.trim() : '',
    notify: els.notify.checked, sound: els.sound.checked, focus: els.focus.checked
  };
}

function fillForm(c) {
  setInterval_(c.intervalSec);
  els.jitter.value = String(c.jitterPct || 0);
  els.mode.value = c.mode;
  els.text.value = c.text || '';
  els.regex.checked = !!c.regex && pro;
  els.selector.value = pro ? c.selector || '' : '';
  els.notify.checked = !!c.notify; els.sound.checked = !!c.sound; els.focus.checked = !!c.focus;
}

function needsHost(c) { return c.mode !== 'none' || c.intervalSec < ALARM_MIN_SEC; }

function fmtAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}
function fmtIn(ts) {
  const s = Math.max(0, Math.ceil((ts - Date.now()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function render() {
  const c = readForm();
  els.cond.querySelectorAll('input').forEach((i) => { if (!['notify', 'sound', 'focus'].includes(i.id)) i.disabled = c.mode === 'none'; });
  els.text.hidden = els.selector.hidden = c.mode === 'none';
  els.regex.closest('.checks').hidden = document.getElementById('alerts').hidden = c.mode === 'none';
  if (!pro) { els.regex.disabled = true; els.selector.disabled = true; }
  els.hint.textContent = needsHost(c)
    ? 'Needs access to this site (asked once) to read the page text or reload faster than 30s. Nothing leaves your device.'
    : 'Reloads every ' + c.intervalSec + 's. No site access needed.';

  const watching = watch?.status === 'watching';
  els.toggle.textContent = watching ? 'Stop' : watch?.status === 'met' ? 'Start again' : 'Start';
  els.toggle.classList.toggle('stop', watching);
  els.form.querySelectorAll('fieldset').forEach((f) => { f.disabled = watching; });
  els.toggle.disabled = !watching && (!tab || !origin);

  let s = '';
  if (errorMsg) s = `<span class="error">${esc(errorMsg)}</span>`;
  else if (watching) {
    s = `Next reload in <b>${watch.nextAt ? fmtIn(watch.nextAt) : '…'}</b> · reloads: ${watch.count || 0}`;
    if (watch.mode !== 'none') s += ` · last checked ${fmtAgo(watch.lastChecked)}`;
  } else if (watch?.status === 'met') {
    const verb = watch.mode === 'appears' ? 'appeared' : 'disappeared';
    s = `<span class="ok">✓ "${esc(watch.text)}" ${verb}</span> at ${new Date(watch.metAt).toLocaleTimeString()} after ${watch.count || 0} reload(s).`;
  } else if (!tab || !origin) s = '<span class="muted">Reload Until works on regular web pages (http/https).</span>';
  els.status.innerHTML = s;
}

function esc(s) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

async function loadWatch() {
  ({ watches = {} } = await chrome.storage.session.get('watches'));
  watch = tab ? watches[tab.id] || null : null;
}

async function onSubmit(e) {
  e.preventDefault();
  errorMsg = '';
  if (watch?.status === 'watching') {
    await chrome.runtime.sendMessage({ type: 'stop', tabId: tab.id });
    await loadWatch(); render();
    return;
  }
  const cfg = readForm();
  if (!Number.isFinite(cfg.intervalSec) || cfg.intervalSec < MIN_INTERVAL_SEC) { errorMsg = `Minimum interval is ${MIN_INTERVAL_SEC} seconds.`; return render(); }
  if (cfg.mode !== 'none' && !cfg.text) { errorMsg = 'Enter the text to watch for.'; els.text.focus(); return render(); }
  if (cfg.regex) { try { new RegExp(cfg.text, 'i'); } catch { errorMsg = 'Invalid regular expression.'; return render(); } }
  if (cfg.selector) { try { document.querySelector(cfg.selector); } catch { errorMsg = 'Invalid CSS selector.'; return render(); } }
  // Check the free limit before asking for site access, not after (the service worker enforces it too).
  if (!pro && Object.values(watches).some((w) => w.status === 'watching' && w.tabId !== tab.id)) {
    errorMsg = 'Free version watches 1 tab at a time. Stop the other tab or get Pro.';
    return render();
  }

  chrome.storage.sync.set({ defaults: cfg });
  if (needsHost(cfg)) {
    // Save first (not awaited: no await may come before the request, or the user gesture is lost) so the
    // service worker can finish the start if the popup closes during the prompt. Replaces any older request.
    chrome.storage.session.set({ pending: { tabId: tab.id, cfg, origin, at: Date.now() } });
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [origin + '/*'] }); } catch (err) { errorMsg = String(err.message || err); }
    if (!granted) {
      chrome.storage.session.remove('pending');
      errorMsg ||= 'Site access was not granted. Choose 30s or more with no text condition to reload without it.';
      return render();
    }
  }
  const res = await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id, cfg, origin });
  if (!res?.ok) errorMsg = res?.error || 'Could not start.';
  await loadWatch(); render();
}

async function init() {
  pro = await isPro();
  els.plan.textContent = pro ? 'Pro' : 'Free';
  els.plan.classList.toggle('pro', pro);
  if (pro) document.querySelectorAll('[data-pro]').forEach((n) => n.remove());

  // ?tab=<id> is used by automated tests; normally the active tab.
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  [tab] = forced ? [await chrome.tabs.get(forced)] : await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const u = new URL(tab?.url || '');
    if (u.protocol === 'http:' || u.protocol === 'https:') origin = u.origin;
    els.site.textContent = origin ? u.host : '';
  } catch {}

  const { defaults } = await chrome.storage.sync.get('defaults');
  await loadWatch();
  fillForm({ ...DEFAULTS, ...(defaults || {}), ...(watch || {}) });

  els.presets.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setInterval_(b.dataset.sec); errorMsg = ''; render(); } });
  els.custom.addEventListener('input', () => setInterval_(els.custom.value));
  els.form.addEventListener('input', () => { errorMsg = ''; render(); });
  els.form.addEventListener('submit', onSubmit);
  chrome.storage.session.onChanged.addListener(async (ch) => { if (ch.watches) { await loadWatch(); render(); } });
  setInterval(render, 1000);
  render();
}
init();
