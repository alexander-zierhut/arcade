// scripts/gen-levels.mjs: generates the 100 fixed levels from the seed table (dev only, never run at play time).
//   node scripts/gen-levels.mjs
// Reads src/levels/seeds.js, builds every level with the generator, certifies it with the tick-accurate bot,
// checks the introduction schedule (plan 5.6). If a seed yields no acceptable level it tries seed+1, +2, ... and
// writes the seed that worked back into seeds.js, so the table stays reproducible. Writes src/levels/levels-001-100.js.
// Exit code 1 if any level fails.
// Levels 101-500: the four plan files in scripts/level-plans/ are their seed table. Same rule: a seed that gives no acceptable
// level is bumped (seed+1, ...) and the seed that worked is written back into the plan JSON (note kept). Every level is
// certified here. Writes src/levels/levels-101-500.js (PL.levels = PL.levels.concat([...]), PL.levelsMeta.count = 500).
//   node scripts/gen-levels.mjs                 levels 101-500 (default; levels-001-100.js is left alone)
//   node scripts/gen-levels.mjs --only 301-400  just one plan file (no output written, plan seeds are still written back)
//   node scripts/gen-levels.mjs --legacy        regenerate 1-100 from seeds.js (writes seeds.js and levels-001-100.js)
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => join(root, 'src', p);
const config = require(src('config.js'));
const model = require(src('engine/model.js'));
const layouts = require(src('levels/layouts.js'));
const solver = require(src('gen/solver.js'));
const bot = require(src('gen/bot.js'));
const gen = require(src('gen/generator.js'));
const rng = require(src('gen/rng.js'));
const seeds = require(src('levels/seeds.js'));

const BUMPS = { 1: 3000 };                          // seeds tried per level before giving up (default 80)
const BUMPS_DEFAULT = 80;                                   // seeds tried per level before giving up
const INTRO = { hidden: 6, pair: 12, wrap: 18, oneway: 28, ice: 35, lock: 42 };
const MAX_KINDS = { 1: 4, 2: 4, 3: 5, 4: 5, 5: 6 };  // the first five levels stay small
const MAX_MOVES = { 1: 4, 2: 8, 3: 8 };
const MIN_N = { 1: 9, 2: 9, 3: 9 };
const EASY_MAX_MOVES = 16, LESSON_MAX_MOVES = 14;     // an easy level stays short; a lesson level shows its mechanic without a long solve

// the mechanics a level contains, as the how-to cards see them (ui/screens.js mechanics())
function mechsOf(level) {
  const f = {};
  const hid = (p) => { if (typeof p === 'string' && p.charAt(0) === 'h') f.hidden = true; };
  for (const b of level.boxes) {
    const m = b.mods || {};
    if (m.wrap !== undefined && m.wrap !== null && m.wrap !== false) f.wrap = true;
    if (m.ice) f.ice = true;
    if (m.lock) f.lock = true;
    if (m.oneway) f.oneway = true;
    for (const p of b.pieces) { if (Array.isArray(p)) { f.pair = true; hid(p[1]); hid(p[2]); } else hid(p); }
  }
  return Object.keys(INTRO).filter((k) => f[k]);
}

// Level 1 is smaller than the easy band allows (3 kinds, 5 boxes, 2 empty, at most 4 moves): dealt with the generator's own deal() and
// place() but with only a few reverse steps, derived seeds tried in order. Deterministic for the table entry.
function buildTiny(e) {
  const layout = layouts[e.layout], r = rng.create(e.seed);
  for (let j = 0; j < 400; j++) {
    const seed = r.int(2147483647), q = rng.create(seed), K = 3, nb = 5;
    const N = 9 + q.int(2), dir = q.next() < 0.5 ? 'cw' : 'ccw';
    const slots = gen.pickSlots(layout, nb, q);
    const dl = gen.deal({ kinds: K, boxes: nb, empties: [2, 2], oneway: 0, rng: q, minSteps: 2, maxSteps: 12 });
    if (!dl) continue;
    const pl = gen.place({ piles: dl.piles, slots, layout, oneway: [], rng: q, mods: [], hidden: 0, tier: 'easy', kinds: K });
    const level = { id: e.id, tier: e.tier, seed, layout: layout.name, dir, N, kinds: K, boxes: pl.boxes };
    if (model.validate(level, { layout }).length) continue;
    const sol = solver.solve(level, { layout, maxNodes: 40000, improve: 3000 });
    if (!sol.solvable || sol.moves.length > MAX_MOVES[e.id]) continue;
    const metrics = gen.metrics(level, sol.moves, layout);
    if (!gen.inBand(Object.assign({}, metrics, { kinds: 4 }), e.tier, e.allow)) continue;   // 3 kinds: one under the easy band, on purpose
    return { level, solution: sol.moves, metrics, attempts: j + 1 };
  }
  return null;
}

