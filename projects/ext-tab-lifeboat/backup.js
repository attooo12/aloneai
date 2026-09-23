// Pro: scheduled backup of all sessions to a JSON file in the Downloads folder (optional "downloads" permission,
// requested only when the user turns this on). The file is the same format as "Export all", so it can be imported.
import { isPro } from './license.js';
import { buildExport } from './schema.js';
import { exportAllData, getSettings, setSettings } from './store.js';
import { BACKUP_FOLDER, BACKUP_PERIOD_MS } from './config.js';

export const hasDownloads = () => chrome.permissions.contains({ permissions: ['downloads'] });

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${BACKUP_FOLDER}/tab-lifeboat-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

// Writes a backup file now. Returns { ok, downloadId, sessions } or { ok: false, error }.
export async function runBackup() {
  if (!(await isPro())) return { ok: false, error: 'pro_required' };
  if (!(await hasDownloads()) || !chrome.downloads) return { ok: false, error: 'permission' };
  const { sessions, unreadable } = await exportAllData();
  const json = JSON.stringify(buildExport(sessions, { unreadable }));
  const downloadId = await chrome.downloads.download({
    url: 'data:application/json;base64,' + utf8Base64(json),
    filename: backupFileName(),
    conflictAction: 'uniquify',
    saveAs: false
  });
  await setSettings({ backupLast: Date.now() });
  return { ok: true, downloadId, sessions: sessions.length };
}

// Called hourly by an alarm: runs the backup if it is due (so a browser that was closed at the scheduled
// time catches up at the next check).
export async function backupIfDue(now = Date.now()) {
  const s = await getSettings();
  if (s.backup === 'off') return { skipped: 'off' };
  const last = s.backupLast || 0;
  // A last-backup time in the future (the clock was wrong or moved back) must not stop backups until it's reached.
  if (last <= now && now - last < BACKUP_PERIOD_MS[s.backup]) return { skipped: 'not-due' };
  return runBackup();
}
