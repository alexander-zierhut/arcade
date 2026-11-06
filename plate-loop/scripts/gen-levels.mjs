// scripts/gen-levels.mjs: generates the 500 fixed levels (dev only, never run at play time).
//   node scripts/gen-levels.mjs                 all 500 levels (writes both level files and the seed tables)
//   node scripts/gen-levels.mjs --only 301-400  one range, nothing written (a dry run; seeds are still reported)
//   node scripts/gen-levels.mjs --range 401-500 one range regenerated and written, every other level kept as committed
// The seed tables are src/levels/seeds.js (1-100: id, seed, allow, layout) and scripts/level-plans/*.json (101-500: id,
// seed, allow, layout, note). The difficulty of every level comes from scripts/level-curve.mjs (structure tier and a
// hardness window); the generator searches candidates for the window (generator.generate with `hardness`), the
// tick-accurate bot certifies the result, and problem() checks the schedule (plan 5.6). A seed whose search misses is
// bumped (seed+1, ...) and the seed that worked is written back, so the tables stay reproducible: build(entry) with the
// table's seed always gives the committed level (tests/levels.test.js checks a sample). The tier of a table entry is
// written back from the curve too (the tables are the record, the curve is the source).
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { target, INTRO, LESSONS, LOOK_INDEX } from './level-curve.mjs';

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

const BUMPS = 6;                      // seeds tried per level (each one is a whole candidate search)
const BELOW = 0.3;                    // a level may end this far below its hardness window when the search found nothing better
const MAX_KINDS = { 1: 4, 2: 4, 3: 5, 4: 5, 5: 6 };  // the first five levels stay small
const MAX_MOVES = { 1: 4, 2: 8, 3: 8 };
const MIN_N = { 1: 9, 2: 9, 3: 9 };
const LESSON_MAX_MOVES = 18;          // a lesson level shows its mechanic without a long solve

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

// the allowed mechanics of an entry under its curve target (nothing hidden at the top)
const ALL_MECHS = ['hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'];
function allowOf(e) {
  const t = target(e.id), base = t.fullAllow ? ALL_MECHS : e.allow;
  return t.noHidden ? base.filter((m) => m !== 'hidden') : base.slice();
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
    const level = { id: e.id, tier: 'easy', seed, layout: layout.name, dir, N, kinds: K, boxes: pl.boxes };
    if (model.validate(level, { layout }).length) continue;
    const sol = solver.solve(level, { layout, maxNodes: 40000, improve: 3000 });
    if (!sol.solvable || sol.moves.length > MAX_MOVES[e.id]) continue;
    const metrics = gen.metrics(level, sol.moves, layout);
    if (!gen.inBand(Object.assign({}, metrics, { kinds: 4 }), 'easy', e.allow)) continue;   // 3 kinds: one under the easy band, on purpose
    const h = gen.hardness(level, layout);
    level.hard = h.H; level.h = h.h;
    return { level, solution: sol.moves, metrics, attempts: j + 1, hard: h.H, h: h.h };
  }
  return null;
}

// build(entry) -> the generator's result for a table entry under its curve target, or null. Deterministic.
function build(e) {
  if (e.id === 1) return buildTiny(e);
  const t = target(e.id);
  let g;
  try {
    g = gen.generate({ tier: t.tier, seed: e.seed, allow: allowOf(e), layout: e.layout, id: e.id, hardness: t.hard, look: t.look, candidates: t.candidates, hardest: t.hardest });
  } catch (err) { return null; }   // e.g. 13 boxes on a 12-slot layout
  return g || null;
}

