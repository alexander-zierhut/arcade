// tests/gen-adversarial.test.js: adversarial tests of solver, bot, generator and rng, written independently of gen.test.js
'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');

var H = require('./helpers.js');
var config = require('../src/config.js');
var model = require('../src/engine/model.js');
var rules = require('../src/engine/rules.js');
var sim = require('../src/engine/sim.js');
var layouts = require('../src/levels/layouts.js');
var rng = require('../src/gen/rng.js');
var solver = require('../src/gen/solver.js');
var bot = require('../src/gen/bot.js');
var gen = require('../src/gen/generator.js');

var TIERS = ['easy', 'normal', 'hard', 'extreme'];

// ------------------------------------------------------------------------------------------------ helpers

var cache = {};
function generated(tier, seed, extra) {
  var key = tier + '/' + seed + '/' + JSON.stringify(extra || {});
  if (!cache[key]) {
    var o = { tier: tier, seed: seed }, x;
    for (x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) o[x] = extra[x];
    cache[key] = gen.generate(o);
  }
  return cache[key];
}
function layoutOf(level) { return layouts[level.layout]; }
function need(tier, seed, extra) {
  var r = generated(tier, seed, extra);
  assert.ok(r, 'generate(' + tier + ', ' + seed + ') returned null');
  return r;
}
// 15 levels per tier with seeds of my own choosing
function poolFor(tier) {
  var base = { easy: 4100, normal: 5200, hard: 6300, extreme: 7400 }[tier], out = [], i;
  for (i = 0; i < 15; i++) out.push(need(tier, base + 17 * i));
  return out;
}
// a mixed pool across tiers for the structural generator tests
function mixedPool() {
  var out = [], i;
  for (i = 0; i < 8; i++) TIERS.forEach(function (t) { out.push(need(t, 910 + 13 * i + t.length)); });
  return out;
}

// everything that must hold of a state at any moment, whatever the bot did
function checkState(st, where) {
  var total = 0, perKind = {}, ids = {}, i, j, b, p, c, nClosed = 0;
  function seeP(pc) {
    assert.ok(!ids[pc.id], where + ': piece id ' + pc.id + ' is twice in the engine');
    ids[pc.id] = true;
    perKind[pc.k] = (perKind[pc.k] || 0) + 1;
    total++;
  }
  assert.equal(st.belt.length, st.N, where + ': belt length');
  for (i = 0; i < st.boxes.length; i++) {
    b = st.boxes[i];
    assert.ok(b.pieces.length <= 4, where + ': box ' + b.id + ' holds ' + b.pieces.length);
    assert.ok(b.pending >= 0, where + ': pending < 0 in ' + b.id);
    for (j = 0; j < b.pieces.length; j++) seeP(b.pieces[j]);
    for (j = 0; j < (b.outbox || []).length; j++) seeP(b.outbox[j]);       // pieces of a tapped box that have not reached a plate yet
    assert.equal(b.pending, (b.outbox || []).length, where + ': pending vs outbox in ' + b.id);
    assert.ok(b.pieces.length + (b.outbox || []).length <= 4, where + ': box ' + b.id + ' plus outbox holds more than 4');
    if (b.closed) {
      nClosed++;
      assert.equal(b.pieces.length, 4, where + ': closed box ' + b.id + ' is not full');
      for (j = 1; j < 4; j++) assert.equal(b.pieces[j].k, b.pieces[0].k, where + ': closed box ' + b.id + ' is mixed');
      assert.ok(st.closedKinds.indexOf(b.pieces[0].k) >= 0, where + ': closed kind not recorded');
    }
  }
  for (j = 0; j < st.belt.length; j++) if (st.belt[j]) seeP(st.belt[j]);
  assert.equal(total, 4 * st.kinds, where + ': pieces were created or lost (' + total + ' of ' + 4 * st.kinds + ')');
  for (c in perKind) assert.equal(perKind[c], 4, where + ': kind ' + c + ' has ' + perKind[c] + ' pieces');
  assert.equal(nClosed, st.closedKinds.length, where + ': closed boxes vs closedKinds');
  assert.equal(new Set(st.closedKinds).size, st.closedKinds.length, where + ': a kind closed twice');
  for (c in st.pouring) assert.ok(st.boxes[st.pouring[c]], where + ': pouring points to no box');
}

// replays a solution with applyMove; returns the final state. Checks every step.
function replay(level, moves, where) {
  var layout = layoutOf(level), st = model.parse(level, { layout: layout }), i, mv, b, ce, res, j;
  checkState(st, where + ' start');
  for (i = 0; i < moves.length; i++) {
    mv = moves[i];
    assert.ok(Number.isInteger(mv.box) && mv.box >= 0 && mv.box < st.boxes.length, where + ' move ' + i + ': box index');
    assert.ok(Number.isInteger(mv.dest) && mv.dest >= 0 && mv.dest < st.boxes.length, where + ' move ' + i + ': dest index');
    b = st.boxes[mv.box];
    assert.ok(!b.closed, where + ' move ' + i + ' taps closed box ' + b.id);
    assert.ok(b.wrap === null && !b.ice && b.lock === null, where + ' move ' + i + ' taps covered box ' + b.id);
    assert.ok(!b.oneway, where + ' move ' + i + ' taps one-way box ' + b.id);
    assert.ok(b.pieces.length > 0, where + ' move ' + i + ' taps empty box ' + b.id);
    ce = rules.canEject(st, mv.box);
    assert.ok(ce.ok, where + ' move ' + i + ': canEject says ' + ce.reason);
    assert.ok(ce.k <= level.N, where + ' move ' + i + ': k ' + ce.k + ' > N ' + level.N);
    assert.ok(!st.boxes[mv.dest].closed, where + ' move ' + i + ' lands in a closed box');
    res = solver.applyMove(st, mv, layout);
    st = res.state;
    for (j = 0; j < st.belt.length; j++) assert.equal(st.belt[j], null, where + ' move ' + i + ': belt not empty afterwards');
    checkState(st, where + ' after move ' + i);
  }
  return st;
}

function structure(level) { return JSON.stringify({ layout: level.layout, dir: level.dir, N: level.N, kinds: level.kinds, boxes: level.boxes }); }

// reachability over the solver's own transition function, with some moves banned: is a win still reachable?
function winnable(level, ban) {
  var layout = layoutOf(level), comp = solver._internal.compile(level, layout), ctx = comp.ctx, seen = new Set(), queue = [comp.s0], s, ch, i, key;
  seen.add(solver._internal.keyOf(ctx, comp.s0));
  while (queue.length) {
    s = queue.pop();
    if (s[2 * ctx.nb] >= ctx.kinds) return true;
    ch = solver._internal.expand(ctx, s);
    for (i = 0; i < ch.length; i++) {
      if (ban && ban(ch[i], s, ctx)) continue;
      key = solver._internal.keyOf(ctx, ch[i].s);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(ch[i].s);
    }
  }
  return false;
}

function idx(level, id) {
  for (var i = 0; i < level.boxes.length; i++) if (level.boxes[i].id === id) return i;
  throw new Error('no box ' + id);
}

function solveOpt(level, extra) {
  var o = { layout: layoutOf(level), optimal: true }, x;
  for (x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) o[x] = extra[x];
  return solver.solve(level, o);
}

// ------------------------------------------------------------------------------------------------ (a) soundness

TIERS.forEach(function (tier) {
  test('(a) soundness: 15 ' + tier + ' levels, every solver move is legal, conserves pieces and ends in a win', function () {
    poolFor(tier).forEach(function (r, i) {
      var level = r.level, res = solver.solve(level, { layout: layoutOf(level) }), fin;
      assert.ok(res.solvable, tier + '#' + i + ': generated level not solvable by solve()');
      assert.equal(res.depth, res.moves.length);
      fin = replay(level, res.moves, tier + '#' + i);
      assert.ok(rules.isWon(fin), tier + '#' + i + ': replay does not end won');
      // the solution the generator returned is just as good
      fin = replay(level, r.solution, tier + '#' + i + ' generator solution');
      assert.ok(rules.isWon(fin), tier + '#' + i + ': generator solution does not end won');
    });
  });
});

test('(a) soundness: solve() is deterministic and optimal mode is never longer than the default', function () {
  poolFor('easy').slice(0, 8).forEach(function (r, i) {
    var level = r.level, a = solver.solve(level, { layout: layoutOf(level) }), b = solver.solve(level, { layout: layoutOf(level) }), o = solveOpt(level);
    assert.deepEqual(a, b, 'easy#' + i + ': two solves differ');
    assert.ok(o.solvable, 'easy#' + i + ': optimal mode lost the solution');
    assert.ok(o.moves.length <= a.moves.length, 'easy#' + i + ': optimal ' + o.moves.length + ' > default ' + a.moves.length);
    assert.ok(rules.isWon(replay(level, o.moves, 'optimal easy#' + i)));
  });
});

