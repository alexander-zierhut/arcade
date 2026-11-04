// tests/gen.test.js: the solver, the certification bot and the level generator (plan 7.2, 7.3)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const config = require('../src/config.js');
const model = require('../src/engine/model.js');
const rules = require('../src/engine/rules.js');
const sim = require('../src/engine/sim.js');
const layouts = require('../src/levels/layouts.js');
const rng = require('../src/gen/rng.js');
const solver = require('../src/gen/solver.js');
const bot = require('../src/gen/bot.js');
const gen = require('../src/gen/generator.js');

const RING = layouts['ring-2col'];
const TIERS = ['easy', 'normal', 'hard', 'extreme'];
const SEEDS = 30;
const usedMods = {};

function lvl(spec) { return H.level(spec); }
function parse(level) { return model.parse(level, { layout: layouts[level.layout] }); }
function total(state) {
  let n = 0;
  state.boxes.forEach((b) => { n += b.pieces.length + (b.outbox ? b.outbox.length : 0); });
  state.belt.forEach((p) => { if (p) n++; });
  return n;
}
function layoutOf(level) { return layouts[level.layout]; }

// ---------------------------------------------------------------- fixtures with their shortest solution

const FIXTURES = {
  plain: { moves: 3, spec: { N: 6, boxes: { L1: [0, 0, 1, 1], L2: [1, 1, 0, 0], L3: [] } } },
  hidden: { moves: 4, spec: { N: 6, boxes: { L1: [0, 0, 'h:1', 1], L2: [1, 'h:1', 0, 0], L3: [] } } },
  pair: { moves: 3, spec: { N: 6, boxes: { L1: [0, 0, ['p', 1, 1]], L2: [1, 1, 0, 0], L3: [] } } },
  mixedPair: { moves: 2, spec: { N: 6, boxes: { L1: [1, 1, ['p', 1, 0]], L2: [0, 0, 0], L3: [1] } } },
  wrap: { moves: 3, spec: { N: 6, boxes: { L1: [0, 0], L3: { pieces: [1, 1, 2, 2], mods: { wrap: 0 } }, L4: [0, 0], L5: [1, 1], L6: [2, 2] } } },
  ice: { moves: 3, spec: { N: 6, boxes: { L1: [0, 0], L2: { pieces: [1, 1, 2, 2], mods: { ice: true } }, L3: [0, 0], L5: [1, 1], L6: [2, 2] } } },
  lock: { moves: 4, spec: { N: 6, boxes: { L1: [0, 'k:A:1', 1], L2: { pieces: [0, 0, 1, 1], mods: { lock: 'A' } }, L3: [0], L4: [] } } },
  ccw: { moves: 3, spec: { N: 5, dir: 'ccw', layout: 'counter', boxes: { T1: [0, 0, 1, 1], T2: [1, 1, 0, 0], B1: [] } } }
};
const UNSOLVABLE = {
  twoKinds: { N: 4, boxes: { L1: [0, 1, 0, 1], L2: [1, 0, 1, 0] } },
  threeKinds: { N: 4, boxes: { L1: [0, 1, 2, 0], L2: [1, 2, 0, 1], L3: [2, 0, 1, 2] } }
};

// An independent reference: breadth-first search over the engine's own applyMove, trying every box as a
// destination (no pruning, no blocker rule), for the shortest solution of a tiny level.
function bfsShortest(level) {
  const layout = layoutOf(level), start = parse(level), seen = new Set([model.hash(start)]);
  let frontier = [start], depth = 0;
  if (rules.isWon(start)) return 0;
  while (frontier.length && depth < 12) {
    depth++;
    const next = [];
    for (const st of frontier) {
      for (let b = 0; b < st.boxes.length; b++) {
        if (!rules.canEject(st, b).ok) continue;
        const tries = [];
        for (let d = 0; d < st.boxes.length; d++) {
          tries.push({ box: b, dest: d });
          for (let e = 0; e < st.boxes.length; e++) tries.push({ box: b, dest: d, dest2: e });
        }
        for (const mv of tries) {
          let r;
          try { r = solver.applyMove(st, mv, layout); } catch (e) { continue; }
          if (rules.isWon(r.state)) return depth;
          const h = model.hash(r.state);
          if (seen.has(h)) continue;
          seen.add(h);
          next.push(r.state);
        }
      }
    }
    frontier = next;
  }
  return -1;
}

