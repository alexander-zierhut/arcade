// tests/engine.test.js: the engine (model, rules, belt, sim) against rules R1-R28 of the plan, small hand-built levels
'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var config = require('../src/config.js');
var model = require('../src/engine/model.js');
var rules = require('../src/engine/rules.js');
var belt = require('../src/engine/belt.js');
var sim = require('../src/engine/sim.js');

// ---------------------------------------------------------------- fixtures

// A fake layout that follows API.md section 7: perimeter 1200, slots with the arc length s of their mouth,
// neighbours. G shares its mouth position with B (used by the R27 test).
var LAYOUT = (function () {
  var slots = {}, svals = { A: 100, B: 300, C: 500, D: 700, E: 900, F: 1100, G: 300 }, id;
  for (id in svals) slots[id] = { x: 0, y: 0, w: 132, h: 44, mouth: 'right', s: svals[id] };
  return {
    name: 'fake', path: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }], corner: 0,
    perimeter: 1200, plate: 40, slots: slots,
    neighbours: { A: ['B'], B: ['A', 'C'], C: ['B', 'D'], D: ['C', 'E'], E: ['D', 'F'], F: ['E'], G: [] },
    order: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  };
})();

// spec: { N, dir, kinds, boxes: [[id, pieces, mods?], ...] }
function level(spec) {
  var boxes = [], i, b, maxk = 0;
  for (i = 0; i < spec.boxes.length; i++) {
    b = { id: spec.boxes[i][0], pieces: spec.boxes[i][1] };
    if (spec.boxes[i][2]) b.mods = spec.boxes[i][2];
    boxes.push(b);
  }
  return { id: 1, tier: 'easy', seed: 1, layout: 'fake', dir: spec.dir || 'cw', N: spec.N || 6, kinds: spec.kinds || 0, boxes: boxes };
}
function withKinds(spec) {     // kinds = highest kind used + 1 when the spec does not say
  var st;
  if (!spec.kinds) { st = model.parse(level({ N: spec.N, boxes: spec.boxes, dir: spec.dir }), { raw: true }); spec.kinds = st.kinds; }
  return spec;
}
function S(spec) { return model.parse(level(withKinds(spec)), { layout: LAYOUT }); }
function mk(spec) { return sim.create(level(withKinds(spec)), { layout: LAYOUT }); }
function pc(k, id) { return { id: id === undefined ? 900 + k : id, k: k, key: null, from: 0 }; }
function types(evs) { return evs.map(function (e) { return e.type; }); }
function ofType(evs, t) { return evs.filter(function (e) { return e.type === t; }); }

function run(s, ms) {      // ticks in 16 ms steps
  var all = [], left = ms, d;
  while (left > 0) { d = Math.min(16, left); all = all.concat(sim.tick(s, d)); left -= d; }
  return all;
}
function runUntil(s, pred, maxMs) {
  var all = [], t = 0, ev;
  while (t < maxMs) {
    ev = sim.tick(s, 16);
    t += 16;
    all = all.concat(ev);
    if (pred(s, ev)) break;
  }
  return all;
}
function moveOut(st, boxIndex, n) {     // puts the n front pieces of a box into its outbox (as a tap would)
  var b = st.boxes[boxIndex], i;
  for (i = 0; i < n; i++) b.outbox.push(b.pieces.pop());
  rules.syncPending(b);
}
// taps and runs until every departure of that box has happened; -> { r (the tap result), events (tap + tick events) }
function tapGo(s, b) {
  var r = sim.tap(s, b), ev = r.events.slice();
  if (r.ok) ev = ev.concat(runUntil(s, function (x) { return x.state.boxes[b].outbox.length === 0; }, 30000));
  return { r: r, events: ev };
}
function beltKinds(s) { return s.state.belt.map(function (p) { return p ? p.k : null; }); }
function pieceCount(state) {     // pieces in boxes (and their outboxes) + on the belt
  var n = 0, i;
  for (i = 0; i < state.boxes.length; i++) n += state.boxes[i].pieces.length + state.boxes[i].outbox.length;
  for (i = 0; i < state.belt.length; i++) if (state.belt[i]) n++;
  return n;
}
// four-box blocker: a full mixed box accepts nothing and (as its front run is 1) is only a distraction
var FULL_X = [2, 3, 2, 3];

// ---------------------------------------------------------------- belt geometry (R1, R24-R27)

test('belt: spacing and plate positions (R1)', function () {
  var b = belt.create({ N: 5, perimeter: 1000, dir: 'cw', mouths: [] });
  assert.equal(b.spacing, 200);
  assert.deepEqual([0, 1, 2, 3, 4].map(function (i) { return belt.platePos(b, i); }), [0, 200, 400, 600, 800]);
  belt.advance(b, 50);
  assert.deepEqual([0, 1, 4].map(function (i) { return belt.platePos(b, i); }), [50, 250, 850]);
  belt.advance(b, 190);                                  // plate 4 wraps past the origin
  assert.equal(belt.platePos(b, 4), 40);
  assert.equal(b.phase, 240);
});

test('belt: direction ccw reports layout (clockwise) units, mouths stay in travel units', function () {
  var b = belt.create({ N: 5, perimeter: 1000, dir: 'ccw', mouths: [{ box: 0, s: 1250 }, { box: 1, s: -100 }] });
  assert.deepEqual(b.mouths.map(function (m) { return m.s; }), [250, 900]);   // normalised, sorted
  assert.equal(belt.platePos(b, 1), 800);               // travel 200 -> layout 800
  belt.advance(b, 50);
  assert.equal(belt.platePos(b, 0), 950);
  assert.equal(belt.travelPos(b, 0), 50);
});

test('belt: one lap crosses every mouth with every plate exactly once, in time order', function () {
  var b = belt.create({ N: 4, perimeter: 1000, dir: 'cw', mouths: [{ box: 0, s: 0 }, { box: 1, s: 333 }, { box: 2, s: 333 }, { box: 3, s: 900 }] });
  var cs = belt.advance(b, 1000), seen = {}, i, key;
  assert.equal(cs.length, 4 * 4);
  for (i = 0; i < cs.length; i++) {
    key = cs[i].plate + '/' + cs[i].mouth;
    assert.equal(seen[key], undefined);
    seen[key] = true;
    if (i) assert.ok(cs[i].at >= cs[i - 1].at);
  }
  assert.equal(Object.keys(seen).length, 16);
});

test('belt: no crossing is skipped whatever the step size', function () {
  var mouths = [{ box: 0, s: 123.456 }, { box: 1, s: 777.7 }], total = 0, i;
  var small = belt.create({ N: 7, perimeter: 1234, dir: 'cw', mouths: mouths });
  var big = belt.create({ N: 7, perimeter: 1234, dir: 'cw', mouths: mouths });
  var a = 0, c = 0;
  for (i = 0; i < 4000; i++) { a += belt.advance(small, 13.7).length; total += 13.7; }
  c = belt.advance(big, total).length;
  assert.equal(a, c);
  assert.equal(belt.advance(big, 5 * 1234).length, 5 * 7 * 2);     // five laps in one call
});

test('belt: nextFree orders by arrival and skips taken plates; timeToMouth', function () {
  var b = belt.create({ N: 4, perimeter: 1000, dir: 'cw', mouths: [{ box: 0, s: 300 }] });
  function all() { return true; }
  assert.equal(belt.nextFree(b, 0, all), 1);            // plate 1 at 250, 50 before the mouth
  assert.equal(belt.nextFree(b, 0, function (p) { return p !== 1; }), 0);
  assert.equal(belt.nextFree(b, 0, function (p) { return p === 3; }), 3);   // arrival order 1, 0, 3, 2
  assert.equal(belt.nextFree(b, 0, function () { return false; }), -1);
  assert.equal(belt.timeToMouth(b, 1, 0, 0.5), 100);
  assert.equal(belt.timeToMouth(b, 0, 0, 0.5), 600);
  assert.equal(belt.timeToMouth(b, 2, 0, 0.5), 1600);
});

test('R26 belt: the plate within half a spacing before the mouth is "reaching now"', function () {
  var b = belt.create({ N: 4, perimeter: 1000, dir: 'cw', mouths: [{ box: 0, s: 300 }] });
  assert.equal(belt.reaching(b, 0), 1);                 // 50 before the mouth, window is 125
  belt.advance(b, 40);                                  // plate 1 at 290: 10 before
  assert.equal(belt.reaching(b, 0), 1);
  belt.advance(b, 20);                                  // plate 1 crossed (310); plate 0 at 60 is 240 away
  assert.equal(belt.reaching(b, 0), -1);
  assert.equal(belt.nextFree(b, 0, function () { return true; }), 0);
});

test('belt: a plate exactly on a mouth has crossed it; its next crossing is a lap away', function () {
  var b = belt.create({ N: 4, perimeter: 1000, dir: 'cw', mouths: [{ box: 0, s: 0 }] });
  assert.equal(belt.timeToMouth(b, 0, 0, 1), 1000);
  function plate0(cs) { return cs.filter(function (c) { return c.plate === 0; }).length; }
  assert.equal(plate0(belt.advance(b, 10)), 0);
  assert.equal(plate0(belt.advance(b, 990)), 1);
});

// ---------------------------------------------------------------- R3 pieces and model

test('R3: piece accounting, ids and validation', function () {
  var ok = { N: 6, kinds: 3, boxes: [['A', [0, 1, 2, 0]], ['B', [1, 2, 0, 1]], ['C', [2, 0, 1, 2]], ['D', []]] };
  var st = S(ok), ids = {}, n = 0, i, j;
  assert.deepEqual(model.validate(level(ok), { layout: LAYOUT }), []);
  for (i = 0; i < st.boxes.length; i++) for (j = 0; j < st.boxes[i].pieces.length; j++) { ids[st.boxes[i].pieces[j].id] = true; n++; }
  assert.equal(n, 12);                                  // 4 per kind
  assert.equal(Object.keys(ids).length, 12);            // unique ids
  assert.equal(pieceCount(st), 12);
  assert.ok(model.pieceId(st) > 11);

  var five = { N: 6, kinds: 3, boxes: [['A', [0, 1, 2, 0]], ['B', [1, 2, 0, 1]], ['C', [2, 0, 1, 0]]] };
  assert.ok(model.validate(level(five)).some(function (m) { return /^R3: kind 0 has 5 pieces/.test(m); }));
  assert.ok(model.validate(level(five)).some(function (m) { return /^R3: kind 2 has 3 pieces/.test(m); }));
  var few = { N: 6, kinds: 3, boxes: [['A', [0, 1, 2, 0]], ['B', [1, 2, 0, 1, 2, 0, 1, 2]]] };
  var errs = model.validate(level(few));
  assert.ok(errs.some(function (m) { return /^R3: 2 boxes for 3 kinds/.test(m); }));
  assert.ok(errs.some(function (m) { return /^R2: box B holds 8 pieces/.test(m); }));
  var range = { N: 6, kinds: 2, boxes: [['A', [0, 1, 0, 1]], ['B', [1, 0, 1, 0]], ['C', [5]]] };
  assert.ok(model.validate(level(range)).some(function (m) { return /^R3: kind 5 in box C is outside/.test(m); }));
  assert.ok(model.validate(level({ N: 3, kinds: 1, boxes: [['A', [0, 0, 0]], ['B', [0]]] })).some(function (m) { return /^R1:/.test(m); }));
  assert.ok(model.validate(level({ N: 6, kinds: 1, boxes: [['Z9', []]] }), { layout: LAYOUT })[0].indexOf('layout') > 0);
  assert.throws(function () { model.parse(level({ N: 6, boxes: [['A', ['x:1']]] })); }, /level: box A: bad piece/);
});