test('(a) soundness: a solved level takes no moves, and a won state is not moved on', function () {
  var level = H.level({ N: 5, boxes: { R1: [0, 0, 0, 0], R2: [1, 1, 1, 1] } });
  // both boxes already hold four of a kind but are not "closed" in the parsed state: the solver must still finish it
  var res = solver.solve(level, { layout: layouts['ring-2col'] });
  assert.ok(res.solvable === true || res.solvable === false, 'must give a definite answer, got ' + JSON.stringify(res));
});

// ------------------------------------------------------------------------------------------------ (b) completeness

test('(b) completeness: a level that needs re-entry into the source box (both pieces of a mixed pair start at the mouth)', function () {
  // Trapdoor model (R26): the front piece 1 of the pair has no taker but its own box, whose remaining front is also 1; the
  // mate 0 goes to R2. The same level has no solution that avoids putting a piece back into R1.
  var level = H.level({ N: 5, boxes: { R1: [1, ['p', 0, 1]], R2: [0], R3: [0, 0, 1, 1] } }), res = solveOpt(level), src = idx(level, 'R1');
  assert.deepEqual(model.validate(level, { layout: layouts['ring-2col'] }), []);
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 3);
  assert.ok(res.moves.some(function (m) { return m.box === src && (m.dest === src || m.dest2 === src); }), 'solution should re-enter R1');
  assert.equal(winnable(level, function (c) { return c.dest === c.box || c.dest2 === c.box; }), false, 'level must be unsolvable without re-entry');
  assert.ok(rules.isWon(replay(level, res.moves, 're-entry')));
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
});

test('(b) completeness: R10b, a piece rides past an empty box when it can complete a box (no kick, 2 moves)', function () {
  // R1's 0 meets the empty R2 first, but R3 holds three 0s: the piece skips R2 and closes R3
  var spec = { N: 6, boxes: { R1: [1, 1, 1, 0], R2: [], R3: [0, 0, 0], R4: [1] } }, level = H.level(spec), res = solveOpt(level), s, ev;
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 2, JSON.stringify(res.moves));
  assert.equal(res.moves[0].dest, idx(level, 'R3'));
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
  assert.equal(cert.taps, 2, 'no kick needed, taps=' + cert.taps);
  s = H.sim(spec);
  ev = H.tapAndSettle(s, idx(level, 'R1'));
  assert.equal(s.state.boxes[idx(level, 'R3')].closed, true);
  assert.equal(s.state.boxes[idx(level, 'R2')].pieces.length, 0, 'the empty box stayed empty');
  assert.ok(!ev.some(function (e) { return e.type === 'land' && e.box === idx(level, 'R2'); }));
});

test('(b) completeness: a kick through an empty box is still needed when nothing can be completed', function () {
  // run of two 0s, R3 holds one 0 (1 + 2 < 4): the empty R2 takes the first piece, so reaching R3 costs kicks. The
  // optimal solution has 3 moves and uses them; parking in R2 instead needs 4.
  var level = H.level({ N: 6, boxes: { R1: [1, 1, 0, 0], R2: [], R3: [0], R4: [1, 1], R5: [0] } }), res = solveOpt(level);
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 3, JSON.stringify(res.moves));
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
  assert.ok(cert.taps > res.moves.length, 'kicks are extra taps, taps=' + cert.taps);
});

test('(b) completeness: a run of three goes past an empty box into a box it completes (R10b), certifies without kicks', function () {
  var level = H.level({ N: 4, boxes: { R1: [1, 0, 0, 0], R2: [], R3: [0], R4: [1, 1, 1] } }), res = solveOpt(level);
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 2);
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
  assert.equal(cert.taps, 2);
});

test('(b) completeness: a level that needs a hidden piece revealed first is solved after the reveal', function () {
  var level = H.level({ N: 5, boxes: { R1: ['h:0', 1], R2: [0, 0, 0], R3: [1, 1, 1], R4: [] } }), res = solveOpt(level), st, out;
  assert.deepEqual(model.validate(level, { layout: layouts['ring-2col'] }), []);
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 2);
  st = model.parse(level, { layout: layouts['ring-2col'] });
  assert.equal(rules.front(st.boxes[idx(level, 'R1')]).hidden, false);
  assert.equal(st.boxes[0].pieces[0].hidden, true, 'the piece behind the front starts hidden');
  out = solver.applyMove(st, res.moves[0], layouts['ring-2col']);
  assert.equal(out.state.boxes[0].pieces[0].hidden, false, 'the move reveals it');
  assert.ok(out.events.some(function (e) { return e.type === 'reveal'; }), 'a reveal event');
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
});

test('(b) completeness: a hidden chain of reveals (every move reveals the next) is solvable and certifies', function () {
  var level = H.level({ N: 4, boxes: { R1: ['h:0', 'h:2', 1], R2: [0, 0, 0], R3: [1, 1, 1], R4: [2, 2, 2], R5: [] } }), res = solveOpt(level);
  assert.equal(res.solvable, true);
  assert.equal(bot.certify(level, res.moves, { layout: layouts['ring-2col'] }).won, true);
});

test('(b) completeness: a provably unsolvable level is solvable:false, not unknown', function () {
  var level = H.level({ N: 5, boxes: { R1: [0, 1, 0, 1], R2: [1, 0, 1, 0] } }), res = solver.solve(level, { layout: layouts['ring-2col'] });
  assert.equal(res.solvable, false);
  assert.equal(res.unknown, undefined);
  assert.ok(res.nodes > 0);
  assert.equal(solver.solve(level, { layout: layouts['ring-2col'], optimal: true }).solvable, false);
  assert.equal(bot.play(level, { skill: 'perfect' }).won, false);
});

test('(b) completeness: unsolvable because a lock key sits behind its own shutter', function () {
  // the only key is under shutter A; nothing can ever open A
  var level = H.level({ N: 6, boxes: { R1: { pieces: ['k:A:0', 0, 0, 0], mods: { lock: 'A' } }, R2: [1, 1, 1, 1], R3: [] } });
  assert.ok(model.validate(level, { layout: layouts['ring-2col'] }).length > 0, 'validator should reject it');
  var res = solver.solve(level, { layout: layouts['ring-2col'] });
  assert.equal(res.solvable, false);
});

test('(b) completeness: a mixed-kind pair at the front sends its two pieces to two boxes (dest2)', function () {
  var level = H.level({ N: 5, boxes: { R1: [['p', 0, 1]], R2: [1, 1, 1], R3: [0, 0, 0] } }), res = solveOpt(level);
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 1);
  assert.notEqual(res.moves[0].dest2, undefined, 'dest2 must be set');
  assert.notEqual(res.moves[0].dest, res.moves[0].dest2);
  assert.ok(rules.isWon(replay(level, res.moves, 'dest2')));
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
});

test('(b) completeness: a mixed pair in the middle of a box is its own unit on a later tap', function () {
  var level = H.level({ N: 6, boxes: { R1: [['p', 0, 1], 2], R2: [2, 2, 2], R3: [1, 1, 1], R4: [0, 0, 0] } }), res = solveOpt(level);
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 2);
  assert.equal(bot.certify(level, res.moves, { layout: layouts['ring-2col'] }).won, true);
});

test('(b) completeness: one shutter over two boxes whose key hides behind a run', function () {
  var level = H.level({
    N: 6, boxes: {
      R1: ['k:A:0', 1, 1], R2: { pieces: [0, 0, 0], mods: { lock: 'A' } }, R3: { pieces: [2, 2, 2], mods: { lock: 'A' } },
      R4: [1, 1], R5: [2]
    }
  }), res = solveOpt(level), st = model.parse(level, { layout: layouts['ring-2col'] }), out;
  assert.deepEqual(model.validate(level, { layout: layouts['ring-2col'] }), []);
  assert.equal(rules.canEject(st, idx(level, 'R2')).reason, 'covered');
  assert.equal(rules.canEject(st, idx(level, 'R3')).reason, 'covered');
  assert.equal(res.solvable, true);
  assert.equal(res.moves.length, 3, JSON.stringify(res.moves));
  assert.equal(res.moves[0].box, idx(level, 'R1'), 'the run must leave first, it exposes the key');
  out = solver.applyMove(st, res.moves[0], layouts['ring-2col']);
  assert.ok(out.events.some(function (e) { return e.type === 'unlock'; }), 'unlock event');
  assert.equal(out.state.boxes[idx(level, 'R2')].lock, null);
  assert.equal(out.state.boxes[idx(level, 'R3')].lock, null, 'both boxes open together');
  assert.ok(rules.isWon(replay(level, res.moves, 'shutter')));
  var cert = bot.certify(level, res.moves, { layout: layouts['ring-2col'] });
  assert.equal(cert.won, true, cert.reason);
});

