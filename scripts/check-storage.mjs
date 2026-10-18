#!/usr/bin/env node
// Every game is served from the same origin (arcade.alzlper.com), so localStorage, sessionStorage,
// IndexedDB and cookies are shared between them. The rule that keeps their saves apart: every storage
// key of a game starts with the game's prefix, the folder name in camelCase plus a dot
// (cocktail-merge -> "cocktailMerge."). This script fails when a game breaks the rule or uses another
// game's prefix. It runs in CI (see .github/workflows/ci.yml) and by hand: node scripts/check-storage.mjs
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** files(dir) -> every .js and .html file below dir (node_modules, dist, tests and symlinks stay out: a game's `shared`
 *  is a link to the repo's shared/ kit, which uses its own arcade.* keys and is checked once below). */
function files(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (['node_modules', 'dist', 'release', 'tests', 'docs', 'examples'].includes(e)) continue;
    const p = join(dir, e);
    if (lstatSync(p).isSymbolicLink()) continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(js|mjs|html)$/.test(e)) out.push(p);
  }
  return out;
}

const games = readdirSync(root).filter((n) => existsSync(join(root, n, 'scripts', 'release.sh'))).sort();
const prefixes = Object.fromEntries(games.map((g) => [g, camel(g) + '.']));
const errors = [];

for (const game of games) {
  const prefix = prefixes[game];
  const others = games.filter((g) => g !== game).map((g) => prefixes[g]);
  let declared = false;
  for (const file of files(join(root, game))) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    // a key literal handed straight to a storage call
    for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*(['"`])([^'"`]+)\1/g)) {
      if (!m[2].startsWith(prefix)) errors.push(`${rel}: storage key '${m[2]}' must start with '${prefix}'`);
    }
    // a key or key prefix defined as a constant: STORAGE_KEY, RUN_KEY, *_KEY = '...'
    for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]*KEY)\s*[:=]\s*(['"`])([^'"`]+)\2/g)) {
      if (/^#/.test(m[3])) continue;                                   // colour constants in the art files
      if (!m[3].startsWith(prefix)) errors.push(`${rel}: ${m[1]} = '${m[3]}' must start with '${prefix}'`);
      if (m[1] === 'STORAGE_KEY') declared = true;
    }
    // another game's prefix anywhere in the sources
    for (const o of others) {
      if (src.includes(`'${o}`) || src.includes(`"${o}`)) errors.push(`${rel}: uses the prefix '${o}' of another game`);
    }
    // storage APIs that are shared across the origin and cannot be prefixed per game
    if (/\b(indexedDB\.open|navigator\.serviceWorker|document\.cookie|new BroadcastChannel)\b/.test(src)) {
      errors.push(`${rel}: uses an origin-wide API (IndexedDB, service worker, cookie, BroadcastChannel); see README "Storage"`);
    }
  }
  if (!declared) errors.push(`${game}: no STORAGE_KEY constant found (expected one starting with '${prefix}')`);
}

const dupes = games.filter((g, i) => games.findIndex((h) => prefixes[h] === prefixes[g]) !== i);
for (const g of dupes) errors.push(`${g}: prefix '${prefixes[g]}' is also another game's prefix`);

// the kit (shared/) owns the prefix arcade.: its keys are the same in every game on purpose (language, perf, stats);
// it must not touch a game's prefix, and no game may be called "arcade"
if (games.includes('arcade')) errors.push(`a game cannot be called 'arcade': that prefix belongs to the kit (shared/)`);
if (existsSync(join(root, 'shared'))) {
  for (const file of files(join(root, 'shared'))) {
    const src = readFileSync(file, 'utf8'), rel = file.slice(root.length + 1);
    for (const g of games) if (src.includes(`'${prefixes[g]}`) || src.includes(`"${prefixes[g]}`)) errors.push(`${rel}: uses the prefix '${prefixes[g]}' of a game`);
    for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*(['"`])([^'"`]+)\1/g)) {
      if (!m[2].startsWith('arcade.')) errors.push(`${rel}: storage key '${m[2]}' must start with 'arcade.'`);
    }
  }
}

for (const g of games) console.log(`${g}: ${prefixes[g]}*`);
console.log('shared (the kit): arcade.*');
if (errors.length) {
  console.error('\nstorage check failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('storage keys are separate per game');
