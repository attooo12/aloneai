import { isPro, verifyToken } from './license.js';
import { CHECKOUT_URL, PRO_PRICE, AUTO_MINUTES_CHOICES, AUTO_KEEP_CHOICES } from './config.js';
import { getIndex, getSettings, setSettings, importSessions, exportAllData } from './store.js';
import { parseImport, buildExport, toMarkdown, toHtml } from './schema.js';
import { hasDownloads } from './backup.js';

const $ = (id) => document.getElementById(id);
let pro = false;

function download(text, type, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
function result(html, kind = '') { $('data-result').className = 'result ' + kind; $('data-result').replaceChildren(...html); }
const node = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };

async function refresh() {
  pro = await isPro();
  $('plan-status').innerHTML = pro ? '<b class="ok">Pro is active.</b> Thank you for supporting an independent tool.' : 'You are on the <b>Free</b> plan.';
  $('buy-wrap').hidden = !CHECKOUT_URL || pro;
  $('soon').hidden = pro || !!CHECKOUT_URL;
  for (const id of ['export-md', 'export-html', 'backup', 'backup-now']) $(id).disabled = !pro;
  const [named, auto] = await Promise.all([getIndex('named'), getIndex('auto')]);
  const tabs = [...named, ...auto].reduce((n, e) => n + e.tabs, 0);
  $('data-summary').textContent = `${named.length} saved session${named.length === 1 ? '' : 's'} and ${auto.length} automatic snapshot${auto.length === 1 ? '' : 's'} (${tabs} tabs in total).`;
  const s = await getSettings();
  $('backup').value = s.backup;
  const last = s.backupLast ? `Last backup: ${new Date(s.backupLast).toLocaleString()}.` : 'No backup made yet.';
  // Scheduled backups stop silently without Pro or the downloads permission (removable in chrome://extensions): say so.
  const paused = s.backup === 'off' ? '' : !pro ? ' Scheduled backups are paused: they need Pro.'
    : !(await hasDownloads()) ? ' Scheduled backups are paused: Chrome\'s downloads permission was removed. Click "Back up now" to grant it again.' : '';
  $('backup-status').textContent = last + paused;
  $('backup-status').classList.toggle('error', !!paused);
}
for (const el of document.querySelectorAll('.price')) el.textContent = PRO_PRICE;

$('buy').addEventListener('click', () => { if (CHECKOUT_URL) chrome.tabs.create({ url: CHECKOUT_URL }); });

// ---------- license ----------
$('save').addEventListener('click', async () => {
  const key = $('license').value.trim();
  if (!(await verifyToken(key))) { $('msg').innerHTML = '<span class="error">This license key is not valid for Tab Lifeboat.</span>'; return; }
  await chrome.storage.sync.set({ license: key });
  $('msg').innerHTML = '<span class="ok">Saved. Pro unlocked.</span>';
  refresh();
});
$('remove').addEventListener('click', async () => {
  await chrome.storage.sync.remove('license');
  $('license').value = '';
  $('msg').textContent = 'Removed. All your sessions stay saved.';
  refresh();
});