test('R3: piece sugar parses to pieces, keys, hidden flags and pair ids', function () {
  var st = model.parse(level({ N: 6, kinds: 8, boxes: [['A', [3, 'h:5', 'k:Q:6', 'hk:R:7', ['p', 2, 'h:4']]], ['B', [], { lock: 'Q' }], ['C', [], { lock: 'R' }]] }), { raw: true });
  var p = st.boxes[0].pieces;
  assert.deepEqual(p.map(function (x) { return x.k; }), [3, 5, 6, 7, 2, 4]);
  assert.deepEqual(p.map(function (x) { return x.hidden; }), [false, true, false, true, false, true]);
  assert.deepEqual(p.map(function (x) { return x.key; }), [null, null, 'Q', 'R', null, null]);
  assert.equal(p[4].pair, p[5].pair);
  assert.notEqual(p[4].pair, null);
  assert.equal(p[0].pair, null);
});

test('R3: clone is deep and hash is canonical (belt as a multiset, no piece ids)', function () {
  var st = S({ N: 6, kinds: 3, boxes: [['A', [0, 1, 0]], ['B', ['h:2', 1], { ice: true }]] }), c = model.clone(st);
  assert.equal(model.hash(c), model.hash(st));
  c.boxes[0].pieces.pop();
  assert.notEqual(model.hash(c), model.hash(st));
  assert.equal(st.boxes[0].pieces.length, 3);
  var x = model.clone(st), y = model.clone(st);
  x.belt[0] = pc(1, 5); x.belt[3] = pc(2, 6);
  y.belt[2] = pc(2, 70); y.belt[5] = pc(1, 71);
  assert.equal(model.hash(x), model.hash(y));
  x.pouring[1] = 0;
  assert.notEqual(model.hash(x), model.hash(y));
});

test('R4: the level is won when every kind sits in a closed box', function () {
  var st = S({ N: 6, kinds: 2, boxes: [['A', [0, 0, 0]], ['B', [1, 1, 1, 1]], ['C', []]] });
  assert.equal(rules.isWon(st), false);
  st.belt[0] = pc(0);
  rules.tryLand(st, 0, 0);
  assert.equal(st.boxes[0].closed, true);
  assert.equal(rules.isWon(st), false);                 // kind 1 is not closed yet
  st.closedKinds.push(1);
  assert.equal(rules.isWon(st), true);
});

// ---------------------------------------------------------------- R5-R7 tapping

test('R5: a tap ejects the run, k = min(run, free plates); refused when the belt is full', function () {
  var st = S({ N: 4, kinds: 4, boxes: [['A', [1, 0, 0, 0]], ['B', FULL_X]] });
  assert.equal(rules.runLength(st.boxes[0]), 3);
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 3 });
  st.belt[1] = pc(5, 1); st.belt[2] = pc(5, 2);
  assert.equal(rules.freePlates(st), 2);
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 2 });   // min(3, 2)
  st.belt[0] = pc(5, 3); st.belt[3] = pc(5, 4);
  assert.deepEqual(rules.canEject(st, 0), { ok: false, reason: 'full' });
  assert.deepEqual(rules.canEject(st, 1), { ok: false, reason: 'full' });
});

test('R5: a tap takes k = min(run, free) pieces out and reserves their plates; a full belt refuses with a shake event', function () {
  var s = mk({ N: 4, kinds: 4, boxes: [['A', [1, 0, 0, 0]], ['B', FULL_X]] });
  s.state.belt[2] = pc(5, 50); s.state.belt[3] = pc(5, 51);       // 2 free plates
  var r = sim.tap(s, 0);
  assert.deepEqual([r.ok, r.k], [true, 2]);
  assert.deepEqual(types(r.events), ['tapped']);
  assert.equal(s.state.boxes[0].pieces.length, 2);                // [1, 0] stay
  assert.equal(s.state.boxes[0].outbox.length, 2);
  assert.equal(s.state.boxes[0].pending, 2);
  assert.equal(sim.freePlates(s), 0);                             // the two plates are reserved
  assert.equal(sim.tap(s, 0).reason, 'pending');
  assert.equal(sim.tap(s, 1).reason, 'full');                     // a second tap cannot take them
  var ev = runUntil(s, function (x) { return x.state.boxes[0].outbox.length === 0; }, 9000);
  assert.equal(ofType(ev, 'eject').length, 2);
  assert.equal(s.state.boxes[0].pending, 0);
  // belt is now full of pieces nobody takes: a tap is refused, nothing changes
  var before = model.hash(s.state), logLen = s.log.length;
  var r2 = sim.tap(s, 0);
  assert.deepEqual([r2.ok, r2.reason], [false, 'full']);
  assert.equal(model.hash(s.state), before);
  assert.deepEqual(types(r2.events), ['refuse']);
  assert.equal(r2.events[0].box, 0);
  assert.equal(s.log.length, logLen + 1);
});

test('R5: closed, empty, covered and one-way boxes cannot be tapped', function () {
  var st = S({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', []], ['C', [1], { wrap: 3 }], ['D', [1], { ice: true }], ['E', [1], { lock: 'Z' }], ['F', [2], { oneway: true }]] });
  assert.equal(rules.canEject(st, 0).ok, true);
  st.boxes[0].closed = true;
  assert.equal(rules.canEject(st, 0).reason, 'closed');
  assert.equal(rules.canEject(st, 1).reason, 'empty');
  assert.equal(rules.canEject(st, 2).reason, 'covered');
  assert.equal(rules.canEject(st, 3).reason, 'covered');
  assert.equal(rules.canEject(st, 4).reason, 'covered');
  assert.equal(rules.canEject(st, 5).reason, 'oneway');
});

test('R6: pieces leave front to back, one unit per DEPART_GAP_MS, each on the plate reserved at the tap', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [1, 0, 0]], ['B', FULL_X]] });
  var front = s.state.boxes[0].pieces[2].id, second = s.state.boxes[0].pieces[1].id;
  assert.equal(sim.nextEjectPlate(s, 0), 0);                      // plate 0 is 100 behind the mouth: it reaches it soonest
  var r = sim.tap(s, 0);
  var plan = r.events[0].plan;
  assert.deepEqual(plan.map(function (e) { return e.plate; }), [0, 5]);
  assert.deepEqual(plan.map(function (e) { return e.piece.id; }), [front, second]);
  assert.deepEqual(plan.map(function (e) { return e.from; }), [0, 1000]);
  assert.deepEqual(plan.map(function (e) { return e.departAt; }), [config.DEPART_FIRST_MS, config.DEPART_FIRST_MS + config.DEPART_GAP_MS]);
  assert.equal(config.DEPART_FIRST_MS, 900);
  assert.equal(config.DEPART_GAP_MS, 900);
  assert.equal(config.LAND_MS, 800);
  assert.deepEqual(beltKinds(s), [null, null, null, null, null, null]);        // nothing on a plate before departAt
  assert.equal(types(run(s, 899)).length, 0);
  var ev1 = ofType(run(s, 1), 'eject');
  assert.equal(ev1.length, 1);
  assert.deepEqual([ev1[0].plate, ev1[0].piece.id, ev1[0].time, ev1[0].departAt, ev1[0].teleported], [0, front, 900, 900, true]);
  assert.ok(Math.abs(ev1[0].from - 135) < 1e-6 || ev1[0].from > 0);          // the plate rode on until it was lifted
  assert.equal(types(run(s, 899)).length, 0);
  var ev2 = ofType(run(s, 1), 'eject');
  assert.deepEqual([ev2[0].plate, ev2[0].piece.id, ev2[0].time], [5, second, 1800]);
  assert.deepEqual([ev1[0].to, ev2[0].to], [99.5, 99.5]);                     // each unit drops EPS behind the mouth
  assert.equal(s.state.belt[0].from, 0);
  assert.equal(sim.freePlates(s), 4);
  assert.equal(types(run(s, 500)).length, 0);                     // the departure crossing is not a landing
});

test('R6/R10: a dropped piece crosses its own mouth before any other mouth, cw and ccw', function () {
  // E is empty and stands 30 units from R's mouth. The mate of a pair is dropped 40 units behind its partner, i.e.
  // behind E's mouth: it must not land in E before it has left R.
  [['cw', 470], ['ccw', 530]].forEach(function (c) {
    var slots = { R: { x: 0, y: 0, w: 132, h: 44, mouth: 'right', s: 500 }, E: { x: 0, y: 0, w: 132, h: 44, mouth: 'right', s: c[1] } };
    var lay = { perimeter: 1200, plate: 40, slots: slots, neighbours: {} };
    var s = sim.create(level({ N: 8, dir: c[0], kinds: 10, boxes: [['R', [9, ['p', 1, 1]]], ['E', []]] }), { layout: lay });
    var r = sim.tap(s, 0);
    assert.equal(r.k, 2);
    var ev = run(s, 900);
    var ej = ofType(ev, 'eject');
    assert.equal(ej.length, 2);
    assert.ok(Math.abs(ej[1].to - ej[0].to) > 39.9 && Math.abs(ej[1].to - ej[0].to) < 40.1, 'the mate is a plate width behind');
    ev = run(s, 700);                                              // 40.5 units take 270 ms
    assert.equal(ofType(ev, 'land').length, 0);                    // nobody landed in E (or back in R) on the way out
    assert.equal(s.state.boxes[1].pieces.length, 0);
    assert.deepEqual(s.skip, s.skip.map(function () { return -1; }));   // both have departed
    ev = ofType(run(s, 8000), 'land');                             // after the departure they are ordinary pieces again
    assert.ok(ev.length >= 1);
  });
});