// generate one table entry: the generator, then (extreme levels before 60 only) the plate count raised to entry.N
function build(e) {
  if (e.id === 1) return buildTiny(e);
  let g;
  try { g = gen.generate({ tier: e.tier, seed: e.seed, allow: e.allow, layout: e.layout, id: e.id }); } catch (err) { return null; }   // e.g. 13 boxes on a 12-slot layout
  if (!g) return null;
  const layout = layouts[g.level.layout];
  if (e.N && e.N !== g.level.N) {
    g.level.N = e.N;
    const sol = solver.solve(g.level, { layout, maxNodes: 40000, improve: 3000 });
    if (!sol.solvable) return null;
    g.solution = sol.moves;
    g.metrics = gen.metrics(g.level, g.solution, layout);
  }
  return g;
}

// null if the level is acceptable for its table entry, else the reason
function problem(e, g) {
  const level = g.level, layout = layouts[level.layout], m = g.metrics;
  if (level.tier !== e.tier) return 'tier';
  if (level.layout !== e.layout) return 'layout';
  const check = Object.assign({}, m, { N: e.tier === 'extreme' && e.N ? 4 : m.N }, e.id === 1 ? { kinds: 4 } : {});
  if (!gen.inBand(check, e.tier, e.allow)) return 'band ' + JSON.stringify(m);
  const errs = model.validate(level, { layout });
  if (errs.length) return 'invalid ' + errs[0];
  if (level.N < 4 || (level.N === 4 && e.id < 60)) return 'N=' + level.N + ' before 60';
  if (e.tier === 'extreme' && e.id < 60 && level.N !== 5) return 'N must be 5';
  const mechs = mechsOf(level);
  for (const k of mechs) if (e.allow.indexOf(k) < 0 || INTRO[k] > e.id) return k + ' not introduced yet';
  for (const k of Object.keys(INTRO)) if (INTRO[k] === e.id && mechs.indexOf(k) < 0) return 'lesson level lacks ' + k;
  if (e.id < 6 && mechs.length) return 'modifiers in 1-5';
  if (e.id === 6 && !(m.hiddenShare > 0)) return 'level 6 needs hidden pieces';
  if (e.tier === 'easy' && m.moves > EASY_MAX_MOVES) return 'easy but ' + m.moves + ' moves';
  if (Object.keys(INTRO).some((k) => INTRO[k] === e.id) && m.moves > LESSON_MAX_MOVES) return 'lesson with ' + m.moves + ' moves';
  if (MAX_KINDS[e.id] && level.kinds > MAX_KINDS[e.id]) return 'too many kinds';
  if (MAX_MOVES[e.id] && m.moves > MAX_MOVES[e.id]) return 'too many moves (' + m.moves + ')';
  if (MIN_N[e.id] && level.N < MIN_N[e.id]) return 'N too small';
  if (e.id === 1 && (level.kinds !== 3 || level.boxes.length !== 5 || m.emptyBoxes !== 2)) return 'level 1 shape';
  if (e.id === 35) {                                      // the ice lesson: short, and a single frozen box
    const frozen = level.boxes.filter((b) => b.mods && b.mods.ice).length;
    if (m.moves > 10) return 'ice lesson with ' + m.moves + ' moves';
    if (frozen !== 1) return 'ice lesson with ' + frozen + ' frozen boxes';
  }
  const c = bot.certify(level, g.solution, { layout });
  if (!c.won) return 'certify: ' + c.reason;
  return null;
}

export { build, problem, mechsOf, INTRO };

// ---------------------------------------------------------------- levels 101-500 (plan files)

const planDir = join(root, 'scripts', 'level-plans');
const planFiles = () => readdirSync(planDir).filter((f) => /^\d+-\d+\.json$/.test(f)).sort();
const planText = (arr) => '[\n  ' + arr.map((e) => JSON.stringify(e)).join(',\n  ') + '\n]\n';

