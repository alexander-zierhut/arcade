// tests/levels.test.js: the 500 fixed levels (plan 5.6, 5.7, 7.3 and the 2026-11-06 difficulty curve): valid, solvable,
// certified, on schedule, hard where the curve says so, reproducible from the seed tables (src/levels/seeds.js for
// 1-100, scripts/level-plans/*.json for 101-500) and scripts/level-curve.mjs.
// Runtime budget: scripts/gen-levels.mjs certifies all 500 levels every time it runs. The suite re-validates all 500
// (cheap), re-solves and re-certifies a deterministic subset (1-100, every 7th of 101-500, every 25th) and regenerates a
// fixed sample of 8 levels from the tables (a whole candidate search each).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const config = require('../src/config.js');
const model = require('../src/engine/model.js');
const rules = require('../src/engine/rules.js');
const layouts = require('../src/levels/layouts.js');
const solver = require('../src/gen/solver.js');
const bot = require('../src/gen/bot.js');
const gen = require('../src/gen/generator.js');
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
const BELOW = 0.3;                                               // gen-levels.mjs accepts a level this far under its window
let curve = null;
async function curveMod() { return curve || (curve = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'level-curve.mjs')).href)); }

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

test('levels: all 500 levels are valid, with exactly 4 pieces per kind, and nothing is hopeless at the start', () => {
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
    assert.deepEqual(rules.deadKinds(model.parse(level, { layout })), [], label + ' is not hopeless at the start');
    // every frozen box has a plain neighbour (the ice bug of the first beta)
    st.boxes.forEach((b, bi) => {
      if (!b.ice) return;
      assert.ok(st.neighbours[bi].some((nb) => !model.isCovered(st.boxes[nb]) && !st.boxes[nb].oneway), label + ': frozen box ' + b.id + ' has no plain neighbour');
    });
  }
});

test('levels: solvable and certified by the tick-accurate bot (1-100, every 7th of 101-500, every 25th)', () => {
  const t0 = Date.now(), ids = levels.filter((l) => l.id <= 100 || (l.id - 101) % 7 === 0 || l.id % 25 === 0).map((l) => l.id);
  assert.ok(ids.length >= 160, 'sample size ' + ids.length);
  for (const id of ids) {
    const label = 'level ' + id, { solve, cert } = check(levels[id - 1]);
    assert.equal(solve.solvable, true, label + ' solvable');
    assert.equal(cert.won, true, label + ' certified: ' + (cert && cert.reason));
  }
  console.log('# ' + ids.length + ' levels solved and certified in ' + (Date.now() - t0) + ' ms');
});

test('levels: the plates and the bands (N >= 4 always, N = 4 only from level 60, structure in the tier band)', () => {
  for (const level of levels) {
    const band = config.TIERS[level.tier], label = 'level ' + level.id;
    assert.ok(band, label + ' tier');
    assert.ok(level.N >= 4, label + ' N');
    if (level.N === 4) assert.ok(level.id >= 60, label + ' has N = 4 before level 60');
    assert.ok(level.N >= band.N[0] && level.N <= band.N[1], label + ' N in the tier band');
    if (level.id > 1) {
      assert.ok(level.kinds >= band.kinds[0] && level.kinds <= band.kinds[1], label + ' kinds in the tier band');
      const extra = level.boxes.length - level.kinds;
      assert.ok(extra >= band.extraBoxes[0] && extra <= band.extraBoxes[1], label + ' boxes in the tier band');
    }
  }
});