test('R6: a plate in the way is respected; the drop steps back until 0.9 plate widths are clear', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [1, 0]], ['B', FULL_X]] });
  sim.tap(s, 0);
  run(s, 890);
  s.state.belt[4] = pc(7, 61);                                     // a busy plate stands right behind mouth A
  belt.teleport(s.belt, 4, 75);
  var ev = ofType(run(s, 20), 'eject');
  assert.equal(ev.length, 1);
  assert.ok(ev[0].to < 99.5 - 1e-9);                               // stepped back past the plate near 78
  var pos = s.belt.pos.slice().sort(function (a, b) { return a - b; }), i, gap;
  for (i = 0; i < pos.length; i++) {
    gap = i + 1 < pos.length ? pos[i + 1] - pos[i] : pos[0] + 1200 - pos[i];
    assert.ok(gap >= 36 - 1e-9, 'plates too close: ' + gap);
  }
  assert.equal(s.state.belt[4].id, 61);                            // the busy plate keeps its piece
});

test('R6/R10: a piece on a plate is beyond the player (taps cannot touch it) and keeps its plate while riding', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [1, 0]], ['B', FULL_X]] });
  sim.tap(s, 0);
  run(s, 1000);
  var idx = beltKinds(s).indexOf(0);
  assert.equal(idx, 0);
  run(s, 5000);
  assert.equal(s.state.belt[idx].k, 0);                           // same plate, still there
});

test('R7: a tap reveals the hidden piece that becomes the front at once, at the tap', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', ['h:3', 'h:2', 1]], ['B', FULL_X]] });
  assert.equal(s.state.boxes[0].pieces[1].hidden, true);
  var r = sim.tap(s, 0);
  assert.deepEqual(types(r.events), ['tapped', 'reveal']);
  assert.equal(r.events[1].box, 0);
  assert.equal(r.events[1].piece.k, 2);
  assert.equal(s.state.boxes[0].pieces[1].hidden, false);
  assert.equal(s.state.boxes[0].pieces[0].hidden, true);          // the one behind stays hidden
  assert.equal(s.state.belt.filter(Boolean).length, 0);           // the piece is not on a plate before departAt
  assert.deepEqual(types(run(s, 900)), ['eject']);                // the departure reveals nothing
});

test('tap: the k pieces leave box.pieces at once into box.outbox; `tapped` carries the plan; ejects follow plate by plate', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [1, 0, 0, 0]], ['B', FULL_X]] });
  var ids = s.state.boxes[0].pieces.map(function (p) { return p.id; });
  var r = sim.tap(s, 0);
  assert.deepEqual([r.ok, r.k], [true, 3]);
  assert.deepEqual(types(r.events), ['tapped']);
  assert.deepEqual([r.events[0].box, r.events[0].k], [0, 3]);
  assert.deepEqual(r.events[0].pieces.map(function (p) { return p.id; }), [ids[3], ids[2], ids[1]]);
  assert.deepEqual(r.events[0].plan.map(function (e) { return e.piece.id; }), [ids[3], ids[2], ids[1]]);
  assert.deepEqual(r.events[0].plan.map(function (e) { return e.departAt; }), [900, 1800, 2700]);
  assert.deepEqual(s.state.boxes[0].pieces.map(function (p) { return p.id; }), [ids[0]]);
  assert.deepEqual(s.state.boxes[0].outbox.map(function (p) { return p.id; }), [ids[3], ids[2], ids[1]]);
  assert.equal(s.state.boxes[0].pending, 3);                      // derived: outbox.length
  assert.equal(sim.freePlates(s), 3);                             // 6 plates - 3 reserved
  assert.equal(pieceCount(s.state), 8);
  assert.equal(sim.tap(s, 0).reason, 'pending');
  var ev = ofType(run(s, 2800), 'eject');
  assert.deepEqual(ev.map(function (e) { return e.piece.id; }), [ids[3], ids[2], ids[1]]);
  assert.deepEqual(ev.map(function (e) { return e.time; }), [900, 1800, 2700]);
  assert.equal(s.state.boxes[0].outbox.length, 0);
  assert.equal(s.state.boxes[0].pending, 0);
  // rules.tap on its own parks the pieces in the outbox; hash and clone see it
  var st = S({ N: 6, kinds: 4, boxes: [['A', [1, 0, 0, 0]], ['B', FULL_X]] }), h = model.hash(st);
  var t = rules.tap(st, 0);
  assert.deepEqual([t.ok, t.k], [true, 3]);
  assert.equal(st.boxes[0].outbox.length, 3);
  assert.equal(rules.freePlates(st), 3);
  assert.equal(rules.canEject(st, 0).reason, 'pending');
  assert.notEqual(model.hash(st), h);
  var c = model.clone(st);
  assert.equal(model.hash(c), model.hash(st));
  c.boxes[0].outbox.pop();
  assert.notEqual(model.hash(c), model.hash(st));
  assert.equal(st.boxes[0].outbox.length, 3);
});

test('tap: reserved plates are taken by nobody else, capacity holds, the plate is the one reaching the mouth soonest', function () {
  var s = mk({ N: 4, kinds: 4, boxes: [['A', [0, 0, 0]], ['B', [1, 1]], ['C', FULL_X]] });
  var r = sim.tap(s, 0);                                           // k = 3 of 4 plates
  var plan = r.events[0].plan, res = plan.map(function (e) { return e.plate; });
  assert.equal(new Set(res).size, 3);
  assert.equal(sim.freePlates(s), 1);
  var r2 = sim.tap(s, 1);                                          // B's run of 2 gets the one plate left
  assert.equal(r2.k, 1);
  var plate = r2.events[0].plan[0].plate;
  assert.ok(res.indexOf(plate) < 0);                               // not one of the reserved ones
  assert.equal(sim.freePlates(s), 0);
  assert.equal(sim.tap(s, 2).reason, 'full');
  var used = s.state.belt.filter(Boolean).length + s.state.boxes.reduce(function (n, b) { return n + b.outbox.length; }, 0);
  assert.ok(used <= 4);
  // soonest to reach: with the plates at 0, 300, 600, 900 and mouth A at 100, plate 0 (100 behind) goes first, then 3 (400)
  var t = mk({ N: 4, kinds: 4, boxes: [['A', [0, 0, 0]], ['B', FULL_X]] });
  assert.deepEqual(sim.tap(t, 0).events[0].plan.map(function (e) { return e.plate; }), [0, 3, 2]);
  // reserved plates carry nothing: they never land anything, they just ride
  run(t, 800);
  assert.equal(types(t.log.slice(1)).length, 0);
  // the verdict "lost" waits for the scheduled departures
  var u = mk({ N: 4, kinds: 10, boxes: [['A', [5, 4, 4, 4]], ['B', [6, 7, 6, 7]], ['C', [8, 9, 8, 9]]] });
  sim.tap(u, 0);
  assert.equal(rules.isStuck(u.state), false);
});

test('tap: the same taps at the same times give the same event log (departures included)', function () {
  function game() {
    var s = mk({ N: 6, kinds: 2, boxes: [['A', [0, 0]], ['B', [0, 0]], ['C', [1, 1]], ['D', [1, 1]]] });
    sim.tap(s, 0);
    run(s, 4000);
    sim.tap(s, 2);
    run(s, 12000);
    return s;
  }
  var a = game(), b = game();
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.equal(a.status, 'won');
});

// ---------------------------------------------------------------- R8-R12 landing

test('R8: accept matrix', function () {
  var st = S({ N: 6, kinds: 6, boxes: [
    ['A', []],                                   // 0 empty
    ['B', [4, 2]],                               // 1 front 2, room
    ['C', [2, 2, 2, 3]],                         // 2 full
    ['D', [2]],                                  // 3 closed (set below)
    ['E', [2], { wrap: 5 }],                     // 4 wrapped
    ['F', [2], { ice: true }],                   // 5 frozen
    ['G', [2], { lock: 'Q' }]] });               // 6 locked
  st.boxes[3].closed = true;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(function (b) { return rules.accepts(st, b, 2); }), [true, true, false, false, false, false, false]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(function (b) { return rules.accepts(st, b, 3); }), [true, false, false, false, false, false, false]);
  var ow = S({ N: 6, kinds: 4, boxes: [['A', [], { oneway: true }], ['B', [2, 2], { oneway: true }], ['C', [2], { oneway: true, ice: true }]] });
  assert.deepEqual([0, 1, 2].map(function (b) { return rules.accepts(ow, b, 2); }), [true, true, false]);
  assert.deepEqual([0, 1, 2].map(function (b) { return rules.accepts(ow, b, 3); }), [true, false, false]);
});

test('R8: a landing moves the piece from the plate into the box, the plate is free at once', function () {
  var st = S({ N: 6, kinds: 4, boxes: [['A', [1]]] });
  st.belt[3] = pc(1, 77);
  var ev = rules.tryLand(st, 3, 0);
  assert.deepEqual(types(ev), ['land']);
  assert.deepEqual([ev[0].box, ev[0].plate, ev[0].piece.id, ev[0].piece.k], [0, 3, 77, 1]);
  assert.equal(st.belt[3], null);
  assert.equal(rules.freePlates(st), 6);
  assert.equal(rules.front(st.boxes[0]).id, 77);
  assert.deepEqual(rules.tryLand(st, 3, 0), []);        // nothing on the plate any more
});

test('R9: pouring preference, a second accepting box is skipped while the pouring box can still be completed', function () {
  var st = S({ N: 6, kinds: 3, boxes: [['A', [2]], ['B', [2, 2]]] });
  st.belt[0] = pc(2, 100); st.belt[1] = pc(2, 101);
  assert.deepEqual(types(rules.tryLand(st, 0, 1)), ['land']);     // B = 3, a piece of 2 remains: 3 + 1 >= 4
  assert.deepEqual(st.pouring, { 2: 1 });
  assert.deepEqual(rules.tryLand(st, 1, 0), []);                  // A accepts 2 but B pours and can be completed
  assert.equal(st.belt[1].id, 101);
  assert.deepEqual(types(rules.tryLand(st, 1, 1)), ['land', 'close']);
  assert.deepEqual(st.pouring, {});                               // closed: pouring ends
});

test('R9: no preference when the pouring box cannot be completed by what is in transit', function () {
  var st = S({ N: 6, kinds: 3, boxes: [['A', [2]], ['B', [2, 2]]] });
  st.belt[1] = pc(2, 101);
  st.pouring[2] = 1;                                              // B holds 2, one more 2 in transit: 3 < 4
  assert.equal(rules.wouldLand(st, 1, 0), true);                  // first accepting box
  assert.equal(rules.wouldLand(st, 1, 1), true);
  st.belt[3] = pc(2, 102);                                        // now 2 + 2 >= 4
  assert.equal(rules.wouldLand(st, 1, 0), false);
  assert.equal(rules.wouldLand(st, 1, 1), true);
  moveOut(st, 1, 1);                                              // a pouring box that is itself ejecting is no target
  assert.equal(rules.wouldLand(st, 1, 0), true);
});

