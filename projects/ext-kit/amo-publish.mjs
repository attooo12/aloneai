#!/usr/bin/env node
// Publish a Firefox build of one of the extensions to addons.mozilla.org (AMO) via the public API v5, with a
// complete listing (metadata + screenshots), no browser/human step. Node 24+ (uses global fetch/FormData/Blob
// and node:crypto — no npm dependencies).
//
// Usage:
//   node amo-publish.mjs <name> [--dry-run]
//   node amo-publish.mjs reload-until
//   node amo-publish.mjs cookie-crate --dry-run
//
// <name> is the short extension name used throughout this repo: reload-until, color-picker, tab-lifeboat,
// cookie-crate. It maps to ../ext-<name>/ (source) and ../ext-<name>-listing/amo.json (listing metadata).
//
// What it does, in order:
//   1. Runs build-firefox.sh <name> --zip to produce a fresh Firefox build + .xpi-equivalent .zip.
//   2. Reads amo.json next to the source (ext-<name>-listing/amo.json) for the listing metadata.
//   3. Validates categories against the live GET /api/v5/addons/categories/ (public, no auth) and the license
//      slug against AMO's documented, hardcoded license-choice list (there's no live JSON endpoint for it).
//   4. Uploads the zip to POST /api/v5/addons/upload/ (channel=listed) and polls
//      GET /api/v5/addons/upload/<uuid>/ until processed; prints validation errors and stops if invalid.
//   5. PUTs the full listing (name/summary/description/categories/tags/etc. + version{upload, license,
//      release_notes}) to /api/v5/addons/addon/<guid>/ — this single idempotent call creates the add-on if the
//      guid is new, or attaches a new version to it if the guid already exists on AMO.
//   6. Uploads each screenshot in amo.json to the addon's /previews/ endpoint and PATCHes its caption.
//
// --dry-run prints every request (method, URL, headers with the JWT redacted, body) without sending anything
// over the network, except for the always-safe, unauthenticated category-list GET used for validation.
//
// Needs env vars AMO_JWT_ISSUER and AMO_JWT_SECRET (from https://addons.mozilla.org/developers/addon/api/key/)
// for anything beyond --dry-run.
//
// Known gap (see SUBMIT-AMO.md): AMO's documented Add-on Create/Edit API has no `support_url` field (only
// `support_email`). amo.json's supportUrl is kept for the record and printed as a reminder, but it cannot be
// set through this script — set it once by hand on the listing's "Edit Product Page" > "Support Information".

import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..'); // .../projects
const API = 'https://addons.mozilla.org/api/v5';

// AMO's documented, hardcoded license choices for non-theme add-ons (there is no live JSON endpoint for this;
// see https://mozilla.github.io/addons-server/topics/api/licenses.html — "not frozen, can change"). Re-check
// that page if a submission is ever rejected for an unrecognised license slug.
const NON_THEME_LICENSES = new Set([
  'all-rights-reserved', 'MPL-2.0', 'Apache-2.0', 'GPL-2.0-only', 'GPL-3.0-only',
  'LGPL-2.1-only', 'LGPL-3.0-only', 'AGPL-3.0-only', 'MIT', 'ISC', 'BSD-2-Clause', 'Unlicense'
]);

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error('Usage: node amo-publish.mjs <name> [--dry-run]');
  console.error('  <name>: reload-until | color-picker | tab-lifeboat | cookie-crate');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const name = args.find((a) => !a.startsWith('--'));
if (!name) usage('missing <name>');

const srcDir = path.join(ROOT, `ext-${name}`);
const listingDir = path.join(ROOT, `ext-${name}-listing`);
const amoJsonPath = path.join(listingDir, 'amo.json');

function readJson(p, what) {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { usage(`can't read ${what} at ${p}: ${e.message}`); }
}

// ---------- 1. build the Firefox zip ----------
function buildFirefoxZip() {
  const buildSh = path.join(HERE, 'build-firefox.sh');
  let out;
  try {
    out = execFileSync('sh', [buildSh, srcDir, '--zip'], { encoding: 'utf8' });
  } catch (e) {
    console.error((e.stdout || '') + (e.stderr || ''));
    throw new Error(`build-firefox.sh failed for ${srcDir}`);
  }
  const lines = out.trim().split('\n');
  const zipPath = lines[lines.length - 1];
  const unpackedDir = lines[lines.length - 2];
  if (!zipPath.endsWith('.zip')) throw new Error(`unexpected build-firefox.sh output:\n${out}`);
  return { zipPath, unpackedDir };
}

// ---------- JWT (HS256, hand-rolled per https://mozilla.github.io/addons-server/topics/api/auth.html) ----------
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeJwt(issuer, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuer, jti: randomUUID(), iat: now, exp: now + 60 }; // must be <= 5 min per docs
  const h = base64url(Buffer.from(JSON.stringify(header)));
  const p = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

