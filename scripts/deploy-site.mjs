#!/usr/bin/env node
// Safe FTP deploy of site/ to Altervista (or any plain FTP host).
//
//   node scripts/deploy-site.mjs            upload what changed (asks the FTP password)
//   node scripts/deploy-site.mjs --dry-run  only list what would be uploaded
//   node scripts/deploy-site.mjs --all      upload everything
//
// Why not `lftp mirror`: mirror deletes each old file before sending the new one, so a
// visitor (or their service worker) can catch a missing or half-written file, and big
// transfers on Altervista sometimes stall at 100% and leave a truncated file.
// Here every changed file is first uploaded as `<name>.__new` (resumable with put -c),
// each one is downloaded back over HTTPS and checked against the local hash, and only
// when all of them are intact are they renamed into place (play/ page + sw.js last).
// A manifest of hashes is kept on the server so the next run only sends real changes.
//
// Env overrides: FTP_HOST, FTP_PORT, FTP_USER, SITE_URL (LFTP_PASSWORD skips the prompt). Needs `lftp` (brew install lftp).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'site');
const HOST = process.env.FTP_HOST || 'ftp.tridchess.altervista.org';
const USER = process.env.FTP_USER || 'tridchess';
const PORT = process.env.FTP_PORT || '';
const SITE = (process.env.SITE_URL || 'https://tridchess.altervista.org').replace(/\/+$/, '');
const MANIFEST = 'deploy-manifest.json';
const TMP = '.__new';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ALL = args.includes('--all');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const die = (msg) => { console.error(`deploy: ${msg}`); process.exit(1); };

// --- local files ------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(SRC, p).split(sep).join('/'));
  }
  return out;
}
let files;
try { files = walk(SRC).filter((f) => f !== MANIFEST).sort(); } catch { die('site/ not found: build it first (npm run site:altervista)'); }
const local = Object.fromEntries(files.map((f) => [f, sha(readFileSync(join(SRC, f)))]));

// --- what is live -------------------------------------------------------------------
// URL a browser would use; /x/index.html is 301-redirected to /x/ by our .htaccess.
const urlOf = (f) => `${SITE}/${f.replace(/(^|\/)index\.html$/, '$1')}?nocache=${Date.now()}${Math.random().toString(36).slice(2)}`;
const fetchHash = async (url) => {
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    return r.ok ? sha(Buffer.from(await r.arrayBuffer())) : null;
  } catch { return null; }
};
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