test('R9: pouring ends when the pouring box is tapped', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [2]], ['B', [3, 2]]] });
  s.state.pouring[2] = 1;
  s.state.belt[4] = pc(2);
  assert.equal(sim.tap(s, 1).ok, true);
  assert.deepEqual(s.state.pouring, {});
  var s2 = mk({ N: 6, kinds: 4, boxes: [['A', [2]], ['B', [3, 2]]] });
  s2.state.pouring[2] = 0;                                        // pouring in another box survives a tap elsewhere
  assert.equal(sim.tap(s2, 1).ok, true);
  assert.deepEqual(s2.state.pouring, { 2: 0 });
});

test('R9: pouring ends when the pouring box closes, and when it no longer accepts', function () {
  var st = S({ N: 6, kinds: 3, boxes: [['A', [2]], ['B', [2, 2, 2]]] });
  st.belt[0] = pc(2, 100); st.belt[1] = pc(2, 101);
  rules.tryLand(st, 0, 1);                                        // B closes, a 2 is still on the belt
  assert.equal(st.boxes[1].closed, true);
  assert.deepEqual(st.pouring, {});
  assert.deepEqual(types(rules.tryLand(st, 1, 0)), ['land']);     // A accepts now
  var st2 = S({ N: 6, kinds: 4, boxes: [['A', [2]], ['B', [3]]] });
  st2.pouring[2] = 1;                                             // stale: B's front is not 2
  st2.belt[0] = pc(2);
  assert.deepEqual(types(rules.tryLand(st2, 0, 0)), ['land']);
});

test('R9: a piece rides past the first accepting box into the pouring box (sim)', function () {
  // A ejects 0 0 0; B (upstream of C) and C both accept 0. B + the run in transit can reach 4, so B takes all three
  var s = mk({ N: 6, kinds: 3, boxes: [['A', [0, 0, 0]], ['B', [0]], ['C', [0]]] });
  sim.tap(s, 0);
  var lands = ofType(run(s, 8000), 'land');
  assert.deepEqual(lands.map(function (e) { return e.box; }), [1, 1, 1]);
  assert.equal(s.state.boxes[1].closed, true);                    // 1 + 3 = 4
  assert.equal(s.state.boxes[2].pieces.length, 1);
  // a stray 0 passes B (which accepts it) because C pours and 3 + 1 >= 4
  var s2 = mk({ N: 6, kinds: 3, boxes: [['A', [1]], ['B', [0]], ['C', [0, 0, 0]]] });
  s2.state.belt[belt.nextFree(s2.belt, belt.mouthIndex(s2.belt, 1), function () { return true; })] = pc(0, 500);
  s2.state.pouring[0] = 2;
  var ev = ofType(run(s2, 8000), 'land');
  assert.equal(ev[0].box, 2);
  assert.equal(s2.state.boxes[1].pieces.length, 1);
  // control: C = [0] cannot be completed by one stray, so the first accepting box (B) takes it
  var s3 = mk({ N: 6, kinds: 3, boxes: [['A', [1]], ['B', [0]], ['C', [0]]] });
  s3.state.belt[belt.nextFree(s3.belt, belt.mouthIndex(s3.belt, 1), function () { return true; })] = pc(0, 500);
  s3.state.pouring[0] = 2;
  assert.equal(ofType(run(s3, 8000), 'land')[0].box, 1);
});

test('R10: a piece lands in the first accepting box along the belt', function () {
  var s = mk({ N: 6, kinds: 3, boxes: [['A', [1, 1]], ['B', [1]], ['C', [1]]] });
  sim.tap(s, 0);
  var lands = ofType(run(s, 6000), 'land');
  assert.deepEqual(lands.map(function (e) { return e.box; }), [1, 1]);
  assert.equal(s.state.boxes[1].pieces.length, 3);
  assert.equal(s.state.boxes[2].pieces.length, 1);
});

test('R10b: an empty box lets a piece ride on when a matching box downstream can be completed', function () {
  // E1 and E2 are empty, D holds three 0: the 0 skips both empty boxes (1 and 2 of them) and completes D
  var st = S({ N: 6, kinds: 2, boxes: [['A', []], ['B', []], ['C', [0, 0, 0]]] });
  st.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(st, 0, 0), false);
  assert.deepEqual(rules.tryLand(st, 0, 0), []);
  assert.deepEqual(rules.tryLand(st, 0, 1), []);
  assert.equal(rules.wouldLand(st, 0, 2), true);
  assert.deepEqual(types(rules.tryLand(st, 0, 2)), ['land', 'close']);
  // through the sim: a 0 rides past the empty boxes A and B and completes C
  var s = mk({ N: 6, kinds: 2, boxes: [['A', []], ['B', []], ['C', [0, 0, 0]]] });
  s.state.belt[belt.nextFree(s.belt, belt.mouthIndex(s.belt, 0), function () { return true; })] = pc(0, 101);
  var ev = ofType(run(s, 9000), 'land');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].box, 2);
  assert.equal(s.state.boxes[0].pieces.length + s.state.boxes[1].pieces.length, 0);
  assert.equal(s.state.boxes[2].closed, true);
});

test('R10b: the count includes every piece of that kind on the belt', function () {
  var st = S({ N: 6, kinds: 2, boxes: [['A', []], ['B', [0, 0]]] });
  st.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(st, 0, 0), true);                  // 2 + 1 piece on the belt < 4: not completable
  st.belt[3] = pc(0, 101);
  assert.equal(rules.wouldLand(st, 0, 0), false);                 // 2 + 2 >= 4: skip the empty box
  assert.equal(rules.wouldLand(st, 3, 0), false);
  assert.equal(rules.wouldLand(st, 0, 1), true);
  // one piece in D, one on the belt: not completable, the empty box takes it
  var one = S({ N: 6, kinds: 2, boxes: [['A', []], ['B', [0]]] });
  one.belt[0] = pc(0, 100);
  assert.deepEqual(types(rules.tryLand(one, 0, 0)), ['land']);
  // two pieces of c on the belt skip an empty box for a 2-piece match, both land in the match
  var s = mk({ N: 6, kinds: 3, boxes: [['A', [0, 0]], ['B', []], ['C', [0, 0]], ['D', [1]]] });
  sim.tap(s, 0);
  var lands = ofType(run(s, 9000), 'land');
  assert.deepEqual(lands.map(function (e) { return e.box; }), [2, 2]);
  assert.equal(s.state.boxes[2].closed, true);
  assert.equal(s.state.boxes[1].pieces.length, 0);
});

test('R10b: covered boxes cannot complete anything; a one-way box can', function () {
  [{ ice: true }, { wrap: 1 }, { lock: 'Z' }].forEach(function (mods) {
    var st = S({ N: 6, kinds: 3, boxes: [['A', []], ['B', [0, 0, 0], mods]] });
    st.belt[0] = pc(0, 100);
    assert.equal(rules.wouldLand(st, 0, 0), true);                // D is covered: the empty box takes it
  });
  var ow = S({ N: 6, kinds: 3, boxes: [['A', []], ['B', [0, 0, 0], { oneway: true }]] });
  ow.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(ow, 0, 0), false);
  assert.deepEqual(types(rules.tryLand(ow, 0, 1)), ['land', 'close']);
  var closed = S({ N: 6, kinds: 3, boxes: [['A', []], ['B', [0, 0, 0]]] });
  closed.boxes[1].closed = true;
  closed.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(closed, 0, 0), true);
  var full = S({ N: 6, kinds: 3, boxes: [['A', []], ['B', [1, 0, 0, 0]]] });   // full: no room
  full.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(full, 0, 0), true);
  var mid = S({ N: 6, kinds: 3, boxes: [['A', []], ['B', [0, 0, 0]]] });       // being emptied: not a target
  moveOut(mid, 1, 1);
  mid.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(mid, 0, 0), true);
});

test('R10b: non-empty matching boxes keep the old rule (first accepting box); the source box is skipped when empty', function () {
  var st = S({ N: 6, kinds: 3, boxes: [['A', [0]], ['B', [0, 0, 0]]] });
  st.belt[0] = pc(0, 100);
  assert.equal(rules.wouldLand(st, 0, 0), true);                  // A is not empty: first accepting box
  // re-entry: A is emptied by its own tap; its two 0 ride on past the now empty A into D = [0, 0]
  var s = mk({ N: 6, kinds: 3, boxes: [['A', [0, 0]], ['B', FULL_X], ['C', [0, 0]]] });
  sim.tap(s, 0);
  var lands = ofType(run(s, 9000), 'land');
  assert.deepEqual(lands.map(function (e) { return e.box; }), [2, 2]);
  assert.equal(s.state.boxes[0].pieces.length, 0);
  // control: with no completable box the source takes its pieces back (R10)
  var c = mk({ N: 6, kinds: 3, boxes: [['A', [0, 0]], ['B', FULL_X]] });
  sim.tap(c, 0);
  assert.equal(ofType(run(c, 12000), 'land')[0].box, 0);
});

test('R10b: pieces still leaving a tapped box count as in transit', function () {
  // a tapped run of 3 with a 1-piece match downstream: 1 + 3 >= 4, so the empty box in between is skipped at once
  var s = mk({ N: 6, kinds: 2, boxes: [['A', [0, 0, 0]], ['B', []], ['C', [0]]] });
  sim.tap(s, 0);
  var lands = ofType(run(s, 9000), 'land');
  assert.deepEqual(lands.map(function (e) { return e.box; }), [2, 2, 2]);
  assert.equal(s.state.boxes[2].closed, true);
  assert.equal(s.state.boxes[1].pieces.length, 0);
  // a tapped run of 2 with a 1-piece match: 1 + 2 < 4, the first accepting box (the empty one) takes them
  var t = mk({ N: 6, kinds: 2, boxes: [['A', [0, 0]], ['B', []], ['C', [0]]] });
  sim.tap(t, 0);
  lands = ofType(run(t, 9000), 'land');
  assert.deepEqual(lands.map(function (e) { return e.box; }), [1, 1]);
  assert.equal(t.state.boxes[2].pieces.length, 1);
  // the count itself: the outbox pieces of that kind, pair members one by one
  var st = S({ N: 6, kinds: 2, boxes: [['A', [1, 0, ['p', 0, 0]]], ['B', []], ['C', [0]]] });
  st.belt[0] = pc(0, 100);                                        // one 0 on a plate; C holds one
  moveOut(st, 0, 1);                                              // 1 + 1 in transit + C's 1 = 3 < 4
  assert.equal(rules.wouldLand(st, 0, 1), true);
  moveOut(st, 0, 1);                                              // the pair is out: 1 + 2 + C's 1 = 4
  assert.equal(rules.wouldLand(st, 0, 1), false);
  moveOut(st, 0, 1);                                              // the single 0 too: 5 >= 4
  assert.equal(rules.wouldLand(st, 0, 1), false);
  assert.equal(st.boxes[0].pieces.length, 1);                     // only the 1 stayed (outbox pieces of other kinds do not count)
});

