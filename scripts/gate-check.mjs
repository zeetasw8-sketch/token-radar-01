// Local gate check for the token-radar-01 entry: the kit's seven sealed
// checks (kit RULES.txt, "Gate"), run against entry/out/.
//
//   node entry/scripts/gate-check.mjs [out-dir]
//
// Prints PASS/FAIL per check and exits 0 only when all seven pass.
// It never touches the network and never writes anything.
//
// Screenshot dimensions follow RULES.txt: long side at most 1440, short side
// AT LEAST 800 pixels. (An earlier task note said "short <= 800"; that
// contradicts RULES.txt line 34 and the kit's own starter screenshots, which
// are 1440x900. RULES.txt is the sealed gate, so it wins.)

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.argv[2] ?? join(here, '..', 'out');
const snapshotPath =
  process.env.SNAPSHOT ??
  join(here, '..', '..', 'kit', 'extracted', 'token-radar-01-kit', 'input', 'snapshot.json');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

/** PNG width/height from the IHDR chunk; null when the bytes are not a PNG. */
function pngSize(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), whole: buf.subarray(buf.length - 12).toString('ascii', 4, 8) === 'IEND' };
}

/** JPEG width/height from the first SOF0/1/2 marker; null when not a JPEG. */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xd9) break;
    if (marker === 0xda) break; // SOS: dimensions already passed
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), whole: buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9 };
    }
    i += 2 + len;
  }
  return null;
}

// --- 1. dashboard_files ---------------------------------------------------
{
  const dir = join(out, 'dashboard');
  if (!existsSync(dir)) {
    check('dashboard_files', false, 'no out/dashboard/');
  } else {
    const names = readdirSync(dir).filter((n) => !n.startsWith('.'));
    const bad = [];
    let bytes = 0;
    for (const n of names) {
      const p = join(dir, n);
      const st = lstatSync(p);
      if (!st.isFile() || st.isSymbolicLink()) { bad.push(`${n}: not a plain file`); continue; }
      if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(n)) bad.push(`${n}: bad name`);
      bytes += st.size;
      if (/\.(html|css|js|json|mjs|svg|md|txt)$/.test(n)) {
        const text = readFileSync(p, 'utf8');
        const hit = text.match(/https?:\/\/[^\s"'<>]+/);
        if (hit) bad.push(`${n}: names a network address (${hit[0].slice(0, 60)})`);
      }
    }
    const ok = names.length > 0 && names.length <= 400 && bytes <= 4_194_304 && bad.length === 0;
    check('dashboard_files', ok, `${names.length} files, ${bytes} bytes${bad.length ? `; ${bad.join('; ')}` : ''}`);
  }
}

// --- 2. board_file --------------------------------------------------------
let board = null;
{
  const path = join(out, 'board.json');
  if (!existsSync(path)) {
    check('board_file', false, 'no out/board.json');
  } else {
    try {
      const doc = JSON.parse(readFileSync(path, 'utf8'));
      const rows = doc.rows;
      if (!Array.isArray(rows)) throw new Error('board.json has no rows array');
      const bad = [];
      if (rows.length < 100 || rows.length > 4000) bad.push(`${rows.length} rows (need 100-4000)`);
      const seen = new Set();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.rank !== i + 1) { bad.push(`row ${i + 1} has rank ${r.rank}`); break; }
        if (seen.has(r.slug)) { bad.push(`duplicate slug ${r.slug}`); break; }
        seen.add(r.slug);
        if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) { bad.push(`${r.slug}: implied value ${r.implied_value_usd}`); break; }
      }
      board = rows;
      check('board_file', bad.length === 0, `${rows.length} rows, ranks 1..${rows.length}${bad.length ? `; ${bad.join('; ')}` : ''}`);
    } catch (e) {
      check('board_file', false, `unparsable: ${e.message}`);
    }
  }
}