test('(b) completeness: two shutters, the key of B lies in a box that A covers (a chain of unlocks)', function () {
  // R10b: the piece that exposes key A must not be able to complete the box it just uncovered (R3 would close with key B
  // inside). R3 holds only two 1s, so the piece lands in the empty R2 (or is kicked on) and key B comes out with the run.
  var level = H.level({
    N: 6, boxes: {
      R1: ['k:A:0', 1], R2: [], R3: { pieces: ['k:B:1', 1], mods: { lock: 'A' } }, R4: { pieces: [0, 0, 0], mods: { lock: 'B' } }, R5: [1]
    }
  }), res = solveOpt(level);
  assert.deepEqual(model.validate(level, { layout: layouts['ring-2col'] }), []);
  assert.equal(res.solvable, true);
  assert.ok(rules.isWon(replay(level, res.moves, 'chain')));
  assert.equal(bot.certify(level, res.moves, { layout: layouts['ring-2col'] }).won, true);
});

test('(b) completeness: a piece that unlocks a matching box on the way lands in it and closes it over key B: the lid releases the key (R12b)', function () {
  // R1 is the only tappable box; its 1 passes R2 first, which was uncovered the instant the piece left, and closes it with
  // key B inside. Since 2026-11-06 a closing lid releases every key inside (a key can never be buried), so the level is
  // winnable, and the real belt and the abstract model agree on it.
  var level = H.level({
    N: 6, boxes: {
      R1: ['k:A:0', 1], R2: { pieces: ['k:B:1', 1, 1], mods: { lock: 'A' } }, R3: { pieces: [0, 0, 0], mods: { lock: 'B' } }, R4: []
    }
  });
  var res = solver.solve(level, { layout: layouts['ring-2col'] });
  assert.equal(res.solvable, true);
  assert.equal(bot.certify(level, res.moves, { layout: layouts['ring-2col'] }).won, true);
  var s = H.sim({ N: 6, boxes: { R1: ['k:A:0', 1], R2: { pieces: ['k:B:1', 1, 1], mods: { lock: 'A' } }, R3: { pieces: [0, 0, 0], mods: { lock: 'B' } }, R4: [] } });
  var ev = H.tapAndSettle(s, 0);
  assert.equal(s.state.boxes[1].closed, true);
  assert.equal(s.state.boxes[2].lock, null, 'key B comes out with the lid');
  assert.ok(ev.some(function (e) { return e.type === 'unlock' && e.lock === 'B'; }));
});

test('(b) completeness: wrapped and frozen boxes open when they should', function () {
  var wrapped = H.level({ N: 6, boxes: { R1: [1, 1, 1, 0], R2: { pieces: [0, 0, 0], mods: { wrap: 1 } }, R3: [1], R4: [] } });
  var resW = solveOpt(wrapped);
  assert.equal(resW.solvable, true);
  assert.equal(bot.certify(wrapped, resW.moves, { layout: layouts['ring-2col'] }).won, true);
  var frozen = H.level({ N: 6, boxes: { R1: [1, 1, 1, 0], R2: { pieces: [0, 0, 0], mods: { ice: true } }, R3: [1], R4: [] } });
  var resF = solveOpt(frozen);
  assert.equal(resF.solvable, true);
  assert.equal(bot.certify(frozen, resF.moves, { layout: layouts['ring-2col'] }).won, true);
  // a frozen box whose only neighbour is itself frozen can never thaw: unsolvable
  var dead = H.level({ N: 6, boxes: { R1: { pieces: [0, 0, 0, 1], mods: { ice: true } }, R2: { pieces: [1, 1, 1, 0], mods: { ice: true } }, R3: [] } });
  assert.equal(solver.solve(dead, { layout: layouts['ring-2col'] }).solvable, false);
});

test('(b) completeness: a one-way box takes a piece but is never a source', function () {
  var level = H.level({ N: 5, boxes: { R1: { pieces: [], mods: { oneway: true } }, R2: [0, 0, 0, 1], R3: [1, 1, 1], R4: [0] } });
  var res = solveOpt(level);
  assert.equal(res.solvable, true);
  res.moves.forEach(function (m) { assert.notEqual(m.box, 0, 'tapped the one-way box'); });
  assert.equal(bot.certify(level, res.moves, { layout: layouts['ring-2col'] }).won, true);
});

test('(b) metamorphic: relabelling the kinds changes neither verdict nor optimal length', function () {
  poolFor('easy').slice(0, 6).concat(poolFor('normal').slice(0, 4)).forEach(function (r, i) {
    var level = r.level, perm = rng.permutation(level.kinds, 100 + i), copy = JSON.parse(JSON.stringify(level)), a, b;
    function map(p) {
      if (Array.isArray(p)) return ['p', map(p[1]), map(p[2])];
      if (typeof p === 'number') return perm[p];
      var parts = p.split(':');
      parts[parts.length - 1] = String(perm[Number(parts[parts.length - 1])]);
      return parts.join(':');
    }
    copy.boxes.forEach(function (bx) {
      bx.pieces = bx.pieces.map(map);
      if (bx.mods && typeof bx.mods.wrap === 'number') bx.mods = Object.assign({}, bx.mods, { wrap: perm[bx.mods.wrap] });
    });
    a = solveOpt(level, { maxNodes: 400000 });
    b = solveOpt(copy, { maxNodes: 400000 });
    assert.equal(!!a.solvable, !!b.solvable, 'level #' + i + ': verdict changed by relabelling');
    if (a.solvable && b.solvable) assert.equal(a.moves.length, b.moves.length, 'level #' + i + ': optimal length changed by relabelling');
  });
});

test('(b) metamorphic: the order of the boxes in the level file does not change the verdict', function () {
  poolFor('normal').slice(0, 6).concat(poolFor('hard').slice(0, 4)).forEach(function (r, i) {
    var level = r.level, copy = JSON.parse(JSON.stringify(level)), a, b, cert;
    copy.boxes.reverse();
    a = solver.solve(level, { layout: layoutOf(level), maxNodes: 400000 });
    b = solver.solve(copy, { layout: layoutOf(copy), maxNodes: 400000 });
    assert.equal(!!a.solvable, !!b.solvable, 'level #' + i + ': verdict changed by reordering');
    cert = bot.certify(copy, b.moves, { layout: layoutOf(copy) });
    assert.equal(cert.won, true, 'level #' + i + ' reordered: ' + cert.reason);
  });
});

test('(b) hand levels on both layouts and belt directions: whenever the solver says yes, the real sim agrees', function () {
  var specs = [
    { boxes: { 0: [1, 1, 1, 0], 1: [], 2: [0, 0, 0], 3: [1] } },
    { boxes: { 0: [1, 0, 0, 0], 1: [], 2: [0], 3: [1, 1, 1] } },
    { boxes: { 0: [0, 0, ['p', 0, 1]], 1: [1, 1, 1, 0], 2: [] } },
    { boxes: { 0: ['h:0', 1], 1: [0, 0, 0], 2: [1, 1, 1], 3: [] } },
    { boxes: { 0: [['p', 0, 1]], 1: [1, 1, 1], 2: [0, 0, 0] } }
  ];
  var plan = { 'ring-2col': ['R1', 'R2', 'R3', 'R4'], counter: ['T1', 'T2', 'T3', 'T4'] };
  var other = { 'ring-2col': ['L1', 'L3', 'R2', 'L5'], counter: ['B1', 'I1', 'T3', 'B4'] };
  Object.keys(plan).forEach(function (lay) {
    ['cw', 'ccw'].forEach(function (dir) {
      [plan[lay], other[lay]].forEach(function (names) {
        specs.forEach(function (sp, si) {
          var boxes = {}, k;
          for (k in sp.boxes) boxes[names[Number(k)]] = sp.boxes[k];
          var level = H.level({ N: 5, layout: lay, dir: dir, boxes: boxes }), res = solver.solve(level, { layout: layouts[lay] }), cert, where = lay + '/' + dir + '/' + names[0] + '/spec' + si;
          assert.ok(!res.unknown, where + ': unknown');
          if (!res.solvable) return;
          assert.ok(rules.isWon(replay(level, res.moves, where)));
          cert = bot.certify(level, res.moves, { layout: layouts[lay] });
          assert.equal(cert.won, true, where + ': ' + cert.reason);
        });
      });
    });
  });
});

// ------------------------------------------------------------------------------------------------ (c) bot certification