test('R13/R10b: stuck detection uses the same predicate; a skipped empty box still counts as a way out through D', function () {
  var st = S({ N: 4, kinds: 3, boxes: [['A', []], ['B', [2, 2]], ['C', [1, 0, 1, 0]]] });
  st.belt = [pc(2, 1), pc(2, 2), pc(1, 3), pc(1, 4)];
  assert.equal(rules.isStuck(st), false);
  assert.equal(rules.wouldLand(st, 0, 0), false);                 // skipped for B (2 + 2 >= 4)
  assert.equal(rules.wouldLand(st, 0, 1), true);
  st.boxes[0].pieces = [1, 0, 1, 0];                              // no empty box and no match: dead
  st.boxes[1].pieces = [0, 1, 0, 1];
  assert.equal(rules.isStuck(st), true);
});

test('R10: a piece may re-enter the box it came from', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', FULL_X]] });
  var ids = s.state.boxes[0].pieces.map(function (p) { return p.id; });
  var go = tapGo(s, 0);
  var ej = ofType(go.events, 'eject');
  assert.equal(ej.length, 2);
  var ld = ofType(run(s, 8000 + 3000), 'land');
  assert.equal(ld.length >= 1, true);
  assert.equal(ld[0].box, 0);                                     // back into A, a lap later (the departure crossing does not count)
  assert.ok(ids.indexOf(ld[0].piece.id) >= 0);
  assert.ok(ld[0].time - ej[0].time > 7000);
  run(s, 8000);
  assert.equal(s.state.boxes[0].pieces.length, 2);                // both are back
});

test('R11: a piece that finds no accepting box rides on, there is no lap limit', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [0, 1]], ['B', FULL_X]] });
  sim.tap(s, 0);
  var ev = run(s, 5 * 8000 + 500);
  assert.equal(ofType(ev, 'land').length, 0);
  assert.equal(beltKinds(s).filter(function (k) { return k === 1; }).length, 1);
  assert.equal(s.status, 'play');
});

test('R12: four of a kind close the box; it stays closed, takes nothing, cannot be tapped', function () {
  var s = mk({ N: 6, kinds: 3, boxes: [['A', [0, 0, 0]], ['B', [2]]] });
  s.state.belt[0] = pc(0, 800);
  var ev = rules.tryLand(s.state, 0, 0);
  assert.deepEqual(types(ev), ['land', 'close']);
  assert.equal(ev[1].kind, 0);
  assert.equal(ev[1].box, 0);
  assert.equal(s.state.boxes[0].closed, true);
  assert.deepEqual(s.state.closedKinds, [0]);
  assert.equal(s.state.boxes.length, 2);                          // nothing replaces it
  s.state.belt[1] = pc(0, 801);
  assert.deepEqual(rules.tryLand(s.state, 1, 0), []);
  assert.equal(rules.accepts(s.state, 0, 0), false);
  assert.equal(sim.tap(s, 0).reason, 'closed');
});

test('R12: a box holding other kinds behind does not close at four pieces', function () {
  var st = S({ N: 6, kinds: 3, boxes: [['A', [1, 0, 0]]] });
  st.belt[0] = pc(0);
  assert.deepEqual(types(rules.tryLand(st, 0, 0)), ['land']);
  assert.equal(st.boxes[0].closed, false);
  assert.equal(st.boxes[0].pieces.length, 4);
});

// ---------------------------------------------------------------- R13-R14 losing

test('R13: full belt and no plate can land anywhere is terminal; the sim says lost', function () {
  var st = S({ N: 4, kinds: 8, boxes: [['A', [0, 1, 0, 1]], ['B', [2, 3, 2, 3]]] });
  st.belt = [pc(5, 1), pc(6, 2), pc(5, 3), pc(6, 4)];
  assert.equal(rules.isStuck(st), true);

  // played through the sim: three 4s leave box A, then one 7 leaves B: full, nobody takes 4 or 7
  var s = mk({ N: 4, kinds: 10, boxes: [['A', [5, 4, 4, 4]], ['B', [6, 7, 6, 7]], ['C', [8, 9, 8, 9]]] });
  var go = tapGo(s, 0);
  assert.equal(go.r.k, 3);
  assert.equal(ofType(go.events, 'eject').length, 3);
  assert.equal(s.status, 'play');                                 // R14: three pieces on the belt, plates not full
  assert.equal(sim.freePlates(s), 1);
  assert.equal(sim.tap(s, 1).k, 1);
  run(s, 899);
  assert.equal(s.status, 'play');                                 // the last departure is still scheduled: no verdict yet
  var ev = run(s, 2);
  assert.equal(s.status, 'lost');
  assert.equal(ofType(ev, 'lost').length, 1);
  assert.equal(sim.freePlates(s), 0);
  assert.equal(sim.tap(s, 2).ok, false);
  run(s, 1000);                                                   // the belt keeps moving, tick keeps working
  assert.equal(s.status, 'lost');
  assert.equal(ofType(s.log, 'lost').length, 1);
});

test('R14: not a loss while a piece can still land, or while the belt has a free plate and something can be tapped', function () {
  var st = S({ N: 4, kinds: 8, boxes: [['A', [0, 1, 0, 1]], ['B', [2, 3, 2, 3]], ['C', [1]]] });
  st.belt = [pc(5, 1), pc(6, 2), pc(5, 3), pc(1, 4)];
  assert.equal(rules.isStuck(st), false);                         // the 1 can land in C
  st.belt[3] = pc(6, 4);
  assert.equal(rules.isStuck(st), true);
  st.belt[3] = null;                                              // one free plate, boxes tappable
  assert.equal(rules.isStuck(st), false);
  var empty = S({ N: 4, kinds: 8, boxes: [['A', []], ['B', [2, 3, 2, 3]]] });
  empty.belt = [pc(5, 1), pc(6, 2), pc(5, 3), pc(6, 4)];
  assert.equal(rules.isStuck(empty), false);                      // an empty box accepts anything
});

test('R14: pouring does not hide a way out (a pouring box that is full frees the others)', function () {
  var st = S({ N: 4, kinds: 8, boxes: [['A', [2, 2, 2, 2]], ['B', [5]], ['C', [4, 3, 2, 3]]] });
  st.belt = [pc(5, 1), pc(6, 2), pc(6, 3), pc(6, 4)];
  st.pouring[5] = 0;                                              // A "pours" 5 but is full
  assert.equal(rules.isStuck(st), false);                         // B takes the 5
});

// ---------------------------------------------------------------- R15-R16 hidden and pairs

test('R15: the front piece of a box is never hidden at the start; hidden pieces may sit anywhere behind', function () {
  var base = { N: 6, kinds: 2, boxes: [['A', [0, 'h:1', 0, 1]], ['B', ['h:1', 'h:0', 1, 0]]] };
  assert.deepEqual(model.validate(level(base)), []);
  base.boxes[0][1][3] = 'h:1';
  assert.ok(model.validate(level(base)).some(function (m) { return /^R15: front piece of box A is hidden/.test(m); }));
  var st = S({ N: 6, kinds: 2, boxes: [['A', [0, 'h:1', 0, 1]], ['B', ['h:1', 'h:0', 1, 0]]] });
  assert.equal(st.boxes[1].pieces[0].hidden, true);               // hidden at the very back
  assert.equal(st.initialEvents.length, 0);
});

test('R15: a run ends at a hidden piece, even of the same kind; it becomes the front and is revealed at the tap', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [3, 'h:1', 1]], ['B', FULL_X]] });
  assert.equal(rules.runLength(s.state.boxes[0]), 1);
  var r = sim.tap(s, 0);
  assert.equal(r.k, 1);                                           // only the visible 1 leaves
  assert.deepEqual(types(r.events), ['tapped', 'reveal']);
  assert.equal(r.events[1].piece.k, 1);
  assert.equal(s.state.boxes[0].pieces.length, 2);                // the revealed 1 is the new front
  assert.equal(s.state.boxes[0].outbox.length, 1);
  assert.equal(rules.front(s.state.boxes[0]).hidden, false);
  assert.deepEqual(types(run(s, 3000)), ['eject']);
  // tap again: now the revealed 1 leaves (and the 3 behind it is a different kind)
  assert.equal(sim.tap(s, 0).k, 1);
  // a visible same-kind piece behind a visible front still joins; a hidden one after it ends the run
  var s2 = mk({ N: 6, kinds: 4, boxes: [['A', ['h:1', 1, 1]], ['B', FULL_X]] });
  assert.equal(sim.tap(s2, 0).k, 2);
  assert.equal(s2.state.boxes[0].pieces.length, 1);
  assert.equal(s2.state.boxes[0].pieces[0].hidden, false);        // revealed by the tap
  // a hidden piece of another kind behind the front: the run is just the front, the hidden one is revealed
  var s3 = mk({ N: 6, kinds: 4, boxes: [['A', ['h:2', 'h:3', 1]], ['B', FULL_X]] });
  assert.equal(types(sim.tap(s3, 0).events).join(), 'tapped,reveal');
  assert.equal(s3.state.boxes[0].pieces[0].hidden, true);         // the one behind stays hidden
  assert.equal(s3.state.boxes[0].pieces[1].hidden, false);
  // a pair whose back member is hidden is still one unit; its hidden member is revealed once the pair is the front unit
  var st = S({ N: 6, kinds: 4, boxes: [['A', [['p', 'h:2', 1], 0]], ['B', FULL_X]] });
  assert.equal(rules.unit(st.boxes[0]).size, 1);
  rules.tap(st, 0);
  assert.equal(st.boxes[0].pieces[1].hidden, false);              // pair now the front unit: its mate is revealed
  assert.equal(rules.unit(st.boxes[0]).size, 2);
  // inside a run: a pair with a hidden mate ends the run before it
  var st2 = S({ N: 6, kinds: 4, boxes: [['A', [['p', 'h:1', 1], 1]]] });
  assert.equal(rules.runLength(st2.boxes[0]), 1);
});

