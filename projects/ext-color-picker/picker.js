// Injected into the active tab (activeTab + scripting) only when you start a pick. Classic script, no imports.
// Opens the native EyeDropper. Chrome requires (1) a user activation, which it passes along from the popup click
// or the shortcut, and (2) a focused page: when started from the popup it waits for the popup to close first.
// If either is missing, it shows a transparent overlay and opens the EyeDropper on your next click or Enter.
// UI lives in a shadow root (styles isolated from the page); nothing is sent anywhere except to this extension's own service worker.
(() => {
  const KEY = '__aloneaiColorPicker';
  const fromPopup = !!window.__aloneaiColorPickerFromPopup;
  window.__aloneaiColorPickerFromPopup = false;
  if (window[KEY]?.busy) return 'busy';
  const SETTLE_MS = 300;
  const state = (window[KEY] = { busy: true });
  let host = null, root = null, toastTimer = 0, attempts = 0;

  function ensureRoot() {
    if (host?.isConnected) return root;
    host = document.createElement('aloneai-color-picker');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .overlay { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; background: transparent; }
      .pill, .toast { position: fixed; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center;
        background: #111827; color: #f9fafb; border-radius: 999px; padding: 8px 14px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
      .pill { top: 16px; pointer-events: none; }
      .toast { bottom: 20px; pointer-events: none; }
      .toast.err { background: #7f1d1d; }
      .sw { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,.6); }
      kbd { font: 11px ui-monospace, monospace; border: 1px solid #6b7280; border-radius: 4px; padding: 0 4px; }
      b { font-family: ui-monospace, monospace; }`;
    root.append(style);
    (document.body || document.documentElement).append(host);
    return root;
  }
  function cleanup() {
    host?.remove();
    host = root = null;
  }
  function finish() {
    state.busy = false;
    removeEventListener('keydown', onKey, true);
  }
  function toast(parts, isError = false, ms = 3500) {
    const r = ensureRoot();
    r.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' err' : '');
    el.setAttribute('role', 'status');
    el.dataset.testid = 'toast';
    for (const p of [].concat(parts)) el.append(p);
    r.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(cleanup, ms);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  async function open() {
    let hex;
    attempts++;
    const t0 = Date.now();
    try {
      hex = (await new EyeDropper().open()).sRGBHex;
    } catch (e) {
      // NotAllowedError = no user activation; OperationError ("not available") or an instant AbortError = the page
      // didn't have focus (e.g. the address bar did). A click on the page fixes both.
      const instantAbort = e?.name === 'AbortError' && Date.now() - t0 < 400;
      if (e?.name === 'NotAllowedError' || (attempts === 1 && (e?.name === 'OperationError' || instantAbort))) return prompt();
      finish();
      if (e?.name === 'AbortError') toast('Color picking canceled.', false, 1800);
      else toast('Could not open the eyedropper: ' + (e?.message || e), true);
      return;
    }
    finish();
    let res = null;
    try { res = await chrome.runtime.sendMessage({ type: 'picked', hex }); } catch { /* extension reloaded */ }
    if (!res?.ok) return toast('Picked ' + hex + ', but it could not be saved. Reload the page and try again.', true);
    const { settings } = await chrome.storage.sync.get('settings').catch(() => ({}));
    const upper = settings?.upper !== false;
    const shown = upper ? res.hex : res.hex.toLowerCase();
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = res.hex;
    const b = document.createElement('b');
    b.textContent = shown;
    const copied = settings?.autoCopy !== false && (await copy(shown));
    toast([sw, b, copied ? ' copied to clipboard' : ' saved. Open the extension to copy it.']);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      cleanup(); finish();
    } else if (e.key === 'Enter' && root?.querySelector('.overlay')) {
      e.preventDefault(); e.stopImmediatePropagation();
      start();
    }
  }
  function start() {
    // Remove the overlay first so it can never tint the sampled pixel.
    cleanup();
    open();
  }
  function prompt() {
    const r = ensureRoot();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.dataset.testid = 'overlay';
    // Swallow the press so the page underneath never receives it; open on the click (it carries user activation).
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) overlay.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); });
    overlay.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); start(); });
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.append('Click anywhere (or press ');
    const k1 = document.createElement('kbd'); k1.textContent = 'Enter';
    const k2 = document.createElement('kbd'); k2.textContent = 'Esc';
    pill.append(k1, ') to start the eyedropper. ', k2, ' cancels.');
    r.append(overlay, pill);
    addEventListener('keydown', onKey, true);
    return 'prompt';
  }

  if (typeof EyeDropper !== 'function') {
    finish();
    toast('This browser does not support the EyeDropper API.', true);
    return 'unsupported';
  }
  addEventListener('keydown', onKey, true);
  if (navigator.userActivation && !navigator.userActivation.isActive) return prompt();
  if (!fromPopup) {
    if (!document.hasFocus()) return prompt(); // e.g. the address bar has focus: the EyeDropper would close at once
    open();
    return 'opened';
  }
  // Started from the popup: Chrome refuses to open the EyeDropper while the popup is open, and the EyeDropper
  // samples a snapshot of the screen taken when it opens. So wait until the popup has closed (its port
  // disconnects), give its fade-out a moment, then open while the click's activation is still valid.
  const fallback = setTimeout(() => { chrome.runtime.onConnect.removeListener(onConnect); prompt(); }, 3000);
  function onConnect(port) {
    if (port.name !== 'color-picker-popup') return;
    chrome.runtime.onConnect.removeListener(onConnect);
    clearTimeout(fallback);
    port.onDisconnect.addListener(() => setTimeout(() => (navigator.userActivation?.isActive === false ? prompt() : open()), SETTLE_MS));
  }
  chrome.runtime.onConnect.addListener(onConnect);
  return 'waiting-for-popup';
})();
