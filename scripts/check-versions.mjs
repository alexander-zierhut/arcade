#!/usr/bin/env node
// A game's version lives in several places that must agree. package.json is the source of truth (release.sh
// names the zip and dist/VERSION.txt from it); every other place is listed in RULES below, plus the two places
// every game has through the arcade kit (KIT_PLACES: the Arcade.init line, and a news.js entry). This script
// fails when one of them disagrees, when the progress-export fixture for the current version is missing, or when
// the news entry for the version is missing a language. It runs in CI (see .github/workflows/ci.yml) and by hand:
//   node scripts/check-versions.mjs
// scripts/bump-version.mjs imports RULES from here, so a place listed once is both checked and bumped.
// A third game needs at most one entry in RULES (or none, if package.json is its only place).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Per game: places that carry the version besides package.json. `re` has ONE capture group, the version
// string; `required: false` skips the place when the file or the pattern is absent (a game without it).
// `fixture` switches on the supermarket-sorter export fixture. Every game also has the two places of the arcade
// kit (docs/GAME-SPEC.md), checked below for all games: the `Arcade.init({ ... version: 'x.y.z' })` line in
// index.html and an entry for the version in news.js with a German and an English text.
export const RULES = {
  'supermarket-sorter': {
    places: [
      { file: 'src/config.js', re: /(?<![A-Z_])VERSION:\s*'([^']+)'/, label: 'src/config.js' },
    ],
    fixture: 'tests/fixtures/export-v{v}.json',
  },
  'cocktail-merge': { places: [] },        // package.json is the only place (src/config.js has RULES_VERSION only)
  'penguin-march': {
    places: [
      { file: 'src/config.js', re: /(?<![A-Z_])VERSION:\s*'([^']+)'/, label: 'src/config.js' },
      { file: 'index.html', re: /class="version-no">v([^<]+)</, label: 'index.html title' },
    ],
  },
};
export const KIT_PLACES = [
  { file: 'index.html', re: /Arcade\.init\(\{[^}]*\bversion:\s*'([^']+)'/, label: 'Arcade.init' },
];

/** newsOf(game) -> the parsed news.js list (window.ARCADE_NEWS = [...]); throws when the file is not that shape. */
export function newsOf(game) {
  const src = readFileSync(join(root, game, 'news.js'), 'utf8');
  const m = src.match(/window\.ARCADE_NEWS\s*=\s*(\[[\s\S]*\]);/);
  if (!m) throw new Error('news.js must be `window.ARCADE_NEWS = [ ... ];` with a JSON array');
  const list = JSON.parse(m[1]);
  if (!Array.isArray(list)) throw new Error('news.js: not an array');
  return list;
}

export function games() {
  return readdirSync(root).filter((n) => existsSync(join(root, n, 'scripts', 'release.sh'))).sort();
}

export const pkgVersion = (game) => JSON.parse(readFileSync(join(root, game, 'package.json'), 'utf8')).version;

/** Check every game; returns { lines, errors }. */
export function check() {
  const lines = [], errors = [];
  for (const game of games()) {
    const rules = RULES[game] || { places: [] };
    let v;
    try { v = pkgVersion(game); } catch (e) { errors.push(`${game}: package.json unreadable (${e.message})`); continue; }
    if (!/^\d+\.\d+\.\d+$/.test(String(v))) { errors.push(`${game}: package.json version '${v}' is not x.y.z`); continue; }
    const ok = ['package.json'];
    for (const p of rules.places.concat(KIT_PLACES)) {
      const path = join(root, game, p.file);
      if (!existsSync(path)) { if (p.required !== false) errors.push(`${game}/${p.file}: file missing`); continue; }
      const m = readFileSync(path, 'utf8').match(p.re);
      if (!m) { if (p.required !== false) errors.push(`${game}/${p.file}: no version found (pattern ${p.re})`); continue; }
      if (m[1] !== v) errors.push(`${game}/${p.file}: says ${m[1]}, package.json says ${v}`);
      else ok.push(p.label);
    }
    if (rules.fixture) {
      const rel = rules.fixture.replace('{v}', v), path = join(root, game, rel);
      if (!existsSync(path)) errors.push(`${game}/${rel}: missing (add the export fixture for ${v}; scripts/bump-version.mjs copies the previous one)`);
      else {
        try {
          const f = JSON.parse(readFileSync(path, 'utf8'));
          if (f.version !== v) errors.push(`${game}/${rel}: its "version" is ${f.version}, expected ${v}`);
          else ok.push('fixture ok');
        } catch (e) { errors.push(`${game}/${rel}: does not parse (${e.message})`); }
      }
    }
    // news.js: an entry for this version with a text in both languages (the game's news card and the selector show it)
    if (!existsSync(join(root, game, 'news.js'))) errors.push(`${game}/news.js: missing (docs/GAME-SPEC.md "News")`);
    else {
      try {
        const entry = newsOf(game).find((e) => e && e.version === v);
        if (!entry) errors.push(`${game}/news.js: no entry for ${v} (write what changed, de and en)`);
        else {
          let fine = true;
          for (const l of ['de', 'en']) if (typeof entry[l] !== 'string' || !entry[l].replace(/<[^>]*>/g, '').trim()) { errors.push(`${game}/news.js: the ${v} entry has no ${l} text`); fine = false; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) { errors.push(`${game}/news.js: the ${v} entry needs a date (YYYY-MM-DD)`); fine = false; }
          if (fine) ok.push('news de+en');
        }
      } catch (e) { errors.push(`${game}/news.js: ${e.message}`); }
    }
    lines.push(`${game}: ${v} (${ok.join(', ')})`);
  }
  return { lines, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { lines, errors } = check();
  for (const l of lines) console.log(l);
  if (errors.length) {
    console.error('\nversion check failed:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('versions agree in every place');
}
