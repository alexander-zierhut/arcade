#!/usr/bin/env node
// Sets a game's version everywhere scripts/check-versions.mjs knows: package.json, the version constants
// and static titles listed in RULES, and (supermarket-sorter) a new progress-export fixture copied from the
// previous one. Then it runs the checker. The what's-new texts are NOT touched; they are written by hand.
//   node scripts/bump-version.mjs <game> <new version>      e.g. supermarket-sorter 0.3.3
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { RULES, games, pkgVersion, root } from './check-versions.mjs';

const [game, next] = process.argv.slice(2);
if (!game || !next || !games().includes(game) || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`usage: node scripts/bump-version.mjs <game> <x.y.z>\ngames: ${games().join(', ')}`);
  process.exit(2);
}
const rules = RULES[game] || { places: [] };
const prev = pkgVersion(game);
if (prev === next) { console.error(`${game} is already at ${next}`); process.exit(2); }
const errors = [], done = [];

/** Replace capture group 1 of re in file; returns false when the pattern does not match. */
function setIn(rel, re) {
  const path = join(root, game, rel), src = readFileSync(path, 'utf8'), m = src.match(re);
  if (!m) return false;
  const at = m.index + m[0].lastIndexOf(m[1]);
  writeFileSync(path, src.slice(0, at) + next + src.slice(at + m[1].length));
  return true;
}

if (setIn('package.json', /"version":\s*"([^"]+)"/)) done.push('package.json'); else errors.push('package.json: no "version" found');
for (const p of rules.places) {
  if (!existsSync(join(root, game, p.file))) continue;
  if (setIn(p.file, p.re)) done.push(p.label); else if (p.required !== false) errors.push(`${p.file}: no version found`);
}
if (rules.fixture) {
  const dir = join(root, game, rules.fixture.replace('{v}', '').replace(/[^/]*$/, ''));
  const target = join(root, game, rules.fixture.replace('{v}', next));
  if (existsSync(target)) done.push('fixture (already there)');
  else {
    const src = join(root, game, rules.fixture.replace('{v}', prev));
    if (!existsSync(src)) errors.push(`previous fixture ${src} missing, add the new one by hand`);
    else {
      const f = JSON.parse(readFileSync(src, 'utf8'));
      f.version = next; f.exportedAt = new Date().toISOString().slice(0, 19);
      if (f.save && typeof f.save.seenVersion === 'string') f.save.seenVersion = next;
      writeFileSync(target, JSON.stringify(f) + '\n');
      done.push(`fixture ${target.slice(dir.length)}`);
    }
  }
}
console.log(`${game}: ${prev} -> ${next} (${done.join(', ')})`);
if (errors.length) { console.error('\nbump problems:\n  ' + errors.join('\n  ')); process.exit(1); }

console.log('\nStill to do by hand:');
if (rules.whatsnew) console.log(`  - write whatsnew_text for ${next} in ${rules.whatsnew}, de AND en (the checker only tests they are non-empty)`);
if (existsSync(join(root, game, 'docs', 'STATUS.md'))) console.log(`  - ${game}/docs/STATUS.md: version and what changed`);
console.log(`  - see ${game}/docs/RELEASE.md for the full checklist\n`);
const r = spawnSync(process.execPath, [join(root, 'scripts', 'check-versions.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