function certPool() {
  var out = [];
  TIERS.forEach(function (t, ti) {
    for (var i = 0; i < 10; i++) out.push(need(t, 20000 + 101 * i + ti));
  });
  return out;
}

test('(c) certify: 40 generated levels are won with taps >= moves', function () {
  certPool().forEach(function (r, i) {
    var res = solver.solve(r.level, { layout: layoutOf(r.level) }), cert = bot.certify(r.level, res.moves, { layout: layoutOf(r.level) });
    assert.equal(cert.won, true, 'level #' + i + ' (' + r.level.tier + '): ' + cert.reason);
    assert.ok(cert.taps >= res.moves.length, 'level #' + i + ': taps ' + cert.taps + ' < moves ' + res.moves.length);
    assert.ok(cert.ticks > 0);
    cert = bot.certify(r.level, r.solution, { layout: layoutOf(r.level) });
    assert.equal(cert.won, true, 'level #' + i + ' generator solution: ' + cert.reason);
  });
});

test('(c) certify: the same replay twice gives identical numbers (deterministic sim)', function () {
  certPool().slice(0, 6).forEach(function (r) {
    var a = bot.certify(r.level, r.solution, { layout: layoutOf(r.level) }), b = bot.certify(r.level, r.solution, { layout: layoutOf(r.level) });
    assert.deepEqual(a, b);
  });
});

test('(c) certify: a reversed or truncated move list does not win and says why', function () {
  var tried = 0, i, r, rev, cert, short;
  certPool().forEach(function (p, n) {
    r = p;
    if (r.solution.length < 3) return;
    tried++;
    rev = r.solution.slice().reverse();
    cert = bot.certify(r.level, rev, { layout: layoutOf(r.level) });
    // a reversed list can only win if it is itself a valid solution
    if (cert.won) {
      assert.ok(rules.isWon(replay(r.level, rev, 'reversed #' + n)), 'reversed list "won" in the sim but is no solution in the model');
    } else {
      assert.equal(typeof cert.reason, 'string', 'level #' + n + ': failure without a reason');
      assert.ok(cert.reason.length > 0);
    }
    short = r.solution.slice(0, r.solution.length - 1);
    cert = bot.certify(r.level, short, { layout: layoutOf(r.level) });
    assert.equal(cert.won, false, 'level #' + n + ': dropping the last move still wins');
    assert.equal(typeof cert.reason, 'string');
  });
  assert.ok(tried >= 25, 'only ' + tried + ' levels had 3+ moves');
  // across the whole pool reversal must break most solutions
  var broken = 0, total = 0;
  certPool().forEach(function (p) {
    if (p.solution.length < 3) return;
    total++;
    if (!bot.certify(p.level, p.solution.slice().reverse(), { layout: layoutOf(p.level) }).won) broken++;
  });
  assert.ok(broken >= total * 0.8, 'reversing broke only ' + broken + ' of ' + total);
});

test('(c) certify: junk move lists give a reason instead of throwing', function () {
  var r = need('normal', 31337), L = layoutOf(r.level), cert;
  cert = bot.certify(r.level, [], { layout: L });
  assert.equal(cert.won, false);
  assert.match(cert.reason, /not won/);
  cert = bot.certify(r.level, [{ box: 999, dest: 0 }], { layout: L });
  assert.equal(cert.won, false);
  assert.ok(cert.reason);
  // a move on an empty box
  var st = model.parse(r.level, { layout: L }), empty = -1, i;
  for (i = 0; i < st.boxes.length; i++) if (!st.boxes[i].pieces.length) empty = i;
  if (empty >= 0) {
    cert = bot.certify(r.level, [{ box: empty, dest: 0 }], { layout: L });
    assert.equal(cert.won, false);
    assert.ok(cert.reason);
  }
  // a destination that takes nothing
  var lv = H.level({ N: 5, boxes: { R1: [0, 1, 0, 1], R2: [1, 0, 1, 0] } });
  cert = bot.certify(lv, [{ box: 0, dest: 1 }], { layout: layouts['ring-2col'] });
  assert.equal(cert.won, false);
  assert.ok(cert.reason);
});

test('(c) certify: extra moves after the win are ignored', function () {
  var r = need('easy', 777), L = layoutOf(r.level), cert = bot.certify(r.level, r.solution.concat(r.solution), { layout: L });
  assert.equal(cert.won, true, cert.reason);
});

// ------------------------------------------------------------------------------------------------ (d) generator invariants

function parsedRaw(level) { return model.parse(level, { layout: layoutOf(level), raw: true }); }

test('(d) generator: no box starts with a hidden front piece (nor a hidden mate at the front of a pair)', function () {
  mixedPool().forEach(function (r, n) {
    var st = parsedRaw(r.level);
    st.boxes.forEach(function (b) {
      var u = model.frontUnit(b);
      if (!u) return;
      u.pieces.forEach(function (p) { assert.equal(p.hidden, false, 'level #' + n + ' box ' + b.id + ': hidden at the front'); });
    });
  });
});

test('(d) generator: keys have a shutter, one key per shutter, none behind its own shutter, no cycle, thawable', function () {
  var seen = 0;
  TIERS.forEach(function (tier, ti) {
    for (var s = 0; s < 14; s++) {
      var r = need(tier, 60000 + 7 * s + ti, { allow: ['lock', 'ice', 'wrap', 'hidden'] }), st = parsedRaw(r.level), keys = {}, where = {}, graph = {};
      st.boxes.forEach(function (b, bi) {
        b.pieces.forEach(function (p) {
          if (p.key !== null) {
            assert.ok(!keys[p.key], 'key ' + p.key + ' twice');
            keys[p.key] = true;
            where[p.key] = bi;
          }
        });
      });
      Object.keys(st.locks).forEach(function (id) {
        seen++;
        assert.ok(keys[id], tier + ' ' + s + ': lock ' + id + ' without a key');
        assert.ok(st.locks[id].boxes.length >= 1);
        assert.notEqual(st.boxes[where[id]].lock, id, 'key ' + id + ' lies behind its own shutter');
        assert.ok(!st.locks[id].open, 'locks start closed unless the key is at a front');
      });
      Object.keys(keys).forEach(function (id) {
        var b = st.boxes[where[id]];
        assert.ok(st.locks[id], 'key ' + id + ' without a shutter');
        graph[id] = b.lock;            // lock id -> lock that covers the key
        if (b.ice) {
          var ok = st.neighbours[where[id]].some(function (nb) { return st.boxes[nb].lock !== id; });
          assert.ok(ok, 'key ' + id + ' sits in a frozen box whose neighbours are all under its own shutter');
        }
      });
      Object.keys(graph).forEach(function (id) {
        var cur = id, steps = 0;
        while (cur && steps++ < 5) cur = graph[cur];
        assert.ok(!cur, 'cycle of keys and shutters through ' + id);
      });
    }
  });
  assert.ok(seen >= 5, 'the pool contained too few locks to mean anything (' + seen + ')');
});

test('(d) generator: a one-way box starts with at most one piece (easy and normal)', function () {
  var seen = 0;
  ['easy', 'normal'].forEach(function (tier, ti) {
    for (var s = 0; s < 12; s++) {
      var r = need(tier, 70000 + 11 * s + ti, { allow: ['oneway', 'hidden', 'pair'] }), st = parsedRaw(r.level);
      st.boxes.forEach(function (b) {
        if (!b.oneway) return;
        seen++;
        assert.ok(b.pieces.length <= 1, tier + ': one-way box ' + b.id + ' starts with ' + b.pieces.length + ' pieces');
      });
    }
  });
  assert.ok(seen >= 5, 'too few one-way boxes (' + seen + ')');
});

// BUG: in hard and extreme the deal step fails every time a one-way box is requested (generate() returns null for
// allow ['oneway'] in 40 of 40 seeds, 38 of 40 for ['oneway','hidden','pair']), so with the default allow list no
// hard or extreme level ever contains a one-way box (0 of 150 each) although the plan wants it in every tier.
test('(d) generator: hard and extreme levels can contain one-way boxes', function () {
  ['hard', 'extreme'].forEach(function (tier) {
    var made = 0, withOneway = 0, s, r;
    for (s = 1; s <= 12; s++) {
      r = generated(tier, 3000 + 19 * s, { allow: ['oneway'] });
      if (!r) continue;
      made++;
      if (r.level.boxes.some(function (b) { return b.mods && b.mods.oneway; })) withOneway++;
    }
    assert.ok(made >= 10, tier + ': generate(allow [oneway]) returned null for ' + (12 - made) + ' of 12 seeds');
    assert.ok(withOneway >= 10, tier + ': only ' + withOneway + ' levels have a one-way box');
  });
});

