// Firefox has no EyeDropper API (window.EyeDropper). This defines a fallback with the same interface
// (`new EyeDropper().open()` -> Promise<{sRGBHex}>, an AbortError DOMException on Escape) so picker.js and
// popup.js run unmodified: they already handle those exact outcomes for the native API.
//
// The fallback: ask the background to screenshot the visible tab (chrome.tabs.captureVisibleTab), then show a
// full-page magnifier overlay that reads pixels back out of that screenshot on click. It only works for a real
// tab (the same one the pick was started on); the popup's "picker window" (for chrome:// pages etc.) has no
// associated tab to screenshot, so there the background replies with null and open() reports that this mode
// needs Chrome or Edge - the existing catch blocks in popup.js/picker.js already turn that into a message.
if (typeof EyeDropper !== 'function') {
  window.EyeDropper = class EyeDropper {
    async open() {
      const dataUrl = await chrome.runtime.sendMessage({ type: '__aloneaiCapture' }).catch(() => null);
      if (!dataUrl) {
        const e = new Error('This mode needs Chrome or Edge (native EyeDropper). Use the toolbar button or the keyboard shortcut on a regular web page instead.');
        e.name = 'OperationError';
        throw e;
      }
      return magnifierPick(dataUrl);
    }
  };
}

function magnifierPick(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => { const e = new Error('Could not read the page screenshot.'); e.name = 'OperationError'; reject(e); };
    img.onload = () => start(img);
    img.src = dataUrl;

    let host, root, done = false;
    function cleanup() {
      done = true;
      removeEventListener('keydown', onKey, true);
      host?.remove();
      host = root = null;
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation();
      cleanup();
      reject(new DOMException('The user aborted a request.', 'AbortError'));
    }

    function start(img) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      // captureVisibleTab returns the viewport at its real pixel size; map CSS px (clientX/Y) to it.
      const scale = canvas.width / window.innerWidth;

      host = document.createElement('aloneai-eyedropper-fallback');
      host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        .overlay { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; background: transparent; }
        .loupe { position: fixed; width: 120px; height: 120px; border-radius: 50%; border: 2px solid #fff;
          box-shadow: 0 4px 16px rgba(0,0,0,.45); pointer-events: none; overflow: hidden; image-rendering: pixelated; }
        .loupe canvas { position: absolute; }
        .cross { position: absolute; top: 50%; left: 50%; width: 9px; height: 9px; margin: -4px 0 0 -4px;
          border: 1px solid #111827; border-radius: 1px; box-shadow: 0 0 0 1px #fff; }
        .pill { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); pointer-events: none;
          background: #111827; color: #f9fafb; border-radius: 999px; padding: 6px 12px; display: flex; gap: 8px; align-items: center; }
        .sw { width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(255,255,255,.6); }
        kbd { font: 11px ui-monospace, monospace; border: 1px solid #6b7280; border-radius: 4px; padding: 0 4px; }`;
      root.append(style);

      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const loupe = document.createElement('div');
      loupe.className = 'loupe';
      const zoom = document.createElement('canvas');
      const ZOOM = 8, SRC = 15; // 15x15 source px, magnified 8x, shown in a 120px loupe
      zoom.width = zoom.height = SRC * ZOOM;
      const zctx = zoom.getContext('2d');
      zctx.imageSmoothingEnabled = false;
      const cross = document.createElement('div');
      cross.className = 'cross';
      loupe.append(zoom, cross);
      const pill = document.createElement('div');
      pill.className = 'pill';
      const swEl = document.createElement('span'); swEl.className = 'sw';
      const label = document.createElement('b'); label.textContent = '#------';
      pill.append('Click to pick · ', swEl, label, ' · ', (() => { const k = document.createElement('kbd'); k.textContent = 'Esc'; return k; })(), ' cancels');
      root.append(overlay, loupe, pill);
      (document.body || document.documentElement).append(host);

      function hexAt(sx, sy) {
        const x = Math.min(canvas.width - 1, Math.max(0, Math.round(sx)));
        const y = Math.min(canvas.height - 1, Math.max(0, Math.round(sy)));
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
      function move(e) {
        const sx = e.clientX * scale, sy = e.clientY * scale;
        loupe.style.left = e.clientX - 60 + 'px';
        loupe.style.top = e.clientY - 60 + 'px';
        zctx.clearRect(0, 0, zoom.width, zoom.height);
        zctx.drawImage(canvas, sx - SRC / 2, sy - SRC / 2, SRC, SRC, 0, 0, zoom.width, zoom.height);
        const hex = hexAt(sx, sy);
        swEl.style.background = hex;
        label.textContent = hex;
      }
      overlay.addEventListener('mousemove', move);
      overlay.addEventListener('click', (e) => {
        if (done) return;
        const hex = hexAt(e.clientX * scale, e.clientY * scale);
        cleanup();
        resolve({ sRGBHex: hex });
      });
      addEventListener('keydown', onKey, true);
      // Prime the loupe at the current pointer position isn't possible without a first move event; a small
      // hint keeps it out of the way (top-left) until the user moves the mouse.
      loupe.style.left = '16px';
      loupe.style.top = '48px';
    }
  });
}
