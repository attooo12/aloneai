// Unit tests for schema.js (pure) and store.js (against an in-memory fake chrome.storage). Run: node test/unit.mjs
// store.js is imported from a temporary copy whose license.js uses the TEST ONLY public key, so Pro can be
// switched on with a locally signed token. The shipped files are not modified.
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeToken } from './make-license.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const EXT = join(HERE, '..');
if (!existsSync(join(HERE, 'TEST_ONLY_private_key.pem'))) execFileSync('node', [join(HERE, 'keygen.mjs')]);
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- fake chrome ----------
function area() {
  const data = new Map();
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    data,
    async get(keys) {
      const out = {};
      if (keys === null || keys === undefined) { for (const [k, v] of data) out[k] = clone(v); return out; }
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      for (const k of list) if (data.has(k)) out[k] = clone(data.get(k)); else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[k] = keys[k];
      return out;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, clone(v)); },
    async remove(keys) { for (const k of [].concat(keys)) data.delete(k); },
    async clear() { data.clear(); }
  };
}
globalThis.chrome = { storage: { local: area(), sync: area(), session: area() }, runtime: { getURL: (p) => 'chrome-extension://test/' + p } };
const L = chrome.storage.local;

const tmp = mkdtempSync(join(tmpdir(), 'tv-unit-'));
cpSync(EXT, join(tmp, 'ext'), { recursive: true, filter: (p) => !p.includes('/test') && !p.includes('/icons') });
const testPub = readFileSync(join(HERE, 'TEST_ONLY_public_key.txt'), 'utf8').trim();
const licPath = join(tmp, 'ext/license.js');
writeFileSync(licPath, readFileSync(licPath, 'utf8').replace(/export const PUBLIC_KEY = '[^']*'/, `export const PUBLIC_KEY = '${testPub}'`));
const pem = readFileSync(join(HERE, 'TEST_ONLY_private_key.pem'), 'utf8');
const S = await import(join(tmp, 'ext/schema.js'));
const St = await import(join(tmp, 'ext/store.js'));
const Lic = await import(join(tmp, 'ext/license.js'));
const Cfg = await import(join(tmp, 'ext/config.js'));

const tab = (u, extra = {}) => ({ url: 'https://example.com/' + u, title: 'Page ' + u, ...extra });
const win = (n, prefix = 'p') => ({ tabs: Array.from({ length: n }, (_, i) => tab(prefix + i)), groups: [] });

try {
  // ================= schema: cleanSession =================
  {
    const r = S.cleanSession({
      id: 'abc', name: '  My   session\n', created: 1700000000000,
      windows: [{
        groups: [{ title: 'Work', color: 'blue', collapsed: true }, { title: 'Unused', color: 'red' }, { title: 'Bad colour', color: 'rainbow' }],
        tabs: [
          { url: 'https://a.example/', title: 'A', pinned: true, group: 0 },
          { url: 'https://b.example/', title: 'B', group: 0 },
          { url: 'javascript:alert(1)', title: 'evil' },
          { url: 'data:text/html,hi', title: 'data' },
          { url: 'https://c.example/', title: 'C', group: 2 },
          { url: 'https://d.example/', title: 'D', group: 7 },
          { url: 'chrome://settings/', title: 'Settings' },
          'not a tab'
        ]
      }]
    });
    const s = r.session;
    check('clean: keeps id, trims name', s.id === 'abc' && s.name === 'My session');
    check('clean: drops javascript:/data:/non-object tabs', r.dropped === 3 && s.windows[0].tabs.length === 5);
    check('clean: pinned tab loses its group', s.windows[0].tabs[0].pinned === true && s.windows[0].tabs[0].group === undefined);
    check('clean: unused groups pruned and renumbered', eq(s.windows[0].groups, [{ title: 'Work', color: 'blue', collapsed: true }, { title: 'Bad colour', color: 'grey', collapsed: false }]) && s.windows[0].tabs[1].group === 0 && s.windows[0].tabs[2].group === 1, JSON.stringify(s.windows[0]));
    check('clean: out-of-range group index removed', s.windows[0].tabs[3].group === undefined);
    check('clean: schema version stamped', s.v === S.SCHEMA_VERSION && s.kind === 'named');
  }
  check('clean: rejects non-objects and empty sessions', [null, 5, 'x', [], {}, { windows: [] }, { windows: [{ tabs: [] }] }, { tabs: [{ url: 'javascript:1' }] }].every((x) => S.cleanSession(x).error));
  check('clean: rejects a newer schema', /newer/.test(S.cleanSession({ v: 99, tabs: [tab(1)] }).error));
  check('clean: bad id replaced, bad dates fixed', (() => {
    const s = S.cleanSession({ id: '../../etc', created: 'yesterday', updated: -5, tabs: [tab(1)] }).session;
    return /^[A-Za-z0-9_-]+$/.test(s.id) && s.id !== '../../etc' && Number.isFinite(s.created) && s.updated >= s.created;
  })());
  check('clean: control characters and huge titles are tamed', (() => {
    const s = S.cleanSession({ tabs: [{ url: 'https://x.example/', title: 'a\u0000b' + 'x'.repeat(5000) }] }).session;
    return s.windows[0].tabs[0].title.startsWith('a b') && s.windows[0].tabs[0].title.length === S.LIMITS.title;
  })());
  check('clean: URL with whitespace rejected', S.cleanSession({ tabs: [{ url: 'https://x.example/a b' }] }).error);
  check('clean: never throws on hostile input', (() => {
    const evil = { get windows() { throw new Error('boom'); } };
    return typeof S.cleanSession(evil).error === 'string';
  })());
  check('clean: auto kind gets reason/scope', (() => {
    const s = S.cleanSession({ kind: 'auto', reason: 'window-closed', scope: 'window', tabs: [tab(1)] }).session;
    const s2 = S.cleanSession({ kind: 'auto', reason: 'nope', tabs: [tab(1)] }).session;
    return s.reason === 'window-closed' && s.scope === 'window' && s2.reason === 'manual' && s2.scope === 'all';
  })());

  // ================= schema: counts, fingerprint =================
  {
    const s = S.cleanSession({ windows: [{ tabs: [tab(1), { url: 'chrome://newtab/', title: 'New Tab' }, { url: 'about:blank' }] }, win(2)] }).session;
    const c = S.countTabs(s);
    check('countTabs: new-tab and blank pages are not "real"', c.tabs === 5 && c.real === 3 && c.windows === 2);
    const s2 = structuredClone(s);
    check('fingerprint: stable for equal content, ignores names', S.fingerprint(s) === S.fingerprint({ ...s2, name: 'other' }));
    s2.windows[0].tabs[0].pinned = true;
    check('fingerprint: changes with pin state', S.fingerprint(s) !== S.fingerprint(s2));
  }

  // ================= schema: import parsing =================
  {
    const good = S.buildExport([S.cleanSession({ id: 'one', name: 'One', tabs: [tab(1)] }).session, S.cleanSession({ id: 'two', name: 'Two', tabs: [tab(2)] }).session]);
    const r = S.parseImport(JSON.stringify(good));
    check('import: own export round-trips', r.sessions?.length === 2 && r.sessions[0].id === 'one' && r.problems.length === 0);
    const mixed = { ...good, sessions: [...good.sessions, { name: 'Broken', tabs: 'nope' }, 42, { name: 'OnlyBad', tabs: [{ url: 'javascript:x' }] }] };
    const r2 = S.parseImport(JSON.stringify(mixed));
    check('import: bad sessions reported, good ones kept', r2.sessions.length === 2 && r2.problems.length === 3 && /Broken/.test(r2.problems[0]), JSON.stringify(r2.problems));
    check('import: invalid JSON gives a clear error', /not valid JSON/.test(S.parseImport('{"format": "tab-lifeboat-export", "sessions": [').error));
    check('import: empty file', /empty/.test(S.parseImport('   \n').error));
    check('import: unrelated JSON rejected', /not a Tab Lifeboat backup/.test(S.parseImport('{"hello": "world"}').error));
    check('import: JSON with zero valid sessions rejected', /No valid sessions/.test(S.parseImport(JSON.stringify({ format: 'tab-lifeboat-export', schema: 1, sessions: [{}, null] })).error));
    check('import: newer schema refused', /newer version/.test(S.parseImport(JSON.stringify({ format: 'tab-lifeboat-export', schema: 2, sessions: [] })).error));
    check('import: export without sessions array', /no sessions list/.test(S.parseImport(JSON.stringify({ format: 'tab-lifeboat-export', schema: 1 })).error));
    check('import: bare array and single session accepted', S.parseImport(JSON.stringify([{ tabs: [tab(1)] }])).sessions.length === 1 && S.parseImport(JSON.stringify({ tabs: [tab(1)] })).sessions.length === 1);
    const txt = 'https://a.example/ | Alpha\nhttps://b.example/\nnot a url\n\nhttps://c.example/ | Gamma | with pipe\n';
    const r3 = S.parseImport(txt);
    check('import: plain-text URL list (blank line = new session, "url | title")', r3.sessions.length === 2 && r3.sessions[0].windows[0].tabs.length === 2 && r3.sessions[0].windows[0].tabs[0].title === 'Alpha' && r3.sessions[1].windows[0].tabs[0].title === 'Gamma | with pipe' && r3.problems.length === 1, JSON.stringify(r3));
    check('import: text without URLs rejected', /No JSON backup/.test(S.parseImport('hello\nworld').error));
    check('import: binary garbage rejected', !!S.parseImport('\u0000\u0001PK\u0003\u0004garbage').error);
    check('import: non-string input', !!S.parseImport(null).error);
  }

  // ================= schema: exports & merge =================
  {
    const s = S.cleanSession({ name: 'Links [x]', windows: [{ groups: [{ title: 'Work', color: 'blue' }], tabs: [{ url: 'https://a.example/(x)', title: 'A *bold*', pinned: true }, { url: 'https://b.example/', title: 'B', group: 0 }, { url: 'https://c.example/', title: '<script>' }] }] }).session;
    const md = S.toMarkdown([s]);
    check('markdown: escaped title/url, group heading', md.includes('# Links \\[x\\]') && md.includes('[A \\*bold\\*](https://a.example/%28x%29)') && md.includes('**Work** (blue)') && md.includes('- [B](https://b.example/)'), md);
    const html = S.toHtml([s]);
    check('html: escaped, links present, lists balanced', html.includes('&#60;script&#62;') && !html.includes('<script>') && html.includes('href="https://b.example/"') && (html.match(/<ul>/g) || []).length === (html.match(/<\/ul>/g) || []).length);
    const a = S.cleanSession({ windows: [{ groups: [{ title: 'G1', color: 'red' }], tabs: [tab(1, { group: 0 }), tab(2)] }] }).session;
    const b = S.cleanSession({ windows: [{ groups: [{ title: 'G2', color: 'green' }], tabs: [tab(2), tab(3, { group: 0 }), tab(4, { pinned: true })] }] }).session;
    const m = S.mergeSessions([a, b], 'Merged').session;
    const t = m.windows[0].tabs;
    check('merge: one window, dupes dropped, groups kept, pinned first', t.length === 4 && t[0].pinned && m.windows[0].groups.length === 2 && m.windows[0].groups[t.find((x) => x.url.endsWith('p3') || x.url.endsWith('/3')).group].title === 'G2', JSON.stringify(m.windows[0]));
    check('search: all words must match', S.matches('Hello World\nhttps://x', 'world hello') && !S.matches('Hello', 'hello there'));
  }

  // ================= store =================
  const cap = (n, prefix) => ({ windows: [win(n, prefix)] });
  // Free cap
  for (let i = 0; i < Cfg.FREE_SESSION_LIMIT; i++) await St.saveNamed(cap(2, 's' + i), 'S' + i);
  let capErr = null;
  try { await St.saveNamed(cap(1, 'x'), 'eleven'); } catch (e) { capErr = e.code; }
  check(`store: Free plan limited to ${Cfg.FREE_SESSION_LIMIT} named sessions`, capErr === 'limit' && (await St.getIndex('named')).length === Cfg.FREE_SESSION_LIMIT, capErr);
  let emptyErr = null;
  try { await St.saveNamed({ windows: [{ tabs: [] }] }, 'none'); } catch (e) { emptyErr = e.code; }
  check('store: empty save refused', emptyErr === 'empty');
  const tampered = (() => { const [b, s] = makeToken(pem).split('.'); return Buffer.from(JSON.stringify({ product: 'tab-lifeboat', email_hash: 'x', sid: 'y', iat: 1 })).toString('base64url') + '.' + s; })();
  await chrome.storage.sync.set({ license: tampered });
  check('store: tampered token does not lift the cap', await St.namedLimitReached());
  await chrome.storage.sync.set({ license: makeToken(pem, 'a@b.c', 'reload-until') });
  check('store: Reload Until token does not lift the cap', await St.namedLimitReached());
  await chrome.storage.sync.set({ license: makeToken(pem, 'a@b.c', 'color-picker') });
  check('store: Color Picker token does not lift the cap', await St.namedLimitReached());
  await chrome.storage.sync.set({ license: makeToken(pem) });
  check('license: valid tab-lifeboat token verifies (unit)', await Lic.isPro() && Lic.PRODUCT === 'tab-lifeboat');
  const e11 = await St.saveNamed(cap(1, 'x'), 'eleven');
  check('store: Pro lifts the cap', (await St.getIndex('named')).length === 11 && e11.name === 'eleven');
  await chrome.storage.sync.remove('license');

  // rename / delete / undo
  const idx0 = await St.getIndex('named');
  await St.renameSession('named', idx0[0].id, '  Renamed   one ');
  check('store: rename updates index and session', (await St.getIndex('named'))[0].name === 'Renamed one' && (await St.getSession(idx0[0].id)).name === 'Renamed one');
  const del = await St.deleteSession('named', idx0[1].id);
  check('store: delete removes index entry and key', !(await St.getIndex('named')).some((e) => e.id === idx0[1].id) && !L.data.has('s:' + idx0[1].id));
  await St.undoDelete(del);
  check('store: undo restores it (even over the Free cap)', (await St.getIndex('named')).some((e) => e.id === idx0[1].id) && (await St.getSession(idx0[1].id)).windows[0].tabs.length === 2);
  let renameErr = '';
  try { await St.renameSession('named', idx0[0].id, '   '); } catch (e) { renameErr = e.message; }
  check('store: empty rename refused', /empty/.test(renameErr));

  // concurrency: parallel saves never lose an index entry
  await chrome.storage.sync.set({ license: makeToken(pem) });
  const before = (await St.getIndex('named')).length;
  await Promise.all(Array.from({ length: 25 }, (_, i) => St.saveNamed(cap(1, 'par' + i), 'Parallel ' + i)));
  check('store: 25 parallel saves all indexed', (await St.getIndex('named')).length === before + 25);
  await chrome.storage.sync.remove('license');

  // validation on read + index repair
  const victim = (await St.getIndex('named'))[2];
  await L.set({ ['s:' + victim.id]: { garbage: true } });
  check('store: unreadable session returns null (raw left in place)', (await St.getSession(victim.id)) === null && L.data.get('s:' + victim.id).garbage === true);
  const exp = await St.exportAllData();
  check('store: export includes unreadable raw data', exp.unreadable.length === 1 && exp.unreadable[0].key === 's:' + victim.id && exp.sessions.length === (await St.getIndex('named')).length - 1);
  L.data.delete('s:' + victim.id);
  const namedCount = (await St.getIndex('named')).length;
  await L.set({ 'idx:named': 'corrupted!' });
  const rebuilt = await St.getIndex('named');
  check('store: corrupted index rebuilt from the session keys', rebuilt.length === namedCount - 1 && rebuilt.every((e, i, a) => i === 0 || a[i - 1].created <= e.created));
  L.data.set('idx:named', rebuilt.slice(1)); // lose an entry
  const ic = await St.checkIntegrity();
  check('store: integrity check re-indexes orphaned sessions', ic.repaired && (await St.getIndex('named')).length === namedCount - 1);
  check('store: integrity check is a no-op when consistent', (await St.checkIntegrity()).repaired === false);

  // import into store
  const allNow = await St.exportAllData();
  const beforeImport = (await St.getIndex('named')).length;
  const r1 = await St.importSessions(allNow.sessions);
  check('store: re-importing own export adds nothing (duplicates skipped)', r1.added === 0 && r1.duplicates === allNow.sessions.length, JSON.stringify(r1));
  const clash = { ...allNow.sessions[0], windows: [win(3, 'clash')] };
  const autoImp = S.cleanSession({ kind: 'auto', reason: 'periodic', name: 'Auto snapshot', tabs: [tab('auto-imported')] }).session;
  const r2 = await St.importSessions([clash, autoImp]);
  const idxAfter = await St.getIndex('named');
  check('store: id clash with other content gets a new id; imported auto becomes named', r2.added === 2 && idxAfter.length === beforeImport + 2 && idxAfter.filter((e) => e.id === clash.id).length === 1 && idxAfter.some((e) => /Auto snapshot/.test(e.name) && e.kind === 'named'));
  const bigImport = Array.from({ length: 30 }, (_, i) => S.cleanSession({ name: 'Imp ' + i, tabs: [tab('imp' + i)] }).session);
  const r3 = await St.importSessions(bigImport);
  check('store: import is never blocked by the Free cap', r3.added === 30 && !(await Lic.isPro()));

  // ================= snapshots + guard =================
  await St.setSettings({ autoKeep: 5 });
  const snap = (n, prefix, reason = 'periodic', scope = 'all') => St.addAutoSnapshot({ windows: [win(n, prefix)] }, reason, scope);
  check('snapshot: empty capture never stored', (await St.addAutoSnapshot({ windows: [] })).skipped === 'empty' && (await St.addAutoSnapshot({ windows: [{ tabs: [{ url: 'chrome://newtab/' }] }] })).skipped === 'empty' && (await St.getIndex('auto')).length === 0);
  const big = await snap(40, 'big');
  check('snapshot: first snapshot stored', big.added?.tabs === 40);
  check('snapshot: unchanged content skipped', (await snap(40, 'big')).skipped === 'unchanged' && (await St.getIndex('auto')).length === 1);
  const drop = await snap(1, 'after-crash');
  check('snapshot: big drop protects the last good snapshot', drop.protectedId === big.added.id && (await St.getIndex('auto')).find((e) => e.id === big.added.id).keep === true);
  for (let i = 0; i < 12; i++) await snap(1 + (i % 2), 'churn' + i);
  const autoIdx = await St.getIndex('auto');
  check('snapshot: rotation keeps autoKeep unprotected + the protected one', autoIdx.filter((e) => !e.keep).length === 5 && autoIdx.some((e) => e.id === big.added.id), JSON.stringify(autoIdx.map((e) => [e.tabs, !!e.keep])));
  check('snapshot: protected 40-tab snapshot still readable after rotation', (await St.getSession(big.added.id)).windows[0].tabs.length === 40);
  check('snapshot: evicted snapshots are deleted from storage', [...L.data.keys()].filter((k) => k.startsWith('s:')).length === (await St.getIndex('named')).length + autoIdx.length);
  check('snapshot: small changes do not trigger protection', (await snap(10, 'ten')).protectedId === null && (await snap(9, 'nine')).protectedId === null);
  const w1 = await snap(3, 'closedwin', 'window-closed', 'window');
  check('snapshot: closed-window snapshots dedupe within their scope', !!w1.added && (await snap(3, 'closedwin', 'window-closed', 'window')).skipped === 'unchanged');
  check('snapshot: window snapshot is not used as drop baseline', (await snap(9, 'nine2')).protectedId === null);
  // protected cap
  for (let i = 0; i < Cfg.PROTECTED_MAX + 3; i++) { await snap(20, 'p' + i); await snap(1, 'd' + i); }
  const kept = (await St.getIndex('auto')).filter((e) => e.keep);
  check(`snapshot: at most ${Cfg.PROTECTED_MAX} protected snapshots, oldest go first`, kept.length === Cfg.PROTECTED_MAX && !kept.some((e) => e.id === big.added.id));
  await St.setProtected(kept[0].id, false);
  check('snapshot: unprotect works', (await St.getIndex('auto')).filter((e) => e.keep).length === Cfg.PROTECTED_MAX - 1);

  // ================= live state + previous session =================
  await chrome.storage.session.clear();
  await L.remove('live');
  const autosBefore = (await St.getIndex('auto')).length;
  await St.updateLive({ windows: [win(12, 'live')] }, [101]);
  check('live: first write with no previous state archives nothing', (await St.getIndex('auto')).length === autosBefore && (await St.getLive()).session.windows[0].tabs.length === 12);
  check('live: empty capture never replaces a non-empty state', (await St.updateLive({ windows: [] }, [])).skipped === 'empty' && (await St.getLive()).session.windows[0].tabs.length === 12);
  await chrome.storage.session.clear(); // = browser restart
  await St.updateLive({ windows: [win(1, 'fresh')] }, [202]);
  const prevSnap = (await St.getIndex('auto')).at(-1);
  check('live: after a restart the previous state is archived first', prevSnap?.reason === 'previous-session' && prevSnap.tabs === 12 && (await St.getLive()).session.windows[0].tabs.length === 1, JSON.stringify(prevSnap));
  await snap(1, 'fresh');
  check('live: ...and the next 1-tab snapshot protects it', (await St.getIndex('auto')).find((e) => e.id === prevSnap.id)?.keep === true);
  check('live: archiving happens once per browser session', (await St.archivePreviousSession()).skipped === 'already');

  // settings
  const st = await St.getSettings();
  await L.set({ settings: { autoMinutes: -3, autoKeep: 'lots', backup: 'hourly' } });
  const bad = await St.getSettings();
  check('settings: defaults + sanitising', st.autoKeep === 5 && bad.autoMinutes === 1 && bad.autoKeep === Cfg.DEFAULT_SETTINGS.autoKeep && bad.backup === 'off');

  // ================= review fixes =================
  {
    const t = S.cleanSession({ name: 'n'.repeat(119) + '😀', tabs: [{ url: 'https://x.example/', title: 'a'.repeat(S.LIMITS.title - 1) + '😀 more' }] }).session;
    const lone = (x) => /[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/.test(x);
    check('unicode: cutting a long title/name never leaves half an emoji', !lone(t.windows[0].tabs[0].title) && !lone(t.name) && t.windows[0].tabs[0].title.length === S.LIMITS.title - 1, t.windows[0].tabs[0].title.slice(-3));
    check('unicode: CJK/RTL/emoji titles kept intact', S.cleanSession({ tabs: [{ url: 'https://x.example/', title: '日本語 עברית 👩‍💻' }] }).session.windows[0].tabs[0].title === '日本語 עברית 👩‍💻');
  }
  L.data.clear();
  await St.setSettings({ autoKeep: 5 });
  // user-protected snapshots are never rotated out, even by more than PROTECTED_MAX automatic protections
  const mine = await snap(30, 'mine');
  await St.setProtected(mine.added.id, true);
  for (let i = 0; i < Cfg.PROTECTED_MAX + 3; i++) { await snap(20, 'up' + i); await snap(1, 'ud' + i); }
  const ai = await St.getIndex('auto');
  check('protect: a snapshot the user protected is never rotated out', ai.some((e) => e.id === mine.added.id && e.keep === 'user') && (await St.getSession(mine.added.id)) && ai.filter((e) => e.keep === true).length === Cfg.PROTECTED_MAX, JSON.stringify(ai.map((e) => e.keep)));
  await L.set({ 'idx:auto': [...L.data.get('idx:auto'), { broken: true }] }); // one damaged entry => rebuild
  check('protect: an index rebuild keeps "user" protection', (await St.getIndex('auto')).find((e) => e.id === mine.added.id)?.keep === 'user');
  const delMine = await St.deleteSession('auto', mine.added.id);
  await St.undoDelete(delMine);
  check('protect: delete + undo keeps "user" protection', (await St.getIndex('auto')).find((e) => e.id === mine.added.id)?.keep === 'user');
  // rotation can't push out the newest full snapshot or the newest "Previous browser session"
  L.data.clear();
  await St.setSettings({ autoKeep: 5 });
  const full = await snap(8, 'full');
  for (let i = 0; i < 12; i++) await snap(2, 'closed' + i, 'window-closed', 'window');
  check('rotation: many closed-window snapshots never evict the newest full snapshot', (await St.getIndex('auto')).some((e) => e.id === full.added.id) && (await St.getIndex('auto')).filter((e) => !e.keep).length === 5);
  const prev = await St.addAutoSnapshot({ windows: [win(8, 'full')] }, 'previous-session', 'all');
  check('rotation: "Previous browser session" recorded even when unchanged', prev.added?.reason === 'previous-session');
  for (let i = 0; i < 12; i++) await snap(6 + (i % 2), 'later' + i);
  check('rotation: the newest "Previous browser session" survives later snapshots', (await St.getIndex('auto')).some((e) => e.id === prev.added.id) && (await St.getIndex('auto')).filter((e) => !e.keep).length === 5);
  // delete -> trash -> undo after the popup closed
  L.data.clear();
  const d1 = await St.saveNamed(cap(2, 'd1'), 'Del one');
  const d2 = await St.saveNamed(cap(3, 'd2'), 'Del two');
  const gone = await St.deleteSessions('named', [d1.id, d2.id]);
  const tr = await St.getTrash();
  check('trash: a delete is kept as trash in the same write', gone.length === 2 && tr?.sessions.length === 2 && (await St.getIndex('named')).length === 0 && !L.data.has('s:' + d1.id));
  check('trash: not offered once it is old', (await St.getTrash(Date.now() + St.TRASH_UNDO_MS + 1)) === null);
  await St.undoDelete(tr.sessions); // e.g. from a popup opened later
  check('trash: undo from storage brings both back and clears the trash', (await St.getIndex('named')).length === 2 && (await St.getSession(d2.id)).windows[0].tabs.length === 3 && !L.data.has('trash'));
  // settings writes don't lose each other
  await Promise.all([St.setSettings({ backupLast: 123 }), St.setSettings({ autoMinutes: 15 }), St.setSettings({ lazy: true })]);
  const ss = await St.getSettings();
  check('settings: concurrent writes all kept', ss.backupLast === 123 && ss.autoMinutes === 15 && ss.lazy === true, JSON.stringify(ss));
  // scheduled backup: a last-backup time in the future (clock moved back) doesn't stop backups
  const B = await import(join(tmp, 'ext/backup.js'));
  await St.setSettings({ backup: 'daily', backupLast: Date.now() + 5 * 86400e3 });
  const fut = await B.backupIfDue();
  await St.setSettings({ backupLast: Date.now() - 3600e3 });
  check('backup: due again when the last backup is "in the future"; not due 1 h after a backup', fut.skipped !== 'not-due' && (await B.backupIfDue()).skipped === 'not-due', JSON.stringify(fut));
  await St.setSettings({ backup: 'off' });

  // performance: 300 named sessions, index read is cheap
  L.data.clear();
  await chrome.storage.sync.set({ license: makeToken(pem) });
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) await St.saveNamed({ windows: [win(30, 'perf' + i)] }, 'Perf ' + i);
  const t1 = performance.now();
  const ix = await St.getIndex('named');
  const t2 = performance.now();
  check('perf: 300 sessions x 30 tabs saved; index read < 50 ms', ix.length === 300 && t2 - t1 < 50, `save ${(t1 - t0).toFixed(0)} ms, index ${(t2 - t1).toFixed(1)} ms`);
} catch (e) {
  check('unexpected exception', false, e.stack);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} unit checks passed`);
process.exit(failed.length ? 1 : 0);