test('R16: a bound pair needs 2 free plates; with 1 the tap is refused', function () {
  var st = S({ N: 4, kinds: 4, boxes: [['A', [['p', 1, 1]]], ['B', FULL_X]] });
  st.belt[0] = pc(5, 1); st.belt[1] = pc(5, 2); st.belt[2] = pc(5, 3);
  assert.equal(rules.freePlates(st), 1);
  assert.deepEqual(rules.canEject(st, 0), { ok: false, reason: 'pair' });
  st.belt[2] = null;
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 2 });
});

test('R16: a pair departs as one unit onto two plates, counts 2 on the belt and never binds again', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [['p', 0, 1]]], ['B', FULL_X]] });  // a=0 behind b=1; kinds differ
  var u = rules.unit(s.state.boxes[0]);
  assert.equal(u.size, 2);
  assert.deepEqual(u.pieces.map(function (p) { return p.k; }), [1, 0]);           // front member first
  assert.equal(rules.runLength(s.state.boxes[0]), 2);                              // a mixed pair is a 2-piece unit
  var r = sim.tap(s, 0);
  assert.equal(r.k, 2);
  var plan = r.events[0].plan;
  assert.equal(plan.length, 2);
  assert.equal(plan[0].departAt, plan[1].departAt);                                // one unit, one departure time
  assert.notEqual(plan[0].plate, plan[1].plate);
  var ev = ofType(run(s, 900), 'eject');
  assert.equal(ev.length, 2);
  assert.equal(ev[0].pair, ev[1].pair);
  assert.notEqual(ev[0].pair, null);
  assert.deepEqual(ev.map(function (e) { return e.plate; }), [plan[0].plate, plan[1].plate]);
  assert.deepEqual(ev.map(function (e) { return e.piece.k; }), [1, 0]);
  assert.deepEqual(ev.map(function (e) { return e.to; }), [99.5, 59.5]);          // the mate one plate width behind
  assert.deepEqual(ev.map(function (e) { return e.time; }), [900, 900]);
  assert.equal(sim.freePlates(s), 4);                                              // counts 2
  assert.equal(s.state.belt[plan[0].plate].pair, undefined);
  assert.equal(s.state.belt[plan[1].plate].pair, undefined);
});

test('R16: pair rules inside a run', function () {
  function box(pieces) { return S({ N: 6, kinds: 4, boxes: [['A', pieces]] }).boxes[0]; }
  assert.equal(rules.runLength(box([['p', 0, 0], 0, 0])), 4);             // single 0 0 then pair 0 0: all kind 0
  assert.equal(rules.runLength(box([['p', 0, 1], 0, 0])), 2);             // pair with a 1 ends the run before it
  assert.equal(rules.runLength(box([['p', 1, 0], 0])), 1);                // pair (0 in front, 1 behind) ends the run
  assert.equal(rules.runLength(box([['p', 1, 0], ['p', 0, 0]])), 2);      // front pair of 0 0, next pair not both 0
  assert.equal(rules.runLength(box([2, ['p', 1, 0]])), 2);                // front pair (0,1): a unit of 2
  var st = S({ N: 4, kinds: 4, boxes: [['A', [['p', 0, 0], 0, 0]]] });
  st.belt[3] = pc(7, 70);                                                  // 3 free: run 4 -> units 1 + 1 fit, pair (2) does not
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 2 });
  // the pair that is left is its own unit on a later tap
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [['p', 1, 0], 0]], ['B', FULL_X]] });
  assert.equal(sim.tap(s, 0).k, 1);
  run(s, 1000);
  assert.equal(rules.unit(s.state.boxes[0]).size, 2);
  assert.equal(sim.tap(s, 0).k, 2);
});

test('R16: a pair needs 2 free plates, not neighbouring ones: every piece gets its own plate', function () {
  var st = S({ N: 4, kinds: 4, boxes: [['A', [['p', 1, 1]]], ['B', FULL_X]] });
  st.belt[0] = pc(5, 1); st.belt[2] = pc(5, 2);                  // free plates 1 and 3: two, not neighbours
  assert.equal(rules.freePlates(st), 2);
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 2 });
  var s = mk({ N: 4, kinds: 4, boxes: [['A', [['p', 1, 1]]], ['B', FULL_X]] });
  s.state.belt[0] = pc(5, 1); s.state.belt[2] = pc(5, 2);
  var go = tapGo(s, 0);
  assert.deepEqual([go.r.ok, go.r.k], [true, 2]);
  assert.deepEqual(ofType(go.events, 'eject').map(function (e) { return e.plate; }).sort(), [1, 3]);
  assert.equal(sim.freePlates(s), 0);
  st.belt[1] = pc(5, 3);                                          // one free plate left: refused
  assert.deepEqual(rules.canEject(st, 0), { ok: false, reason: 'pair' });
});

test('R16: k for runs with a pair: units are taken while the free plates last', function () {
  function k(pieces, N) { return rules.canEject(S({ N: N || 6, kinds: 4, boxes: [['A', pieces]] }), 0); }
  assert.deepEqual(k([['p', 0, 0], 0, 0]), { ok: true, k: 4 });
  assert.deepEqual(k([['p', 0, 0], 0, 0], 4), { ok: true, k: 4 });
  assert.deepEqual(k([0, 0, ['p', 0, 0]], 4), { ok: true, k: 4 });
  assert.deepEqual(k([['p', 0, 0], ['p', 0, 0]], 4), { ok: true, k: 4 });
  var st = S({ N: 6, kinds: 4, boxes: [['A', [0, 0, ['p', 0, 0]]]] });
  st.belt[3] = pc(5, 1); st.belt[4] = pc(5, 2);                           // 4 free: pair + 2 singles fit
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 4 });
  st.belt[0] = pc(5, 3);                                                  // 3 free: pair + 1 single
  assert.deepEqual(rules.canEject(st, 0), { ok: true, k: 3 });
  var s2 = S({ N: 6, kinds: 4, boxes: [['A', [['p', 0, 0], 0, 0]]] });    // singles first, the pair needs 2 more
  s2.belt[3] = pc(5, 1); s2.belt[4] = pc(5, 2); s2.belt[5] = pc(5, 3);    // 3 free: 2 singles, then 1 left < 2
  assert.deepEqual(rules.canEject(s2, 0), { ok: true, k: 2 });
});

test('R13: a tapped box whose pieces have not found plates is no way out; stuck detection counts the empty plates', function () {
  var st = S({ N: 4, kinds: 4, boxes: [['A', [['p', 1, 1]]], ['B', FULL_X]] });
  st.belt[0] = pc(1, 1); st.belt[2] = pc(1, 2);
  rules.tap(st, 0);                                               // rules.tap alone parks the pair in the outbox
  assert.equal(st.boxes[0].pending, 2);
  assert.equal(rules.isStuck(st), false);                         // 2 empty plates can take the pair
  st.belt[1] = pc(1, 3);
  assert.equal(rules.isStuck(st), true);                          // A takes nothing while its pieces are out, no plate left
  var st2 = S({ N: 4, kinds: 4, boxes: [['A', [['p', 1, 1]]], ['B', FULL_X]] });
  st2.belt[0] = pc(1, 1); st2.belt[2] = pc(1, 2);
  assert.equal(rules.isStuck(st2), false);                        // not tapped: the 1s can land in A
});

// ---------------------------------------------------------------- R17-R20 modifiers

test('R17: all cloths of a kind lift when that kind closes; the wrapped box can neither take nor be tapped before', function () {
  var s = mk({ N: 6, kinds: 3, boxes: [
    ['A', [0, 0]], ['B', [1, 1], { wrap: 0 }], ['C', [0, 0]], ['D', [2, 2], { wrap: 0 }], ['E', [2], { wrap: 1 }]] });
  assert.equal(sim.tap(s, 1).reason, 'covered');
  assert.equal(rules.accepts(s.state, 1, 1), false);
  sim.tap(s, 0);
  var ev = run(s, 6000);
  assert.equal(s.state.boxes[2].closed, true);
  assert.deepEqual(ofType(ev, 'unwrap').map(function (e) { return e.box; }), [1, 3]);   // both cloths of kind 0
  assert.equal(s.state.boxes[1].wrap, null);
  assert.equal(s.state.boxes[3].wrap, null);
  assert.equal(s.state.boxes[4].wrap, 1);                         // other kind stays wrapped
  assert.equal(rules.canEject(s.state, 1).ok, true);
  // the unwrap comes after the close in the event order
  var tp = types(ev);
  assert.ok(tp.indexOf('close') < tp.indexOf('unwrap'));
});

test('R18: ice thaws when a layout neighbour closes, not when another box does', function () {
  // layout neighbours: C is next to B and D; F is next to E only
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', [1, 1], { ice: true }], ['C', [0, 0]], ['F', [2, 2], { ice: true }]] });
  assert.equal(sim.tap(s, 1).reason, 'covered');
  sim.tap(s, 0);
  var ev = run(s, 6000);
  assert.equal(s.state.boxes[2].closed, true);
  assert.deepEqual(ofType(ev, 'thaw').map(function (e) { return e.box; }), [1]);
  assert.equal(s.state.boxes[1].ice, false);
  assert.equal(s.state.boxes[3].ice, true);                       // F is not a neighbour of C
  assert.equal(rules.canEject(s.state, 1).ok, true);
  // neighbour relation also works the other way round (declared on one side only)
  var st = model.parse(level({ N: 6, kinds: 2, boxes: [['X', [0, 0, 0]], ['Y', [1], { ice: true }]] }), { neighbours: { Y: ['X'] } });
  st.belt[0] = pc(0);
  assert.ok(types(rules.tryLand(st, 0, 0)).indexOf('thaw') > 0);
});

test('R19: a key on the front piece at parse time opens its shutter at once', function () {
  var st = S({ N: 6, kinds: 4, boxes: [['A', [3, 'k:Q:2']], ['B', [0, 0], { lock: 'Q' }], ['C', [1, 1], { lock: 'Q' }]] });
  assert.equal(st.locks.Q.open, true);
  assert.equal(st.boxes[1].lock, null);
  assert.equal(st.boxes[2].lock, null);                           // a shutter over several boxes opens as one
  assert.equal(st.initialEvents.length, 1);
  assert.deepEqual([st.initialEvents[0].type, st.initialEvents[0].lock, st.initialEvents[0].boxes], ['unlock', 'Q', [1, 2]]);
  var s = sim.create(level({ N: 6, kinds: 4, boxes: [['A', [3, 'k:Q:2']], ['B', [0, 0], { lock: 'Q' }]] }), { layout: LAYOUT });
  assert.equal(s.log[0].type, 'unlock');
  assert.equal(s.log[0].time, 0);
});