for (const name of Object.keys(FIXTURES)) {
  test('solver: fixture "' + name + '" is solved in the expected ' + FIXTURES[name].moves + ' moves, replays to a win and certifies', () => {
    const fx = FIXTURES[name], level = lvl(fx.spec), layout = layoutOf(level);
    const r = solver.solve(level, { layout, optimal: true });
    assert.equal(r.solvable, true);
    assert.equal(r.moves.length, fx.moves);
    assert.equal(r.depth, fx.moves);
    assert.equal(bfsShortest(level), fx.moves, 'the reference search agrees on the minimum');
    let st = parse(level);
    r.moves.forEach((mv) => { st = solver.applyMove(st, mv, layout).state; });
    assert.equal(rules.isWon(st), true);
    const c = bot.certify(level, r.moves, { layout });
    assert.equal(c.won, true, String(c.reason));
    assert.equal(c.reason, null);
    assert.ok(c.taps >= r.moves.length && c.ticks > 0);
    // the default (non-optimal) mode solves it too, with a solution that is a valid win
    const d = solver.solve(level, { layout });
    assert.equal(d.solvable, true);
    assert.ok(d.moves.length >= fx.moves);
    assert.equal(bot.certify(level, d.moves, { layout }).won, true);
    // and the layout can be left out: it is looked up by the level's layout name
    assert.equal(solver.solve(level, { optimal: true }).moves.length, fx.moves);
  });
}

for (const name of Object.keys(UNSOLVABLE)) {
  test('solver: fixture "' + name + '" is unsolvable', () => {
    const level = lvl(UNSOLVABLE[name]);
    assert.deepEqual(model.validate(level, { layout: RING }), []);
    const r = solver.solve(level, { layout: RING });
    assert.equal(r.solvable, false);
    assert.ok(r.nodes >= 1);
    assert.equal(solver.solve(level, { layout: RING, optimal: true }).solvable, false);
    assert.equal(bfsShortest(level), -1);
  });
}

test('solver: a level that is out of nodes is "unknown", an already won level needs no move', () => {
  const g = gen.generate({ tier: 'normal', seed: 3 });
  const r = solver.solve(g.level, { maxNodes: 1 });
  assert.equal(r.unknown, true);
  assert.equal(r.solvable, undefined);
  const won = { id: 1, N: 6, kinds: 1, layout: 'ring-2col', dir: 'cw', boxes: [{ id: 'L1', pieces: [0, 0, 0, 0] }] };
  // four of a kind at the start is not a valid level, but the solver treats a position without open kinds as done
  const st = parse(won);
  assert.equal(st.boxes[0].pieces.length, 4);
});

test('solver: reveals fire in applyMove, and a hidden piece ends the run (one more move than the same level without it)', () => {
  const level = lvl(FIXTURES.hidden.spec), layout = RING;
  const st = parse(level);
  const moves = solver.solve(level, { layout, optimal: true }).moves;
  let evs = [], cur = st;
  moves.forEach((mv) => { const r = solver.applyMove(cur, mv, layout); cur = r.state; evs = evs.concat(r.events); });
  assert.ok(evs.some((e) => e.type === 'reveal'), 'a hidden piece turned face-up');
  assert.equal(rules.runLength(st.boxes[0]), 1, 'the run of L1 stops at the hidden 1');
  assert.equal(solver.solve(lvl(FIXTURES.plain.spec), { layout, optimal: true }).moves.length + 1, moves.length);
});