function mainLater() {
  const oi = process.argv.indexOf('--only'), only = oi >= 0 ? process.argv[oi + 1] : null;
  const t0 = Date.now(), rows = [], levels = [], failures = [], bumped = [];
  for (const file of planFiles()) {
    if (only && file !== only + '.json') continue;
    const path = join(planDir, file), before = readFileSync(path, 'utf8'), plan = JSON.parse(before);
    for (const e of plan) {
      let g = null, why = '', tried = 0;
      for (let b = 0; b < BUMPS_DEFAULT; b++) {
        const trial = Object.assign({}, e, { seed: e.seed + b });
        tried++;
        const cand = build(trial);
        if (!cand) { why = 'generator gave up'; continue; }
        const p = problem(trial, cand);
        if (p) { why = p; continue; }
        g = cand; break;
      }
      if (!g) { failures.push(e.id + ': ' + why); console.log('FAIL level ' + e.id + ' (' + e.tier + ', ' + e.layout + '): ' + why); continue; }
      if (tried > 1) { bumped.push(e.id); console.log('seed of level ' + e.id + ' bumped ' + e.seed + ' -> ' + (e.seed + tried - 1)); e.seed += tried - 1; }
      levels.push(g.level);
      rows.push([e.id, e.tier, g.level.layout, g.level.N, g.level.kinds, g.level.boxes.length, g.metrics.moves, g.metrics.tightness.toFixed(2),
        mechsOf(g.level).join('+') || '-', g.attempts + (tried > 1 ? '+' + (tried - 1) : '')]);
    }
    const after = planText(plan);
    if (after !== before) { writeFileSync(path, after); console.log(file + ': seeds written back'); }
  }

  const head = ['id', 'tier', 'layout', 'N', 'kinds', 'boxes', 'moves', 'tight', 'mods', 'attempts'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(head));
  for (const r of rows) console.log(fmt(r));
  const tiers = {};
  rows.forEach((r) => {
    const t = tiers[r[1]] = tiers[r[1]] || { n: 0, N: [9, 0], moves: 0, tight: 0 };
    t.n++; t.N = [Math.min(t.N[0], r[3]), Math.max(t.N[1], r[3])]; t.moves += r[6]; t.tight += Number(r[7]);
  });
  for (const k of Object.keys(tiers)) {
    const t = tiers[k];
    console.log(k.padEnd(8) + ' ' + t.n + ' levels, N ' + t.N[0] + '-' + t.N[1] + ', avg moves ' + (t.moves / t.n).toFixed(1) + ', avg tightness ' + (t.tight / t.n).toFixed(2));
  }
  console.log('bumped seeds: ' + bumped.length + (bumped.length ? ' (' + bumped.join(', ') + ')' : ''));
  console.log((Date.now() - t0) + ' ms');
  if (failures.length) { console.log(failures.length + ' level(s) failed'); process.exit(1); }
  if (only) { console.log('--only: levels-101-500.js not written'); return; }
  if (levels.length !== 400) { console.log('expected 400 levels, got ' + levels.length); process.exit(1); }

  const outPath = src('levels/levels-101-500.js');
  const make = (date) => `// src/levels/levels-101-500.js: the fixed levels 101-500, GENERATED by scripts/gen-levels.mjs from scripts/level-plans/*.json. Do not edit by hand.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  PL.levels = (PL.levels || []).concat([
${levels.map((l) => '    ' + JSON.stringify(l)).join(',\n')}
  ]);
  PL.levelsMeta = { generated: '${date}', count: 500 };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.levels;
})(typeof window !== 'undefined' ? window : globalThis);
`;
  let old = ''; try { old = readFileSync(outPath, 'utf8'); } catch (e) { /* first run */ }
  const oldDate = (old.match(/generated: '(\d{4}-\d{2}-\d{2})'/) || [])[1];
  let text = make(new Date().toISOString().slice(0, 10));
  if (oldDate && make(oldDate) === old) text = old;          // nothing but the date would change
  if (text !== old) { writeFileSync(outPath, text); console.log('wrote src/levels/levels-101-500.js (' + levels.length + ' levels)'); }
  else console.log('levels-101-500.js unchanged');
}