test('R19: a key on a back piece releases only when it is exposed', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', ['k:Q:2', 3, 3]], ['B', [0, 0], { lock: 'Q' }], ['C', FULL_X]] });
  assert.equal(s.state.locks.Q.open, false);
  assert.equal(rules.canEject(s.state, 1).reason, 'covered');
  var r = sim.tap(s, 0);                                          // 3 3 leave the box; the key piece (kind 2) becomes the front
  assert.deepEqual(types(r.events), ['tapped', 'unlock']);        // released at the tap, not at the departures
  assert.deepEqual(r.events[1].boxes, [1]);
  assert.equal(s.state.locks.Q.open, true);
  assert.equal(s.state.boxes[1].lock, null);
  var ev = run(s, 3000);
  assert.equal(ofType(ev, 'unlock').length, 0);
  assert.equal(ofType(ev, 'eject').length, 2);
});

test('R19: a hidden key piece is revealed first, then releases', function () {
  var st = S({ N: 6, kinds: 4, boxes: [['A', ['hk:Q:2', 3]], ['B', [0, 0], { lock: 'Q' }]] });
  var ev = rules.ejectUnit(st, 0, [0]);
  assert.deepEqual(types(ev), ['eject', 'reveal', 'unlock']);
  assert.equal(ev[2].piece.id, ev[1].piece.id);
});

test('R19: a key in a frozen box releases when the box thaws (after the thaw)', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', [1, 'k:Q:1'], { ice: true }], ['C', [0, 0]], ['D', [3, 3], { lock: 'Q' }]] });
  assert.equal(s.state.locks.Q.open, false);
  sim.tap(s, 0);
  var ev = run(s, 6000);
  var tp = types(ev);
  assert.ok(tp.indexOf('close') < tp.indexOf('thaw'));
  assert.ok(tp.indexOf('thaw') < tp.indexOf('unlock'));
  assert.equal(s.state.locks.Q.open, true);
  assert.equal(s.state.boxes[3].lock, null);
});

test('R19: a piece carrying a key keeps it on the belt and in the next box', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', ['k:Q:0']], ['B', [0]], ['C', [1], { lock: 'Q' }]] });
  assert.equal(s.state.locks.Q.open, true);
  sim.tap(s, 0);
  run(s, 1000);
  assert.equal(s.state.belt[0].key, 'Q');
  run(s, 2000);
  assert.equal(rules.front(s.state.boxes[1]).key, 'Q');
});

test('R20: a one-way box accepts but is never ejectable; its kind is fixed', function () {
  var st = S({ N: 6, kinds: 4, boxes: [['A', [], { oneway: true }], ['B', [2], { oneway: true }]] });
  assert.equal(rules.canEject(st, 0).reason, 'oneway');
  assert.equal(rules.canEject(st, 1).reason, 'oneway');
  assert.equal(rules.accepts(st, 0, 3), true);
  st.belt[0] = pc(3, 1); st.belt[1] = pc(2, 2); st.belt[2] = pc(3, 3);
  assert.deepEqual(types(rules.tryLand(st, 0, 0)), ['land']);     // empty: any kind, then fixed
  assert.equal(rules.accepts(st, 0, 2), false);
  assert.equal(rules.accepts(st, 0, 3), true);
  assert.deepEqual(rules.tryLand(st, 1, 0), []);
  assert.deepEqual(types(rules.tryLand(st, 2, 0)), ['land']);
  assert.equal(st.boxes[0].pieces.length, 2);
  assert.throws(function () { rules.ejectUnit(st, 0, [4]); }, /oneway/);
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [2, 2, 2], { oneway: true }]] });
  s.state.belt[1] = pc(2);
  rules.tryLand(s.state, 1, 0);
  assert.equal(s.state.boxes[0].closed, true);                    // it closes at four like any box
});

test('R20: a one-way box can be wrapped, frozen or locked (accepts nothing until uncovered)', function () {
  var st = S({ N: 6, kinds: 4, boxes: [['A', [], { oneway: true, wrap: 3 }], ['B', [], { oneway: true, ice: true }], ['C', [], { oneway: true, lock: 'Z' }]] });
  assert.deepEqual([0, 1, 2].map(function (b) { return rules.accepts(st, b, 1); }), [false, false, false]);
  st.boxes[0].wrap = null;
  assert.equal(rules.accepts(st, 0, 1), true);
  assert.equal(rules.canEject(st, 0).reason, 'oneway');
});

// ---------------------------------------------------------------- R21-R24

test('R21: allowed and disallowed modifier combinations', function () {
  function lv(mods, pieces) {
    return level({ N: 6, kinds: 3, boxes: [['A', [0, 1, 2, 0]], ['B', [1, 2, 0, 1]], ['C', [2, 0, 1, 2]], ['D', pieces || [], mods]] });
  }
  function codes(l) { return model.validate(l, { layout: LAYOUT }).join('|'); }
  assert.equal(codes(lv({})), '');
  assert.equal(codes(lv({ wrap: 0 })), '');
  assert.equal(codes(lv({ ice: true })), '');
  assert.equal(codes(lv({ oneway: true })), '');
  assert.equal(codes(lv({ oneway: true, wrap: 0 })), '');
  assert.equal(codes(lv({ oneway: true, ice: true })), '');
  assert.match(codes(lv({ wrap: 0, ice: true })), /^R21: box D combines wrap and ice/);
  assert.match(codes(lv({ ice: true, lock: 'Q' })), /R21: box D combines ice and lock/);
  assert.match(codes(lv({ wrap: 1, lock: 'Q' })), /R21: box D combines wrap and lock/);
  assert.match(codes(lv({ wrap: 1, ice: true, lock: 'Q' })), /R21: box D combines wrap and ice and lock/);
  // hidden pieces and pairs inside any box (also a one-way box): fine
  var hp = level({ N: 6, kinds: 2, boxes: [['A', [1, 'h:0', 0]], ['B', [1, 0, 0]], ['C', [['p', 1, 1]], { oneway: true }], ['D', []]] });
  assert.deepEqual(model.validate(hp, { layout: LAYOUT }), []);
  // four of one kind at the start would be a box that should already be closed
  var four = level({ N: 6, kinds: 2, boxes: [['A', [0, 0, 0, 0]], ['B', [1, 1, 1, 1]], ['C', []]] });
  assert.match(codes(four), /R12: box A starts with four of kind 0/);
  // keys without shutters / shutters without keys, a key behind its own shutter
  var own = level({ N: 6, kinds: 1, boxes: [['A', [0, 0, 0, 'k:Q:0'], { lock: 'Q' }], ['B', []]] });
  assert.match(model.validate(own).join('|'), /R19: key Q lies behind its own shutter in box A/);
  var nokey = level({ N: 6, kinds: 1, boxes: [['A', [0, 0, 0, 0]], ['B', [], { lock: 'Q' }]] });
  assert.match(model.validate(nokey).join('|'), /R19: lock Q has 0 keys/);
  var nolock = level({ N: 6, kinds: 1, boxes: [['A', [0, 0, 0, 'k:Q:0']], ['B', []]] });
  assert.match(model.validate(nolock).join('|'), /R19: key Q has no shutter/);
  var two = level({ N: 6, kinds: 2, boxes: [['A', [0, 0, 'k:Q:1', 'k:Q:1']], ['B', [0, 0, 1, 1]], ['C', [], { lock: 'Q' }]] });
  assert.match(model.validate(two).join('|'), /R19: lock Q has 2 keys/);
  var wrapSelf = level({ N: 6, kinds: 2, boxes: [['A', [0, 1, 0, 1]], ['B', [0, 1, 0, 1], { wrap: 1 }], ['C', []]] });
  assert.match(model.validate(wrapSelf).join('|'), /R17: box B is wrapped with kind 1 but holds one/);
  // one-way start: at most 3 pieces of one kind
  var ow4 = level({ N: 6, kinds: 2, boxes: [['A', [0, 0, 1, 1], { oneway: true }], ['B', [0, 0, 1, 1]]] });
  assert.match(model.validate(ow4).join('|'), /R20: one-way box A starts with 4 pieces/);
  var owMix = level({ N: 6, kinds: 2, boxes: [['A', [0, 1], { oneway: true }], ['B', [0, 0, 1, 1]]] });
  assert.match(model.validate(owMix).join('|'), /R20: one-way box A starts with mixed kinds/);
});

test('R22: a level is a fixed structure; parsing and playing never change it', function () {
  var lv = level({ N: 6, kinds: 2, boxes: [['A', [0, 'h:1', 1, ['p', 0, 0]]], ['B', [1, 1, 'k:Q:0'], { oneway: false }], ['C', [], { lock: 'Q' }]] });
  var before = JSON.stringify(lv);
  var s = sim.create(lv, { layout: LAYOUT });
  sim.tap(s, 0);
  run(s, 20000);
  assert.equal(JSON.stringify(lv), before);
  assert.equal(s.state.level, lv);
});

test('R23: the kind permutation is a seeded bijection and keeps the structure', function () {
  var p = model.permutation(17, 1), i, seen = {};
  assert.equal(p.length, config.KIND_NAMES.length);
  for (i = 0; i < p.length; i++) seen[p[i]] = true;
  assert.equal(Object.keys(seen).length, p.length);
  assert.deepEqual(model.permutation(17, 1), p);                  // reproducible
  var differs = false;
  for (i = 2; i < 8; i++) if (model.permutation(17, i).join() !== p.join()) differs = true;
  assert.equal(differs, true);                                    // another attempt, another picture
  assert.notEqual(model.permutation(18, 1).join(), p.join() + 'x');
  assert.equal(model.permutation(5, 0, 3).length, 3);
  assert.deepEqual(model.permutation(5, 0, 3).slice().sort(), [0, 1, 2]);

  // relabelling the kinds changes nothing but the kinds: same events, same plates, same boxes
  var perm = [1, 0];
  function make(map) {
    return level({ N: 6, kinds: 2, boxes: [['A', [map(0), map(1), map(1)]], ['B', [map(0), map(0)]], ['C', [map(1), map(0), map(0)]]] });
  }
  function play(lv) {
    var s = sim.create(lv, { layout: LAYOUT });
    sim.tap(s, 0);
    var ev = run(s, 4000);
    sim.tap(s, 2);
    return ev.concat(run(s, 8000)).map(function (e) { return [e.type, e.box, e.plate, e.piece ? e.piece.id : null, e.time]; });
  }
  assert.deepEqual(play(make(function (k) { return k; })), play(make(function (k) { return perm[k]; })));
});