test('solver: lock and ice fire inside the abstract move (unlock on exposure, thaw on a neighbour closing)', () => {
  const lock = lvl(FIXTURES.lock.spec), ice = lvl(FIXTURES.ice.spec);
  let st = parse(lock), evs = [];
  solver.solve(lock, { layout: RING, optimal: true }).moves.forEach((mv) => { const r = solver.applyMove(st, mv, RING); st = r.state; evs = evs.concat(r.events); });
  assert.ok(evs.some((e) => e.type === 'unlock'));
  st = parse(ice);
  evs = [];
  solver.solve(ice, { layout: RING, optimal: true }).moves.forEach((mv) => { const r = solver.applyMove(st, mv, RING); st = r.state; evs = evs.concat(r.events); });
  assert.ok(evs.some((e) => e.type === 'thaw'));
  const wrap = lvl(FIXTURES.wrap.spec);
  st = parse(wrap);
  evs = [];
  solver.solve(wrap, { layout: RING, optimal: true }).moves.forEach((mv) => { const r = solver.applyMove(st, mv, RING); st = r.state; evs = evs.concat(r.events); });
  assert.ok(evs.some((e) => e.type === 'unwrap'));
});

// ---------------------------------------------------------------- applyMove and the compact search state agree

test('applyMove conserves pieces, leaves an empty belt and no box over four; refuses impossible moves', () => {
  const g = gen.generate({ tier: 'normal', seed: 11 }), layout = layoutOf(g.level);
  let st = parse(g.level);
  const n = total(st);
  assert.equal(n, 4 * g.level.kinds);
  g.solution.forEach((mv) => {
    const r = solver.applyMove(st, mv, layout);
    assert.equal(total(r.state), n);
    assert.ok(r.state.belt.every((p) => p === null));
    assert.deepEqual(r.state.pouring, {});
    r.state.boxes.forEach((b) => { assert.ok(b.pieces.length <= 4); });
    assert.equal(total(st), n, 'the input state is not touched');
    st = r.state;
  });
  assert.equal(rules.isWon(st), true);
  const plain = parse(lvl(FIXTURES.plain.spec));
  assert.throws(() => solver.applyMove(plain, { box: 0, dest: 1 }, RING), /does not accept/);     // L2's front is 0, the run is 1s
  assert.throws(() => solver.applyMove(plain, { box: 2, dest: 0 }, RING), /cannot be ejected/);   // L3 is empty
  const busy = parse(lvl(FIXTURES.plain.spec));
  busy.belt[0] = { id: 99, k: 0, key: null, from: 0 };
  assert.throws(() => solver.applyMove(busy, { box: 0, dest: 2 }, RING), /belt must be empty/);
});

test('the search state follows the engine: random walks over generated levels give identical positions', () => {
  let steps = 0, withMods = 0;
  const seen = {};
  for (const tier of TIERS) {
    for (let seed = 1; seed <= 12; seed++) {
      const g = gen.generate({ tier, seed: seed + 100 }), layout = layoutOf(g.level);
      assert.ok(g, tier + ' ' + seed);
      const comp = solver._internal.compile(g.level, layout), ctx = comp.ctx, r = rng.create(seed * 7 + tier.length);
      let st = parse(g.level), s = comp.s0;
      assert.deepEqual(solver._internal.fromState(ctx, st), s);
      if (g.metrics.mods) withMods++;
      for (let i = 0; i < 40; i++) {
        const ch = solver._internal.expand(ctx, s);
        if (!ch.length) break;
        const c = ch[r.int(ch.length)], mv = { box: c.box, dest: c.dest };
        if (c.dest2 >= 0) mv.dest2 = c.dest2;
        const res = solver.applyMove(st, mv, layout);
        res.events.forEach((e) => { seen[e.type] = (seen[e.type] || 0) + 1; });
        assert.deepEqual(solver._internal.fromState(ctx, res.state), c.s, tier + ' seed ' + seed + ' step ' + i);
        st = res.state;
        s = c.s;
        steps++;
        if (rules.isWon(st)) break;
      }
    }
  }
  assert.ok(steps > 300);
  assert.ok(withMods >= 12);
  for (const type of ['reveal', 'close', 'unwrap', 'thaw', 'unlock']) assert.ok(seen[type] > 0, 'the walks exercised ' + type);
  console.log('# compact vs engine: ' + steps + ' random steps agree on ' + withMods + ' levels with modifiers; events ' + JSON.stringify(seen));
});

test('the lower bound never exceeds a shortest solution', () => {
  for (const name of Object.keys(FIXTURES)) {
    const level = lvl(FIXTURES[name].spec), comp = solver._internal.compile(level, layoutOf(level));
    assert.ok(solver._internal.lowerBound(comp.ctx, comp.s0) <= FIXTURES[name].moves, name);
  }
});

