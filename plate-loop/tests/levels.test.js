// tests/levels.test.js: the 500 fixed levels (plan 5.6, 5.7, 7.3): valid, solvable, certified, on schedule, reproducible from the seed tables
// (src/levels/seeds.js for 1-100, scripts/level-plans/*.json for 101-500).
// Runtime budget: scripts/gen-levels.mjs certifies all 500 levels with the tick-accurate bot every time it runs. The suite re-validates all
// 500 (cheap: structure, 4 pieces per kind, bands, schedule), but only re-solves and re-certifies a deterministic subset: levels 1-100,
// every 7th level of 101-500 ((id - 101) % 7 === 0, 58 levels) and every extreme level. Regeneration from the seed tables is checked on a
// fixed sample of 10 levels.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const config = require('../src/config.js');
const model = require('../src/engine/model.js');
const layouts = require('../src/levels/layouts.js');
const solver = require('../src/gen/solver.js');
const bot = require('../src/gen/bot.js');
const seeds = require('../src/levels/seeds.js');
const first = require('../src/levels/levels-001-100.js');      // sets PL.levels (1-100); the next file appends 101-500 to it
const levels = require('../src/levels/levels-101-500.js');
const PL = globalThis.PlateLoop;
const planDir = path.join(__dirname, '..', 'scripts', 'level-plans');
const plans = fs.readdirSync(planDir).filter((f) => /^\d+-\d+\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(planDir, f), 'utf8')));
const plan = [].concat(...plans);                                // entries 101..500 of the plan files
const table = seeds.concat(plan);                                // the seed table of all 500 levels
const hundred = levels.slice(0, 100);

const INTRO = { hidden: 6, pair: 12, wrap: 18, oneway: 28, ice: 35, lock: 42 };
const EXTREMES = [25, 50, 75, 100];                // the extremes of 1-100
const isExtremePlanned = (id) => table[id - 1].tier === 'extreme';

// the mechanics of a level as the how-to cards see them (same reading as ui/screens.js mechanics())
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

const certified = {};          // id -> { solve, cert }, filled by the first test and reused (keeps the suite fast)
function check(level) {
  if (!certified[level.id]) {
    const layout = layouts[level.layout], solve = solver.solve(level, { layout });
    certified[level.id] = { solve, cert: solve.solvable ? bot.certify(level, solve.moves, { layout }) : null };
  }
  return certified[level.id];
}

