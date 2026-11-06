// tests/fixes.test.js: the bugs of the first beta (2026-11-06): a key buried under a closing lid, a key landing as
// the fourth piece, a hidden piece closed over, and unwinnable positions (R13b) that the belt never notices.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var H = require('./helpers.js');
var model = require('../src/engine/model.js');
var rules = require('../src/engine/rules.js');
var sim = require('../src/engine/sim.js');
var solver = require('../src/gen/solver.js');
var bot = require('../src/gen/bot.js');
var layouts = require('../src/levels/layouts.js');
var L = layouts['ring-2col'];

function types(ev, t) { return ev.filter(function (e) { return e.type === t; }); }

test('R12b: a key on a buried piece is released when its box closes (level 54 of the first beta)', function () {
  // R7 holds [hk:B:0, 0] after two taps; two more 0 land and close it over the hidden key piece
  var s = H.sim({ N: 6, boxes: {
    R1: ['hk:B:0', 0], R2: [0, 0, 1], R3: { pieces: [2, 2, 2], mods: { lock: 'B' } }, R4: [2, 1, 1, 1], R5: []
  } });
  var ev = H.tapAndSettle(s, 1);                       // the 1 of R2 lands in the empty R5; then tap R2 again: 0,0 ride to R1
  ev = ev.concat(H.tapAndSettle(s, 1));
  assert.equal(s.state.boxes[0].closed, true, 'R1 closed with four 0');
  assert.equal(s.state.boxes[2].lock, null, 'the shutter B is open');
  assert.ok(types(ev, 'unlock').some(function (e) { return e.lock === 'B' && e.box === 0; }), 'an unlock event for B from box R1');
  assert.ok(types(ev, 'reveal').some(function (e) { return e.box === 0 && e.index === 0; }), 'the hidden key piece was revealed (index 0)');
  assert.equal(s.state.boxes[0].pieces[0].hidden, false);
  assert.equal(s.status, 'play');
});

test('R19: a key piece is always released before it rides (it was the front piece or part of the front pair)', function () {
  var s = H.sim({ N: 6, boxes: { R1: ['hk:A:0', 1], R2: [0, 0, 0], R3: { pieces: [2, 2, 2], mods: { lock: 'A' } }, R4: [], R5: [2, 1, 1, 1] } });
  var r = sim.tap(s, 0);                               // the 1 leaves, the hidden key piece is revealed and the shutter opens at the tap
  assert.equal(types(r.events, 'unlock').length, 1);
  assert.equal(s.state.boxes[2].lock, null);
  var s2 = H.sim({ N: 6, boxes: { R1: [['p', 1, 'k:A:0']], R2: [0, 0, 0], R3: { pieces: [2, 2, 2], mods: { lock: 'A' } }, R4: [], R5: [2, 1, 1, 1] } });
  assert.equal(s2.state.boxes[2].lock, null, 'a key on the mate of the front pair is exposed at the start');
});

test('R12b: the solver releases a key under a closing lid too (solver and engine agree)', function () {
  var level = H.level({ N: 6, boxes: {
    R1: ['hk:B:0', 0], R2: [0, 0, 1], R3: { pieces: [2, 2, 2], mods: { lock: 'B' } }, R4: [2, 1, 1, 1], R5: []
  } });
  assert.deepEqual(model.validate(level, { layout: L }), []);
  var res = solver.solve(level, { layout: L });
  assert.equal(res.solvable, true, 'solvable now that the key comes out with the lid');
  assert.equal(bot.certify(level, res.moves, { layout: L }).won, true);
});

test('R13b: the last pieces of every open kind inside a frozen box whose neighbour cannot close: lost at once', function () {
  // counter layout: T1 frozen with [1, 1, 0, 2], T2 holds three 0 (the only neighbour of T1), the other kinds are closed
  var s = H.sim({ N: 4, layout: 'counter', boxes: {
    T1: { pieces: [1, 1, 0, 2], mods: { ice: true } }, T2: [0, 0, 0], B1: [2, 2, 2], B2: [1, 1], B3: []
  } });
  assert.equal(rules.isHopeless(s.state), true);
  assert.deepEqual(rules.deadKinds(s.state).sort(), [0, 1, 2]);
  var ev = sim.tick(s, 16);
  assert.equal(s.status, 'lost');
  assert.equal(types(ev, 'lost')[0].reason, 'hopeless');
});