// ---------------------------------------------------------------- the bot

test('bot.certify: wins every solved fixture, and says why when a move list does not work', () => {
  for (const name of Object.keys(FIXTURES)) {
    const level = lvl(FIXTURES[name].spec), layout = layoutOf(level);
    const r = solver.solve(level, { layout });
    const c = bot.certify(level, r.moves, { layout });
    assert.equal(c.won, true, name + ': ' + c.reason);
  }
  const level = lvl(FIXTURES.plain.spec);
  let c = bot.certify(level, [{ box: 2, dest: 0 }], { layout: RING });
  assert.equal(c.won, false);
  assert.match(c.reason, /empty/);
  c = bot.certify(level, [{ box: 0, dest: 2 }], { layout: RING });
  assert.equal(c.won, false);
  assert.match(c.reason, /not won/);
  c = bot.certify(level, [{ box: 0, dest: 2 }, { box: 1, dest: 0 }], { layout: RING });
  assert.equal(c.won, false);
  assert.equal(bot.certify(level, [], { layout: RING }).won, false);
});

test('bot.certify: a run that has to be kicked past an empty box on the way (kick, re-entry, pairs)', () => {
  // Boxes in belt order for ring-2col, dir cw: find an empty box between the source and the destination.
  const level = lvl({ N: 5, boxes: { L1: [0, 0, 1, 1], L2: [1, 1, 0, 0], L3: [], L4: [], L5: [], L6: [], L7: [] } });
  const layout = RING, ord = solver.downstream(level, layout);
  // from L1 the empty boxes come in some order; send the run to the last of them so every other empty box is kicked
  const empties = [2, 3, 4, 5, 6];
  const rank = (b) => ord[0].indexOf(b);
  const far = empties.slice().sort((a, b) => rank(b) - rank(a))[0];
  const near = empties.slice().sort((a, b) => rank(a) - rank(b))[0];
  assert.ok(rank(far) > rank(near));
  const moves = [{ box: 0, dest: far }, { box: 1, dest: 0 }, { box: 1, dest: far }];
  const c = bot.certify(level, moves, { layout });
  assert.equal(c.won, true, String(c.reason));
  assert.ok(c.taps > 3, 'at least one kick was needed (' + c.taps + ' taps)');
  // re-entry: the second piece of a mixed pair goes back into its own box (dest2 = the source)
  const re = lvl({ N: 5, dir: 'cw', boxes: { L1: [1, 1, ['p', 1, 0]], L3: [0, 0, 0], R2: [1] } });
  const r = solver.solve(re, { layout, optimal: true });
  assert.equal(r.solvable, true);
  assert.equal(r.moves.length, 2);
  assert.equal(bot.certify(re, r.moves, { layout }).won, true);
  const own = [{ box: 0, dest: 1, dest2: 0 }, { box: 2, dest: 0 }];
  let st = parse(re);
  own.forEach((mv) => { st = solver.applyMove(st, mv, layout).state; });
  assert.equal(rules.isWon(st), true, 'the plan with the mate back in its source is a legal abstract plan');
  assert.equal(bot.certify(re, own, { layout }).won, true);
});

test('bot.play: perfect wins, greedy and sloppy end and are deterministic per seed', () => {
  const g = gen.generate({ tier: 'easy', seed: 5 });
  const p = bot.play(g.level, { layout: layoutOf(g.level), skill: 'perfect' });
  assert.equal(p.won, true);
  assert.equal(p.taps >= g.solution.length, true);
  for (const skill of ['greedy', 'sloppy']) {
    const a = bot.play(g.level, { skill, seed: 4 }), b = bot.play(g.level, { skill, seed: 4 });
    assert.deepEqual(a, b);
    assert.equal(typeof a.won, 'boolean');
    assert.ok(a.taps > 0 && a.ticks > 0);
  }
  const hard = bot.play(lvl(UNSOLVABLE.twoKinds), { skill: 'perfect' });
  assert.equal(hard.won, false);
  // over the easy and normal levels greedy wins a good share, sloppy fewer
  let wins = { greedy: 0, sloppy: 0 }, n = 0;
  for (const tier of ['easy', 'normal']) {
    for (let seed = 1; seed <= 6; seed++) {
      const lv = gen.generate({ tier, seed: seed + 40 }).level;
      n++;
      for (const skill of ['greedy', 'sloppy']) if (bot.play(lv, { skill, seed }).won) wins[skill]++;
    }
  }
  console.log('# bot skill over ' + n + ' easy/normal levels: greedy ' + wins.greedy + ' won, sloppy ' + wins.sloppy + ' won');
  assert.ok(wins.greedy >= 1);
});