test('levels: every level follows the difficulty curve (tier, hardness window, nothing hidden at the top)', async () => {
  const { target } = await curveMod();
  let prevLo = -1;
  for (const level of levels) {
    const t = target(level.id), label = 'level ' + level.id;
    assert.equal(level.tier, t.tier, label + ' tier of the curve');
    assert.equal(typeof level.hard, 'number', label + ' carries its hardness');
    assert.ok(level.hard >= t.hard[0] - BELOW, label + ' hardness ' + level.hard + ' under its window ' + t.hard.join('-'));
    if (!t.hardest) assert.ok(level.hard <= t.hard[1] + BELOW, label + ' hardness ' + level.hard + ' over its window ' + t.hard.join('-'));
    if (t.noHidden) assert.equal(mechsOf(level).indexOf('hidden'), -1, label + ' has a hidden piece at the top');
    if (!t.spike && !t.lesson && level.id % 10 !== 0) { assert.ok(t.hard[0] >= prevLo - 1e-9 || level.id <= 16, label + ' the floor never drops (except after a spike, a lesson or a bump)'); prevLo = t.hard[0]; }
  }
  // the curve itself: a gentle start, a steep middle, brutal spikes
  const H = (id) => levels[id - 1].hard;
  assert.ok(H(1) <= 0.4 && H(2) <= 0.5 && H(3) <= 0.5, 'levels 1-3 are nearly trivial');
  assert.ok(levels.slice(0, 15).every((l) => l.hard <= 1.1), 'levels 1-15 stay gentle');
  const mean = (a, b) => levels.slice(a - 1, b).reduce((s, l) => s + l.hard, 0) / (b - a + 1);
  assert.ok(mean(51, 100) > mean(1, 50) + 0.5, 'the second fifty is clearly harder than the first');
  assert.ok(mean(201, 300) > mean(101, 200), '201-300 harder than 101-200');
  assert.ok(mean(401, 500) > mean(301, 400), '401-500 harder than 301-400');
  assert.ok(mean(101, 500) >= 2.0, 'from level 100 on a random tapper wins about one game in a hundred or fewer (mean H ' + mean(101, 500).toFixed(2) + ')');
  for (let id = 125; id <= 475; id += 25) assert.ok(H(id) >= 3.0 && H(id) > H(id - 1) && H(id) > H(id + 1), 'spike ' + id + ' (H ' + H(id) + ') towers over its neighbours');
  for (let id = 497; id <= 500; id++) assert.ok(H(id) >= 4.0, 'the final level ' + id + ' (H ' + H(id) + ') is one of the hardest');
  assert.ok(levels.filter((l) => l.hard >= 4).length >= 10, 'at least ten levels with a random win chance of one in ten thousand or less');
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
  // the plans' allow lists are honest (a level uses only what its entry allows), except where the curve opens everything
  return curveMod().then(({ target }) => {
    levels.slice(100).forEach((l, i) => {
      const e = plan[i], t = target(l.id);
      if (t.fullAllow) return;
      for (const m of mechsOf(l)) assert.ok(e.allow.indexOf(m) >= 0, 'level ' + l.id + ' uses ' + m + ' but its entry does not allow it');
    });
  });
});

test('levels: the first levels are small (level 1 nearly trivial, 2-3 short) and the lessons are short', () => {
  assert.ok(check(levels[0]).solve.moves.length <= 4, 'level 1 solves in at most 4 moves');
  assert.ok(levels[0].kinds <= 4 && levels[0].boxes.length <= 6);
  assert.ok(check(levels[1]).solve.moves.length <= 8);
  assert.ok(check(levels[2]).solve.moves.length <= 8);
  for (const id of [6, 12, 18, 28, 35, 42]) assert.ok(check(levels[id - 1]).solve.moves.length <= 18, 'lesson ' + id);
  // the layouts alternate: both are used, never more than four of the same in a row
  let run = 1, worst = 1;
  for (let i = 1; i < 100; i++) {
    run = levels[i].layout === levels[i - 1].layout ? run + 1 : 1;
    worst = Math.max(worst, run);
  }
  assert.ok(worst <= 4, 'longest run of one layout: ' + worst);
  for (const name of ['ring-2col', 'counter']) assert.ok(hundred.filter((l) => l.layout === name).length >= 30, name + ' is used a lot');
});

test('levels: the stored hardness is the analyser\'s (12 sampled levels)', () => {
  for (const id of [1, 20, 60, 100, 150, 222, 275, 300, 350, 420, 475, 500]) {
    const level = levels[id - 1], h = gen.hardness(level, layouts[level.layout]).H;
    assert.ok(Math.abs(h - level.hard) < 1e-9, 'level ' + id + ': stored ' + level.hard + ', analysed ' + h);
  }
});

test('levels: regenerating 8 sampled levels (of 1-500) from the seed tables gives identical data (hand edits fail here)', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'gen-levels.mjs')).href);
  const sample = [1, 6, 42, 77, 140, 263, 388, 431];      // early, lessons, and a level of every plan file (the spikes search 200 candidates: too slow here)
  const t0 = Date.now();
  for (const id of sample) {
    const entry = table[id - 1], g = mod.build(entry);
    assert.ok(g, 'level ' + id + ' regenerates');
    assert.equal(mod.problem(entry, g), null, 'level ' + id + ' is acceptable for its table entry');
    assert.deepEqual(g.level, levels[id - 1], 'level ' + id + ' differs from the seed table: edit seeds.js / the level plan and run scripts/gen-levels.mjs');
  }
  console.log('# regenerated ' + sample.length + ' levels in ' + (Date.now() - t0) + ' ms');
});