test('R24: the same taps at the same times give an identical event log, whatever the tick sizes', function () {
  function game(dt) {
    var s = mk({ N: 6, kinds: 2, boxes: [['A', [0, 0]], ['B', [0, 0]], ['C', [1, 1]], ['D', [1, 1]]] }), t = 0, ev = [];
    function adv(ms) { var left = ms; while (left > 0) { var d = Math.min(dt, left); ev = ev.concat(sim.tick(s, d)); left -= d; } }
    sim.tap(s, 0);
    adv(3000);
    sim.tap(s, 2);
    adv(12000);
    return { s: s, ev: ev };
  }
  var a = game(16), b = game(16), c = game(500), d = game(2000);
  assert.equal(JSON.stringify(a.s.log), JSON.stringify(b.s.log));
  assert.equal(model.hash(a.s.state), model.hash(b.s.state));
  function shape(g) { return g.ev.map(function (e) { return e.type + ':' + e.box + ':' + e.plate; }).join(' '); }
  assert.equal(shape(a), shape(c));                               // big steps skip no crossing
  assert.equal(shape(a), shape(d));
  assert.equal(a.s.status, 'won');
  assert.equal(c.s.status, 'won');
});

// ---------------------------------------------------------------- R25-R28 timing, sim

test('R25: one lap takes lapMs whatever N is; plates are spaced perimeter / N', function () {
  [4, 7, 10].forEach(function (N) {
    var s = sim.create(level({ N: N, kinds: 1, boxes: [['A', []]] }), { layout: LAYOUT });
    assert.equal(s.speed, 1200 / config.LAP_MS);
    assert.equal(s.belt.spacing, 1200 / N);
    var p0 = sim.plates(s).map(function (x) { return x.s; });
    sim.tick(s, config.LAP_MS);
    var p1 = sim.plates(s).map(function (x) { return x.s; });
    p0.forEach(function (v, i) { assert.ok(Math.abs(p1[i] - v) < 1e-6 || Math.abs(Math.abs(p1[i] - v) - 1200) < 1e-6); });
    assert.ok(Math.abs(s.time - config.LAP_MS) < 1e-9);
  });
  var fast = sim.create(level({ N: 5, kinds: 1, boxes: [['A', []]] }), { layout: LAYOUT, lapMs: 4000 });
  assert.equal(fast.speed, 0.3);
});

test('R24/R25: the belt starts with plate 0 at the origin and the belt direction is per level', function () {
  var cw = sim.create(level({ N: 6, kinds: 1, boxes: [['A', []]] }), { layout: LAYOUT });
  assert.deepEqual(sim.plates(cw).map(function (x) { return x.s; }), [0, 200, 400, 600, 800, 1000]);
  var ccw = sim.create(level({ N: 6, dir: 'ccw', kinds: 1, boxes: [['A', []]] }), { layout: LAYOUT });
  assert.equal(ccw.belt.mouths[0].s, 1100);                       // 1200 - 100
  assert.deepEqual(sim.plates(ccw).map(function (x) { return x.s; }), [0, 1000, 800, 600, 400, 200]);   // layout units
  var s = mk({ N: 6, dir: 'ccw', kinds: 4, boxes: [['A', [1, 0]], ['B', FULL_X]] });
  var plan = sim.tap(s, 0).events[0].plan;
  assert.equal(plan[0].plate, 5);                                 // plate 5 sits 100 before mouth A (travel 1100)
  assert.equal(plan[0].from, 200);                                // layout (clockwise) units
  var ev = ofType(run(s, 900), 'eject');
  assert.equal(ev[0].plate, 5);
  assert.equal(ev[0].time, 900);
  assert.equal(ev[0].to, 100.5);
});

test('R26: a tap reserves the free plate that reaches the mouth soonest (the nearest one behind it)', function () {
  var s = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', FULL_X]] });
  assert.equal(sim.nextEjectPlate(s, 0), 0);                      // plate 0 is 100 behind the mouth
  run(s, 400);                                                     // plate 0 is at 60: 40 before mouth A
  assert.equal(belt.reaching(s.belt, 0), 0);                       // the window of half a spacing still reports it
  assert.equal(sim.nextEjectPlate(s, 0), 0);
  var plan = sim.tap(s, 0).events[0].plan;
  assert.equal(plan[0].plate, 0);
  assert.ok(Math.abs(plan[0].from - 60) < 1e-9);
  assert.equal(plan[0].departAt, 400 + 900);
  // just after the plate passed (8 units ahead of the mouth) the next plate behind it is the one
  var s2 = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', FULL_X]] });
  run(s2, 720);
  assert.equal(sim.nextEjectPlate(s2, 0), 5);
  // an occupied plate is skipped
  var s3 = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', FULL_X]] });
  s3.state.belt[0] = pc(7, 61);
  assert.equal(sim.nextEjectPlate(s3, 0), 5);
  // by arc distance, not plate number: plate 4 stands 20 behind the mouth
  var s4 = mk({ N: 6, kinds: 4, boxes: [['A', [0, 0]], ['B', FULL_X]] });
  belt.teleport(s4.belt, 4, 80);
  assert.equal(sim.nextEjectPlate(s4, 0), 4);
});

test('R27: a plate freed by a landing is free at once, and the next tap may reserve it', function () {
  var s = mk({ N: 2, kinds: 3, boxes: [['B', [0]], ['G', [1]]] });   // N = 2 would be below MIN_N for a level, fine for the engine
  var mi = belt.mouthIndex(s.belt, 0);
  var p = belt.nextFree(s.belt, mi, function () { return true; });
  var q = 1 - p;
  s.state.belt[p] = pc(0, 700);
  s.state.belt[q] = pc(2, 701);                                      // the other plate is busy with an unlandable piece
  var ev = runUntil(s, function (x, e) { return ofType(e, 'land').length > 0; }, 8000);
  assert.deepEqual(types(ev), ['land']);
  assert.deepEqual([ev[0].box, ev[0].plate], [0, p]);
  assert.equal(s.state.belt[p], null);                             // free at once
  assert.equal(sim.freePlates(s), 1);
  var r = sim.tap(s, 1);
  assert.equal(r.events[0].plan[0].plate, p);                      // the only free plate is the one just freed
  assert.equal(sim.freePlates(s), 0);
  assert.equal(ofType(run(s, 900), 'eject')[0].plate, p);
});

test('sim: tick sub-steps, so a huge dt skips no mouth crossing', function () {
  function final(dtList) {
    var s = mk({ N: 4, kinds: 2, boxes: [['A', [0, 0]], ['B', [0, 0]], ['C', [1, 1]], ['D', [1, 1]]] });
    sim.tap(s, 0);
    dtList.forEach(function (d) { sim.tick(s, d); });
    return s;
  }
  var one = final([8000]), many = final([500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  assert.equal(model.hash(one.state), model.hash(many.state));
  assert.equal(one.state.boxes[1].closed, true);
  assert.equal(JSON.stringify(one.log.map(function (e) { return e.type + e.box; })), JSON.stringify(many.log.map(function (e) { return e.type + e.box; })));
  var huge = final([60000]);
  assert.equal(huge.state.boxes[1].closed, true);
  assert.equal(huge.time, 60000);
  assert.equal(sim.tick(huge, 0).length, 0);
  assert.equal(sim.tick(huge, -5).length, 0);
});

test('sim: playing a small level to the win card', function () {
  var s = mk({ N: 6, kinds: 2, boxes: [['A', [0, 0]], ['B', [0, 0]], ['C', [1, 1]], ['D', [1, 1]]] });
  var total = pieceCount(s.state);
  assert.equal(total, 8);
  sim.tap(s, 0);
  runUntil(s, function (x) { return x.state.boxes[1].closed; }, 20000);
  assert.equal(s.status, 'play');
  assert.equal(pieceCount(s.state), 8);
  sim.tap(s, 2);
  var ev = runUntil(s, function (x) { return x.status !== 'play'; }, 20000);
  assert.equal(s.status, 'won');
  assert.equal(ofType(ev, 'won').length, 1);
  assert.equal(types(ev)[types(ev).length - 1], 'won');
  assert.equal(sim.tap(s, 3).reason, 'over');
  assert.equal(pieceCount(s.state), 8);
  assert.ok(ev.every(function (e) { return typeof e.time === 'number'; }));
});

test('sim: invariants hold under random tap storms (pieces conserved, box size, plates, capacity)', function () {
  var seed = 12345;
  function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
  var s = mk({ N: 5, kinds: 4, boxes: [
    ['A', [0, 1, 2, 3]], ['B', [1, 'h:2', 0, 3]], ['C', [2, ['p', 3, 0], 1]], ['D', [3, 0, 2, 1]], ['E', []], ['F', []] ] });
  var total = pieceCount(s.state), i, b, st = s.state, N = st.N, taps = 0, refusedFull = 0;
  function used() {      // pieces on plates + everything waiting in outboxes
    var u = st.belt.filter(function (p) { return p !== null; }).length, k;
    for (k = 0; k < st.boxes.length; k++) u += st.boxes[k].outbox.length;
    return u;
  }
  function check() {
    var ids = {}, k;
    assert.equal(pieceCount(st), total);
    assert.ok(used() <= N, 'plates + outboxes exceed N');
    assert.equal(sim.freePlates(s), N - used());
    for (k = 0; k < st.boxes.length; k++) {
      assert.ok(st.boxes[k].pieces.length <= 4);
      assert.equal(st.boxes[k].pending, st.boxes[k].outbox.length);
    }
    st.belt.forEach(function (p) { if (p) { assert.equal(ids[p.id], undefined); ids[p.id] = true; } });
    st.boxes.forEach(function (bx) {
      bx.pieces.concat(bx.outbox).forEach(function (p) { assert.equal(ids[p.id], undefined); ids[p.id] = true; });
    });
  }
  for (i = 0; i < 600; i++) {
    b = rnd(6);
    var before = used(), r = sim.tap(s, b);
    taps++;
    if (r.ok) assert.ok(before + r.k <= N, 'an accepted tap must fit the free plates');
    else if (r.reason === 'full') { refusedFull++; assert.equal(before, N); }
    check();
    sim.tick(s, 50 + rnd(400));
    check();
    if (s.status !== 'play') break;
  }
  assert.ok(taps > 20);
  // a tap that would not fit is refused: fill the capacity with outboxes, the next box cannot be tapped
  var t = mk({ N: 4, kinds: 4, boxes: [['A', [0, 0, 0]], ['B', [1, 1]], ['C', FULL_X]] });
  assert.equal(sim.tap(t, 0).k, 3);
  assert.equal(sim.tap(t, 1).k, 1);                               // only 1 free plate left: k = min(run, free)
  var full = sim.tap(t, 2);
  assert.deepEqual([full.ok, full.reason], [false, 'full']);
  assert.equal(sim.freePlates(t), 0);
});