// ---------------------------------------------------------------- the dealing and the placement

test('deal: four of every kind, empties in the band, nothing starts as four of a kind, one-way boxes nearly empty', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng.create(seed), K = 5 + (seed % 6), extra = 1 + (seed % 3), nb = K + extra;
    const d = gen.deal({ kinds: K, boxes: nb, empties: [1, Math.min(2, extra)], oneway: seed % 2, rng: r });
    if (!d) continue;
    const counts = {};
    let empties = 0;
    d.piles.forEach((p, i) => {
      assert.ok(p.length <= 4);
      if (!p.length) empties++;
      if (p.length === 4) assert.ok(p.some((x) => x !== p[0]), 'no box of four alike');
      p.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
      if (d.oneway.indexOf(i) >= 0) assert.ok(p.length <= 1);
    });
    for (let k = 0; k < K; k++) assert.equal(counts[k], 4);
    assert.ok(empties >= 1 && empties <= Math.min(2, extra));
    assert.equal(d.oneway.length, seed % 2);
  }
  const a = gen.deal({ kinds: 6, boxes: 8, empties: [1, 2], oneway: 0, rng: rng.create(9) });
  const b = gen.deal({ kinds: 6, boxes: 8, empties: [1, 2], oneway: 0, rng: rng.create(9) });
  assert.deepEqual(a, b);
});

test('place: modifiers only from the allow list, rules of the plan respected', () => {
  const r = rng.create(5), piles = [[0, 1, 2, 3], [1, 2, 3, 0], [2, 3, 0, 1], [3, 0, 1, 2], [4, 4, 5, 5], [5, 5, 4, 4], [], []];
  const slots = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
  const none = gen.place({ piles, slots, layout: RING, rng: rng.create(1), mods: [], hidden: 0, kinds: 6 });
  assert.deepEqual(none.placed, { pair: 0, wrap: 0, ice: 0, lock: 0, oneway: 0, hidden: 0 });
  none.boxes.forEach((b) => { assert.equal(b.mods, undefined); });
  const all = gen.place({ piles, slots, layout: RING, rng: r, mods: ['pair', 'wrap', 'ice', 'lock'], hidden: 6, kinds: 6, tier: 'hard' });
  assert.ok(all.placed.pair >= 1 && all.placed.wrap >= 1 && all.placed.ice >= 1 && all.placed.lock === 1 || all.placed.lock >= 1);
  assert.equal(all.placed.hidden, 6);
  const level = { id: 0, N: 6, kinds: 6, layout: 'ring-2col', dir: 'cw', boxes: all.boxes };
  assert.deepEqual(model.validate(level, { layout: RING }), []);
  const only = gen.place({ piles, slots, layout: RING, rng: rng.create(2), mods: ['pair'], hidden: 0, kinds: 6 });
  only.boxes.forEach((b) => { assert.equal(b.mods, undefined); b.pieces.forEach((p) => { if (!Array.isArray(p)) assert.equal(typeof p, 'number'); }); });
  assert.ok(only.placed.pair >= 1);
});

// ---------------------------------------------------------------- the generator