const ISSUER = process.env.AMO_JWT_ISSUER;
const SECRET = process.env.AMO_JWT_SECRET;
if (!dryRun && (!ISSUER || !SECRET)) {
  usage('AMO_JWT_ISSUER and AMO_JWT_SECRET must be set (get them from https://addons.mozilla.org/developers/addon/api/key/); or pass --dry-run');
}

// ---------- HTTP helper ----------
async function amoRequest(method, p, { json, form, auth = true, label } = {}) {
  const url = `${API}${p}`;
  const headers = {};
  if (auth) headers.Authorization = dryRun ? 'JWT <redacted>' : `JWT ${makeJwt(ISSUER, SECRET)}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json, null, 2); }
  else if (form !== undefined) { body = form; }

  if (dryRun) {
    console.log(`\n--- [dry-run] ${label || ''} ---`);
    console.log(`${method} ${url}`);
    for (const [k, v] of Object.entries(headers)) if (k !== 'Content-Type' || json !== undefined) console.log(`${k}: ${v}`);
    if (json !== undefined) console.log(body);
    else if (form instanceof FormData) {
      for (const [k, v] of form.entries()) {
        console.log(v instanceof Blob ? `${k}: <file ${v.name || '(unnamed)'}, ${v.size} bytes, ${v.type || 'application/octet-stream'}>` : `${k}: ${v}`);
      }
    }
    return { status: 0, ok: true, data: null, dryRun: true };
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

// ---------- category / license validation ----------
async function fetchExtensionCategories() {
  // Public endpoint, no auth needed — always safe to call, even in --dry-run.
  const res = await fetch(`${API}/addons/categories/`);
  if (!res.ok) throw new Error(`GET /addons/categories/ -> HTTP ${res.status}`);
  const cats = await res.json();
  return new Set(cats.filter((c) => c.type === 'extension').map((c) => c.slug));
}

async function fetchValidTags() {
  // Public endpoint, no auth needed — always safe to call, even in --dry-run. Small, fixed vocabulary (a few
  // dozen names like "privacy", "dark mode", "vpn"); most free-text tag ideas will NOT be in it.
  const res = await fetch(`${API}/addons/tags/`);
  if (!res.ok) throw new Error(`GET /addons/tags/ -> HTTP ${res.status}`);
  return new Set(await res.json());
}

function validateAmoJson(amo, validCategorySlugs, validTags) {
  const errors = [];
  for (const f of ['guid', 'name', 'summary', 'description', 'homepage', 'license', 'categories']) {
    if (!amo[f]) errors.push(`amo.json: missing "${f}"`);
  }
  if (amo.license && !NON_THEME_LICENSES.has(amo.license)) {
    errors.push(`amo.json: license "${amo.license}" is not one of AMO's non-theme license slugs (${[...NON_THEME_LICENSES].join(', ')})`);
  }
  const fxCats = amo.categories?.firefox || [];
  if (!fxCats.length) errors.push('amo.json: categories.firefox must have at least one slug');
  for (const slug of fxCats) if (!validCategorySlugs.has(slug)) errors.push(`amo.json: unknown AMO category slug "${slug}" for the "extension" type`);
  for (const tag of amo.tags || []) if (!validTags.has(tag)) errors.push(`amo.json: "${tag}" is not in AMO's fixed tag list (GET /addons/tags/)`);
  if (amo.summary && amo.summary.length > 250) errors.push(`amo.json: summary is ${amo.summary.length} chars, AMO's cap is 250`);
  return errors;
}

// ---------- translated-field helper ----------
// AMO's "translated fields" are objects keyed by locale, e.g. {"en-US": "text"}. Everything here is en-US only.
const t = (s) => (s === undefined || s === null ? undefined : { 'en-US': s });