// --- 3. sorted_by_value ----------------------------------------------------
if (board !== null) {
  let badAt = -1;
  for (let i = 1; i < board.length; i++) {
    if (board[i].implied_value_usd > board[i - 1].implied_value_usd) { badAt = i + 1; break; }
  }
  check('sorted_by_value', badAt === -1, badAt === -1 ? `non-increasing implied value, $${board[0].implied_value_usd.toLocaleString('en-US')} down to $${board[board.length - 1].implied_value_usd.toLocaleString('en-US')}` : `row ${badAt} outranks row ${badAt - 1}`);
} else {
  check('sorted_by_value', false, 'no board to sort-check');
}

// --- 4. coverage ------------------------------------------------------------
{
  if (board === null) {
    check('coverage', false, 'no board to cover-check');
  } else if (!existsSync(snapshotPath)) {
    check('coverage', false, `snapshot not found at ${snapshotPath}`);
  } else {
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const have = new Set(board.map((r) => r.slug));
    const missing = snap.watchlist.filter((s) => !have.has(s));
    check('coverage', missing.length === 0, `${snap.watchlist.length - missing.length}/${snap.watchlist.length} watchlist slugs on the board${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
  }
}

// --- 5. farm_steps ----------------------------------------------------------
if (board !== null) {
  let bad = null;
  for (const r of board) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) { bad = `${r.slug}: ${r.farm_steps?.length} steps`; break; }
    for (const s of r.farm_steps) {
      if (typeof s !== 'string' || s.length < 20 || s.length > 600) { bad = `${r.slug}: a farm step of ${s?.length} characters`; break; }
    }
    if (bad) break;
  }
  const lens = board.map((r) => r.farm_steps.length);
  check('farm_steps', bad === null, bad ?? `${board.length} rows, ${Math.min(...lens)}-${Math.max(...lens)} steps each, all 20-600 characters`);
} else {
  check('farm_steps', false, 'no board to farm-check');
}

// --- 6. screenshots ---------------------------------------------------------
{
  const dir = join(out, 'screenshots');
  if (!existsSync(dir)) {
    check('screenshots', false, 'no out/screenshots/');
  } else {
    const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
    const bad = [];
    for (const n of names) {
      const p = join(dir, n);
      const st = statSync(p);
      if (!st.isFile()) { bad.push(`${n}: not a file`); continue; }
      if (st.size > 524_288) bad.push(`${n}: ${st.size} bytes (> 512 KiB)`);
      const buf = readFileSync(p);
      const size = pngSize(buf) ?? jpegSize(buf);
      if (size === null) { bad.push(`${n}: not a whole PNG or JPEG`); continue; }
      if (!size.whole) bad.push(`${n}: truncated image (no end marker)`);
      const long = Math.max(size.width, size.height);
      const short = Math.min(size.width, size.height);
      if (long > 1440) bad.push(`${n}: long side ${long} > 1440`);
      if (short < 800) bad.push(`${n}: short side ${short} < 800`);
    }
    const ok = names.length >= 3 && names.length <= 4 && bad.length === 0;
    check('screenshots', ok, `${names.length} images (${names.join(', ')})${bad.length ? `; ${bad.join('; ')}` : ''}`);
  }
}

// --- 7. dossier_matches ------------------------------------------------------
{
  const path = join(out, 'dossier.json');
  if (!existsSync(path)) {
    check('dossier_matches', false, 'no out/dossier.json');
  } else {
    try {
      // buildDossier returns Uint8Array bytes, not a string: compare bytes.
      const expected = Buffer.from(buildDossier(out, {
        text_max_bytes: 65_536,
        screenshots: { max: 4, max_bytes: 524_288 },
        dashboard: { max_files: 400, max_bytes: 4_194_304 },
      })).toString('utf8');
      const actual = readFileSync(path, 'utf8');
      const size = Buffer.byteLength(actual, 'utf8');
      const ok = actual === expected && size <= 1_572_864;
      check('dossier_matches', ok, ok ? `byte-for-byte identical, ${size} bytes (cap 1.5 MiB)` : actual !== expected ? 'dossier.json differs from a fresh buildDossier(out)' : `dossier.json is ${size} bytes (> 1.5 MiB)`);
    } catch (e) {
      check('dossier_matches', false, `buildDossier refused: ${e.message}`);
    }
  }
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`gate-check: ${results.length - failed}/${results.length} checks pass\n`);
process.exit(failed === 0 ? 0 : 1);