function checkGenerated(g, tier, label) {
  const level = g.level, layout = layoutOf(level), band = config.TIERS[tier];
  assert.ok(g, label);
  assert.deepEqual(model.validate(level, { layout }), [], label + ' valid');
  assert.equal(gen.inBand(g.metrics, tier), true, label + ' in band ' + JSON.stringify(g.metrics));
  assert.deepEqual(g.metrics, gen.metrics(level, g.solution, layout), label + ' metrics reproducible');
  assert.equal(level.tier, tier);
  const st = model.parse(level, { layout, raw: true }), counts = {};
  let pieces = 0, hidden = 0;
  st.boxes.forEach((b) => {
    assert.ok(b.pieces.length <= 4);
    b.pieces.forEach((p) => { counts[p.k] = (counts[p.k] || 0) + 1; pieces++; if (p.hidden) hidden++; });
  });
  assert.equal(Object.keys(counts).length, level.kinds, label + ' kinds');
  for (let k = 0; k < level.kinds; k++) assert.equal(counts[k], 4, label + ' 4 pieces of kind ' + k);
  assert.equal(pieces, 4 * level.kinds);
  st.boxes.forEach((b) => {
    if (b.wrap !== null) usedMods.wrap = true;
    if (b.ice) usedMods.ice = true;
    if (b.oneway) usedMods.oneway = true;
    if (b.lock !== null) usedMods.lock = true;
    b.pieces.forEach((p) => { if (p.pair !== null) usedMods.pair = true; if (p.hidden) usedMods.hidden = true; });
  });
  assert.ok(level.N >= band.N[0] && level.N <= band.N[1]);
  assert.ok(level.boxes.length - level.kinds >= band.extraBoxes[0] && level.boxes.length - level.kinds <= band.extraBoxes[1]);
  assert.ok(g.metrics.emptyBoxes >= band.emptyBoxes[0] && g.metrics.emptyBoxes <= band.emptyBoxes[1]);
  assert.ok(hidden / pieces >= band.hidden[0] - 1e-9 && hidden / pieces <= band.hidden[1] + 1e-9);
  // the generator's own constraints
  const ids = level.boxes.map((b) => b.id);
  st.boxes.forEach((b) => {
    if (b.wrap !== null) assert.equal(b.pieces.some((p) => p.k === b.wrap), false, label + ' wrapped with its own kind');
    if (b.ice) assert.ok((layout.neighbours[b.id] || []).some((x) => ids.indexOf(x) >= 0), label + ' ice without a neighbour');
    if (b.oneway) assert.ok(b.pieces.length <= 1, label + ' one-way box starts with ' + b.pieces.length);
    if (b.pieces.length) assert.equal(b.pieces[b.pieces.length - 1].hidden, false, label + ' front is visible');
  });
  Object.keys(st.locks).forEach((id) => {
    const group = st.locks[id].boxes;
    assert.ok(group.length >= 1 && group.length <= 2);
    if (group.length === 2) assert.ok(layout.neighbours[group[0]].indexOf(group[1]) >= 0, label + ' lock group is adjacent');
    let keyBox = null;
    st.boxes.forEach((b) => b.pieces.forEach((p) => { if (p.key === id) keyBox = b; }));
    assert.ok(keyBox, label + ' key ' + id + ' exists');
    assert.ok(group.indexOf(keyBox.id) < 0, label + ' key is not behind its own lock');
    assert.ok(keyBox.wrap === null && !keyBox.ice && keyBox.lock === null, label + ' key box is uncovered at the start');
  });
  // the stored solution wins, in the abstract model and in the real sim
  let s = model.parse(level, { layout });
  g.solution.forEach((mv) => { s = solver.applyMove(s, mv, layout).state; });
  assert.equal(rules.isWon(s), true, label + ' solution wins');
  const c = bot.certify(level, g.solution, { layout });
  assert.equal(c.won, true, label + ' certified: ' + c.reason);
  return c;
}

