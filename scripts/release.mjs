#!/usr/bin/env node
// Builds a clean, shippable copy of one game in <game>/dist and zips it into <game>/release/. Both games
// used to carry their own copy of this script; now the steps live here and each game only says what ships,
// in <game>/release.json:
//   name    first line of dist/VERSION.txt
//   status  "ready" (default) or "beta": where the selector page lists the game (optional; see build-site.mjs)
//   before  shell commands run in the game folder before copying (optional)
//   files   paths relative to the game folder: a file, a folder (copied whole) or a glob with `*` in the
//           last segment (matches land in the same relative folder; no match is fine, a missing plain path
//           is an error)
//   copy    extra { source: destination in dist } pairs (optional)
//   after   commands run in dist's game folder after copying, before the zip; a non-zero exit fails (optional)
// Only what the browser needs is shipped (see docs/DEPLOY.md). No bundling: files are copied as they are.
// Usage: node scripts/release.mjs <game-folder>   (`.` from inside the game folder works too)
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error(`release: ${msg}`); process.exit(1); };

const arg = process.argv[2];
if (!arg) fail('usage: node scripts/release.mjs <game-folder>');
const game = resolve(arg);
if (dirname(game) !== root) fail(`${game} is not a game folder directly under ${root}`);
const name = basename(game);
const dist = join(game, 'dist');
if (!existsSync(join(game, 'release.json'))) fail(`${name}/release.json is missing`);

let manifest;
try { manifest = JSON.parse(readFileSync(join(game, 'release.json'), 'utf8')); } catch (e) { fail(`${name}/release.json: ${e.message}`); }
if (typeof manifest.name !== 'string' || !manifest.name) fail('release.json needs a non-empty "name"');
if (!Array.isArray(manifest.files) || !manifest.files.length) fail('release.json needs a non-empty "files" list');
if (manifest.status !== undefined && !['ready', 'beta'].includes(manifest.status)) fail(`release.json: "status" must be "ready" or "beta", not ${JSON.stringify(manifest.status)}`);
const version = JSON.parse(readFileSync(join(game, 'package.json'), 'utf8')).version;
const stamp = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

/** run(cmd, quiet): a manifest command in the game folder. quiet drops stdout (stderr always shows). */
function run(cmd, quiet = false) {
  try { execSync(cmd, { cwd: game, stdio: ['ignore', quiet ? 'ignore' : 'inherit', 'inherit'] }); }
  catch { fail(`command failed: ${cmd}`); }
}
/** inside(rel) -> absolute path in the game folder; refuses anything that climbs out of it. */
function inside(base, rel) {
  const p = resolve(base, rel);
  if (p !== base && !p.startsWith(base + sep)) fail(`${rel} points outside ${base}`);
  return p;
}
/** put(srcRel, destRel): copy a file or folder from the game folder into dist. A symlink is copied as what it points
 *  at (every game's `shared` is a link to the repo's shared/ kit, which ships inside each game's dist). */
function put(srcRel, destRel) {
  const src = inside(game, srcRel);
  if (!existsSync(src)) fail(`${srcRel} does not exist`);
  const dest = inside(dist, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
}

for (const cmd of manifest.before || []) run(cmd, true);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(join(game, 'release'), { recursive: true });

for (const entry of manifest.files) {
  const dir = dirname(entry), pattern = basename(entry);
  if (!pattern.includes('*')) { put(entry, entry); continue; }
  // glob: files of that folder whose name fits the pattern (dotfiles only if the pattern starts with a dot)
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  const folder = inside(game, dir);
  const names = existsSync(folder) ? readdirSync(folder) : [];
  for (const n of names.sort()) {
    if (re.test(n) && (pattern.startsWith('.') || !n.startsWith('.')) && statSync(join(folder, n)).isFile()) put(join(dir, n), join(dir, n));
  }
}
for (const [src, dest] of Object.entries(manifest.copy || {})) put(src, dest);

writeFileSync(join(dist, 'VERSION.txt'), `${manifest.name}\nversion ${version}\nbuilt ${stamp}\n`);

// sanity: every relative src="..." / href="..." in index.html must exist in dist/
const html = readFileSync(join(game, 'index.html'), 'utf8');
const missing = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1])
  .filter((ref) => ref && !/^(?:http|data:|\/|#|mailto:)/.test(ref))
  .map((ref) => ref.replace(/[?#].*$/, ''))
  .filter((ref) => ref && !existsSync(join(dist, ref)));
if (missing.length) fail(missing.map((p) => `MISSING in dist: ${p}`).join('\n'));

for (const cmd of manifest.after || []) run(cmd);

const zip = `release/${name}-v${version}.zip`;
rmSync(join(game, zip), { force: true });
try { execFileSync('zip', ['-qr', `../${zip}`, '.'], { cwd: dist }); } catch (e) { fail(`zip failed: ${e.message}`); }
const size = (p) => execFileSync('du', [p === dist ? '-sh' : '-h', relative(game, p)], { cwd: game, encoding: 'utf8' }).split('\t')[0];
console.log(`dist/ ready (${size(dist)}), ${zip} (${size(join(game, zip))})`);