function mainLegacy() {
  const rows = [], levels = [], failures = [];
  const t0 = Date.now();
  for (const e of seeds) {
    let g = null, used = e.seed, why = '', tried = 0;
    for (let b = 0; b < (BUMPS[e.id] || BUMPS_DEFAULT); b++) {
      const trial = Object.assign({}, e, { seed: e.seed + b });
      tried++;
      const cand = build(trial);
      if (!cand) { why = 'generator gave up'; continue; }
      const p = problem(trial, cand);
      if (p) { why = p; continue; }
      g = cand; used = trial.seed;
      break;
    }
    if (!g) { failures.push(e.id + ': ' + why); console.log('FAIL level ' + e.id + ' (' + e.tier + '): ' + why); continue; }
    if (used !== e.seed) console.log('seed of level ' + e.id + ' bumped ' + e.seed + ' -> ' + used + ' (' + why + ')');
    e.seed = used;
    levels.push(g.level);
    rows.push([e.id, e.tier, g.level.layout, g.level.N, g.level.kinds, g.level.boxes.length, g.metrics.moves, g.metrics.tightness.toFixed(2),
      mechsOf(g.level).join('+') || '-', g.attempts + (tried > 1 ? '+' + (tried - 1) : '')]);
  }

  const head = ['id', 'tier', 'layout', 'N', 'kinds', 'boxes', 'moves', 'tight', 'mods', 'attempts'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(head));
  for (const r of rows) console.log(fmt(r));

  // per tier summary
  const tiers = {};
  rows.forEach((r) => {
    const t = tiers[r[1]] = tiers[r[1]] || { n: 0, N: [9, 0], moves: 0, tight: 0 };
    t.n++; t.N = [Math.min(t.N[0], r[3]), Math.max(t.N[1], r[3])]; t.moves += r[6]; t.tight += Number(r[7]);
  });
  for (const k of Object.keys(tiers)) {
    const t = tiers[k];
    console.log(k.padEnd(8) + ' ' + t.n + ' levels, N ' + t.N[0] + '-' + t.N[1] + ', avg moves ' + (t.moves / t.n).toFixed(1) + ', avg tightness ' + (t.tight / t.n).toFixed(2));
  }
  console.log((Date.now() - t0) + ' ms');

  if (failures.length) { console.log(failures.length + ' level(s) failed'); process.exit(1); }

  // seeds.js (only rewritten when it changed)
  const entry = (e) => '    ' + '{ id: ' + e.id + ', tier: ' + JSON.stringify(e.tier).replace(/"/g, "'") + ', seed: ' + e.seed +
    ', allow: [' + e.allow.map((a) => "'" + a + "'").join(', ') + '], layout: ' + "'" + e.layout + "'" + (e.N ? ', N: ' + e.N : '') + ' }';
  const seedsText = `// src/levels/seeds.js: the seed table of the 100 fixed levels (source of truth; scripts/gen-levels.mjs reads it,
  // generates levels-001-100.js from it, and writes back the seed that worked if one had to be bumped)
  (function (root) {
    'use strict';
    var PL = root.PlateLoop = root.PlateLoop || {};

    PL.seeds = [
  ${seeds.map(entry).join(',\n')}
    ];
    if (typeof module !== 'undefined' && module.exports) module.exports = PL.seeds;
  })(typeof window !== 'undefined' ? window : globalThis);
  `;
  const seedsPath = src('levels/seeds.js');
  let old = ''; try { old = readFileSync(seedsPath, 'utf8'); } catch (e) { /* first run */ }
  if (old !== seedsText) { writeFileSync(seedsPath, seedsText); console.log('seeds.js rewritten'); }

  const date = new Date().toISOString().slice(0, 10);
  const out = `// src/levels/levels-001-100.js: the 100 fixed levels, GENERATED by scripts/gen-levels.mjs from src/levels/seeds.js. Do not edit by hand.
  (function (root) {
    'use strict';
    var PL = root.PlateLoop = root.PlateLoop || {};

    PL.levels = [
  ${levels.map((l) => '    ' + JSON.stringify(l)).join(',\n')}
    ];
    PL.levelsMeta = { generated: '${date}', count: ${levels.length} };
    if (typeof module !== 'undefined' && module.exports) module.exports = PL.levels;
  })(typeof window !== 'undefined' ? window : globalThis);
  `;
  writeFileSync(src('levels/levels-001-100.js'), out);
  console.log('wrote src/levels/levels-001-100.js (' + levels.length + ' levels)');

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.indexOf('--legacy') >= 0) mainLegacy(); else mainLater();
}