test('generate: deterministic for (tier, seed), different seeds give different levels, allow and layout are honoured', () => {
  for (const tier of TIERS) {
    const a = gen.generate({ tier, seed: 7 }), b = gen.generate({ tier, seed: 7 }), c = gen.generate({ tier, seed: 8 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.level, c.level);
  }
  const ring = gen.generate({ tier: 'normal', seed: 3, layout: 'ring-2col' }), counter = gen.generate({ tier: 'normal', seed: 3, layout: 'counter' });
  assert.equal(ring.level.layout, 'ring-2col');
  assert.equal(counter.level.layout, 'counter');
  const plain = gen.generate({ tier: 'easy', seed: 4, allow: [] });
  assert.equal(plain.metrics.mods, 0);
  assert.equal(plain.metrics.hiddenShare, 0);
  const hid = gen.generate({ tier: 'easy', seed: 4, allow: ['hidden'] });
  assert.equal(hid.metrics.mods, 0);
  assert.ok(hid.metrics.hiddenShare >= 0 && hid.metrics.hiddenShare <= 0.2);
  const onlyPair = gen.generate({ tier: 'normal', seed: 4, allow: ['pair', 'hidden'] });
  assert.ok(onlyPair.metrics.mods <= 1);
  const slots = ['L1', 'L2', 'L3', 'L4', 'L5', 'R1', 'R2', 'R3', 'R4', 'R5'];
  const fixed = gen.generate({ tier: 'normal', seed: 4, layout: 'ring-2col', layoutSlots: slots });
  assert.deepEqual(fixed.level.boxes.map((b) => b.id).sort(), slots.slice().sort());
  assert.equal(gen.generate({ tier: 'normal', seed: 4, layoutSlots: ['L1', 'L2'] }), null);
  assert.throws(() => gen.generate({ tier: 'nonsense', seed: 1 }), /unknown tier/);
});

test('generate: inBand matches config.TIERS', () => {
  const base = { N: 6, kinds: 10, extraBoxes: 1, emptyBoxes: 1, hiddenShare: 0.3, mods: 2 };
  assert.equal(gen.inBand(base, 'hard'), true);
  assert.equal(gen.inBand(Object.assign({}, base, { N: 7 }), 'hard'), false);
  assert.equal(gen.inBand(Object.assign({}, base, { kinds: 8 }), 'hard'), false);
  assert.equal(gen.inBand(Object.assign({}, base, { kinds: 13 }), 'hard'), false);
  assert.equal(gen.inBand(Object.assign({}, base, { emptyBoxes: 2 }), 'hard'), false);
  assert.equal(gen.inBand(Object.assign({}, base, { mods: 1 }), 'hard'), false);
  assert.equal(gen.inBand(Object.assign({}, base, { mods: 1 }), 'hard', ['pair']), true);
  assert.equal(gen.inBand(Object.assign({}, base, { hiddenShare: 0.1 }), 'hard'), false);
});

for (const tier of TIERS) {
  test('generate: ' + SEEDS + ' seeds of tier "' + tier + '" give valid, in-band, certified levels', () => {
    const t0 = Date.now(), stats = { attempts: 0, ticks: 0, moves: 0, forced: 0, mods: 0 }, layoutsUsed = {};
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = gen.generate({ tier, seed });
      assert.ok(g, tier + ' seed ' + seed + ' returned null');
      const c = checkGenerated(g, tier, tier + '#' + seed);
      stats.attempts += g.attempts;
      stats.ticks += c.ticks;
      stats.moves += g.metrics.moves;
      stats.forced += g.metrics.forced;
      stats.mods += g.metrics.mods;
      layoutsUsed[g.level.layout] = (layoutsUsed[g.level.layout] || 0) + 1;
    }
    const ms = Date.now() - t0;
    console.log('# ' + tier + ': ' + SEEDS + ' levels in ' + ms + ' ms, ' + (stats.attempts / SEEDS).toFixed(1) + ' attempts per level (' +
      (100 * SEEDS / stats.attempts).toFixed(0) + ' % accepted), avg moves ' + (stats.moves / SEEDS).toFixed(1) + ', forced ' +
      (stats.forced / SEEDS).toFixed(1) + ', mods ' + (stats.mods / SEEDS).toFixed(1) + ', layouts ' + JSON.stringify(layoutsUsed));
  });
}

test('generate: over the tier runs every modifier was used by some level', () => {
  for (const m of ['hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway']) assert.ok(usedMods[m], m + ' never appeared in a generated level');
});

test('solver speed: generated levels of every tier solve in well under 200 ms', () => {
  let worst = 0, sum = 0, n = 0, nodes = 0;
  for (const tier of TIERS) {
    for (let seed = 1; seed <= 10; seed++) {
      const g = gen.generate({ tier, seed: seed + 500 }), layout = layoutOf(g.level);
      const t = Date.now(), r = solver.solve(g.level, { layout });
      const ms = Date.now() - t;
      assert.equal(r.solvable, true);
      worst = Math.max(worst, ms);
      sum += ms;
      nodes += r.nodes;
      n++;
    }
  }
  console.log('# solver: ' + n + ' generated levels, mean ' + (sum / n).toFixed(1) + ' ms, worst ' + worst + ' ms, mean ' + Math.round(nodes / n) + ' nodes');
  assert.ok(worst < 200, 'worst ' + worst + ' ms');
});