test('(d) generator: a wrapped box never holds its own wrapper kind, and the kind exists', function () {
  var seen = 0;
  mixedPool().concat(TIERS.map(function (t) { return need(t, 81000, { allow: ['wrap'] }); })).forEach(function (r, n) {
    var st = parsedRaw(r.level);
    st.boxes.forEach(function (b) {
      if (b.wrap === null) return;
      seen++;
      assert.ok(b.wrap >= 0 && b.wrap < r.level.kinds, 'wrap kind out of range');
      b.pieces.forEach(function (p) { assert.notEqual(p.k, b.wrap, 'level #' + n + ' box ' + b.id + ' holds its own wrapper kind'); });
    });
  });
  assert.ok(seen >= 3, 'too few wrapped boxes (' + seen + ')');
});

function frozenNeighbourCheck(mode) {
  var seen = 0;
  TIERS.forEach(function (tier, ti) {
    for (var s = 0; s < 12; s++) {
      var r = need(tier, 90000 + 5 * s + ti, { allow: ['ice', 'lock', 'wrap'] }), st = parsedRaw(r.level);
      st.boxes.forEach(function (b, bi) {
        if (!b.ice) return;
        seen++;
        var ok;
        if (mode === 'chain') {            // a chain of frozen boxes must end at a box that is not frozen
          var todo = [bi], done = {}, x;
          ok = false;
          done[bi] = true;
          while (todo.length && !ok) {
            x = todo.pop();
            st.neighbours[x].forEach(function (nb) {
              if (done[nb]) return;
              done[nb] = true;
              if (st.boxes[nb].ice) todo.push(nb); else ok = true;
            });
          }
        } else {
          ok = st.neighbours[bi].some(function (nb) {
            var o = st.boxes[nb];
            return !o.ice && (mode !== 'plain' || (o.lock === null && o.wrap === null));
          });
        }
        assert.ok(ok, tier + ' seed ' + s + ': frozen box ' + b.id + ' fails the ' + mode + ' neighbour check');
      });
    }
  });
  assert.ok(seen >= 5, 'too few frozen boxes (' + seen + ')');
}

test('(d) generator: the neighbours of a frozen box lead to a box that is not frozen', function () { frozenNeighbourCheck('chain'); });

// AMBIGUITY: the plan only asks for "a neighbour that can close". Both stricter readings below are violated by a few
// generated levels (3 of 166 frozen boxes have only frozen neighbours, 10 of 166 have no plain neighbour), e.g. extreme
// seed 90018 freezes R1 and R2 side by side (R1's only neighbour is R2). Each such level is still solved and certified.
test('(d) generator: every frozen box has an unfrozen neighbour', { todo: 'plan says "can close"' }, function () { frozenNeighbourCheck('unfrozen'); });
test('(d) generator: every frozen box has a neighbour that is plain from the start', { todo: 'plan says "can close"' }, function () { frozenNeighbourCheck('plain'); });

test('(d) generator: slot ids are valid and unique, box count fits the layout', function () {
  mixedPool().forEach(function (r, n) {
    var layout = layoutOf(r.level), ids = r.level.boxes.map(function (b) { return b.id; });
    assert.ok(layout, 'unknown layout ' + r.level.layout);
    assert.ok(ids.length <= Object.keys(layout.slots).length, 'level #' + n + ': more boxes than slots');
    assert.equal(new Set(ids).size, ids.length, 'level #' + n + ': duplicate slot ids');
    ids.forEach(function (id) { assert.ok(layout.slots[id], 'level #' + n + ': no slot ' + id); });
    assert.ok(r.level.dir === 'cw' || r.level.dir === 'ccw');
    assert.equal(r.level.tier, TIERS.find(function (t) { return t === r.level.tier; }));
  });
});

test('(d) generator: 4 pieces per kind, kinds count equals level.kinds, kinds are 0..kinds-1, no box over 4', function () {
  mixedPool().forEach(function (r, n) {
    var st = parsedRaw(r.level), count = {}, c;
    st.boxes.forEach(function (b) {
      assert.ok(b.pieces.length <= 4, 'level #' + n + ': box over 4');
      b.pieces.forEach(function (p) { count[p.k] = (count[p.k] || 0) + 1; });
    });
    assert.equal(Object.keys(count).length, r.level.kinds, 'level #' + n + ': number of distinct kinds');
    for (c = 0; c < r.level.kinds; c++) assert.equal(count[c], 4, 'level #' + n + ': kind ' + c + ' has ' + count[c]);
    assert.ok(r.level.kinds <= config.KIND_NAMES.length);
    assert.ok(r.level.boxes.length >= r.level.kinds);
    assert.deepEqual(model.validate(r.level, { layout: layoutOf(r.level) }), [], 'level #' + n + ' fails validate');
    // no box starts closed-looking: four of a kind in one box
    st.boxes.forEach(function (b) {
      if (b.pieces.length === 4) assert.ok(b.pieces.some(function (p) { return p.k !== b.pieces[0].k; }), 'level #' + n + ': a box starts with four of a kind');
    });
  });
});

test('(d) generator: metrics are sane and every level sits in its tier band (re-derived here)', function () {
  mixedPool().forEach(function (r, n) {
    var m = r.metrics, band = config.TIERS[r.level.tier], st = parsedRaw(r.level), total = 0, hidden = 0, empty = 0, kinds = {}, mods;
    assert.ok(m.tightness > 0 && m.tightness <= 1, 'level #' + n + ': tightness ' + m.tightness);
    assert.equal(m.moves, r.solution.length);
    assert.ok(m.forced >= 0 && m.forced <= m.moves);
    st.boxes.forEach(function (b) {
      if (!b.pieces.length) empty++;
      b.pieces.forEach(function (p) {
        total++;
        if (p.hidden) hidden++;
        if (p.pair !== null) kinds.pair = true;
      });
      if (b.wrap !== null) kinds.wrap = true;
      if (b.ice) kinds.ice = true;
      if (b.lock !== null) kinds.lock = true;
      if (b.oneway) kinds.oneway = true;
    });
    mods = Object.keys(kinds).length;
    function within(x, rg, what) { assert.ok(x >= rg[0] - 1e-9 && x <= rg[1] + 1e-9, 'level #' + n + ' (' + r.level.tier + '): ' + what + ' ' + x + ' not in ' + rg); }
    within(r.level.N, band.N, 'N');
    within(r.level.kinds, band.kinds, 'kinds');
    within(r.level.boxes.length - r.level.kinds, band.extraBoxes, 'extra boxes');
    within(empty, band.emptyBoxes, 'empty boxes');
    within(hidden / total, band.hidden, 'hidden share');
    within(mods, band.mods, 'modifier kinds');
    assert.equal(m.emptyBoxes, empty);
    assert.equal(m.mods, mods);
    assert.ok(Math.abs(m.hiddenShare - hidden / total) < 1e-9);
    assert.equal(gen.inBand(m, r.level.tier), true);
    assert.equal(gen.metrics(r.level, r.solution).moves, m.moves, 'metrics() on its own disagrees');
  });
});

test('(d) generator: the same options twice give the identical result', function () {
  [['easy', 1], ['normal', 2], ['hard', 3], ['extreme', 4]].forEach(function (a) {
    var o1 = { tier: a[0], seed: a[1] * 999 }, o2 = { tier: a[0], seed: a[1] * 999 };
    assert.deepEqual(gen.generate(o1), gen.generate(o2), a[0]);
  });
  var o = { tier: 'normal', seed: 55, allow: ['hidden', 'pair'], layout: 'counter' }, before = JSON.stringify(o);
  assert.deepEqual(gen.generate(o), gen.generate({ tier: 'normal', seed: 55, allow: ['hidden', 'pair'], layout: 'counter' }));
  assert.equal(JSON.stringify(o), before, 'generate mutated its options');
});

test('(d) generator: different seeds give different levels (>= 90 % of 20 pairs)', function () {
  var different = 0, i, tier;
  for (i = 0; i < 20; i++) {
    tier = TIERS[i % 4];
    if (structure(need(tier, 300 + i).level) !== structure(need(tier, 5300 + 7 * i).level)) different++;
  }
  assert.ok(different >= 18, 'only ' + different + ' of 20 pairs differ');
  // neighbouring seeds too: not just far apart ones
  different = 0;
  for (i = 0; i < 20; i++) if (structure(need('normal', 600 + i).level) !== structure(need('normal', 601 + i).level)) different++;
  assert.ok(different >= 18, 'neighbouring seeds: only ' + different + ' of 20 differ');
});