// ---------- export / import ----------
$('export-json').addEventListener('click', async () => {
  const { sessions, unreadable } = await exportAllData();
  download(JSON.stringify(buildExport(sessions, { unreadable }), null, 1), 'application/json', `tab-lifeboat-export-${stamp()}.json`);
  result([node('span', `Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}${unreadable.length ? ` (plus ${unreadable.length} unreadable, included raw)` : ''}.`, 'ok')]);
});
for (const [id, fmt] of [['export-md', 'md'], ['export-html', 'html']]) {
  $(id).addEventListener('click', async () => {
    if (!(await isPro())) return result([node('span', 'Markdown and HTML export are part of Pro.', 'error')]);
    const { sessions } = await exportAllData();
    const named = sessions.filter((s) => s.kind === 'named');
    if (fmt === 'md') download(toMarkdown(named), 'text/markdown', `tab-lifeboat-${stamp()}.md`);
    else download(toHtml(named, { title: 'Tab Lifeboat: saved sessions' }), 'text/html', `tab-lifeboat-${stamp()}.html`);
    result([node('span', `Exported ${named.length} saved sessions as ${fmt === 'md' ? 'Markdown' : 'HTML'}.`, 'ok')]);
  });
}
$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0];
  $('import-file').value = '';
  if (!file) return;
  await importText(await file.text().catch(() => null));
});
async function importText(text) {
  const parsed = parseImport(text);
  if (parsed.error) {
    result([node('span', 'Nothing was imported. ' + parsed.error, 'error'), ...(parsed.problems?.length ? [list(parsed.problems)] : [])], 'error');
    return { error: parsed.error };
  }
  const r = await importSessions(parsed.sessions);
  const out = [node('span', `Imported ${r.added} session${r.added === 1 ? '' : 's'}${r.duplicates ? `; ${r.duplicates} already here, skipped` : ''}.`, 'ok')];
  const notes = [...parsed.problems];
  if (parsed.droppedTabs) notes.push(`${parsed.droppedTabs} tab(s) with addresses Chrome can't reopen (for example javascript: or data:) were left out`);
  if (notes.length) out.push(list(notes));
  result(out);
  refresh();
  return { ...r, problems: parsed.problems };
}
function list(items) {
  const ul = document.createElement('ul');
  for (const p of items.slice(0, 20)) ul.append(node('li', p));
  if (items.length > 20) ul.append(node('li', `…and ${items.length - 20} more`));
  return ul;
}

// ---------- scheduled backup (Pro, optional downloads permission) ----------
$('backup').addEventListener('change', async () => {
  const value = $('backup').value;
  if (value !== 'off') {
    const granted = await chrome.permissions.request({ permissions: ['downloads'] }).catch(() => false);
    if (!granted) { $('backup').value = 'off'; $('backup-status').textContent = 'Chrome did not grant the downloads permission, so backups stay off.'; return; }
  }
  await setSettings({ backup: value });
  $('backup-status').textContent = value === 'off' ? 'Scheduled backups are off.' : `Backups will be saved ${value}.`;
  if (value === 'off') chrome.permissions.remove({ permissions: ['downloads'] }).catch(() => {});
});
$('backup-now').addEventListener('click', async () => {
  const granted = await chrome.permissions.request({ permissions: ['downloads'] }).catch(() => false);
  if (!granted) { $('backup-status').textContent = 'The downloads permission is needed to write the backup file.'; return; }
  const r = await chrome.runtime.sendMessage({ type: 'backupNow' });
  $('backup-status').textContent = r?.ok ? `Backup saved (${r.sessions} sessions) to Downloads/Tab Lifeboat backups.` : `Backup failed: ${r?.error || 'unknown error'}`;
});

// ---------- snapshots + restore settings ----------
for (const [id, choices, fmt] of [['autoMinutes', AUTO_MINUTES_CHOICES, (n) => `${n} minute${n === 1 ? '' : 's'}`], ['autoKeep', AUTO_KEEP_CHOICES, String]]) {
  for (const n of choices) { const o = document.createElement('option'); o.value = n; o.textContent = fmt(n); $(id).append(o); }
  $(id).addEventListener('change', async () => {
    await setSettings({ [id]: Number($(id).value) });
    chrome.runtime.sendMessage({ type: 'settingsChanged' });
  });
}
$('lazy').addEventListener('change', () => setSettings({ lazy: $('lazy').checked }));
$('snap-now').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'snapshotNow' });
  $('snap-status').textContent = r?.added ? `Snapshot taken (${r.added.tabs} tabs).` : r?.skipped === 'unchanged' ? 'Nothing changed since the last snapshot.' : r?.skipped === 'empty' ? 'No tabs to snapshot.' : (r?.error || 'Done.');
  refresh();
});

getSettings().then((s) => {
  $('autoMinutes').value = s.autoMinutes;
  $('autoKeep').value = s.autoKeep;
  $('lazy').checked = s.lazy;
});
chrome.storage.sync.get('license').then(({ license }) => { if (license) $('license').value = license; });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c['idx:named'] || c['idx:auto'] || c.settings)) refresh(); });
refresh().then(() => { document.body.dataset.ready = '1'; });