test('levels: 500 levels, ids 1..500 in order, committed with matching seed tables', () => {
  assert.equal(first.length, 100, 'levels-001-100.js alone holds the first 100');
  assert.deepEqual(levels.slice(0, 100), first, 'levels-101-500.js appends to them');
  assert.equal(levels.length, 500);
  assert.deepEqual(levels.map((l) => l.id), Array.from({ length: 500 }, (_, i) => i + 1));
  assert.equal(PL.levels, levels);
  assert.equal(PL.levelsMeta.count, 500);
  assert.match(PL.levelsMeta.generated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(seeds.length, 100);
  assert.equal(plans.length, 4);
  assert.equal(plan.length, 400);
  table.forEach((e, i) => {
    assert.equal(e.id, i + 1);
    assert.equal(levels[i].tier, e.tier, 'level ' + e.id + ' tier follows the seed table');
    assert.equal(levels[i].layout, e.layout, 'level ' + e.id + ' layout follows the seed table');
    assert.ok(Array.isArray(e.allow));
    assert.ok(Number.isInteger(e.seed));
    assert.equal(typeof e.note === 'string' || e.id <= 100, true, 'level ' + e.id + ' keeps its note');
  });
});

test('levels: all 500 levels are valid, with exactly 4 pieces per kind', () => {
  for (const level of levels) {
    const layout = layouts[level.layout], label = 'level ' + level.id;
    assert.ok(layout, label + ' layout');
    assert.deepEqual(model.validate(level, { layout }), [], label + ' valid');
    const st = model.parse(level, { layout, raw: true }), counts = {};
    st.boxes.forEach((b) => {
      assert.ok(b.pieces.length <= 4, label + ' box over four');
      b.pieces.forEach((p) => { counts[p.k] = (counts[p.k] || 0) + 1; });
    });
    assert.equal(Object.keys(counts).length, level.kinds, label + ' kinds');
    for (let k = 0; k < level.kinds; k++) assert.equal(counts[k], 4, label + ' has 4 pieces of kind ' + k);
  }
});

test('levels: solvable and certified by the tick-accurate bot (1-100, every 7th of 101-500, every extreme)', () => {
  const t0 = Date.now(), ids = levels.filter((l) => l.id <= 100 || (l.id - 101) % 7 === 0 || l.tier === 'extreme').map((l) => l.id);
  assert.ok(ids.length >= 160, 'sample size ' + ids.length);
  for (const id of ids) {
    const label = 'level ' + id, { solve, cert } = check(levels[id - 1]);
    assert.equal(solve.solvable, true, label + ' solvable');
    assert.equal(cert.won, true, label + ' certified: ' + (cert && cert.reason));
  }
  console.log('# ' + ids.length + ' levels solved and certified in ' + (Date.now() - t0) + ' ms');
});

test('levels: the plates and the bands (N >= 4 always, N = 4 only from level 60, tier bands except the early extremes)', () => {
  for (const level of levels) {
    const band = config.TIERS[level.tier], label = 'level ' + level.id;
    assert.ok(band, label + ' tier');
    assert.ok(level.N >= 4, label + ' N');
    if (level.N === 4) assert.ok(level.id >= 60, label + ' has N = 4 before level 60');
    if (level.id < 60) assert.ok(level.N >= 5, label);
    const early = level.tier === 'extreme' && level.id < 60;
    if (early) assert.equal(level.N, 5, label + ' early extreme runs with 5 plates');
    else assert.ok(level.N >= band.N[0] && level.N <= band.N[1], label + ' N in the tier band');
    if (level.id > 1) {
      assert.ok(level.kinds >= band.kinds[0] && level.kinds <= band.kinds[1], label + ' kinds in the tier band');
      const extra = level.boxes.length - level.kinds;
      assert.ok(extra >= band.extraBoxes[0] && extra <= band.extraBoxes[1], label + ' boxes in the tier band');
    }
  }
});

test('levels: the tier pattern (1-100: easy start, normal from 8, first hard at 20, extremes exactly at 25/50/75/100, cycle after 50)', () => {
  const tier = (id) => levels[id - 1].tier, levels = hundred;
  for (let id = 1; id <= 7; id++) assert.equal(tier(id), 'easy', 'level ' + id);
  assert.equal(levels.findIndex((l) => l.tier === 'normal') + 1 >= 8, true, 'no normal before 8');
  assert.ok(levels.slice(7, 19).some((l) => l.tier === 'normal'), 'normal appears between 8 and 19');
  assert.equal(levels.findIndex((l) => l.tier === 'hard') + 1, 20, 'the first hard level is 20');
  assert.deepEqual(levels.filter((l) => l.tier === 'extreme').map((l) => l.id), EXTREMES);
  for (let id = 51; id <= 100; id++) {
    if (EXTREMES.indexOf(id) >= 0) continue;
    assert.equal(tier(id), ['easy', 'normal', 'normal', 'hard'][(id - 51) % 4], 'level ' + id + ' follows the 51-100 cycle');
  }
  const count = {};
  levels.forEach((l) => { count[l.tier] = (count[l.tier] || 0) + 1; });
  assert.ok(count.easy >= 20 && count.normal >= 25 && count.hard >= 15 && count.extreme === 4, JSON.stringify(count));
});

test('levels: the tiers of 101-500 are as planned, extremes at every multiple of 25 and at 497-500, never two in a row before that', () => {
  levels.slice(100).forEach((l, i) => {
    assert.equal(l.tier, plan[i].tier, 'level ' + l.id + ' tier as planned');
    assert.equal(plan[i].id, l.id);
  });
  const ext = levels.filter((l) => l.tier === 'extreme').map((l) => l.id);
  for (let id = 25; id <= 500; id += 25) assert.ok(ext.indexOf(id) >= 0, 'extreme at ' + id);
  for (const id of [497, 498, 499, 500]) assert.ok(ext.indexOf(id) >= 0, 'extreme at ' + id);
  assert.deepEqual(ext.filter((id) => id <= 100), EXTREMES);
  ext.forEach((id) => { if (id < 497) assert.ok(ext.indexOf(id - 1) < 0, 'extremes ' + (id - 1) + ' and ' + id + ' in a row'); });
  // every block has all four tiers, and the plans' allow lists are honest (a level uses only what its entry allows)
  [[101, 200], [201, 300], [301, 400], [401, 500]].forEach(([a, b]) => {
    const block = levels.slice(a - 1, b), count = {};
    block.forEach((l) => { count[l.tier] = (count[l.tier] || 0) + 1; });
    assert.equal(block.length, 100);
    for (const t of ['easy', 'normal', 'hard', 'extreme']) assert.ok(count[t] > 0, a + '-' + b + ' has ' + t);
    assert.ok(count.extreme >= 8 && count.easy >= 8, JSON.stringify(count));
  });
  levels.slice(100).forEach((l, i) => {
    const e = plan[i];
    for (const m of mechsOf(l)) assert.ok(e.allow.indexOf(m) >= 0, 'level ' + l.id + ' uses ' + m + ' but its entry does not allow it');
    if (l.tier === 'extreme') assert.equal(l.N, 4, 'extreme level ' + l.id + ' runs with 4 plates');
  });
});

test('levels: the introduction schedule (hidden 6, pairs 12, wraps 18, one-way 28, ice 35, locks 42), nothing before its time', () => {
  for (const level of levels) {
    const mechs = mechsOf(level), label = 'level ' + level.id;
    for (const m of mechs) assert.ok(INTRO[m] <= level.id, label + ' uses ' + m + ' before level ' + INTRO[m]);
    for (const m of Object.keys(INTRO)) if (INTRO[m] === level.id) assert.ok(mechs.indexOf(m) >= 0, label + ' must introduce ' + m);
    if (level.id <= 5) {
      assert.deepEqual(mechs, [], label + ' has no modifiers');
      assert.equal(level.tier, 'easy');
      assert.ok(level.N >= 8 && level.N <= 10, label + ' N');
    }
  }
  // first appearance of each mechanic is its lesson level
  for (const m of Object.keys(INTRO)) {
    const first = levels.find((l) => mechsOf(l).indexOf(m) >= 0);
    assert.equal(first.id, INTRO[m], m + ' first appears at ' + INTRO[m]);
  }
  // level 6: a real hidden piece
  const six = levels[5];
  assert.ok(JSON.stringify(six).indexOf('"h:') >= 0, 'level 6 has a hidden piece');
  // later levels do use the mechanics that were introduced (every one of them somewhere between 51 and 100)
  for (const m of Object.keys(INTRO)) assert.ok(levels.slice(50).some((l) => mechsOf(l).indexOf(m) >= 0), m + ' is used in 51-100');
});

test('levels: the first levels are small (level 1 nearly trivial, 2-3 short) and the lessons are short', () => {
  assert.ok(check(levels[0]).solve.moves.length <= 4, 'level 1 solves in at most 4 moves');
  assert.ok(levels[0].kinds <= 4 && levels[0].boxes.length <= 6);
  assert.ok(check(levels[1]).solve.moves.length <= 8);
  assert.ok(check(levels[2]).solve.moves.length <= 8);
  for (const id of [6, 12, 18, 28, 35, 42]) assert.ok(check(levels[id - 1]).solve.moves.length <= 14, 'lesson ' + id);
  // the layouts alternate: both are used, never more than four of the same in a row
  let run = 1, worst = 1;
  for (let i = 1; i < 100; i++) {
    run = levels[i].layout === levels[i - 1].layout ? run + 1 : 1;
    worst = Math.max(worst, run);
  }
  assert.ok(worst <= 4, 'longest run of one layout: ' + worst);
  for (const name of ['ring-2col', 'counter']) assert.ok(hundred.filter((l) => l.layout === name).length >= 30, name + ' is used a lot');
});

test('levels: regenerating 10 sampled levels (of 1-500) from the seed tables gives identical data (hand edits fail here)', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'gen-levels.mjs')).href);
  const sample = [1, 25, 64, 100, 140, 163, 250, 367, 431, 500];      // early, extremes, and the two levels whose plan seed was bumped
  const t0 = Date.now();
  for (const id of sample) {
    const entry = table[id - 1], g = mod.build(entry);
    assert.ok(g, 'level ' + id + ' regenerates');
    assert.equal(mod.problem(entry, g), null, 'level ' + id + ' is acceptable for its table entry');
    assert.deepEqual(g.level, levels[id - 1], 'level ' + id + ' differs from the seed table: edit seeds.js / the level plan and run scripts/gen-levels.mjs');
  }
  console.log('# regenerated ' + sample.length + ' levels in ' + (Date.now() - t0) + ' ms');
});