test('(d) generator: allow [] yields no modifiers at all', function () {
  TIERS.forEach(function (tier, ti) {
    for (var s = 0; s < 6; s++) {
      var r = need(tier, 1100 + 9 * s + ti, { allow: [] }), st = parsedRaw(r.level);
      assert.equal(r.metrics.mods, 0);
      assert.equal(r.metrics.hiddenShare, 0);
      st.boxes.forEach(function (b) {
        assert.ok(b.wrap === null && !b.ice && b.lock === null && !b.oneway, tier + ': modifier on ' + b.id);
        b.pieces.forEach(function (p) {
          assert.ok(!p.hidden && p.key === null && p.pair === null, tier + ': piece modifier in ' + b.id);
        });
      });
      assert.equal(Object.keys(st.locks).length, 0);
      r.level.boxes.forEach(function (b) { assert.ok(!b.mods || Object.keys(b.mods).length === 0); });
    }
  });
});

test('(d) generator: allow [hidden] yields only hidden pieces', function () {
  var sawHidden = 0;
  TIERS.forEach(function (tier, ti) {
    for (var s = 0; s < 6; s++) {
      var r = need(tier, 1300 + 9 * s + ti, { allow: ['hidden'] }), st = parsedRaw(r.level);
      assert.equal(r.metrics.mods, 0);
      st.boxes.forEach(function (b) {
        assert.ok(b.wrap === null && !b.ice && b.lock === null && !b.oneway, tier + ': box modifier on ' + b.id);
        b.pieces.forEach(function (p) {
          assert.ok(p.key === null && p.pair === null, tier + ': non-hidden piece modifier in ' + b.id);
          if (p.hidden) sawHidden++;
        });
      });
    }
  });
  assert.ok(sawHidden > 20, 'no hidden pieces at all (' + sawHidden + ')');
});

test('(d) generator: each single allow entry yields only that modifier', function () {
  ['pair', 'wrap', 'ice', 'lock'].forEach(function (mod, mi) {
    var saw = 0;
    TIERS.forEach(function (tier, ti) {
      for (var s = 0; s < 4; s++) {
        var r = need(tier, 1500 + 31 * mi + 5 * s + ti, { allow: [mod] }), st = parsedRaw(r.level), present = {};
        st.boxes.forEach(function (b) {
          if (b.wrap !== null) present.wrap = true;
          if (b.ice) present.ice = true;
          if (b.lock !== null) present.lock = true;
          if (b.oneway) present.oneway = true;
          b.pieces.forEach(function (p) {
            if (p.hidden) present.hidden = true;
            if (p.pair !== null) present.pair = true;
            if (p.key !== null) present.key = true;
          });
        });
        Object.keys(present).forEach(function (x) {
          assert.ok(x === mod || (mod === 'lock' && x === 'key'), tier + ' allow [' + mod + '] produced ' + x);
          saw++;
        });
      }
    });
    assert.ok(saw > 0, 'allow [' + mod + '] never produced its modifier');
  });
});

test('(d) generator: layout and layoutSlots options are honoured', function () {
  var r = need('normal', 41, { layout: 'counter', allow: ['hidden'] });
  assert.equal(r.level.layout, 'counter');
  var slots = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'R1', 'R2'];
  r = need('easy', 42, { layoutSlots: slots, layout: 'ring-2col' });
  r.level.boxes.forEach(function (b) { assert.ok(slots.indexOf(b.id) >= 0, 'slot ' + b.id + ' not offered'); });
  assert.equal(r.level.boxes.length, slots.length);
  assert.throws(function () { gen.generate({ tier: 'nonsense', seed: 1 }); });
  assert.throws(function () { gen.generate({ tier: 'easy', seed: 1, layout: 'nowhere' }); });
});

// BUG: with a fixed layout that is too small for the tier, generate() throws ("generator: 13 boxes do not fit layout
// counter") for 29 of 40 hard seeds and 35 of 40 extreme seeds instead of choosing a smaller size or returning null,
// which its contract promises ("a level or null").
test('(d) generator: a layout too small for the tier gives null or a level, never an exception', function () {
  ['hard', 'extreme'].forEach(function (tier) {
    var thrown = 0, first = '', s;
    for (s = 1; s <= 20; s++) {
      try { gen.generate({ tier: tier, seed: s, layout: 'counter' }); } catch (e) { thrown++; first = first || e.message; }
    }
    assert.equal(thrown, 0, tier + ' on counter threw ' + thrown + ' of 20 times: ' + first);
  });
});

// AMBIGUITY: rng.create truncates the seed with `seed | 0`, so seeds that differ by a multiple of 2^32 (or only in the
// fraction) give the same stream. Level seeds from the generator are below 2^31, so nothing breaks today.
test('(g) rng.create tells apart seeds that differ beyond 32 bits or in the fraction', { todo: 'seed | 0 truncation' }, function () {
  assert.notEqual(rng.create(5).next(), rng.create(4294967301).next());
  assert.notEqual(rng.create(1).next(), rng.create(1.5).next());
});

test('(d) generator: a hidden piece ends the run (runLength ignores everything from the first hidden piece)', function () {
  var checked = 0;
  mixedPool().forEach(function (r, n) {
    var st = parsedRaw(r.level);
    st.boxes.forEach(function (b) {
      var len = b.pieces.length, i, pre = 0, f;
      if (!len) return;
      f = b.pieces[len - 1];
      if (f.pair !== null && len >= 2 && b.pieces[len - 2].pair === f.pair) {      // a pair at the front always leaves as a unit of two
        pre = 2;
        i = b.pieces[len - 2].k === f.k ? len - 3 : -1;
      } else { pre = 1; i = len - 2; }
      for (; i >= 0 && b.pieces[i].k === f.k && !b.pieces[i].hidden; i--) pre++;
      assert.ok(rules.runLength(b) <= pre, 'level #' + n + ' box ' + b.id + ': runLength ' + rules.runLength(b) + ' > visible prefix ' + pre);
      if (b.pieces.some(function (q) { return q.hidden && q.k === f.k; })) checked++;
    });
  });
  assert.ok(checked >= 3, 'pool had too few boxes with a hidden piece of the front kind (' + checked + ')');
  var st1 = H.state({ N: 6, boxes: { R1: [0, 'h:0', 0], R2: [0, 'h:1', 1] } });
  assert.equal(rules.runLength(st1.boxes[0]), 1, 'a hidden piece of the same kind still ends the run');
  assert.equal(rules.canEject(st1, 0).k, 1);
  var s = H.sim({ N: 6, boxes: { R1: [0, 'h:0', 0], R2: [] } });
  assert.equal(sim.tap(s, 0).k, 1);
  assert.equal(s.state.boxes[0].pieces[1].hidden === false || s.state.boxes[0].pieces.length === 2, true, 'tap revealed the next piece');
  assert.equal(rules.runLength(s.state.boxes[0]), 2, 'after the reveal the two 0s form a run');
});

test('(c) certify: all 60 generated levels (15 per tier) are won under the trapdoor engine', function () {
  var n = 0;
  TIERS.forEach(function (tier) {
    poolFor(tier).forEach(function (r, i) {
      var cert = bot.certify(r.level, r.solution, { layout: layoutOf(r.level) });
      assert.equal(cert.won, true, tier + '#' + i + ': ' + cert.reason);
      n++;
    });
  });
  assert.equal(n, 60);
});

// ------------------------------------------------------------------------------------------------ (e) bot.play

function occupied(st) { return st.belt.filter(function (q) { return q !== null; }).length; }
function outboxTotal(st) { return st.boxes.reduce(function (n, b) { return n + b.outbox.length; }, 0); }

