// Injected into the watched page (isolated world) by sw.js with chrome.scripting.executeScript.
// executeScript serializes one function at a time, so everything it needs lives inside it.
//   op 'check':    resolves to true if the condition is met, false if not (throws on an invalid selector).
//                  In "disappears" mode an absent text is re-checked for up to `ms` before it counts, so a
//                  page that renders its content after the load event is not reported as "gone".
//   op 'schedule': reload the page after `ms`, unless the condition became true meanwhile (dynamic pages).
//   op 'cancel':   drop the pending reload.
// cond: null or {text, regex, selector, mode}
export async function pageRun(op, cond, ms) {
  // Visible text of the page (or of the elements matching the selector), including same-origin frames.
  // innerText only: textContent would also count hidden elements and <script> contents.
  const textOf = (doc) => {
    const els = cond.selector ? Array.from(doc.querySelectorAll(cond.selector)) : [doc.body || doc.documentElement].filter(Boolean);
    let t = els.map((el) => (typeof el.innerText === 'string' ? el.innerText : el.textContent || '')).join('\n');
    for (const f of doc.querySelectorAll('iframe, frame')) {
      let d = null;
      try { if (f.getClientRects().length) d = f.contentDocument; } catch { /* cross-origin */ }
      if (d) t += '\n' + textOf(d);
    }
    return t;
  };
  // Plain text: case-insensitive, and any run of whitespace (line breaks, &nbsp;) equals one space.
  const norm = (s) => String(s).normalize('NFC').replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').toLowerCase();
  const met = () => {
    const content = textOf(document);
    const found = cond.regex ? new RegExp(cond.text, 'i').test(content) : norm(content).includes(norm(cond.text));
    return cond.mode === 'appears' ? found : !found;
  };

  if (op === 'check') {
    let m = met();
    for (let waited = 0; m && cond.mode === 'disappears' && waited < ms; waited += 250) {
      await new Promise((r) => setTimeout(r, 250));
      m = met();
    }
    return m;
  }
  if (window.__reloadUntilTimer) clearTimeout(window.__reloadUntilTimer);
  window.__reloadUntilTimer = null;
  if (op !== 'schedule') return;
  window.__reloadUntilTimer = setTimeout(() => {
    if (!chrome.runtime?.id) return; // extension was updated/reloaded: this watch no longer exists
    if (cond) {
      try {
        if (met()) {
          // Content changed without a reload (dynamic page): tell the service worker instead of reloading.
          chrome.runtime.sendMessage({ type: 'conditionMet' });
          return;
        }
      } catch (e) { /* fall through to reload */ }
    }
    location.reload();
  }, ms);
}