// null if the level is acceptable for its table entry, else the reason
function problem(e, g) {
  const level = g.level, layout = layouts[level.layout], m = g.metrics, t = target(e.id);
  if (level.tier !== t.tier) return 'tier';
  if (level.layout !== e.layout) return 'layout';
  const check = Object.assign({}, m, e.id === 1 ? { kinds: 4 } : {});
  if (!gen.inBand(check, t.tier, allowOf(e))) return 'band ' + JSON.stringify(m);
  const errs = model.validate(level, { layout });
  if (errs.length) return 'invalid ' + errs[0];
  if (level.N < 4 || (level.N === 4 && e.id < 60)) return 'N=' + level.N + ' before 60';
  if (typeof level.hard !== 'number' || level.hard < 0 || !Array.isArray(level.h)) return 'no hardness';
  const hv = level.h[LOOK_INDEX[t.look] || 0];
  if (hv < t.hard[0] - BELOW) return 'too easy: H' + t.look + ' ' + hv + ' for ' + t.hard.join('-');
  if (!t.hardest && hv > t.hard[1] + BELOW) return 'too hard: H' + t.look + ' ' + hv + ' for ' + t.hard.join('-');
  const mechs = mechsOf(level);
  for (const k of mechs) if (allowOf(e).indexOf(k) < 0 || INTRO[k] > e.id) return k + ' not introduced yet';
  if (t.noHidden && mechs.indexOf('hidden') >= 0) return 'hidden piece at the top';
  for (const k of Object.keys(INTRO)) if (INTRO[k] === e.id && mechs.indexOf(k) < 0) return 'lesson level lacks ' + k;
  if (e.id < 6 && mechs.length) return 'modifiers in 1-5';
  if (e.id === 6 && !(m.hiddenShare > 0)) return 'level 6 needs hidden pieces';
  if (t.lesson && m.moves > LESSON_MAX_MOVES) return 'lesson with ' + m.moves + ' moves';
  if (MAX_KINDS[e.id] && level.kinds > MAX_KINDS[e.id]) return 'too many kinds';
  if (MAX_MOVES[e.id] && m.moves > MAX_MOVES[e.id]) return 'too many moves (' + m.moves + ')';
  if (MIN_N[e.id] && level.N < MIN_N[e.id]) return 'N too small';
  if (e.id === 1 && (level.kinds !== 3 || level.boxes.length !== 5 || m.emptyBoxes !== 2)) return 'level 1 shape';
  if (e.id === 35) {                                      // the ice lesson: a single frozen box
    const frozen = level.boxes.filter((b) => b.mods && b.mods.ice).length;
    if (frozen !== 1) return 'ice lesson with ' + frozen + ' frozen boxes';
  }
  const c = bot.certify(level, g.solution, { layout });
  if (!c.won) return 'certify: ' + c.reason;
  return null;
}

export { build, problem, mechsOf, allowOf, INTRO, LESSONS };

// ---------------------------------------------------------------- the tables

const planDir = join(root, 'scripts', 'level-plans');
const planFiles = () => readdirSync(planDir).filter((f) => /^\d+-\d+\.json$/.test(f)).sort();
const planText = (arr) => '[\n  ' + arr.map((e) => JSON.stringify(e)).join(',\n  ') + '\n]\n';