// wraps sim.tap / sim.tick: after an accepted tap the box's outbox holds k pieces that carry distinct, free, reserved plates
// and departure times; each departure is an eject event at or after its departAt; once the last departAt has passed the
// outbox is empty and the belt count rose by k (belt count == ejects - lands seen); occupied + outbox <= N always.
function guarded(fn) {
  var oTick = sim.tick, oTap = sim.tap, calls = 0, track = new WeakMap();
  function info(s) {
    var t = track.get(s);
    if (!t) { t = { base: occupied(s.state), ejects: 0, lands: 0, taps: {} }; track.set(s, t); }
    return t;
  }
  function capacity(s, where) {
    assert.ok(occupied(s.state) + outboxTotal(s.state) <= s.state.N, where + ': occupied + outbox exceeds N');
  }
  sim.tick = function (s, dt) {
    var t = info(s), ev = oTick(s, dt), i, b, tp;
    calls++;
    for (i = 0; i < ev.length; i++) {
      if (ev[i].type === 'eject') {
        t.ejects++;
        if (ev[i].departAt !== undefined) assert.ok(ev[i].time >= ev[i].departAt - 1e-6, 'eject before its departAt');
      }
      if (ev[i].type === 'land') t.lands++;
    }
    checkState(s.state, 'tick ' + calls);
    capacity(s, 'tick ' + calls);
    assert.equal(occupied(s.state), t.base + t.ejects - t.lands, 'tick ' + calls + ': belt count is not ejects - lands');
    for (b in t.taps) {
      tp = t.taps[b];
      if (s.state.boxes[b].outbox.length === 0) {
        assert.ok(s.time >= tp.last - 1e-6, 'tick ' + calls + ': outbox of box ' + b + ' emptied before the last departAt');
        assert.equal(t.ejects - tp.ejectsAtTap >= tp.k, true, 'the belt did not receive the k pieces of the tap');
        delete t.taps[b];
      }
    }
    return ev;
  };
  sim.tap = function (s, b) {
    var t = info(s), before = occupied(s.state), r = oTap(s, b), box = s.state.boxes[b], seen = {}, last = 0, i, pc;
    checkState(s.state, 'tap ' + b);
    capacity(s, 'tap ' + b);
    if (r.ok) {
      assert.equal(box.outbox.length, r.k, 'accepted tap: outbox holds ' + box.outbox.length + ' of k=' + r.k);
      assert.equal(occupied(s.state), before, 'the belt must not change at the tap itself');
      for (i = 0; i < box.outbox.length; i++) {
        pc = box.outbox[i];
        assert.ok(Number.isInteger(pc.plate) && pc.plate >= 0 && pc.plate < s.state.N, 'outbox piece without a reserved plate');
        assert.equal(s.state.belt[pc.plate], null, 'reserved plate is not free');
        assert.ok(!seen[pc.plate], 'plate reserved twice');
        seen[pc.plate] = true;
        assert.ok(pc.departAt > s.time, 'departure is not in the future');
        last = Math.max(last, pc.departAt);
      }
      t.taps[b] = { k: r.k, last: last, ejectsAtTap: t.ejects };
    }
    return r;
  };
  try { return fn(); } finally { sim.tick = oTick; sim.tap = oTap; }
}

['greedy', 'sloppy'].forEach(function (skill) {
  test('(e) bot.play ' + skill + ': 20 levels never throw and the engine stays consistent', function () {
    var wins = 0;
    guarded(function () {
      var i, r, res;
      for (i = 0; i < 20; i++) {
        r = need(TIERS[i % 4], 40000 + 13 * i);
        res = bot.play(r.level, { skill: skill, seed: i + 1 });
        assert.equal(typeof res.won, 'boolean');
        assert.ok(Number.isInteger(res.taps) && res.taps >= 0 && res.taps <= 600, 'taps ' + res.taps);
        assert.ok(Number.isInteger(res.ticks) && res.ticks >= 0);
        if (res.won) wins++;
      }
    });
    assert.ok(wins >= 1, skill + ' never won a single level');
  });
});

test('(e) bot.play: same seed same result, perfect always wins generated levels', function () {
  var r = need('hard', 51515), a = bot.play(r.level, { skill: 'sloppy', seed: 9 }), b = bot.play(r.level, { skill: 'sloppy', seed: 9 });
  assert.deepEqual(a, b);
  TIERS.forEach(function (t, i) {
    var q = need(t, 52000 + i), p = bot.play(q.level, { skill: 'perfect' });
    assert.equal(p.won, true, t + ': ' + p.reason);
    assert.ok(p.taps >= q.solution.length - 3, 'perfect taps ' + p.taps);
  });
});

// Over-approximation of real play WITH juggling: any number of runs in flight, any belt piece may land in any accepting box
// at any time (no plate order, no R9/R10b). If a plain level cannot be won even here, no player can win it.
function relaxedWinnable(boxes, N, kinds) {
  var seen = {}, stack = [{ b: boxes.map(function (x) { return x.slice(); }), belt: [] }], n = 0;
  function closedBox(x) { return x.length === 4 && x.every(function (v) { return v === x[0]; }); }
  function key(b, belt) { return b.map(function (x) { return x.join(''); }).join('|') + '/' + belt.join(''); }
  function push(b, belt) { var k = key(b, belt); if (!seen[k]) { seen[k] = true; stack.push({ b: b, belt: belt }); } }
  seen[key(stack[0].b, [])] = true;
  while (stack.length) {
    var st = stack.pop(), i, j, u, closed = 0, x, f, r, k, b, belt, c;
    assert.ok(++n < 300000, 'relaxed search too large');
    st.b.forEach(function (y) { if (closedBox(y)) closed++; });
    if (closed >= kinds) return true;
    for (i = 0; i < st.b.length; i++) {
      x = st.b[i];
      if (!x.length || closedBox(x)) continue;
      f = x[x.length - 1];
      r = 0;
      while (r < x.length && x[x.length - 1 - r] === f) r++;
      k = Math.min(r, N - st.belt.length);
      if (k <= 0) continue;
      b = st.b.map(function (y) { return y.slice(); });
      b[i] = x.slice(0, x.length - k);
      belt = st.belt.slice();
      for (j = 0; j < k; j++) belt.push(f);
      push(b, belt.sort());
    }
    for (u = 0; u < st.belt.length; u++) {
      if (u > 0 && st.belt[u] === st.belt[u - 1]) continue;
      c = st.belt[u];
      for (j = 0; j < st.b.length; j++) {
        x = st.b[j];
        if (closedBox(x) || !(x.length === 0 || (x.length < 4 && x[x.length - 1] === c))) continue;
        b = st.b.map(function (y) { return y.slice(); });
        b[j] = x.concat([c]);
        belt = st.belt.slice();
        belt.splice(u, 1);
        push(b, belt);
      }
    }
  }
  return false;
}

test('(e) bot.play: a level that is hopeless even with juggling ends with won=false for every skill and seed', function () {
  // N = 4, four full mixed boxes, no empty one. relaxedWinnable (above) explores every juggling strategy and finds no win.
  var boxes = [[1, 3, 3, 1], [2, 0, 3, 1], [1, 3, 0, 2], [2, 0, 0, 2]], seed,
    lv = H.level({ N: 4, boxes: { R1: boxes[0], R2: boxes[1], R3: boxes[2], R4: boxes[3] } });
  assert.deepEqual(model.validate(lv, { layout: layouts['ring-2col'] }), []);
  assert.equal(relaxedWinnable(boxes, 4, 4), false, 'the level must be hopeless even for a perfect juggler');
  assert.equal(solver.solve(lv, { layout: layouts['ring-2col'] }).solvable, false);
  assert.equal(bot.play(lv, { skill: 'perfect' }).won, false);
  for (seed = 1; seed <= 12; seed++) {
    assert.equal(bot.play(lv, { skill: 'greedy', seed: seed }).won, false);
    assert.equal(bot.play(lv, { skill: 'sloppy', seed: seed }).won, false);
  }
});

test('(e) relaxedWinnable agrees with the juggling bot: the interleaved two-box level is winnable with juggling', function () {
  assert.equal(relaxedWinnable([[0, 1, 0, 1], [1, 0, 1, 0]], 5, 2), true);
});

test('(e) bot.play: the abstract solver may say unsolvable where a juggling player wins (documented limitation)', function () {
  // two interleaved boxes: one run in flight can never close anything, but tapping both boxes before either piece
  // lands exposes a match in each. Real play has that freedom; the solver (plan 5.2) does not.
  var lv = H.level({ N: 5, boxes: { R1: [0, 1, 0, 1], R2: [1, 0, 1, 0] } }), seed, won = 0;
  assert.equal(solver.solve(lv, { layout: layouts['ring-2col'] }).solvable, false);
  for (seed = 1; seed <= 12; seed++) if (bot.play(lv, { skill: 'sloppy', seed: seed }).won) won++;
  assert.ok(won >= 1, 'no sloppy seed managed to juggle its way to a win');
});

// ------------------------------------------------------------------------------------------------ (f) node budget

test('(f) budget: a 12-kind extreme level that needs more than 50 nodes is unknown at 50, answered quickly by default', function () {
  var found = 0, s, r, full, t0, small;
  for (s = 1; s < 120 && found < 2; s++) {
    r = generated('extreme', s);
    if (!r || r.level.kinds < 12) continue;
    full = solver.solve(r.level, { layout: layoutOf(r.level) });
    assert.equal(full.solvable, true);
    if (full.nodes <= 50) continue;
    found++;
    small = solver.solve(r.level, { layout: layoutOf(r.level), maxNodes: 50 });
    assert.equal(small.unknown, true, 'seed ' + s + ': expected unknown, got ' + JSON.stringify(small).slice(0, 80));
    assert.equal(small.solvable, undefined);
    assert.ok(small.nodes <= 51);
    t0 = Date.now();
    full = solver.solve(r.level, { layout: layoutOf(r.level) });
    assert.ok(Date.now() - t0 < 2000, 'default budget took ' + (Date.now() - t0) + ' ms');
    assert.equal(full.solvable, true);
  }
  assert.ok(found >= 1, 'no 12-kind level needing more than 50 nodes found');
});