async function main() {
  console.log(`== amo-publish: ${name}${dryRun ? ' (dry run)' : ''} ==`);

  const amo = readJson(amoJsonPath, 'amo.json');

  console.log('Building Firefox zip...');
  const { zipPath, unpackedDir } = buildFirefoxZip();
  const manifest = readJson(path.join(unpackedDir, 'manifest.json'), 'built manifest.json');
  const gecko = manifest.browser_specific_settings?.gecko;
  if (!gecko?.id) throw new Error(`built manifest has no browser_specific_settings.gecko.id (${unpackedDir}/manifest.json)`);
  if (gecko.id !== amo.guid) throw new Error(`amo.json guid "${amo.guid}" does not match the built manifest's gecko id "${gecko.id}"`);
  const zipSize = statSync(zipPath).size;
  console.log(`Built ${zipPath} (${zipSize} bytes), version ${manifest.version}, guid ${gecko.id}`);

  console.log('Validating categories and tags against the live AMO API...');
  const [validCategorySlugs, validTags] = await Promise.all([fetchExtensionCategories(), fetchValidTags()]);
  const errors = validateAmoJson(amo, validCategorySlugs, validTags);
  if (errors.length) { for (const e of errors) console.error(`  - ${e}`); throw new Error('amo.json failed validation'); }
  console.log('  OK');

  if (amo.supportUrl) {
    console.log(`Note: AMO's Add-on Create/Edit API has no support_url field. Set it manually once at\n` +
      `  https://addons.mozilla.org/developers/addon/${amo.slug || gecko.id}/edit -> Support Information -> ${amo.supportUrl}`);
  }

  // Does this guid already exist on AMO? (Public detail GET, no auth needed.)
  let existing = false;
  if (!dryRun) {
    const check = await fetch(`${API}/addons/addon/${encodeURIComponent(amo.guid)}/`);
    existing = check.status === 200;
    console.log(existing ? `Add-on ${amo.guid} already exists on AMO: will submit a new version.` : `Add-on ${amo.guid} not found on AMO: will create it.`);
  } else {
    console.log('[dry-run] Would check GET /addons/addon/<guid>/ to report create-vs-new-version (skipped).');
  }

  // ---------- upload the zip ----------
  const zipBuf = readFileSync(zipPath);
  const uploadForm = new FormData();
  uploadForm.append('upload', new Blob([zipBuf], { type: 'application/zip' }), path.basename(zipPath));
  uploadForm.append('channel', 'listed');
  const uploadRes = await amoRequest('POST', '/addons/upload/', { form: uploadForm, label: 'upload xpi/zip' });

  let uploadUuid;
  if (dryRun) {
    uploadUuid = 'DRY-RUN-UUID';
  } else {
    if (!uploadRes.ok) throw new Error(`upload failed: HTTP ${uploadRes.status} ${JSON.stringify(uploadRes.data)}`);
    uploadUuid = uploadRes.data.uuid;
    console.log(`Uploaded, uuid=${uploadUuid}. Polling for validation...`);
    let attempt = 0;
    for (;;) {
      const poll = await amoRequest('GET', `/addons/upload/${uploadUuid}/`, { label: 'poll upload' });
      if (!poll.ok) throw new Error(`poll failed: HTTP ${poll.status} ${JSON.stringify(poll.data)}`);
      if (poll.data.processed) {
        if (!poll.data.valid) {
          console.error('Upload failed validation:');
          console.error(JSON.stringify(poll.data.validation, null, 2));
          throw new Error('AMO validation failed');
        }
        console.log('Upload valid.');
        break;
      }
      if (++attempt > 60) throw new Error('timed out waiting for AMO to process the upload (5 min)');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // ---------- create the add-on, or attach a new version, via PUT (idempotent on guid) ----------
  const addonBody = {
    name: t(amo.name || manifest.name),
    summary: t(amo.summary),
    description: t(amo.description),
    homepage: t(amo.homepage),
    ...(amo.supportEmail ? { support_email: t(amo.supportEmail) } : {}),
    categories: amo.categories,
    tags: amo.tags || [],
    ...(amo.slug ? { slug: amo.slug } : {}),
    requires_payment: !!amo.requiresPayment,
    is_experimental: !!amo.isExperimental,
    version: {
      upload: uploadUuid,
      license: amo.license,
      ...(amo.releaseNotes ? { release_notes: t(amo.releaseNotes) } : {})
    }
  };
  const putRes = await amoRequest('PUT', `/addons/addon/${encodeURIComponent(amo.guid)}/`, { json: addonBody, label: 'create-or-new-version' });
  if (!dryRun && !putRes.ok) throw new Error(`add-on PUT failed: HTTP ${putRes.status} ${JSON.stringify(putRes.data, null, 2)}`);
  if (!dryRun) console.log(`Add-on ${existing ? 'updated with new version' : 'created'}: ${putRes.data.url || amo.guid}`);

  // ---------- screenshots ----------
  for (const shot of amo.screenshots || []) {
    const file = path.resolve(listingDir, shot.file);
    let buf;
    try { buf = readFileSync(file); } catch (e) { console.error(`  skip screenshot ${shot.file}: ${e.message}`); continue; }
    const form = new FormData();
    const ext = path.extname(file).slice(1) || 'png';
    form.append('image', new Blob([buf], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }), path.basename(file));
    if (shot.position !== undefined) form.append('position', String(shot.position));
    const prevRes = await amoRequest('POST', `/addons/addon/${encodeURIComponent(amo.guid)}/previews/`, { form, label: `preview ${shot.file}` });
    if (!dryRun) {
      if (!prevRes.ok) { console.error(`  screenshot ${shot.file} failed: HTTP ${prevRes.status} ${JSON.stringify(prevRes.data)}`); continue; }
      console.log(`  uploaded preview ${shot.file} (id ${prevRes.data.id})`);
      if (shot.caption) {
        const capRes = await amoRequest('PATCH', `/addons/addon/${encodeURIComponent(amo.guid)}/previews/${prevRes.data.id}/`, { json: { caption: t(shot.caption) }, label: `caption ${shot.file}` });
        if (!capRes.ok) console.error(`  caption for ${shot.file} failed: HTTP ${capRes.status} ${JSON.stringify(capRes.data)}`);
      }
    }
  }

  console.log(dryRun ? '\nDry run complete: no network requests other than the public categories GET were sent.' : '\nDone.');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