test('R13b: the same board with a free kind for the neighbour is not hopeless', function () {
  var s = H.sim({ N: 4, layout: 'counter', boxes: {
    T1: { pieces: [1, 1, 0, 2], mods: { ice: true } }, T2: [0, 0, 0], B1: [2, 2, 2], B2: [1, 1], B3: [3, 3, 3, 0], B4: [3]
  } });
  assert.equal(rules.isHopeless(s.state), false, 'kind 3 can close in T2 after B3 is emptied');
  sim.tick(s, 16);
  assert.equal(s.status, 'play');
});

test('R13b: two keys behind each other\'s shutters are hopeless, and validation refuses such a level', function () {
  var level = H.level({ N: 6, boxes: {
    R1: { pieces: ['k:B:0', 0], mods: { lock: 'A' } }, R2: { pieces: ['k:A:1', 1], mods: { lock: 'B' } }, R3: [0, 0, 1, 1], R4: []
  } });
  var errs = model.validate(level, { layout: L });
  assert.ok(errs.some(function (e) { return e.indexOf('R13b') === 0; }), errs.join('; '));
  var st = model.parse(level, { layout: L });
  assert.equal(rules.isHopeless(st), true);
});

test('R13b: a cloth whose kind can still close, a key on the belt and a thawable chain are all hopeful', function () {
  var s = H.sim({ N: 6, boxes: {
    R1: { pieces: [1, 1], mods: { wrap: 0 } }, R2: [0, 0, 0, 1], R3: { pieces: [2, 2], mods: { lock: 'A' } }, R4: ['k:A:2', 2], R5: [0, 1],
    L1: { pieces: [3, 3], mods: { ice: true } }, L2: { pieces: [3, 3], mods: { ice: true } }, L3: []
  } });
  assert.equal(rules.isHopeless(s.state), false);
  assert.deepEqual(rules.deadKinds(s.state), []);
});

test('R13b: a frozen box whose only neighbours are closed boxes is a dead end', function () {
  var s = H.sim({ N: 6, boxes: { L1: [1, 1, 1, 1], L2: { pieces: [0, 2], mods: { ice: true } }, L3: [3, 3, 3, 3], L4: [0, 0, 0], L5: [2, 2, 2], L6: [] } });
  // L1 and L3 are "closed" only once they close through a landing; here they merely start full of one kind. Make them closed:
  s.state.boxes[0].closed = true; s.state.boxes[2].closed = true; s.state.closedKinds.push(1, 3);
  assert.equal(rules.isHopeless(s.state), true);
  assert.deepEqual(rules.deadKinds(s.state).sort(), [0, 2]);
});

test('generator: every frozen box has a plain neighbour (uncovered, not one-way) at the start', function () {
  var gen = require('../src/gen/generator.js'), tiers = ['easy', 'normal', 'hard', 'extreme'], seen = 0;
  tiers.forEach(function (tier, ti) {
    for (var sd = 0; sd < 12; sd++) {
      var r = gen.generate({ tier: tier, seed: 90000 + 5 * sd + ti, allow: ['ice', 'lock', 'wrap', 'oneway', 'hidden', 'pair'] });
      if (!r) continue;
      var st = model.parse(r.level, { layout: layouts[r.level.layout], raw: true });
      st.boxes.forEach(function (b, bi) {
        if (!b.ice) return;
        seen++;
        var ok = st.neighbours[bi].some(function (nb) { var o = st.boxes[nb]; return !model.isCovered(o) && !o.oneway; });
        assert.ok(ok, tier + ' seed ' + sd + ': frozen box ' + b.id + ' has no plain neighbour');
      });
    }
  });
  assert.ok(seen >= 5, 'too few frozen boxes (' + seen + ')');
});