let remote = {};
if (!ALL) {
  try {
    const r = await fetch(`${SITE}/${MANIFEST}?nocache=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) remote = await r.json();
  } catch {}
  if (!Object.keys(remote).length) {
    console.log('no manifest on the server yet: comparing live files over HTTPS…');
    const hs = await pool(files, 6, (f) => (f.startsWith('.ht') ? null : fetchHash(urlOf(f))));
    files.forEach((f, k) => { if (hs[k]) remote[f] = hs[k]; });
  }
}
const changed = files.filter((f) => ALL || remote[f] !== local[f]);
if (!changed.length) { console.log('nothing to upload: the live site matches site/'); process.exit(0); }
console.log(`${changed.length} file(s) to upload:\n  ${changed.join('\n  ')}`);
if (DRY) process.exit(0);

// --- password (asked once, handed to lftp via env, never on the command line) --------
async function askPassword() {
  if (process.env.LFTP_PASSWORD) return process.env.LFTP_PASSWORD;
  if (!process.stdin.isTTY) die('no TTY to ask the password (or set LFTP_PASSWORD)');
  process.stdout.write(`FTP password for ${USER}@${HOST}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let pw = '';
  return new Promise((res) => {
    const onData = (b) => {
      for (const ch of b.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); return res(pw); }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') pw = pw.slice(0, -1); else pw += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}
const password = await askPassword();

const q = (s) => `"${s.replace(/(["\\])/g, '\\$1')}"`;
const work = mkdtempSync(join(tmpdir(), 'tridchess-deploy-'));
function lftp(lines, label) {
  const script = join(work, `${label}.lftp`);
  writeFileSync(script, [
    'set cmd:fail-exit yes',
    'set ftp:passive-mode on',
    'set ssl:verify-certificate no',
    'set net:timeout 20',
    'set net:max-retries 4',
    'set net:reconnect-interval-base 3',
    `open -u ${q(USER)} --env-password ${PORT ? `-p ${PORT} ` : ''}${q(HOST)}`,
    ...lines,
    'bye',
  ].join('\n'));
  const r = spawnSync('lftp', ['-f', script], { stdio: 'inherit', env: { ...process.env, LFTP_PASSWORD: password } });
  if (r.error) die(r.error.code === 'ENOENT' ? 'lftp not installed (brew install lftp)' : r.error.message);
  return r.status === 0;
}

// --- 1. upload as <name>.__new (resumable), with retries ------------------------------
const dirs = [...new Set(changed.map((f) => posix.dirname(f)).filter((d) => d !== '.'))];
const upload = (list) => [
  ...dirs.map((d) => `mkdir -p -f ${q('/' + d)}`),
  ...list.map((f) => `put -c ${q(join(SRC, f))} -o ${q('/' + f + TMP)}`),
];
let pending = changed;
for (let attempt = 1; attempt <= 4 && pending.length; attempt++) {
  console.log(`\nupload pass ${attempt}: ${pending.length} file(s)`);
  lftp(upload(pending), `upload${attempt}`);
  // 2. verify every temp copy over HTTPS (.ht* files are never served: trust FTP for those)
  const ok = await pool(pending, 6, async (f) => f.startsWith('.ht') || (await fetchHash(`${SITE}/${f}${TMP}?nocache=${Date.now()}`)) === local[f]);
  pending = pending.filter((f, k) => !ok[k]);
  if (pending.length) console.log(`incomplete or corrupt after pass ${attempt}:\n  ${pending.join('\n  ')}`);
  // a corrupt (not just short) copy can't be resumed: delete it so the next pass restarts it
  if (pending.length) lftp(pending.map((f) => `rm -f ${q('/' + f + TMP)}`), `clean${attempt}`);
}
if (pending.length) die('some files could not be uploaded intact; the live site is untouched. Run it again.');

// --- 3. swap into place: page shell and service worker last ------------------------------
const late = (f) => (f === 'play/index.html' ? 2 : f === 'play/sw.js' ? 1 : 0);
const order = [...changed].sort((a, b) => late(a) - late(b));
const manifest = { ...remote, ...local };
for (const f of Object.keys(manifest)) if (!(f in local)) delete manifest[f];
writeFileSync(join(work, MANIFEST), JSON.stringify(manifest, null, 0));
console.log('\nall files verified, switching them live…');
const swapped = lftp([
  ...order.map((f) => `mv ${q('/' + f + TMP)} ${q('/' + f)}`),
  `put ${q(join(work, MANIFEST))} -o ${q('/' + MANIFEST)}`,
], 'swap');
// `mv` onto an existing name fails on some servers: fall back to rm + mv per file
if (!swapped) {
  console.log('rename-over failed, retrying with delete + rename…');
  const r = lftp([
    ...order.flatMap((f) => [`rm -f ${q('/' + f)}`, `mv ${q('/' + f + TMP)} ${q('/' + f)}`]),
    `put ${q(join(work, MANIFEST))} -o ${q('/' + MANIFEST)}`,
  ], 'swap2');
  if (!r) die('switching files live failed: run it again (uploads are kept as *.__new)');
}

// --- 4. final check ----------------------------------------------------------------------
const live = await pool(order, 6, async (f) => f.startsWith('.ht') || (await fetchHash(urlOf(f))) === local[f]);
const bad = order.filter((f, k) => !live[k]);
if (bad.length) die(`live copy differs for:\n  ${bad.join('\n  ')}`);
console.log(`\ndeployed ${order.length} file(s) to ${SITE} ✔`);