function seedsText(list) {
  const entry = (e) => '    ' + '{ id: ' + e.id + ', tier: ' + JSON.stringify(e.tier).replace(/"/g, "'") + ', seed: ' + e.seed +
    ', allow: [' + e.allow.map((a) => "'" + a + "'").join(', ') + '], layout: ' + "'" + e.layout + "'" + ' }';
  return `// src/levels/seeds.js: the seed table of the first 100 fixed levels (source of truth; scripts/gen-levels.mjs reads it,
  // generates levels-001-100.js from it, and writes back the seed that worked if one had to be bumped; the tier comes
  // from scripts/level-curve.mjs and is written back too)
  (function (root) {
    'use strict';
    var PL = root.PlateLoop = root.PlateLoop || {};

    PL.seeds = [
  ${list.map(entry).join(',\n')}
    ];
    if (typeof module !== 'undefined' && module.exports) module.exports = PL.seeds;
  })(typeof window !== 'undefined' ? window : globalThis);
  `;
}

function levelsText(list, which, date) {
  const head = which === 'first'
    ? `// src/levels/levels-001-100.js: the fixed levels 1-100, GENERATED by scripts/gen-levels.mjs from src/levels/seeds.js and
// scripts/level-curve.mjs. Do not edit by hand.`
    : `// src/levels/levels-101-500.js: the fixed levels 101-500, GENERATED by scripts/gen-levels.mjs from scripts/level-plans/*.json
// and scripts/level-curve.mjs. Do not edit by hand.`;
  const body = which === 'first'
    ? `  PL.levels = [\n${list.map((l) => '    ' + JSON.stringify(l)).join(',\n')}\n  ];\n  PL.levelsMeta = { generated: '${date}', count: ${list.length} };`
    : `  PL.levels = (PL.levels || []).concat([\n${list.map((l) => '    ' + JSON.stringify(l)).join(',\n')}\n  ]);\n  PL.levelsMeta = { generated: '${date}', count: 500 };`;
  return `${head}
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

${body}
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.levels;
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

function writeIfChanged(path, text, keepDate) {
  let old = ''; try { old = readFileSync(path, 'utf8'); } catch (e) { /* first run */ }
  if (keepDate) {
    const oldDate = (old.match(/generated: '(\d{4}-\d{2}-\d{2})'/) || [])[1];
    if (oldDate && text.replace(/generated: '\d{4}-\d{2}-\d{2}'/, `generated: '${oldDate}'`) === old) text = old;
  }
  if (text !== old) { writeFileSync(path, text); console.log('wrote ' + path.replace(root + '/', '')); return true; }
  console.log(path.replace(root + '/', '') + ' unchanged');
  return false;
}

function main() {
  const oi = process.argv.indexOf('--only'), ri = process.argv.indexOf('--range');
  const only = oi >= 0 ? process.argv[oi + 1].split('-').map(Number) : ri >= 0 ? process.argv[ri + 1].split('-').map(Number) : null;
  const write = oi < 0;                                     // --range writes (levels outside it are kept), --only never writes
  const t0 = Date.now(), rows = [], levels = [], failures = [], bumped = [], outside = [];
  let committed = [];
  if (ri >= 0) { require(src('levels/levels-001-100.js')); committed = require(src('levels/levels-101-500.js')); }
  const plans = planFiles().map((f) => ({ file: f, path: join(planDir, f), before: readFileSync(join(planDir, f), 'utf8') }));
  for (const p of plans) p.plan = JSON.parse(p.before);
  const tables = [{ kind: 'seeds', list: seeds }].concat(plans.map((p) => ({ kind: p.file, list: p.plan })));
  for (const tb of tables) {
    for (const e of tb.list) {
      if (only && (e.id < only[0] || e.id > only[1])) { if (write && committed[e.id - 1]) levels.push(committed[e.id - 1]); continue; }
      const t = target(e.id), tl = Date.now();
      let g = null, why = '', tried = 0, best = null, bestWhy = '';
      for (let b = 0; b < BUMPS; b++) {
        const trial = Object.assign({}, e, { seed: e.seed + b });
        tried++;
        const cand = build(trial);
        if (!cand) { why = 'generator gave up'; continue; }
        const p = problem(trial, cand);
        if (p) {
          why = p;
          // a search that ended below its window is the best fallback when no later seed does better
          if (/^too easy/.test(p) && (!best || cand.hard > best.cand.hard)) { best = { cand, trial, tried }; bestWhy = p; }   // cand.hard is the H of the target's lookahead
          continue;
        }
        g = cand; break;
      }
      if (!g && best) { g = best.cand; tried = best.tried; outside.push(e.id + ' (' + bestWhy + ')'); console.log('level ' + e.id + ': kept the hardest search result, ' + bestWhy); }
      if (!g) { failures.push(e.id + ': ' + why); console.log('FAIL level ' + e.id + ' (' + t.tier + ', ' + e.layout + '): ' + why); continue; }
      if (tried > 1) { bumped.push(e.id); console.log('seed of level ' + e.id + ' bumped ' + e.seed + ' -> ' + (e.seed + tried - 1)); e.seed += tried - 1; }
      e.tier = g.level.tier;
      levels.push(g.level);
      rows.push([e.id, g.level.tier, g.level.layout, g.level.N, g.level.kinds, g.level.boxes.length, g.metrics.moves, g.level.h.map((x) => x.toFixed(1)).join('/'), 'k' + t.look + ' ' + t.hard.join('-') + (t.hardest ? '*' : ''),
        mechsOf(g.level).join('+') || '-', (g.candidates || g.attempts || 1) + (tried > 1 ? '+' + (tried - 1) : ''), Date.now() - tl]);
      console.log('level ' + e.id + ' ' + g.level.tier + ' H' + t.look + ' ' + g.level.h[LOOK_INDEX[t.look] || 0].toFixed(2) + ' (' + t.hard.join('-') + ') h ' + g.level.h.join('/') + ' ' + (Date.now() - tl) + ' ms');
    }
  }

  const head = ['id', 'tier', 'layout', 'N', 'kinds', 'boxes', 'moves', 'H0/2/4/6/8', 'window', 'mods', 'cands', 'ms'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(head));
  for (const r of rows) console.log(fmt(r));
  const tiers = {};
  rows.forEach((r) => {
    const t = tiers[r[1]] = tiers[r[1]] || { n: 0, N: [9, 0], moves: 0, H: 0 };
    t.n++; t.N = [Math.min(t.N[0], r[3]), Math.max(t.N[1], r[3])]; t.moves += r[6]; t.H += Number(String(r[7]).split('/')[0]);
  });
  for (const k of Object.keys(tiers)) {
    const t = tiers[k];
    console.log(k.padEnd(8) + ' ' + t.n + ' levels, N ' + t.N[0] + '-' + t.N[1] + ', avg moves ' + (t.moves / t.n).toFixed(1) + ', avg H ' + (t.H / t.n).toFixed(2));
  }
  console.log('bumped seeds: ' + bumped.length + (bumped.length ? ' (' + bumped.join(', ') + ')' : ''));
  console.log('below their window: ' + outside.length + (outside.length ? ' (' + outside.join('; ') + ')' : ''));
  console.log((Date.now() - t0) + ' ms');
  if (failures.length) { console.log(failures.length + ' level(s) failed'); process.exit(1); }
  if (!write) { console.log('--only: nothing written'); return; }
  levels.sort((a, b) => a.id - b.id);
  if (levels.length !== 500) { console.log('expected 500 levels, got ' + levels.length); process.exit(1); }

  const date = new Date().toISOString().slice(0, 10);
  writeIfChanged(src('levels/seeds.js'), seedsText(seeds));
  for (const p of plans) writeIfChanged(p.path, planText(p.plan));
  writeIfChanged(src('levels/levels-001-100.js'), levelsText(levels.slice(0, 100), 'first', date), true);
  writeIfChanged(src('levels/levels-101-500.js'), levelsText(levels.slice(100), 'later', date), true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