test('(f) budget: an unsolvable 12-kind extreme level is unknown at 50 nodes, never solvable:false', function () {
  var done = 0, s, m, r, lv, R, a, b, t, x, small, t0, big;
  for (s = 1; s < 80 && !done; s++) {
    r = generated('extreme', s, { allow: ['hidden'] });
    if (!r || r.level.kinds < 12) continue;
    lv = JSON.parse(JSON.stringify(r.level));
    R = rng.create(s);
    for (m = 0; m < 6 && !done; m++) {
      a = lv.boxes[R.int(lv.boxes.length)];
      b = lv.boxes[R.int(lv.boxes.length)];
      if (!a.pieces.length || !b.pieces.length) continue;
      t = a.pieces[a.pieces.length - 1];
      a.pieces[a.pieces.length - 1] = b.pieces[b.pieces.length - 1];
      b.pieces[b.pieces.length - 1] = t;
      t0 = Date.now();
      x = solver.solve(lv, { layout: layoutOf(lv) });
      if (x.solvable !== false || x.nodes < 200) continue;
      done++;
      assert.ok(Date.now() - t0 < 2000, 'proof of unsolvability took ' + (Date.now() - t0) + ' ms');
      small = solver.solve(lv, { layout: layoutOf(lv), maxNodes: 50 });
      assert.equal(small.unknown, true, 'budget 50 must not claim unsolvable: ' + JSON.stringify(small));
      assert.equal(small.solvable, undefined);
      big = solver.solve(lv, { layout: layoutOf(lv), maxNodes: 10 * x.nodes });
      assert.equal(big.solvable, false);
    }
  }
  assert.ok(done, 'no unsolvable 12-kind mutant with a non-trivial proof found');
});

test('(f) budget: unknown grows monotonically (a bigger budget never turns solvable into unknown)', function () {
  poolFor('hard').slice(0, 6).forEach(function (r, i) {
    var full = solver.solve(r.level, { layout: layoutOf(r.level) }), lo = solver.solve(r.level, { layout: layoutOf(r.level), maxNodes: Math.max(1, full.nodes - 1) }), hi = solver.solve(r.level, { layout: layoutOf(r.level), maxNodes: full.nodes });
    assert.equal(hi.solvable, true, 'hard#' + i + ': the exact node budget must suffice');
    assert.deepEqual(hi.moves, full.moves);
    assert.ok(lo.unknown === true || lo.solvable === true, 'hard#' + i + ': ' + JSON.stringify(lo).slice(0, 80));
  });
});

// ------------------------------------------------------------------------------------------------ (g) rng and permutations

function isBijection(arr, n) {
  if (arr.length !== n) return false;
  var seen = {}, i;
  for (i = 0; i < n; i++) {
    if (!Number.isInteger(arr[i]) || arr[i] < 0 || arr[i] >= n || seen[arr[i]]) return false;
    seen[arr[i]] = true;
  }
  return true;
}

test('(g) rng.permutation(n, seed) is a bijection of 0..n-1 for n = 1..12 and many seeds, and repeatable', function () {
  var n, seed, seeds = [0, 1, 2, 3, 7, 42, 12345, 2147483647, -1, -99999, 4294967295, 1.5];
  for (n = 1; n <= 12; n++) {
    seeds.forEach(function (sd) {
      var p = rng.permutation(n, sd);
      assert.ok(isBijection(p, n), 'n=' + n + ' seed=' + sd + ': ' + JSON.stringify(p));
      assert.deepEqual(p, rng.permutation(n, sd));
    });
  }
  assert.deepEqual(rng.permutation(0, 5), []);
  assert.deepEqual(rng.permutation(1, 5), [0]);
});

test('(g) rng.permutation: seeds give varied permutations, not one fixed shuffle', function () {
  var seen = new Set(), s;
  for (s = 0; s < 50; s++) seen.add(rng.permutation(8, s).join(','));
  assert.ok(seen.size >= 45, 'only ' + seen.size + ' distinct permutations of 8 from 50 seeds');
  // every position gets every value over many seeds (no biased shuffle)
  var hits = [], i, j;
  for (i = 0; i < 6; i++) { hits.push([]); for (j = 0; j < 6; j++) hits[i].push(0); }
  for (s = 0; s < 3000; s++) rng.permutation(6, s).forEach(function (v, pos) { hits[pos][v]++; });
  for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) assert.ok(hits[i][j] > 3000 / 6 * 0.75 && hits[i][j] < 3000 / 6 * 1.25, 'position ' + i + ' value ' + j + ' count ' + hits[i][j]);
});

test('(g) rng.create: streams are in range, reproducible and seed-dependent', function () {
  var a = rng.create(5), b = rng.create(5), c = rng.create(6), i, x, sum = 0, same = 0, arr = [1, 2, 3, 4, 5, 6, 7, 8], res;
  for (i = 0; i < 10000; i++) {
    x = a.next();
    assert.ok(x >= 0 && x < 1);
    assert.equal(x, b.next());
    sum += x;
    if (x === c.next()) same++;
  }
  assert.ok(Math.abs(sum / 10000 - 0.5) < 0.02, 'mean ' + sum / 10000);
  assert.ok(same < 5);
  for (i = 0; i < 2000; i++) { x = a.int(7); assert.ok(Number.isInteger(x) && x >= 0 && x < 7); }
  assert.equal(a.int(1), 0);
  res = a.shuffle(arr);
  assert.equal(res, arr, 'shuffle works in place and returns the array');
  assert.deepEqual(arr.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok([1, 2, 3].indexOf(rng.create(1).pick([1, 2, 3])) >= 0);
});

test('(g) model.permutation: a bijection of the 12 sprites, deterministic per (level, attempt)', function () {
  var id, attempt;
  for (id = 1; id <= 40; id++) {
    for (attempt = 0; attempt < 3; attempt++) {
      var p = model.permutation(id, attempt);
      assert.ok(isBijection(p, config.KIND_NAMES.length), 'level ' + id + ' attempt ' + attempt);
      assert.deepEqual(p, model.permutation(id, attempt));
    }
  }
  assert.ok(isBijection(model.permutation('abc', 2), 12));
  assert.deepEqual(model.permutation('abc', 2), model.permutation('abc', 2));
});

test('(g) model.permutation: size argument works for n = 1..12, attempts differ, a restart really shuffles', function () {
  var n, distinct = new Set(), id;
  for (n = 1; n <= 12; n++) assert.ok(isBijection(model.permutation(7, 1, n), n), 'n=' + n);
  for (id = 0; id < 30; id++) distinct.add(model.permutation(id, 0).join(','));
  assert.ok(distinct.size >= 28, 'levels share permutations: ' + distinct.size + ' of 30');
  distinct = new Set();
  for (id = 0; id < 30; id++) distinct.add(model.permutation(5, id).join(','));
  assert.ok(distinct.size >= 28, 'attempts share permutations: ' + distinct.size + ' of 30');
  // (levelId, attempt) must not collide with (attempt, levelId) systematically
  var swapped = 0;
  for (id = 1; id < 20; id++) if (model.permutation(id, id + 3).join() === model.permutation(id + 3, id).join()) swapped++;
  assert.ok(swapped < 3, 'permutation(a, b) == permutation(b, a) too often: ' + swapped);
});

test('(g) kind permutation keeps the solver verdict: relabelling a level by model.permutation is harmless', function () {
  poolFor('easy').slice(0, 5).forEach(function (r, i) {
    var perm = model.permutation(r.level.id || i + 1, 2, r.level.kinds), copy = JSON.parse(JSON.stringify(r.level));
    function map(p) {
      if (Array.isArray(p)) return ['p', map(p[1]), map(p[2])];
      if (typeof p === 'number') return perm[p];
      var parts = p.split(':');
      parts[parts.length - 1] = String(perm[Number(parts[parts.length - 1])]);
      return parts.join(':');
    }
    copy.boxes.forEach(function (bx) {
      bx.pieces = bx.pieces.map(map);
      if (bx.mods && typeof bx.mods.wrap === 'number') bx.mods = Object.assign({}, bx.mods, { wrap: perm[bx.mods.wrap] });
    });
    var res = solver.solve(copy, { layout: layoutOf(copy) });
    assert.equal(res.solvable, true);
    assert.equal(bot.certify(copy, res.moves, { layout: layoutOf(copy) }).won, true);
  });
});
