// Unit tests for the page matcher (page.js, with a tiny fake DOM) and the license check. Run: node test/unit.mjs
import { readFileSync } from 'node:fs';
import { pageRun } from '../page.js';
import { verifyToken, normalizeToken } from '../license.js';
import { MIN_INTERVAL_SEC, MAX_INTERVAL_SEC } from '../config.js';
import { makeToken } from './make-license.mjs';

const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake DOM: an element has innerText (what is rendered) and textContent (everything, hidden included) ----
function el(innerText, textContent = innerText, { id = '', rects = 1, doc } = {}) {
  return { innerText, textContent, id, getClientRects: () => ({ length: rects }), get contentDocument() { if (doc === 'cross') throw new Error('cross-origin'); return doc || null; } };
}
function makeDoc(body, { els = [], frames = [] } = {}) {
  return {
    body,
    documentElement: body,
    querySelectorAll(sel) {
      if (sel === 'iframe, frame') return frames;
      if (sel.startsWith('{')) throw new SyntaxError('bad selector');
      return els.filter((e) => '#' + e.id === sel);
    }
  };
}
const run = (doc, cond, ms = 0) => { globalThis.document = doc; return pageRun('check', cond, ms); };
const appears = (text, extra = {}) => ({ text, regex: false, selector: '', mode: 'appears', ...extra });
const disappears = (text, extra = {}) => ({ ...appears(text, extra), mode: 'disappears' });

// ---- plain text normalisation ----
check('case-insensitive', await run(makeDoc(el('Now IN STOCK')), appears('in stock')));
check('&nbsp; in the page matches a normal space', await run(makeDoc(el('In\u00a0stock')), appears('In stock')));
check('line break / several spaces in the page match one space', await run(makeDoc(el('Ships\n   today')), appears('ships today')));
check('&nbsp; typed in the condition (copied from the page) matches', await run(makeDoc(el('In stock')), appears('in\u00a0stock')));
check('soft hyphen and zero-width space inside a word are ignored', await run(makeDoc(el('Verf\u00fcg\u00adbar\u200b jetzt')), appears('verf\u00fcgbar jetzt')));
check('composed vs decomposed accents (NFC) match', await run(makeDoc(el('Cafe\u0301 ouvert')), appears('Caf\u00e9 ouvert')));
check('emoji text', await run(makeDoc(el('Tickets \u{1F39F}\uFE0F available')), appears('\u{1F39F}\uFE0F AVAILABLE')));
check('absent text is not found', (await run(makeDoc(el('Sold out')), appears('in stock'))) === false);
check('regex mode is tested on the raw text, case-insensitive', await run(makeDoc(el('Price: 12 EUR')), appears('price:\\s+\\d+', { regex: true })));
check('invalid selector throws (reported as "could not check")', await run(makeDoc(el('x')), appears('x', { selector: '{' })).then(() => false, () => true));

// ---- hidden text does not count ----
check('hidden text (innerText empty, textContent has it) is not found', (await run(makeDoc(el('', 'In stock')), appears('in stock'))) === false);
const scoped = makeDoc(el('Sold out'), { els: [el('', 'In stock', { id: 'b' })] });
check('selector scope: hidden child text is not found', (await run(scoped, appears('in stock', { selector: '#b' }))) === false);
check('selector scope: only the matching element is searched', (await run(makeDoc(el('In stock'), { els: [el('Sold out', 'Sold out', { id: 'b' })] }), appears('in stock', { selector: '#b' }))) === false);

// ---- frames ----
const inner = makeDoc(el('IN STOCK'));
check('text in a same-origin iframe is found', await run(makeDoc(el('Booking'), { frames: [el('', '', { doc: inner })] }), appears('in stock')));
check('hidden iframe is ignored', (await run(makeDoc(el('Booking'), { frames: [el('', '', { doc: inner, rects: 0 })] }), appears('in stock'))) === false);
check('cross-origin iframe is skipped without error', (await run(makeDoc(el('Booking'), { frames: [el('', '', { doc: 'cross' })] }), appears('in stock'))) === false);

// ---- "disappears" waits for late-rendered content ----
const late = el('Loading');
setTimeout(() => { late.innerText = 'SOLD OUT'; }, 400);
check('disappears: text rendered shortly after load is not reported as gone', (await run(makeDoc(late), disappears('sold out'), 1500)) === false);
const t0 = Date.now();
check('disappears: really gone is reported after the settle time', (await run(makeDoc(el('IN STOCK')), disappears('sold out'), 600)) === true && Date.now() - t0 >= 500);
const t1 = Date.now();
check('disappears: present text answers at once', (await run(makeDoc(el('SOLD OUT')), disappears('sold out'), 3000)) === false && Date.now() - t1 < 200);

// ---- schedule / cancel ----
let reloads = 0, sent = [];
globalThis.window = globalThis;
globalThis.location = { reload: () => { reloads++; } };
globalThis.chrome = { runtime: { id: 'test', sendMessage: (m) => { sent.push(m); } } };
globalThis.document = makeDoc(el('Sold out'));
await pageRun('schedule', appears('in stock'), 50);
await sleep(120);
check('schedule: reloads when the condition is still not met', reloads === 1 && sent.length === 0);
globalThis.document = makeDoc(el('In stock'));
await pageRun('schedule', appears('in stock'), 50);
await sleep(120);
check('schedule: condition met meanwhile -> message instead of reload', reloads === 1 && sent[0]?.type === 'conditionMet');
await pageRun('schedule', null, 50);
await pageRun('cancel', null, 0);
await sleep(120);
check('cancel drops the pending reload', reloads === 1);

// ---- interval limits ----
check('longest interval (+50% jitter) fits a setTimeout (2^31-1 ms)', MAX_INTERVAL_SEC * 1000 * 1.5 < 2 ** 31 - 1 && MIN_INTERVAL_SEC >= 1);

// ---- license ----
const HERE = new URL('.', import.meta.url).pathname;
const pem = readFileSync(HERE + 'TEST_ONLY_private_key.pem', 'utf8');
const pub = readFileSync(HERE + 'TEST_ONLY_public_key.txt', 'utf8').trim();
const good = makeToken(pem);
const [body, sig] = good.split('.');
check('license: valid token', await verifyToken(good, pub));
check('license: surrounding whitespace', await verifyToken(`  ${good}\n`, pub));
check('license: line breaks / spaces inside (wrapped in an email)', await verifyToken(good.slice(0, 30) + '\r\n' + good.slice(30, 77) + ' \n\t' + good.slice(77), pub));
check('normalizeToken strips all whitespace', normalizeToken(' a.\nb \r\n') === 'a.b');
check('license: wrong product slug rejected', (await verifyToken(makeToken(pem, 'a@b.c', 'color-picker'), pub)) === false);
const flipped = body + '.' + sig.slice(0, 10) + (sig[10] === 'A' ? 'B' : 'A') + sig.slice(11);
check('license: flipped signature character rejected', (await verifyToken(flipped, pub)) === false);
check('license: body from another token rejected', (await verifyToken(makeToken(pem, 'other@x.y').split('.')[0] + '.' + sig, pub)) === false);
check('license: extra dot / empty parts rejected', (await verifyToken(good + '.x', pub)) === false && (await verifyToken('.' + sig, pub)) === false && (await verifyToken(body + '.', pub)) === false);
check('license: non-string rejected', (await verifyToken(null, pub)) === false && (await verifyToken(42, pub)) === false);
check('license: production key rejects the test token', (await verifyToken(good)) === false);

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