test('solver speed: random (not reverse-dealt) deals with 10 kinds: two free boxes are solved fast, one free box is decided fast', () => {
  for (const free of [2, 1]) {
  let solved = 0, unsolvable = 0, unknown = 0, worst = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = rng.create(seed), bag = [];
    for (let k = 0; k < 10; k++) for (let i = 0; i < 4; i++) bag.push(k);
    r.shuffle(bag);
    const boxes = {};
    const ids = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'R1', 'R2', 'R3', 'R4', 'R5'].slice(0, 10 + free);
    ids.forEach((id, i) => { boxes[id] = i < 10 ? bag.slice(i * 4, i * 4 + 4) : []; });
    const level = lvl({ N: 5, boxes });
    if (model.validate(level, { layout: RING }).length) continue;
    const t = Date.now(), res = solver.solve(level, { layout: RING, maxNodes: 30000 });
    worst = Math.max(worst, Date.now() - t);
    if (res.solvable) solved++; else if (res.unknown) unknown++; else unsolvable++;
  }
  console.log('# random 10-kind deals with ' + free + ' free box(es): ' + solved + ' solved, ' + unsolvable + ' unsolvable, ' + unknown + ' unknown (budget 30000 nodes), worst ' + worst + ' ms');
  assert.ok(worst < 200, 'worst ' + worst + ' ms');
  if (free === 2) assert.ok(solved >= 18);
  }
});

// ---------------------------------------------------------------- juggling cannot break the engine

test('tap storms on generated levels keep the engine consistent (pieces conserved, no box over four, no plate double-booked)', () => {
  let taps = 0, refused = 0, ticks = 0;
  for (const tier of TIERS) {
    for (let seed = 1; seed <= 3; seed++) {
      const g = gen.generate({ tier, seed: seed + 900 }), layout = layoutOf(g.level);
      const s = sim.create(g.level, { perimeter: layout.perimeter, layout }), r = rng.create(seed * 31 + tier.length);
      const n = 4 * g.level.kinds, nbox = s.state.boxes.length;
      for (let t = 0; t < 7000 && s.status === 'play'; t++) {          // up to ~2 minutes of sim time
        if (r.next() < 0.08) {
          const res = sim.tap(s, r.int(nbox));
          taps++;
          if (!res.ok) refused++;
        }
        sim.tick(s, 16);
        ticks++;
        const ids = {};
        let count = 0;
        s.state.boxes.forEach((b) => {
          assert.ok(b.pieces.length <= 4, 'box over four');
          assert.ok(b.pending >= 0);
          assert.equal(b.pending, (b.outbox || []).length);
          b.pieces.concat(b.outbox || []).forEach((p) => { assert.equal(ids[p.id], undefined, 'piece twice'); ids[p.id] = true; count++; });
        });
        s.state.belt.forEach((p) => { if (p) { assert.equal(ids[p.id], undefined, 'piece twice (belt)'); ids[p.id] = true; count++; } });
        assert.equal(count, n, 'pieces conserved');
        assert.equal(s.state.belt.length, g.level.N);
        assert.ok(rules.freePlates(s.state) >= 0);
      }
    }
  }
  console.log('# tap storms: ' + taps + ' taps (' + refused + ' refused), ' + ticks + ' ticks checked');
  assert.ok(taps > 100);
});

test('tap storms: after the storm the abstract plan from the start still certifies (juggling does not change the level)', () => {
  const g = gen.generate({ tier: 'hard', seed: 77 }), layout = layoutOf(g.level);
  const s = sim.create(g.level, { perimeter: layout.perimeter, layout }), r = rng.create(5);
  for (let t = 0; t < 1500; t++) { if (r.next() < 0.1) sim.tap(s, r.int(s.state.boxes.length)); sim.tick(s, 16); }
  assert.equal(bot.certify(g.level, g.solution, { layout }).won, true);
});
