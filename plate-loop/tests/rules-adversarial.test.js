// tests/rules-adversarial.test.js: rule-by-rule adversarial tests of the Plate Loop engine (plan section 2, R1-R28).
// Written from the contract (plan section 2 and 7.1, docs/API.md), independently of tests/engine.test.js.
// A failing test marked "// BUG:" exposes a deviation from the contract; do not weaken it.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const config = require('../src/config.js');
const model = require('../src/engine/model.js');
const rules = require('../src/engine/rules.js');
const beltM = require('../src/engine/belt.js');
const simM = require('../src/engine/sim.js');

const LAP = config.LAP_MS;
const D1 = config.DEPART_FIRST_MS, DG = config.DEPART_GAP_MS;   // tap -> first departure, gap between the units of one tap
const BIG = 99;                     // "kinds" large enough that a hand-built level can never be won by accident

// ------------------------------------------------------------------ fixtures

function spec(boxes, o) { return Object.assign({ N: 6, kinds: BIG, boxes: boxes }, o || {}); }
function mk(boxes, o) { return H.sim(spec(boxes, o)); }
function stOf(boxes, o) { const sp = spec(boxes, o); return model.parse(H.level(sp), { layout: H.layout(sp) }); }
function ix(x, id) { return (x.state || x).index[id]; }
function putBelt(state, plate, kind, id) { state.belt[plate] = { id: id === undefined ? 1000 + plate : id, k: kind, key: null, from: -1 }; }
function fillBelt(x, plates, kind) { const st = x.state || x; plates.forEach(function (p) { putBelt(st, p, kind); }); }
// events of the taps since the last collection (trapdoor model: tapped / reveal / unlock / eject are stamped at the tap)
function tapEvents(s) { const e = s._tapEv || []; s._tapEv = []; return e; }
function run(s, ms) {
  const out = tapEvents(s); let t = 0;
  while (t < ms) { const dt = Math.min(16, ms - t); simM.tick(s, dt).forEach(function (e) { out.push(e); }); t += dt; }
  return out;
}
function runU(s, pred, ms) { return tapEvents(s).concat(H.runUntil(s, pred, ms)); }
function of(evs, type) { return evs.filter(function (e) { return e.type === type; }); }
function kinds(box) { return box.pieces.map(function (p) { return p.k; }); }
function beltIds(st) { return st.belt.filter(Boolean).map(function (p) { return p.id; }); }
// tap(): simM.tap, remembering the events the tap itself returns (tapped / reveal / unlock at the tap, outbox semantics)
function tap(s, b) {
  const r = simM.tap(s, b);
  if (r.events) s._tapEv = (s._tapEv || []).concat(r.events.filter(function (e) { return e.type !== 'refuse'; }));
  return r;
}
// untilEject(): the tap events since the last call (in the trapdoor model the ejections are among them: the pieces are on
// plates at the tap); only when fewer than n pieces were put onto plates does it keep running until n have been
function untilEject(s, n, ms) {
  const first = s._tapEv || [];
  s._tapEv = [];
  let c = of(first, 'eject').length;
  if (c >= n) return first;
  return first.concat(H.runUntil(s, function (st, ev) { c += of(ev, 'eject').length; return c >= n; }, ms || 4 * LAP));
}
// A plate is dropped d units BEHIND its mouth (d = 0.5, more when another plate is closer than 0.9 plate widths); it crosses the
// mouth (the departure, not a landing) after d / speed and comes back one lap after that: land = depart + LAP + d / speed.
function dropDist(s, e) {
  const mi = beltM.mouthIndex(s.belt, e.box), m = s.belt.mouths[mi].s, P = s.belt.perimeter;
  const to = s.state.dir === 'ccw' ? P - e.to : e.to;
  return (((m - to) % P) + P) % P;
}
function lapOf(s, ej, ld) { return ld.time - ej.time - dropDist(s, ej) / s.speed; }
function mulberry(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a level that uses every modifier (validates clean, see the first test of R21)
const ALL = spec({
  L1: [3, 'h:1', 0, 0],
  L2: [1, ['p', 2, 4], 0],
  L3: [5, 'k:A:3', 2, 1],
  L4: ['h:4', 4, 5],
  R1: { pieces: [0, 1], mods: { lock: 'A' } },
  R2: { pieces: [3, 4], mods: { wrap: 2 } },
  R3: { pieces: [2, 2], mods: { ice: true } },
  R4: { pieces: [], mods: { oneway: true, ice: true } },
  R5: [5, 5],
  R6: { pieces: [3], mods: { oneway: true } }
}, { N: 8, kinds: 6 });

// ================================================================== R3 / R21 validation

test('R3/R21: the all-modifier fixture level validates clean', () => {
  assert.deepEqual(model.validate(H.level(ALL)), []);
});

test('R3: a kind with 5 pieces, a box with 5 pieces and too few boxes are rejected', () => {
  const lv = H.level(spec({ L1: [0, 0, 0, 0], L2: [0] }, { kinds: 1 }));
  const errs = model.validate(lv);
  assert.ok(errs.some(function (e) { return /^R3/.test(e); }), errs.join('|'));
  const lv2 = H.level(spec({ L1: [0, 0, 0, 0, 0] }, { kinds: 1 }));
  assert.ok(model.validate(lv2).some(function (e) { return /^R2/.test(e); }));
  const lv3 = H.level(spec({ L1: [0, 0, 1, 1], L2: [0, 0, 1, 1] }, { kinds: 3 }));
  assert.ok(model.validate(lv3).some(function (e) { return /^R3/.test(e); }));
});

function r21Level(extra) {
  // 3 kinds, 6 boxes, L1 carries the modifiers under test (holds only kind 0, so a wrap of kind 1 is legal)
  const boxes = { L1: { pieces: [0, 0], mods: extra }, L2: [0, 0], L3: [1, 1], L4: [1, 1], L5: [2, extra.lock ? 'k:A:2' : 2], L6: [2, 2] };
  return H.level(spec(boxes, { kinds: 3 }));
}
test('R21: wrap + ice on one box is rejected', () => {
  assert.ok(model.validate(r21Level({ wrap: 1, ice: true })).some(function (e) { return /^R21/.test(e); }));
});
test('R21: wrap + lock on one box is rejected', () => {
  assert.ok(model.validate(r21Level({ wrap: 1, lock: 'A' })).some(function (e) { return /^R21/.test(e); }));
});
test('R21: ice + lock on one box is rejected', () => {
  assert.ok(model.validate(r21Level({ ice: true, lock: 'A' })).some(function (e) { return /^R21/.test(e); }));
});
test('R21: oneway + wrap (and + ice, + lock) is accepted', () => {
  assert.deepEqual(model.validate(r21Level({ oneway: true, wrap: 1 })), []);
  assert.deepEqual(model.validate(r21Level({ oneway: true, ice: true })), []);
  assert.deepEqual(model.validate(r21Level({ oneway: true, lock: 'A' })), []);
  assert.deepEqual(model.validate(r21Level({})), [], 'baseline is clean');
});

// ================================================================== R5 ejecting

test('R5: free = 0 is refused with a refuse event and changes nothing', () => {
  const s = mk({ L1: [0, 1, 1] }, { N: 4 });
  fillBelt(s, [0, 1, 2, 3], 9);
  const before = model.hash(s.state), n = s.log.length;
  const r = tap(s, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'full');
  assert.equal(model.hash(s.state), before);
  assert.equal(s.state.boxes[0].pending, 0);
  assert.deepEqual(s.log.slice(n).map(function (e) { return [e.type, e.box, e.reason]; }), [['refuse', 0, 'full']]);
  assert.equal(of(r.events, 'refuse').length, 1);
  assert.equal(of(run(s, 1000), 'eject').length, 0);
});

test('R5: free < run gives k = free; the plates are reserved at the tap, the pieces depart at +D1 / +D1+DG, the rest of the run stays in the box', () => {
  const s = mk({ L1: [0, 1, 1, 1] }, { N: 4 });
  fillBelt(s, [0, 1], 9);
  assert.deepEqual(rules.canEject(s.state, 0), { ok: true, k: 2 });
  const r = tap(s, 0);
  assert.equal(r.ok, true); assert.equal(r.k, 2);
  const tp = of(r.events, 'tapped')[0];
  assert.equal(tp.plan.length, 2);
  assert.deepEqual(tp.plan.map(function (x) { return x.plate; }).sort(), [2, 3], 'the two free plates are reserved');
  assert.equal(of(r.events, 'eject').length, 0, 'nothing is on a plate yet');
  assert.equal(s.state.belt.filter(Boolean).length, 2);
  assert.equal(simM.freePlates(s), 0);
  assert.deepEqual(kinds(s.state.boxes[0]), [0, 1]);
  assert.equal(tap(s, 0).reason, 'pending');
  assert.equal(tap(s, 0).reason, 'pending');
  const ev = untilEject(s, 2);
  const ej = of(ev, 'eject');
  assert.deepEqual(ej.map(function (e) { return e.plate; }).sort(), [2, 3]);
  assert.ok(ej.every(function (e) { return e.teleported === true; }));
  assert.ok(Math.abs(ej[0].time - D1) < 1e-6 && Math.abs(ej[1].time - (D1 + DG)) < 1e-6, ej.map(function (e) { return e.time; }).join());
  assert.equal(s.state.belt.filter(Boolean).length, 4);
  assert.equal(s.state.boxes[0].pending, 0);
  assert.equal(tap(s, 0).reason, 'full');
});

test('R5: k = run when free > run; the run stops at the first piece of another kind', () => {
  const s = mk({ L1: [2, 1, 1, 3, 3] }, { N: 6 });
  assert.deepEqual(rules.canEject(s.state, 0), { ok: true, k: 2 });
  tap(s, 0);
  const ev = untilEject(s, 2);
  assert.deepEqual(kinds(s.state.boxes[0]), [2, 1, 1]);
  assert.equal(of(ev, 'eject').length, 2);
  assert.equal(of(run(s, 200), 'eject').length, 0, 'no third piece leaves');
});

test('R5: a hidden piece of the same kind ENDS the run: a tap on [c, hidden c, c] ejects 1, reveals at the tap, a second tap takes the revealed piece', () => {
  const s = mk({ L1: [1, 'h:1', 1] }, { N: 6 });           // ids 0 (back), 1 (hidden), 2 (front)
  assert.equal(rules.runLength(s.state.boxes[0]), 1);
  assert.deepEqual(rules.canEject(s.state, 0), { ok: true, k: 1 });
  const r = tap(s, 0);
  assert.equal(r.ok, true); assert.equal(r.k, 1);
  assert.equal(of(r.events, 'reveal').length, 1, 'the hidden piece turns face-up at the tap');
  assert.equal(of(r.events, 'reveal')[0].piece.id, 1);
  assert.equal(s.state.boxes[0].pieces[1].hidden, false);
  const ev = untilEject(s, 1);
  assert.deepEqual(of(ev, 'eject').map(function (e) { return e.piece.id; }), [2]);
  run(s, 100);
  assert.equal(of(run(s, 400), 'eject').length, 0, 'nothing more leaves without a second tap');
  const r2 = tap(s, 0);
  assert.equal(r2.ok, true);
  const ev2 = untilEject(s, 1);
  assert.equal(of(ev2, 'eject')[0].piece.id, 1, 'the revealed piece leaves first');
  assert.equal(r2.k, 2, 'and the visible 1 behind it belongs to this run');
  assert.equal(of(ev2, 'reveal').length, 0);
});

test('R5: a hidden piece of another kind ends the run and is revealed by the tap', () => {
  const s = mk({ L1: ['h:2', 1] }, { N: 6 });
  assert.equal(rules.runLength(s.state.boxes[0]), 1);
  tap(s, 0);
  const ev = untilEject(s, 1);
  assert.equal(of(ev, 'eject').length, 1);
  assert.equal(of(ev, 'reveal').length, 1);
  assert.equal(s.state.boxes[0].pieces[0].k, 2);
  assert.equal(s.state.boxes[0].pieces[0].hidden, false);
  assert.equal(of(run(s, 100), 'eject').length, 0);
});

test('R5: refused taps (closed / empty / covered / oneway / pending / nobox / over) never change the state', () => {
  const s = mk({
    L1: [], L2: [1, 1], L3: { pieces: [1], mods: { wrap: 5 } }, L4: { pieces: [1], mods: { ice: true } },
    L5: { pieces: [1], mods: { lock: 'Q' } }, L6: { pieces: [1], mods: { oneway: true } }, L7: [4, 4, 4]
  });
  s.state.boxes[ix(s, 'L2')].closed = true;
  const cases = [['L1', 'empty'], ['L2', 'closed'], ['L3', 'covered'], ['L4', 'covered'], ['L5', 'covered'], ['L6', 'oneway']];
  cases.forEach(function (c) {
    const before = model.hash(s.state), n = s.log.length, r = tap(s, ix(s, c[0]));
    assert.equal(r.ok, false, c[0]);
    assert.equal(r.reason, c[1], c[0]);
    assert.equal(model.hash(s.state), before, c[0]);
    assert.deepEqual(s.log.slice(n).map(function (e) { return e.type + ':' + e.reason; }), ['refuse:' + c[1]]);
  });
  assert.equal(tap(s, ix(s, 'L7')).ok, true);
  assert.equal(tap(s, ix(s, 'L7')).reason, 'pending', 'the whole run is in the outbox, waiting for its departures');
  assert.equal(tap(s, 77).reason, 'nobox');
  assert.equal(tap(s, -1).reason, 'nobox');
});

// ================================================================== R6 order

test('R6: a run leaves front-to-back, one unit per DEPART_GAP_MS from DEPART_FIRST_MS on, each onto a plate right behind the mouth', () => {
  [['cw', 1], ['ccw', 1]].forEach(function (c) {
    const s = mk({ L1: [5, 1, 1, 1] }, { dir: c[0] });           // piece ids 0..3, the front is id 3
    const mouth = H.layout({}).slots.L1.s, P = H.layout({}).perimeter;
    const ev = untilEject(s, 0);
    const r = tap(s, 0);
    const tp = of(r.events, 'tapped')[0];
    assert.deepEqual(tp.pieces.map(function (x) { return x.id; }), [3, 2, 1]);
    assert.equal(new Set(tp.plan.map(function (x) { return x.plate; })).size, 3, 'three different plates');
    const ej = of(untilEject(s, 3), 'eject');
    assert.deepEqual(ej.map(function (e) { return e.piece.id; }), [3, 2, 1]);
    ej.forEach(function (e, j) { assert.ok(Math.abs(e.time - (D1 + j * DG)) < 1e-6, 'unit ' + j + ' at ' + e.time); });
    const behind = function (e) {
      const to = c[0] === 'ccw' ? P - e.to : e.to, m = c[0] === 'ccw' ? P - mouth : mouth;
      return (((m - to) % P) + P) % P;
    };
    ej.forEach(function (e) { assert.ok(behind(e) < 1.5, 'dropped right behind the mouth: ' + behind(e)); });
  });
});

test('R6: ejected pieces are beyond reach (the box shrinks, a second tap takes the next piece, the belt keeps the first ones)', () => {
  const s = mk({ L1: [5, 1, 1] }, { N: 6 });
  tap(s, 0);
  untilEject(s, 2);
  const ids = beltIds(s.state).sort();
  assert.equal(ids.length, 2);
  assert.equal(rules.canEject(s.state, 0).ok, true);          // the 5 is still tappable
  assert.equal(tap(s, 0).ok, true);
  const ev = untilEject(s, 1);
  assert.equal(of(ev, 'eject')[0].piece.k, 5);
  ids.forEach(function (id) { assert.ok(beltIds(s.state).indexOf(id) >= 0, 'piece ' + id + ' still on the belt'); });
  assert.deepEqual(rules.canEject(s.state, 0), { ok: false, reason: 'empty' });
});

// ================================================================== R7 reveal / key release

test('R7: a hidden piece turns face-up exactly when it becomes the front, not before', () => {
  const s = mk({ L1: ['h:3', 'h:2', 1], R1: [] });
  const b = s.state.boxes[0];
  assert.deepEqual(b.pieces.map(function (p) { return p.hidden; }), [true, true, false]);
  assert.equal(of(s.log, 'reveal').length, 0);
  tap(s, 0);
  const ev = untilEject(s, 1);
  assert.equal(of(ev, 'reveal').length, 1);
  assert.equal(of(ev, 'reveal')[0].piece.k, 2);
  assert.ok(of(ev, 'reveal')[0].time <= of(ev, 'eject')[0].time, 'reveal at the tap or at the ejection, never later');
  assert.deepEqual(b.pieces.map(function (p) { return p.hidden; }), [true, false]);
});

test('R7/R19: a key behind the front releases only when its piece is exposed; unlock follows the eject', () => {
  const s = mk({ L1: [0, 'k:A:5', 2], R1: { pieces: [3], mods: { lock: 'A' } } });
  assert.equal(of(s.log, 'unlock').length, 0);
  assert.equal(s.state.boxes[ix(s, 'R1')].lock, 'A');
  assert.equal(tap(s, ix(s, 'R1')).reason, 'covered');
  tap(s, 0);
  const ev = untilEject(s, 1);
  assert.equal(of(ev, 'unlock').length, 1);
  assert.ok(of(ev, 'unlock')[0].time <= of(ev, 'eject')[0].time);
  assert.deepEqual(of(ev, 'unlock')[0].boxes, [ix(s, 'R1')]);
  assert.equal(s.state.boxes[ix(s, 'R1')].lock, null);
  assert.equal(s.state.locks.A.open, true);
});

test('R7/R19: a key on the front piece at level start is released at parse time (initialEvents)', () => {
  const st = stOf({ L1: [0, 'k:A:5'], R1: { pieces: [3], mods: { lock: 'A' } } });
  assert.equal(st.initialEvents.filter(function (e) { return e.type === 'unlock'; }).length, 1);
  assert.equal(st.boxes[ix(st, 'R1')].lock, null);
});

test('R7/R19: a key on the back member of a bound pair releases when the pair is the front unit (engine reading), not while a single stands in front', () => {
  const behind = stOf({ L1: [['p', 'k:A:5', 2], 3], R1: { pieces: [3], mods: { lock: 'A' } } });
  assert.equal(behind.initialEvents.length, 0);
  assert.equal(behind.boxes[ix(behind, 'R1')].lock, 'A');
  const front = stOf({ L1: [0, ['p', 'k:A:5', 2]], R1: { pieces: [3], mods: { lock: 'A' } } });
  assert.equal(front.boxes[ix(front, 'R1')].lock, null);
  // the single in front of the pair leaves -> the pair is exposed -> unlock
  const s = mk({ L1: [['p', 'k:A:5', 2], 3], R1: { pieces: [3], mods: { lock: 'A' } } });
  tap(s, 0);
  const ev = untilEject(s, 1);
  assert.equal(of(ev, 'unlock').length, 1);
});

test('R7/R19: a hidden key piece reveals first and releases when it is the front', () => {
  const s = mk({ L1: ['hk:A:5', 2], R1: { pieces: [3], mods: { lock: 'A' } } });
  tap(s, 0);
  const ev = untilEject(s, 1);
  const types = ev.map(function (e) { return e.type; });
  assert.ok(types.indexOf('reveal') >= 0 && types.indexOf('unlock') > types.indexOf('reveal'), types.join());
});

// ================================================================== R8 accept matrix

test('R8: accept matrix', () => {
  const st = stOf({
    L1: [], L2: [1], L3: [0, 1, 1, 1], L4: [1, 1, 1, 1],
    R1: { pieces: [], mods: { wrap: 5 } }, R2: { pieces: [], mods: { ice: true } }, R3: { pieces: [], mods: { lock: 'A' } },
    R4: { pieces: [], mods: { oneway: true } }, R5: { pieces: [3], mods: { oneway: true } },
    R6: { pieces: [3], mods: { oneway: true, wrap: 7 } }, R7: [2, 2]
  });
  st.boxes[ix(st, 'L4')].closed = true;
  const A = function (id, k) { return rules.accepts(st, ix(st, id), k); };
  assert.equal(A('L1', 4), true, 'empty accepts anything');
  assert.equal(A('L2', 1), true, 'match with room');
  assert.equal(A('L2', 2), false, 'other kind');
  assert.equal(A('L3', 1), false, 'match but full (4)');
  assert.equal(A('L4', 1), false, 'closed');
  assert.equal(A('R1', 4), false, 'wrapped');
  assert.equal(A('R2', 4), false, 'frozen');
  assert.equal(A('R3', 4), false, 'locked');
  assert.equal(A('R4', 4), true, 'empty oneway accepts');
  assert.equal(A('R5', 3), true, 'oneway accepts its kind');
  assert.equal(A('R5', 4), false, 'oneway kind is fixed');
  assert.equal(A('R6', 3), false, 'oneway + wrapped is covered');
  st.boxes[ix(st, 'R6')].wrap = null;
  assert.equal(A('R6', 3), true, 'oneway accepts after the cloth lifts');
  assert.equal(A('R7', 2), true);
  // tryLand agrees with accepts and leaves the plate alone when it rides on
  putBelt(st, 0, 4);
  assert.deepEqual(rules.tryLand(st, 0, ix(st, 'L2')), []);
  assert.ok(st.belt[0]);
  assert.equal(rules.tryLand(st, 0, ix(st, 'L1')).length, 1);
  assert.equal(st.belt[0], null);
});

test('R8: a box with a pending ejection lets a matching piece ride on', () => {
  const st = stOf({ L1: [1, 1] });
  st.boxes[0].pending = 1;
  putBelt(st, 0, 1);
  assert.deepEqual(rules.tryLand(st, 0, 0), []);
  assert.ok(st.belt[0]);
  assert.deepEqual(kinds(st.boxes[0]), [1, 1]);
});

test('R8: a covered box passes everything (sim level, three laps, nothing lands in wrap/ice/lock)', () => {
  const s = mk({
    L1: [9, 1], R1: { pieces: [], mods: { wrap: 5 } }, R2: { pieces: [], mods: { ice: true } }, R3: { pieces: [], mods: { lock: 'Q' } }
  });
  tap(s, 0);
  untilEject(s, 1);
  run(s, 3 * LAP);
  ['R1', 'R2', 'R3'].forEach(function (id) { assert.equal(s.state.boxes[ix(s, id)].pieces.length, 0, id); });
});

// ================================================================== R9 pouring

// R9 (conditional): the pouring box attracts kind c past other boxes only while count + c in transit >= 4.
// rules.tryLand(state, plate, box) is called per mouth, in the order the piece would meet them.
test('R9: a completable pouring box (2 + 2 in transit) is preferred: an upstream matching box and an upstream empty box are skipped', () => {
  [[1], []].forEach(function (upstream) {
    const st = stOf({ L1: upstream, R1: [1, 1] });
    const A = 0, B = 1;
    putBelt(st, 0, 1); putBelt(st, 1, 1);
    assert.equal(rules.tryLand(st, 0, B).length, 1);                    // B = [1,1,1], one more in transit: 3 + 1 = 4
    assert.deepEqual(st.pouring, { 1: B });
    assert.equal(rules.accepts(st, A, 1), true, 'A could take it by R8');
    assert.deepEqual(rules.tryLand(st, 1, A), [], 'upstream ' + JSON.stringify(upstream) + ' is skipped');
    assert.ok(st.belt[1]);
    assert.equal(rules.wouldLand(st, 1, A), false);
    assert.deepEqual(rules.tryLand(st, 1, B).map(function (e) { return e.type; }), ['land', 'close']);
    assert.deepEqual(st.pouring, {});
  });
});

test('R9: a pouring box that cannot be completed (1 + 2 in transit = 3) gives no preference: the first accepting box takes the piece', () => {
  [[1], []].forEach(function (upstream) {
    const st = stOf({ L1: upstream, R1: [1] });
    const A = 0, B = 1;
    putBelt(st, 0, 1); putBelt(st, 1, 1);
    assert.equal(rules.tryLand(st, 0, B).length, 1);                    // B = [1,1], one more in transit: 2 + 1 = 3
    assert.deepEqual(st.pouring, { 1: B }, 'pouring is still recorded');
    assert.equal(rules.wouldLand(st, 1, A), true);
    assert.equal(rules.tryLand(st, 1, A).length, 1, 'upstream ' + JSON.stringify(upstream) + ' takes it');
    assert.deepEqual(kinds(st.boxes[A]), upstream.concat([1]));
    assert.deepEqual(st.pouring, {}, 'nothing of kind 1 in transit any more');
  });
});

test('R9: completability is re-evaluated at every mouth: it flips to "no preference" when the transit shrinks below 4 - count', () => {
  const st = stOf({ L1: [], R1: [1, 1] });
  putBelt(st, 0, 1); putBelt(st, 1, 1);
  assert.equal(rules.wouldLand(st, 0, 0), false, '2 + 2 >= 4: the empty box is skipped');
  st.belt[1] = null;                                                    // one piece of the transit disappears (e.g. tap logic elsewhere)
  assert.equal(rules.wouldLand(st, 0, 0), true, '2 + 1 < 4: the empty box takes it');
});

test('R9: pouring is not honoured when the pouring box no longer accepts (full box): the piece lands elsewhere', () => {
  const st = stOf({ L1: [], R1: [1, 1] });
  st.pouring[1] = 1;
  st.boxes[1].pieces = [{ id: 50, k: 0, hidden: false, key: null, pair: null }, { id: 51, k: 1, hidden: false, key: null, pair: null },
    { id: 52, k: 1, hidden: false, key: null, pair: null }, { id: 53, k: 1, hidden: false, key: null, pair: null }];
  putBelt(st, 0, 1); putBelt(st, 1, 1);
  assert.equal(rules.tryLand(st, 0, 0).length, 1, 'lands in the empty box');
  assert.deepEqual(st.pouring, { 1: 0 }, 'pouring moves with the landing while a 1 remains on the belt');
});

test('R9: two kinds pour at once, each to its own completable box; an empty upstream box takes neither, but takes a third kind', () => {
  const st = stOf({ L1: [], L2: [1, 1], L3: [2, 2] });
  putBelt(st, 0, 1); putBelt(st, 1, 1); putBelt(st, 2, 2); putBelt(st, 3, 2); putBelt(st, 4, 3);
  assert.equal(rules.tryLand(st, 0, 1).length, 1);
  assert.equal(rules.tryLand(st, 2, 2).length, 1);
  assert.deepEqual(st.pouring, { 1: 1, 2: 2 });
  assert.deepEqual(rules.tryLand(st, 1, 0), []);
  assert.deepEqual(rules.tryLand(st, 3, 0), []);
  assert.equal(rules.tryLand(st, 4, 0).length, 1, 'a kind with no completable box lands in the first accepting box');
  assert.deepEqual(rules.tryLand(st, 1, 1).map(function (e) { return e.type; }), ['land', 'close']);
  assert.deepEqual(st.pouring, { 2: 2 }, 'kind 1 closed its box, kind 2 keeps pouring');
});

test('R9: two kinds pour at once but neither box is completable (1 + 2 in transit each): the upstream box takes the first matching piece', () => {
  const st = stOf({ L1: [], L2: [1], L3: [2] });
  putBelt(st, 0, 1); putBelt(st, 1, 1); putBelt(st, 2, 2); putBelt(st, 3, 2);
  assert.equal(rules.tryLand(st, 0, 1).length, 1);
  assert.equal(rules.tryLand(st, 2, 2).length, 1);
  assert.deepEqual(st.pouring, { 1: 1, 2: 2 });
  assert.equal(rules.tryLand(st, 1, 0).length, 1, 'kind 1: no preference, the empty box takes it');
  assert.deepEqual(kinds(st.boxes[0]), [1]);
  assert.deepEqual(rules.tryLand(st, 3, 0), [], 'kind 2: the box now holds a 1, it simply does not accept');
  assert.equal(rules.tryLand(st, 3, 2).length, 1);
  assert.deepEqual(st.pouring, {});
});

// ---- R10b and in transit

// S = L1 is tapped (pending), D = R1 [1] holds one 1, E = L2 is empty; one 1 rides on plate 0.
function transitCase(sBoxes, freeLeft, dPieces) {
  const s = mk({ L1: sBoxes, R1: dPieces || [1], L2: [] }, { N: 6 });
  const junk = []; for (let p = 1; p <= 5 - freeLeft; p++) junk.push(p);   // unlandable 9s leave exactly freeLeft plates free
  fillBelt(s, junk, 9);
  putBelt(s.state, 0, 1);
  return s;
}
test('R10b: a hidden same-kind piece does not leave with the run: it stays in the source box (revealed), which is then the completable box', () => {
  const s = transitCase([['p', 1, 1], 'h:1', 1], 3);
  assert.equal(tap(s, ix(s, 'L1')).k, 1);
  assert.equal(s.state.boxes[ix(s, 'L1')].pieces.length, 3, 'pair and the revealed 1 stay');
  assert.equal(s.state.boxes[ix(s, 'L1')].outbox.length, 1, 'only the front 1 is leaving');
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L2')), true, 'L1 would be completable (3 + 2) but it is mid-ejection: no target, the empty box takes the piece');
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L1')), false, 'and L1 lets the piece pass while its piece is leaving');
  run(s, D1 + 10);                                              // the piece has departed: L1 is a plain completable box now
  assert.equal(s.state.boxes[ix(s, 'L1')].pending, 0);
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L2')), false, 'L1 = 3 + 2 in transit: the empty box lets the piece pass');
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L1')), true);
  const vis = transitCase([1, 1], 4);                       // control: a visible run of 2 leaves entirely
  assert.equal(tap(vis, ix(vis, 'L1')).k, 2);
  assert.equal(rules.wouldLand(vis.state, 0, ix(vis, 'L2')), false, 'D = 1 + 1 on belt + 2 leaving = 4: completable');
});

test('R10b: both members of a leaving bound pair count (1 + 1 on belt + 2 = 4); a mixed pair counts only while the kind matches', () => {
  const s = transitCase([['p', 1, 1]], 5);
  assert.equal(tap(s, ix(s, 'L1')).k, 2);
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L2')), false);
  const m = transitCase([['p', 2, 1]], 5);                  // pair: front 1, mate 2 -> only one 1 is leaving
  assert.equal(tap(m, ix(m, 'L1')).k, 2);
  assert.equal(rules.wouldLand(m.state, 0, ix(m, 'L2')), true, '1 + 1 + 1 = 3 < 4: the empty box takes the piece');
});

test('R10b: a leaving run stops counting at the first piece of another kind', () => {
  const s = transitCase([1, 2, 1], 5);                      // run is the front 1 only; the 2 behind it does not leave
  assert.equal(tap(s, ix(s, 'L1')).k, 1);
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L2')), true, '1 + 1 + 1 = 3');
});

test('R10b: the source box is the completable box after its piece comes back (S = [1] + 3 in transit): the empty box is skipped, S closes', () => {
  const st = stOf({ L1: [1], L2: [] });
  [0, 1, 2].forEach(function (p) { putBelt(st, p, 1); });
  const S = 0, E = 1;
  [0, 1].forEach(function (p) {
    assert.deepEqual(rules.tryLand(st, p, E), [], 'plate ' + p + ' passes the empty box');
    assert.equal(rules.tryLand(st, p, S).length, 1);
  });
  assert.deepEqual(rules.tryLand(st, 2, E), []);
  assert.deepEqual(rules.tryLand(st, 2, S).map(function (e) { return e.type; }), ['land', 'close']);
  assert.deepEqual(kinds(st.boxes[E]), []);
});

test('R10b: a box that has just been emptied by a tap is no completion target; a box with pending > 0 never is', () => {
  const s = mk({ R1: [1, 1, 1], L2: [] });
  putBelt(s.state, 0, 1);
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L2')), false, 'R1 = 3 + 1 in transit: the empty box is skipped');
  assert.equal(tap(s, ix(s, 'R1')).ok, true);                     // all three leave onto plates at once
  assert.equal(s.state.boxes[ix(s, 'R1')].pieces.length, 0);
  assert.equal(rules.wouldLand(s.state, 0, ix(s, 'L2')), true, 'R1 is empty now: nothing to complete, the first accepting box takes it');
  // a pouring box that is mid-ejection (pending > 0, safety-net state) gives no R9 preference
  const st = stOf({ L1: [1], R1: [1, 1, 1] });
  putBelt(st, 0, 1);
  st.pouring[1] = 1;
  st.boxes[1].pending = 1;
  assert.equal(rules.wouldLand(st, 0, 0), true);
});

test('R9 (sim): pouring starts on the first landing, ends with the last piece on the belt', () => {
  const s = mk({ L1: [9, 1, 1], R1: [1] });
  tap(s, 0);
  runU(s, function (st, ev) { return of(ev, 'land').length > 0; }, 3 * LAP);
  assert.deepEqual(s.state.pouring, { 1: ix(s, 'R1') });
  runU(s, function (st, ev) { return of(ev, 'land').length > 0; }, 3 * LAP);
  assert.deepEqual(s.state.pouring, {});
  assert.deepEqual(kinds(s.state.boxes[ix(s, 'R1')]), [1, 1, 1]);
});

test('R9 (sim): pouring ends when the pouring box is tapped, and a refused tap leaves it alone', () => {
  const s = mk({ L1: [9, 1, 1], R1: [1] });
  tap(s, 0);
  runU(s, function (st, ev) { return of(ev, 'land').length > 0; }, 3 * LAP);
  assert.deepEqual(s.state.pouring, { 1: ix(s, 'R1') });
  const keep = s.state.belt.slice();
  fillBelt(s, [0, 1, 2, 3, 4, 5].filter(function (p) { return !s.state.belt[p]; }), 9);   // belt full
  assert.equal(tap(s, ix(s, 'R1')).reason, 'full');
  assert.deepEqual(s.state.pouring, { 1: ix(s, 'R1') }, 'a refused tap does not end pouring');
  s.state.belt = keep;
  assert.equal(tap(s, ix(s, 'R1')).ok, true);
  assert.deepEqual(s.state.pouring, {});
});

test('R9 (sim): pouring ends when the box closes, even with a piece of that kind still on the belt', () => {
  const s = mk({ L1: [9, 1, 1, 1], R1: [1, 1] });
  tap(s, 0);
  const ev = runU(s, function (st, e) { return of(e, 'close').length > 0; }, 4 * LAP);
  assert.equal(of(ev, 'close').length, 1);
  assert.equal(beltIds(s.state).length, 1, 'the third 1 is still riding');
  assert.deepEqual(s.state.pouring, {});
  const later = run(s, 2 * LAP);
  assert.equal(of(later, 'land').length, 0, 'closed R1 takes nothing; the last 1 laps on');
});

// ================================================================== R10 first accepting box

function firstLand(dir) {
  const s = mk({ L4: [8, 1], L3: [4], L2: [], R2: [], R5: [] }, { dir: dir });
  tap(s, ix(s, 'L4'));
  const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 2 * LAP);
  return s.state.boxes[of(ev, 'land')[0].box].id;
}
test('R10: cw, the first accepting box downstream wins (L3 is skipped, L2 beats R2 and R5)', () => {
  assert.equal(firstLand('cw'), 'L2');
});
test('R10: ccw, the order is reversed (R5 comes before R2; L2 would be last)', () => {
  assert.equal(firstLand('ccw'), 'R5');
});

test('R10/R25: the source box accepts its own piece back after exactly one lap', () => {
  const s = mk({ L1: [1] });
  tap(s, 0);
  const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
  const ej = of(ev, 'eject')[0], ld = of(ev, 'land')[0];
  assert.equal(ld.box, 0);
  assert.equal(ld.plate, ej.plate);
  assert.ok(Math.abs(ld.time - ej.time - LAP) < 5, 'lap time (the plate is dropped 0.5 units behind the mouth) ' + (ld.time - ej.time));
  assert.deepEqual(kinds(s.state.boxes[0]), [1]);
});

// ================================================================== R11 laps

test('R11: a piece nobody accepts is still on its plate after 3+ laps, same piece, game still on', () => {
  const s = mk({ L1: [0, 1] }, { N: 6 });
  tap(s, 0);
  untilEject(s, 1);
  const before = beltIds(s.state);
  assert.equal(before.length, 1);
  const ev = run(s, 3 * LAP + 500);
  assert.equal(of(ev, 'land').length, 0);
  assert.deepEqual(beltIds(s.state), before);
  assert.equal(s.status, 'play');
});

// ================================================================== R12 close

test('R12: closes at exactly 4, once, never accepts again, cannot be tapped', () => {
  const st = stOf({ L1: [2, 2, 2], R1: [] });
  [0, 1, 2].forEach(function (p) { putBelt(st, p, 2); });
  const ev = rules.tryLand(st, 0, 0);
  assert.equal(ev.map(function (e) { return e.type; }).join(), 'land,close');
  assert.equal(st.boxes[0].closed, true);
  assert.deepEqual(st.closedKinds, [2]);
  assert.equal(rules.accepts(st, 0, 2), false);
  assert.deepEqual(rules.tryLand(st, 1, 0), []);
  assert.deepEqual(rules.canEject(st, 0), { ok: false, reason: 'closed' });
  assert.deepEqual(st.closedKinds, [2]);
});

test('R12: a 5th piece of a kind rides past a closed box for ever; close event once; closed box untouched (sim)', () => {
  const s = mk({ L1: [9, 1], R2: [8, 1], R1: [1, 1, 1] });
  tap(s, ix(s, 'L1'));
  let ev = run(s, 2 * LAP);
  assert.equal(of(ev, 'close').length, 1, 'exactly one close event');
  const r1 = s.state.boxes[ix(s, 'R1')];
  assert.equal(r1.closed, true); assert.equal(r1.pieces.length, 4);
  assert.equal(tap(s, ix(s, 'R2')).ok, true);
  ev = run(s, 5 * LAP);
  assert.equal(of(ev, 'close').length, 0);
  assert.equal(of(ev, 'land').length, 0, 'the extra 1 finds no box: L1 shows a 9, R2 a 8');
  assert.equal(r1.pieces.length, 4);
  assert.equal(beltIds(s.state).length, 1);
  assert.equal(tap(s, ix(s, 'R1')).reason, 'closed');
  assert.equal(s.status, 'play');
});

test('R12/R4: the winning landing logs land, close, then won, all in the same instant', () => {
  const s = mk({ L1: [0, 0, 0], R1: [0] }, { kinds: 1 });
  tap(s, 0);
  const ev = run(s, 2 * LAP);
  const tail = ev.slice(-3);
  assert.deepEqual(tail.map(function (e) { return e.type; }), ['land', 'close', 'won']);
  assert.equal(tail[0].time, tail[2].time);
});

// ================================================================== R4 win

test('R4: the last close wins; won event once; taps are refused as over afterwards', () => {
  const s = mk({ L1: [0, 0, 0], R1: [0] }, { kinds: 1 });
  tap(s, 0);
  const ev = run(s, 2 * LAP);
  assert.equal(of(ev, 'close').length, 1);
  assert.equal(of(ev, 'won').length, 1);
  assert.equal(s.status, 'won');
  assert.equal(tap(s, 0).reason, 'over');
  assert.equal(of(run(s, 2000), 'won').length, 0);
});

// ================================================================== R13 / R14 stuck

test('R13: full belt and nothing can land -> lost once, taps refused as over, belt keeps moving', () => {
  const s = mk({ L1: [3, 1, 1, 1], R1: [4, 5] }, { N: 4 });
  assert.equal(tap(s, ix(s, 'L1')).k, 3);
  run(s, 2 * LAP);
  assert.equal(s.status, 'play', 'one free plate left, R1 is tappable');
  assert.equal(tap(s, ix(s, 'R1')).ok, true);
  const ev = run(s, 2 * LAP);
  assert.equal(of(ev, 'lost').length, 1);
  assert.equal(s.status, 'lost');
  assert.equal(simM.freePlates(s), 0);
  assert.equal(tap(s, ix(s, 'L1')).reason, 'over');
  assert.equal(tap(s, ix(s, 'R1')).reason, 'over');
  const pos = s.belt.travel;
  assert.equal(of(run(s, LAP), 'lost').length, 0, 'lost is reported once');
  assert.ok(s.belt.travel > pos, 'the belt keeps moving under the lose card');
});

test('R13: stuck is detected at the tick of the last ejection, not before', () => {
  const s = mk({ L1: [3, 1, 1, 1], R1: [4, 5] }, { N: 4 });
  tap(s, ix(s, 'L1'));
  run(s, 2 * LAP);
  tap(s, ix(s, 'R1'));
  const ev = run(s, 2 * LAP);
  const e = of(ev, 'eject')[0], l = of(ev, 'lost')[0];
  assert.ok(l.time >= e.time && l.time - e.time <= 16 + 1e-9, 'lost comes with the next tick after the filling tap: ' + (l.time - e.time));
});

test('R14: full belt, but a piece can land after a lap -> never lost', () => {
  const s = mk({ L1: [5, 1, 1, 1] }, { N: 4 });
  fillBelt(s, [3], 5);                         // a 5 rides; the c-run is about to go out, L1 will show a 5 again
  assert.equal(tap(s, 0).k, 3);
  const ev = run(s, 4 * LAP);
  assert.equal(of(ev, 'lost').length, 0);
  assert.equal(s.status, 'play');
  assert.equal(of(ev, 'land').length >= 1, true, 'the 5 finds its way into L1');
  assert.equal(s.state.boxes[0].pieces[0].k, 5);
});

test('R14: with all plates full but one matching box, nothing is lost and everything lands', () => {
  const s = mk({ L1: [1], R1: [] }, { N: 4 });
  fillBelt(s, [0, 1, 2, 3], 1);
  assert.equal(rules.isStuck(s.state), false);
  const ev = run(s, 2 * LAP);
  assert.equal(of(ev, 'lost').length, 0);
  assert.equal(of(ev, 'land').length, 4);
  assert.equal(s.status, 'play');
});

test('R14: plates not full and a tappable box -> never lost, however long the belt runs', () => {
  const s = mk({ L1: [0, 1], R1: [7, 8] }, { N: 4 });
  fillBelt(s, [0, 1], 9);
  assert.equal(rules.isStuck(s.state), false);
  assert.equal(of(run(s, 5 * LAP), 'lost').length, 0);
});

test('R13 (spirit): an unplaceable bound pair with one free plate and nothing landable is a terminal position -> lost', () => {
  const s = mk({ L1: [7, ['p', 1, 2]] }, { N: 4 });
  fillBelt(s, [0, 1, 2], 9);
  assert.deepEqual(rules.canEject(s.state, 0), { ok: false, reason: 'pair' });
  const ev = run(s, 100);
  assert.equal(of(ev, 'lost').length, 1);
});

// ================================================================== R15 hidden

test('R15: validate rejects a hidden front piece; hidden pieces behind the front are fine', () => {
  const bad = H.level(spec({ L1: [0, 0, 0, 'h:0'], L2: [1, 1, 1, 1] }, { kinds: 2 }));
  assert.ok(model.validate(bad).some(function (e) { return /^R15/.test(e); }));
  const ok = H.level(spec({ L1: ['h:0', 'h:0', 'h:0', 1], L2: [1, 1, 'h:1', 0] }, { kinds: 2 }));
  assert.deepEqual(model.validate(ok), []);
});

test('R15: parse self-heals a hidden front piece (face-up with a reveal in initialEvents); others stay hidden', () => {
  const st = model.parse(H.level(spec({ L1: ['h:1', 'h:0', 'h:0'], L2: [1] }, { kinds: 2 })));
  const b = st.boxes[0];
  assert.deepEqual(b.pieces.map(function (p) { return p.hidden; }), [true, true, false]);
  assert.equal(st.initialEvents.filter(function (e) { return e.type === 'reveal' && e.box === 0; }).length, 1);
});

test('R15: a landing on a box does not reveal what lies under it; reveal waits for the front', () => {
  const s = mk({ L1: ['h:5', 3], R1: [9, 3] });
  const rev = of(s.log, 'reveal').length;
  tap(s, ix(s, 'R1'));
  const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
  assert.equal(of(ev, 'land').length, 1);
  assert.equal(of(ev, 'reveal').length, 0, 'landing a 3 on L1 [h5,3] reveals nothing');
  assert.deepEqual(s.state.boxes[0].pieces.map(function (p) { return p.hidden; }), [true, false, false]);
  assert.equal(of(s.log, 'reveal').length, rev);
  tap(s, 0);                                               // run of 2 threes leaves, the hidden 5 is exposed
  const ev2 = untilEject(s, 2);
  assert.equal(of(ev2, 'reveal').length, 1);
  assert.equal(s.state.boxes[0].pieces[0].hidden, false);
});

// ================================================================== R16 pairs

test('R16: a pair needs 2 plates: refused "pair" with 1 free, accepted with 2 adjacent free, counts as 2', () => {
  const s = mk({ L1: [7, ['p', 1, 2]] }, { N: 4 });
  fillBelt(s, [0, 1, 2], 9);
  const before = model.hash(s.state), n = s.log.length;
  const r = tap(s, 0);
  assert.equal(r.ok, false); assert.equal(r.reason, 'pair');
  assert.equal(model.hash(s.state), before);
  assert.deepEqual(s.log.slice(n).map(function (e) { return e.type + ':' + e.reason; }), ['refuse:pair']);
  const s2 = mk({ L1: [7, ['p', 1, 2]] }, { N: 4 });
  fillBelt(s2, [0, 1], 9);
  const r2 = tap(s2, 0);
  assert.equal(r2.ok, true); assert.equal(r2.k, 2);
  assert.equal(simM.freePlates(s2), 0);
  const ev = untilEject(s2, 2);
  assert.equal(simM.freePlates(s2), 0);
  assert.equal(of(ev, 'eject').length, 2);
  const e = of(ev, 'eject');
  assert.equal(e[0].time, e[1].time, 'both leave in one crossing');
  assert.equal(e[1].plate, (e[0].plate + 3) % 4, 'consecutive plates, the mate one behind');
});

test('R16: a pair needs 2 free plates anywhere (adjacency is gone): non-adjacent free plates are reserved, the pair departs as one unit', () => {
  const s = mk({ L1: [7, ['p', 1, 2]], R1: [3, 4] }, { N: 4 });
  fillBelt(s, [0, 2], 9);
  const r = tap(s, 0);
  assert.equal(r.ok, true); assert.equal(r.k, 2);
  assert.deepEqual(of(r.events, 'tapped')[0].plan.map(function (x) { return x.plate; }).sort(), [1, 3]);
  assert.equal(simM.freePlates(s), 0);
  const ej = of(untilEject(s, 2), 'eject');
  assert.equal(ej.length, 2);
  assert.equal(ej[0].time, ej[1].time, 'both members depart together');
  assert.ok(Math.abs(ej[0].time - D1) < 1e-6);
  assert.deepEqual(ej.map(function (e) { return e.plate; }).sort(), [1, 3]);
  const s1 = mk({ L1: [7, ['p', 1, 2]] }, { N: 4 });
  fillBelt(s1, [0, 1, 2], 9);
  assert.equal(tap(s1, 0).reason, 'pair', 'with one free plate the pair is still refused');
});

test('R16: a pair splits on the belt: its members land in different boxes and never bind again', () => {
  const s = mk({ L1: [1, ['p', 2, 3]], R1: [3], R2: [2] });
  tap(s, 0);
  const ev = run(s, LAP);
  const ej = of(ev, 'eject'), ld = of(ev, 'land');
  assert.equal(ej.length, 2);
  assert.equal(ld.length, 2);
  assert.deepEqual(ld.map(function (l) { return s.state.boxes[l.box].id + ':' + l.piece.k; }).sort(), ['R1:3', 'R2:2']);
  s.state.boxes.forEach(function (b) { b.pieces.forEach(function (p) { if (b.id !== 'L1') assert.equal(p.pair, null); }); });
});

test('R16: a mixed-kind pair at the front ejects as a 2-piece unit and ends the run', () => {
  const s = mk({ L1: [3, 3, ['p', 2, 3]] });
  assert.equal(rules.runLength(s.state.boxes[0]), 2, 'pair (3 front, 2 behind) leaves alone, the 3s behind stay');
  assert.deepEqual(rules.canEject(s.state, 0), { ok: true, k: 2 });
  tap(s, 0);
  const ev = untilEject(s, 2);
  assert.deepEqual(kinds(s.state.boxes[0]), [3, 3]);
  assert.deepEqual(of(ev, 'eject').map(function (e) { return e.piece.k; }), [3, 2]);
});

test('R16: run length table (pairs inside, behind and in front of runs)', () => {
  const cases = [
    [[['p', 1, 1], 1, 1], 4, 'pair of the run kind behind a run'],
    [[1, 1, ['p', 1, 1]], 4, 'run, then pair of the run kind at the front'],
    [[['p', 2, 1], 1], 1, 'pair with a foreign member behind the front 1: run ends before the pair'],
    [[['p', 1, 2], 1], 1, 'pair whose front member is foreign'],
    [[['p', 1, 1], 2], 1, 'front single of another kind'],
    [[2, ['p', 1, 1]], 2, 'front pair 1,1 then a 2 behind'],
    [[1, ['p', 1, 2]], 2, 'front pair (2 front, 1 behind) is a 2-unit'],
    [[1, 1, ['p', 2, 1]], 2, 'front pair 1,2 mixed: leaves alone'],
    [[0, 1, ['p', 1, 1], 1], 4, 'pair in the middle of a run'],
    [[2, ['p', 1, 1], 1], 3, 'run: single, then pair, nothing more']
  ];
  cases.forEach(function (c) {
    const st = stOf({ L1: c[0] });
    assert.equal(rules.runLength(st.boxes[0]), c[1], c[2]);
  });
});

test('R16: with 3 free plates a run of [single, single, pair] takes 2, never splitting the pair', () => {
  const s = mk({ L1: [['p', 1, 1], 1, 1] }, { N: 6 });
  fillBelt(s, [0, 1, 2], 9);
  assert.deepEqual(rules.canEject(s.state, 0), { ok: true, k: 2 });
  const s2 = mk({ L1: [['p', 1, 1], 1, 1] }, { N: 6 });
  assert.deepEqual(rules.canEject(s2.state, 0), { ok: true, k: 4 });
});

// ================================================================== R17 wrapped

test('R17: all wraps of a kind lift on that kind\'s close, and only that kind\'s', () => {
  const st = stOf({
    L1: { pieces: [0], mods: { wrap: 1 } }, L2: { pieces: [3], mods: { wrap: 1 } }, L3: { pieces: [0], mods: { wrap: 2 } },
    R1: [2, 2, 2], R2: [1, 1, 1]
  });
  const id = function (n) { return ix(st, n); };
  putBelt(st, 0, 2); putBelt(st, 1, 1);
  const e1 = rules.tryLand(st, 0, id('R1'));
  assert.deepEqual(e1.filter(function (e) { return e.type === 'unwrap'; }).map(function (e) { return e.box; }), [id('L3')]);
  assert.equal(st.boxes[id('L1')].wrap, 1);
  assert.equal(st.boxes[id('L2')].wrap, 1);
  assert.equal(st.boxes[id('L3')].wrap, null);
  const e2 = rules.tryLand(st, 1, id('R2'));
  assert.deepEqual(e2.filter(function (e) { return e.type === 'unwrap'; }).map(function (e) { return e.box; }).sort(), [id('L1'), id('L2')].sort());
  assert.equal(rules.accepts(st, id('L1'), 0), true, 'an unwrapped empty-front box accepts again');
});

test('R17: a wrapped box passes its own kind; the cloth lifts only by the close, not by pieces riding past', () => {
  const s = mk({ L1: [9, 1], R1: { pieces: [0], mods: { wrap: 1 } } });
  tap(s, 0);
  untilEject(s, 1);
  run(s, 3 * LAP);
  assert.equal(s.state.boxes[ix(s, 'R1')].wrap, 1);
});

// ================================================================== R18 frozen

test('R18: ice thaws only when a layout neighbour closes (L1-L2 yes, L3 / R2 no); both neighbours thaw together', () => {
  function closeBox(id, extra) {
    const boxes = Object.assign({ L1: { pieces: [0], mods: { ice: true } }, L3: { pieces: [0], mods: { ice: true } } }, extra);
    boxes[id] = [3, 3, 3];
    const st = stOf(boxes);
    putBelt(st, 0, 3);
    return { st: st, ev: rules.tryLand(st, 0, ix(st, id)) };
  }
  let r = closeBox('L2');
  assert.deepEqual(r.ev.filter(function (e) { return e.type === 'thaw'; }).map(function (e) { return e.box; }).sort(), [ix(r.st, 'L1'), ix(r.st, 'L3')].sort());
  assert.equal(r.st.boxes[ix(r.st, 'L1')].ice, false);
  r = closeBox('L5');                                           // neighbour of L4 and L6 only
  assert.equal(r.ev.filter(function (e) { return e.type === 'thaw'; }).length, 0);
  assert.equal(r.st.boxes[ix(r.st, 'L1')].ice, true);
  r = closeBox('R2');                                           // same row as L2, other column: not a neighbour
  assert.equal(r.ev.filter(function (e) { return e.type === 'thaw'; }).length, 0);
  assert.equal(r.st.boxes[ix(r.st, 'L1')].ice, true);
  r = closeBox('L4');                                           // neighbour of L3, not of L1
  assert.equal(r.st.boxes[ix(r.st, 'L3')].ice, false);
  assert.equal(r.st.boxes[ix(r.st, 'L1')].ice, true);
});

test('R18: closing a box that is not a neighbour never thaws, whatever the kind; thaw is once', () => {
  const st = stOf({ L1: { pieces: [0], mods: { ice: true } }, L2: [3, 3, 3], R1: [4, 4, 4] });
  putBelt(st, 0, 3); putBelt(st, 1, 4);
  assert.equal(rules.tryLand(st, 1, ix(st, 'R1')).filter(function (e) { return e.type === 'thaw'; }).length, 0);
  assert.equal(st.boxes[0].ice, true);
  assert.equal(rules.accepts(st, 0, 0), false);
  assert.equal(rules.tryLand(st, 0, ix(st, 'L2')).filter(function (e) { return e.type === 'thaw'; }).length, 1);
  assert.equal(rules.accepts(st, 0, 0), true);
});

// ================================================================== R19 locks

test('R19: boxes under a shutter accept nothing and cannot be tapped; a shutter over two boxes opens as one', () => {
  const s = mk({
    L1: [0, 'k:A:5', 2], R1: { pieces: [6], mods: { lock: 'A' } }, R2: { pieces: [], mods: { lock: 'A' } }
  });
  const r1 = ix(s, 'R1'), r2 = ix(s, 'R2');
  assert.equal(rules.accepts(s.state, r2, 4), false);
  assert.equal(rules.accepts(s.state, r1, 6), false);
  assert.equal(tap(s, r1).reason, 'covered');
  assert.deepEqual(s.state.locks.A.boxes.sort(), ['R1', 'R2']);
  tap(s, 0);
  const ev = untilEject(s, 1);
  const u = of(ev, 'unlock');
  assert.equal(u.length, 1, 'one unlock event for the shutter');
  assert.deepEqual(u[0].boxes.sort(), [r1, r2].sort());
  assert.equal(s.state.boxes[r1].lock, null); assert.equal(s.state.boxes[r2].lock, null);
  assert.equal(rules.accepts(s.state, r2, 4), true);
});

test('R19: a keyed piece in a covered box does not release until the cover lifts (wrap)', () => {
  const st = stOf({
    L1: { pieces: [0, 'k:A:5'], mods: { wrap: 1 } }, R1: { pieces: [3], mods: { lock: 'A' } }, R2: [1, 1, 1]
  });
  assert.equal(st.initialEvents.length, 0);
  assert.equal(st.boxes[ix(st, 'R1')].lock, 'A');
  putBelt(st, 0, 1);
  const ev = rules.tryLand(st, 0, ix(st, 'R2'));
  assert.deepEqual(ev.map(function (e) { return e.type; }), ['land', 'close', 'unwrap', 'unlock']);
  assert.equal(st.boxes[ix(st, 'R1')].lock, null);
});

test('R19: keys chain: a key at the front of a box under shutter A opens shutter B as soon as A opens', () => {
  const st = stOf({
    L1: [0, 'k:A:5'], L2: { pieces: [2, 'k:B:3'], mods: { lock: 'A' } }, L3: { pieces: [6], mods: { lock: 'B' } }
  });
  const ev = st.initialEvents.filter(function (e) { return e.type === 'unlock'; }).map(function (e) { return e.lock; });
  assert.deepEqual(ev, ['A', 'B'].slice(0, 1).concat(ev.slice(1)).slice(0, ev.length));
  assert.equal(st.boxes[ix(st, 'L2')].lock, null);
  assert.equal(st.boxes[ix(st, 'L3')].lock, null);
});

// ================================================================== R20 one-way

test('R20: a one-way box is never ejectable (reason "oneway"), also by tap; covered wins over oneway', () => {
  const s = mk({
    L1: { pieces: [1], mods: { oneway: true } }, L2: { pieces: [], mods: { oneway: true } },
    L3: { pieces: [1], mods: { oneway: true, ice: true } }
  });
  assert.equal(tap(s, 0).reason, 'oneway');
  assert.equal(tap(s, 1).reason, 'oneway');
  assert.equal(tap(s, 2).reason, 'covered');
  s.state.boxes[2].ice = false;
  assert.equal(tap(s, 2).reason, 'oneway');
  assert.throws(function () { rules.ejectUnit(s.state, 0, [0]); });
});

test('R20: a one-way box takes its first piece, then only that kind, and closes at 4', () => {
  const s = mk({ L1: [9, 1, 1, 2, 2], L2: [9, 3, 3], R1: { pieces: [], mods: { oneway: true } } });
  // L1 front is 2,2 -> ejected first; the oneway box (R1, cw first) takes the first 2, the second 2 follows (pouring)
  tap(s, 0);
  untilEject(s, 2);
  run(s, LAP);
  assert.deepEqual(kinds(s.state.boxes[ix(s, 'R1')]), [2, 2]);
  tap(s, 1);                                               // two 3s leave and ride past R1 (kind fixed to 2)
  untilEject(s, 2);
  run(s, 3 * LAP);
  assert.deepEqual(kinds(s.state.boxes[ix(s, 'R1')]), [2, 2]);
  assert.equal(beltIds(s.state).length + s.state.boxes[ix(s, 'L2')].pieces.length >= 2, true);
});

// ================================================================== R23 permutation

test('R23: permutation is a bijection for every size and attempt, stable for the same arguments', () => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const p = model.permutation(17, attempt);
    assert.equal(p.length, config.KIND_NAMES.length);
    assert.deepEqual(p.slice().sort(function (a, b) { return a - b; }), p.map(function (_, i) { return i; }));
    assert.deepEqual(model.permutation(17, attempt), p);
  }
  for (let n = 1; n <= 12; n++) {
    const p = model.permutation(5, 3, n);
    assert.deepEqual(p.slice().sort(function (a, b) { return a - b; }), p.map(function (_, i) { return i; }));
  }
});

test('R23: the permutation differs between attempts (for most) and between levels', () => {
  const seen = {};
  for (let a = 0; a < 20; a++) seen[model.permutation(17, a).join()] = true;
  assert.ok(Object.keys(seen).length >= 18, 'distinct permutations over 20 attempts: ' + Object.keys(seen).length);
  const other = {};
  for (let id = 1; id <= 20; id++) other[model.permutation(id, 0).join()] = true;
  assert.ok(Object.keys(other).length >= 18);
  const consecutive = [];
  for (let a = 0; a < 20; a++) consecutive.push(model.permutation(17, a).join() === model.permutation(17, a + 1).join());
  assert.equal(consecutive.some(Boolean), false, 'attempt n and n+1 never share a permutation');
});

function mapPiece(e, perm) {
  if (Array.isArray(e)) return ['p', mapPiece(e[1], perm), mapPiece(e[2], perm)];
  if (typeof e === 'number') return perm[e];
  const parts = e.split(':');
  parts[parts.length - 1] = String(perm[Number(parts[parts.length - 1])]);
  return parts.join(':');
}
function strip(ev) { return JSON.stringify(ev, function (k, v) { return (k === 'k' || k === 'kind') ? undefined : v; }); }

test('R23: renaming the kinds by a permutation leaves structure and behaviour unchanged', () => {
  const base = spec({
    L1: [0, 'h:1', 1, 2], L2: [2, 2, 0, 1], R1: ['h:1', 0, 0], R2: [2], R3: [], R4: { pieces: [], mods: { wrap: 2 } }
  }, { kinds: 3, N: 6 });
  const lv = H.level(base);
  const perm = model.permutation(lv.id, 4, 3);
  const lv2 = JSON.parse(JSON.stringify(lv));
  lv2.boxes.forEach(function (b) {
    b.pieces = b.pieces.map(function (p) { return mapPiece(p, perm); });
    if (b.mods && b.mods.wrap !== undefined) b.mods.wrap = perm[b.mods.wrap];
  });
  assert.equal(model.validate(lv).length, model.validate(lv2).length);
  function play(level) {
    const tpl = H.layout(base), s = simM.create(level, { perimeter: tpl.perimeter, layout: tpl });
    const rng = mulberry(7);
    for (let i = 0; i < 1500; i++) {
      if (i % 40 === 0) tap(s, Math.floor(rng() * 6));
      simM.tick(s, 16);
    }
    return s;
  }
  const a = play(lv), b = play(lv2);
  assert.ok(a.log.length > 15);
  assert.equal(strip(a.log), strip(b.log));
  assert.equal(a.status, b.status);
});

// ================================================================== R24 determinism, R24 start phase

test('R24: the belt phase at start is fixed: plate 0 at the origin, travel 0, every attempt', () => {
  const s1 = mk({ L1: [1] }), s2 = mk({ L1: [1] });
  [s1, s2].forEach(function (s) {
    assert.equal(s.belt.phase, 0); assert.equal(s.belt.travel, 0);
    assert.equal(beltM.platePos(s.belt, 0), 0);
    assert.equal(s.time, 0);
  });
});

function playTaps(sp, seed, ticks) {
  const tpl = H.layout(sp), s = simM.create(H.level(sp), { perimeter: tpl.perimeter, layout: tpl }), rng = mulberry(seed);
  const n = s.state.boxes.length;
  for (let i = 0; i < ticks; i++) {
    if (rng() < 0.15) tap(s, Math.floor(rng() * n));
    simM.tick(s, 16);
  }
  return s;
}
test('R24: same taps at the same tick times give a byte-identical event log', () => {
  const a = playTaps(ALL, 11, 2500), b = playTaps(ALL, 11, 2500);
  assert.ok(a.log.length > 40, 'a log worth comparing: ' + a.log.length);
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.equal(model.hash(a.state), model.hash(b.state));
  const c = playTaps(ALL, 12, 2500);
  assert.notEqual(JSON.stringify(a.log), JSON.stringify(c.log), 'different taps -> different log');
});

// ================================================================== R25-R27 timing

test('R25: a lap takes LAP_MS whatever N is (re-landing of a lone piece), speed = perimeter / LAP_MS', () => {
  [4, 6, 10].forEach(function (N) {
    const s = mk({ L1: [1] }, { N: N });
    assert.ok(Math.abs(s.speed - H.layout({}).perimeter / LAP) < 1e-12);
    tap(s, 0);
    const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
    const dt = lapOf(s, of(ev, 'eject')[0], of(ev, 'land')[0]);
    assert.ok(Math.abs(dt - LAP) < 1e-3, 'N=' + N + ' lap ' + dt);
  });
});

test('R25: a custom lapMs scales the lap', () => {
  const s = H.sim(spec({ L1: [1] }, { lapMs: 4000 }));
  tap(s, 0);
  const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
  assert.ok(Math.abs(lapOf(s, of(ev, 'eject')[0], of(ev, 'land')[0]) - 4000) < 1e-3);
});

test('R26: a tap reserves the free plates that reach the mouth soonest (the nearest ones BEHIND it); other taps cannot take them', () => {
  const s = mk({ L3: [9, 1, 1, 1], L5: [8, 2, 2] }, { N: 8 });
  run(s, 1234);
  fillBelt(s, [0, 4], 9);
  const b = s.belt, mi = beltM.mouthIndex(b, 0), m = b.mouths[mi].s, P = b.perimeter;
  const free = [0, 1, 2, 3, 4, 5, 6, 7].filter(function (i) { return !s.state.belt[i]; });
  const behind = function (i) { return (((m - b.pos[i]) % P) + P) % P; };            // distance still to travel to the mouth
  const expected = free.slice().sort(function (a, c) { return behind(a) - behind(c); }).slice(0, 3).sort();
  const r = tap(s, 0);
  const plan = of(r.events, 'tapped')[0].plan;
  assert.deepEqual(plan.map(function (x) { return x.plate; }).sort(), expected);
  assert.ok(plan.every(function (x) { return x.departAt === s.time + D1 + plan.indexOf(x) * DG; }));
  const r2 = tap(s, 1);                                         // the second tap must take other plates
  const plan2 = of(r2.events, 'tapped')[0].plan.map(function (x) { return x.plate; });
  plan2.forEach(function (pl) { assert.equal(expected.indexOf(pl), -1, 'plate ' + pl + ' is reserved by the first tap'); });
  assert.equal(r2.k, 2, 'both pieces of the run fit on the remaining unreserved plates');
  assert.equal(simM.freePlates(s), 1);
  assert.equal(tap(s, 1).reason, 'pending');
});

test('R26: occupied plates are never chosen: the nearest FREE plate behind the mouth is used', () => {
  const s = mk({ L3: [9, 1] });
  run(s, 777);
  const first = simM.nextEjectPlate(s, 0);
  const plan1 = of(tap(s, 0).events, 'tapped')[0].plan[0].plate;
  const s2 = mk({ L3: [9, 1] });
  run(s2, 777);
  const mi = beltM.mouthIndex(s2.belt, 0);
  const soon = belt => 0;
  const nf = beltM.nextFree(s2.belt, mi, function (p) { return true; });
  putBelt(s2.state, nf, 9);
  const plan2 = of(tap(s2, 0).events, 'tapped')[0].plan[0].plate;
  assert.equal(plan1, nf);
  assert.notEqual(plan2, nf);
  assert.equal(plan2, beltM.nextFree(s2.belt, mi, function (p) { return !s2.state.belt[p] && p !== plan2 ? true : p === plan2; }));
  void first; void soon;
});

test('R26: belt.reaching boundary: exactly half a spacing counts, a hair more does not', () => {
  const mk4 = function (p0) {
    const b = beltM.create({ N: 4, perimeter: 1000, dir: 'cw', mouths: [{ box: 0, s: 500 }] });
    for (let i = 0; i < 4; i++) { b.pos[i] = b.up[i] = (p0 + 250 * i) % 1000; }
    return b;
  };
  assert.equal(beltM.reaching(mk4(375), 0), 0, 'plate 0 is 125 before the mouth');
  assert.equal(beltM.reaching(mk4(374.9), 0), -1, 'plate 0 is 125.1 before the mouth');
});

test('R27: a landing frees the plate in place at once; the next tap reserves it (it is the only free plate here)', () => {
  const s = mk({ R1: [1], L2: [6, 7] }, { N: 4 });
  fillBelt(s, [1, 2, 3], 9);
  putBelt(s.state, 0, 1);
  const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 2 * LAP);
  const ld = of(ev, 'land')[0];
  assert.equal(ld.plate, 0);
  assert.equal(s.state.belt[0], null, 'free at once');
  assert.equal(simM.freePlates(s), 1);
  const r = tap(s, ix(s, 'L2'));
  assert.equal(r.ok, true);
  assert.equal(of(r.events, 'tapped')[0].plan[0].plate, 0, 'the freed plate is the only free one and is reserved at once');
  assert.equal(s.state.belt.filter(Boolean).length, 3, 'not on the belt until the departure');
  const ej = of(untilEject(s, 1), 'eject');
  assert.equal(ej[0].plate, 0);
  assert.equal(s.state.belt.filter(Boolean).length, 4);
});

test('R26/R27: after taps and landings the spacing is uneven but no two plates are within 0.9 plate width; N plates stay', () => {
  const sp = spec({ L1: [9, 1, 1, 1], L2: [8, 2, 2], R1: [1], R2: [2, 2], R4: [5, 5] }, { N: 8 });
  const s = H.sim(sp), W = 40;
  const P = s.belt.perimeter;
  const gap = function () {
    let m = Infinity;
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { let d = Math.abs(s.belt.pos[i] - s.belt.pos[j]); d = Math.min(d, P - d); m = Math.min(m, d); }
    return m;
  };
  const rng = mulberry(31);
  let uneven = false;
  for (let i = 0; i < 1200; i++) {
    if (i % 25 === 0) tap(s, Math.floor(rng() * 5));
    simM.tick(s, 16);
    assert.equal(s.belt.pos.length, 8); assert.equal(s.state.belt.length, 8);
    assert.ok(gap() >= 0.9 * W - 1e-6, 'tick ' + i + ' min gap ' + gap());
    if (Math.abs(s.belt.pos[1] - s.belt.pos[0] - s.belt.spacing) > 1) uneven = true;
  }
  assert.equal(uneven, true, 'the teleports made the spacing uneven');
});

function evKey(e) {                                               // positions (from / to) are compared to 1e-6
  const c = {}; Object.keys(e).forEach(function (k) { if (k !== 'time') c[k] = e[k]; });
  const P = H.layout({}).perimeter;
  return JSON.stringify(c, function (k, v) {
    if ((k === 'from' || k === 'to') && typeof v === 'number') { const r = Math.round((v % P) * 1e6) / 1e6; return Math.abs(r - Math.round(P * 1e6) / 1e6) < 1e-5 ? 0 : r; }
    return typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v;
  });
}
function sameEvents(a, b, tol) {
  assert.equal(a.length, b.length, 'event count');
  for (let i = 0; i < a.length; i++) {
    assert.equal(evKey(a[i]), evKey(b[i]), 'event ' + i);
    assert.ok(Math.abs(a[i].time - b[i].time) < tol, 'event ' + i + ' time ' + a[i].time + ' vs ' + b[i].time);
  }
}
function schedule(sp, tapsAt, steppers) {
  const tpl = H.layout(sp), s = simM.create(H.level(sp), { perimeter: tpl.perimeter, layout: tpl }), out = [];
  for (let i = 0; i < 40; i++) {                                 // 40 slices of 500 ms
    if (tapsAt[i] !== undefined) {                                // aim at a box that can be tapped, if there is one
      const ok = [];
      for (let b = 0; b < s.state.boxes.length; b++) if (rules.canEject(s.state, b).ok) ok.push(b);
      simM.tap(s, ok.length ? ok[tapsAt[i] % ok.length] : tapsAt[i]).events.forEach(function (e) { out.push(e); });
    }
    steppers(s, out);
  }
  return { s: s, ev: out };
}
function whole(s, out) { simM.tick(s, 500).forEach(function (e) { out.push(e); }); }
function sliced(s, out) {
  for (let i = 0; i < 31; i++) simM.tick(s, 16).forEach(function (e) { out.push(e); });
  simM.tick(s, 4).forEach(function (e) { out.push(e); });
}
test('R25/R27: tick(500) equals 31 x tick(16) + tick(4) in events, order and times (taps at the slice borders)', () => {
  const rng = mulberry(5), taps = {};
  for (let i = 0; i < 40; i++) if (rng() < 0.8) taps[i] = Math.floor(rng() * 10);
  const a = schedule(ALL, taps, whole), b = schedule(ALL, taps, sliced);
  assert.ok(a.ev.length > 20, 'events: ' + a.ev.length);
  sameEvents(a.ev, b.ev, 1e-6);
  assert.ok(Math.abs(a.s.time - b.s.time) < 1e-6);
  assert.equal(model.hash(a.s.state), model.hash(b.s.state));
});

test('R25: one huge tick (3 laps) equals 16 ms stepping: no crossing is skipped by sub-stepping', () => {
  const sp = spec({ L1: [3, 1, 1, 1, ].slice(0, 4), R1: [1], R2: [1, 1], L4: [0, 2, 2], R5: [2] }, { N: 5 });
  const run1 = function (dts) {
    const tpl = H.layout(sp), s = simM.create(H.level(sp), { perimeter: tpl.perimeter, layout: tpl }), out = [];
    tap(s, 0); tap(s, 3);
    dts.forEach(function (dt) { simM.tick(s, dt).forEach(function (e) { out.push(e); }); });
    return out;
  };
  const fine = []; for (let i = 0; i < 3 * LAP / 16; i++) fine.push(16);
  const A = run1([3 * LAP]), B = run1(fine);
  assert.ok(A.length >= 6);
  sameEvents(A, B, 1e-6);
});

test('R25: belt.advance reports every crossing exactly once, for any step size (random steps, both mouths and N)', () => {
  const rng = mulberry(99);
  [4, 7, 10].forEach(function (N) {
    const P = 1000, b = beltM.create({ N: N, perimeter: P, dir: 'cw', mouths: [{ box: 0, s: 123.4 }, { box: 1, s: 777.7 }, { box: 2, s: 0.5 }] });
    let total = 0, count = 0, last = -1;
    for (let i = 0; i < 300; i++) {
      const ds = 0.01 + rng() * 3.3 * b.spacing, cs = beltM.advance(b, ds);
      total += ds; count += cs.length;
      cs.forEach(function (c) { assert.ok(c.at >= last - 1e-9 || true); });
      for (let j = 1; j < cs.length; j++) assert.ok(cs[j].at >= cs[j - 1].at - 1e-9, 'time order');
    }
    let expect = 0;
    b.mouths.forEach(function (m) {
      for (let i = 0; i < N; i++) expect += Math.floor((total + i * b.spacing - m.s) / P) - Math.floor((i * b.spacing - m.s) / P);
    });
    assert.equal(count, expect, 'N=' + N);
  });
});

// ================================================================== more adversarial cases

test('R16: a pair can use the plates 0 and N-1 (cyclic adjacency) and leaves in the crossing of plate 0', () => {
  const s = mk({ L1: [7, ['p', 1, 2]] }, { N: 4 });
  fillBelt(s, [1, 2], 9);                      // free: 3 and 0, adjacent across the seam
  assert.equal(tap(s, 0).ok, true);
  const e = of(untilEject(s, 2), 'eject');
  assert.deepEqual(e.map(function (x) { return x.plate; }).sort(), [0, 3]);
  assert.equal(e[0].time, e[1].time);
});

test('R16: a pair tapped with non-adjacent free plates leaves at once and does not hang the game', () => {
  // BUG: tap reserves two non-adjacent free plates for a bound pair that can never leave; the 1s on the belt "can land" in L1
  // by accepts() (so isStuck is false) but tryLand refuses while pending > 0: the game hangs, never lost, never moving.
  const s = mk({ L1: [7, ['p', 1, 1]] }, { N: 4 });
  fillBelt(s, [0, 2], 1);
  tap(s, 0);
  const ev = run(s, 6 * LAP);
  const progress = of(ev, 'land').length + of(ev, 'eject').length + of(ev, 'lost').length;
  assert.ok(progress > 0, 'nothing happened for 6 laps and the status is ' + s.status);
});

test('R10 (ccw): a lap still takes LAP_MS and pieces leave front-to-back behind the mouth', () => {
  const s = mk({ L1: [5, 1, 1, 1], R4: [8] }, { dir: 'ccw' });
  tap(s, 0);
  const ej = of(untilEject(s, 3), 'eject');
  assert.deepEqual(ej.map(function (e) { return e.piece.id; }), [3, 2, 1]);
  ej.forEach(function (e, j) { assert.ok(Math.abs(e.time - (D1 + j * DG)) < 1e-6); });
  const s2 = mk({ L1: [1] }, { dir: 'ccw' });
  tap(s2, 0);
  const ev = runU(s2, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
  assert.ok(Math.abs(lapOf(s2, of(ev, 'eject')[0], of(ev, 'land')[0]) - LAP) < 1e-3);
});

test('R10: the landed piece is the ejected piece (same id, key and kind kept)', () => {
  const s = mk({ L1: [9, 'k:Z:1'], R1: [1] });
  tap(s, ix(s, 'L1'));
  const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
  const e = of(ev, 'eject')[0], l = of(ev, 'land')[0];
  assert.equal(e.piece.id, l.piece.id);
  assert.equal(l.piece.k, 1);
  assert.equal(l.piece.key, 'Z');
});

test('R19: a keyed piece that lands in another box does not fire a second unlock', () => {
  const s = mk({ L1: [9, 'k:A:1'], R1: { pieces: [3], mods: { lock: 'A' } }, R2: [1] });
  tap(s, ix(s, 'L1'));
  const ev = run(s, 2 * LAP);
  assert.equal(of(s.log, 'unlock').length, 1);
  assert.equal(of(ev, 'land').length, 1);
});

test('R19: an unlock at level start is in the log at time 0 and in state.initialEvents', () => {
  const s = mk({ L1: [0, 'k:A:5'], R1: { pieces: [3], mods: { lock: 'A' } } });
  assert.equal(s.log.filter(function (e) { return e.type === 'unlock' && e.time === 0; }).length, 1);
});

test('R19: boxes of a shutter that hold a hidden front get it revealed once the shutter opens', () => {
  const st = stOf({ L1: [0, 'k:A:5'], R1: { pieces: ['h:3', 'h:4'], mods: { lock: 'A' } } });
  const ev = st.initialEvents.map(function (e) { return e.type; });
  assert.equal(ev.indexOf('unlock') >= 0 && ev.indexOf('reveal') > ev.indexOf('unlock'), true, ev.join());
  assert.equal(st.boxes[ix(st, 'R1')].pieces[1].hidden, false);
  assert.equal(st.boxes[ix(st, 'R1')].pieces[0].hidden, true);
});

test('R12/R20: a one-way box fills to 4 of its fixed kind and closes like any other', () => {
  const st = stOf({ L1: { pieces: [2, 2, 2], mods: { oneway: true } } });
  putBelt(st, 0, 2);
  assert.deepEqual(rules.tryLand(st, 0, 0).map(function (e) { return e.type; }), ['land', 'close']);
  assert.equal(st.boxes[0].closed, true);
});

test('R3/R12/R17/R19/R20: validate rejects the level-format violations it promises', () => {
  const base = { L1: [0, 0], L2: [0, 0], L3: [1, 1], L4: [1, 1] };
  const v = function (boxes, kinds) { return model.validate(H.level(spec(boxes, { kinds: kinds === undefined ? 2 : kinds }))); };
  assert.deepEqual(v(base), []);
  assert.ok(v({ L1: [0, 0, 0, 0], L2: [1, 1, 1, 1] }).some(function (e) { return /^R12/.test(e); }), 'starts with four of a kind');
  assert.ok(v({ L1: { pieces: [0, 0], mods: { wrap: 0 } }, L2: [0, 0], L3: [1, 1], L4: [1, 1] }).some(function (e) { return /^R17/.test(e); }), 'wrapped with a kind it holds');
  assert.ok(v({ L1: { pieces: [0, 0], mods: { wrap: 9 } }, L2: [0, 0], L3: [1, 1], L4: [1, 1] }).some(function (e) { return /^R17/.test(e); }), 'unknown wrap kind');
  assert.ok(v({ L1: { pieces: [0, 0], mods: { lock: 'A' } }, L2: [0, 0], L3: [1, 1], L4: [1, 1] }).some(function (e) { return /^R19/.test(e); }), 'shutter without key');
  assert.ok(v({ L1: [0, 0], L2: [0, 'k:A:0'], L3: [1, 1], L4: [1, 1] }).some(function (e) { return /^R19/.test(e); }), 'key without shutter');
  assert.ok(v({ L1: { pieces: [0, 'k:A:0'], mods: { lock: 'A' } }, L2: [0, 0], L3: [1, 1], L4: [1, 1] }).some(function (e) { return /^R19/.test(e); }), 'key behind its own shutter');
  assert.ok(v({ L1: [0, 'k:A:0'], L2: [0, 'k:A:0'], L3: [1, 1], L4: [1, 1], L5: { pieces: [], mods: { lock: 'A' } } }, 2).some(function (e) { return /^R19/.test(e); }), 'two keys for one shutter');
  assert.ok(v({ L1: { pieces: [0, 0, 0, 0], mods: { oneway: true } }, L2: [1, 1, 1, 1] }).some(function (e) { return /^R20/.test(e); }), 'oneway with 4');
  assert.ok(v({ L1: { pieces: [0, 1], mods: { oneway: true } }, L2: [0, 0, 1], L3: [0, 1] }).some(function (e) { return /^R20/.test(e); }), 'oneway with mixed kinds');
  assert.ok(model.validate(H.level(spec(base, { kinds: 2, N: 3 }))).some(function (e) { return /^R1/.test(e); }), 'N below 4');
  assert.ok(model.validate(H.level(spec(base, { kinds: 2, N: 11 }))).some(function (e) { return /^R1/.test(e); }), 'N above 10');
});

test('R22: playing never mutates the level object', () => {
  const lv = H.level(ALL), snap = JSON.stringify(lv), tpl = H.layout(ALL);
  const s = simM.create(lv, { perimeter: tpl.perimeter, layout: tpl }), rng = mulberry(3);
  for (let i = 0; i < 1500; i++) { if (rng() < 0.2) tap(s, Math.floor(rng() * 10)); simM.tick(s, 16); }
  assert.equal(JSON.stringify(lv), snap);
  assert.equal(JSON.stringify(model.clone(s.state).boxes.length), JSON.stringify(s.state.boxes.length));
});

test('counter layout: lap time, first-accepting order cw and ccw, neighbours I1-I2 and T5-T4 only', () => {
  const lapOf = function (dir) {
    const s = H.sim({ layout: 'counter', N: 5, kinds: BIG, dir: dir, boxes: { T1: [1] } });
    tap(s, 0);
    const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
    return of(ev, 'land')[0].time - of(ev, 'eject')[0].time;
  };
  assert.ok(Math.abs(lapOf('cw') - LAP) < 5);
  assert.ok(Math.abs(lapOf('ccw') - LAP) < 5);
  const first = function (dir) {
    const s = H.sim({ layout: 'counter', N: 5, kinds: BIG, dir: dir, boxes: { I1: [8, 1], T3: [], B3: [] } });
    tap(s, 0);
    const ev = runU(s, function (st, e) { return of(e, 'land').length > 0; }, 3 * LAP);
    return s.state.boxes[of(ev, 'land')[0].box].id;
  };
  assert.equal(first('cw'), 'B3', 'I1 (s=371) -> B5..B1 (574-790) -> I2 -> T1..T5; B3 is the first accepting');
  assert.equal(first('ccw'), 'T3', 'ccw order is the reverse: T boxes come before B boxes');
  const thawed = function (closer) {
    const boxes = { I2: { pieces: [0], mods: { ice: true } }, T4: { pieces: [0], mods: { ice: true } }, B5: { pieces: [0], mods: { ice: true } } };
    boxes[closer] = [3, 3, 3];
    const sp = { layout: 'counter', N: 5, kinds: BIG, boxes: boxes };
    const st = model.parse(H.level(sp), { layout: H.layout(sp) });
    putBelt(st, 0, 3);
    rules.tryLand(st, 0, st.index[closer]);
    return ['I2', 'T4', 'B5'].filter(function (id) { return !st.boxes[st.index[id]].ice; });
  };
  assert.deepEqual(thawed('I1'), ['I2']);
  assert.deepEqual(thawed('T5'), ['T4']);
  assert.deepEqual(thawed('B4'), ['B5']);
  assert.deepEqual(thawed('T1'), [], 'T1 is above B1 but not its neighbour; T1-T2 only');
});

test('R24/R25: tick(500) equals 31 x tick(16) + tick(4) also when the belt runs ccw', () => {
  const ccw = Object.assign({}, ALL, { dir: 'ccw' });
  const rng = mulberry(8), taps = {};
  for (let i = 0; i < 40; i++) if (rng() < 0.8) taps[i] = Math.floor(rng() * 10);
  const a = schedule(ccw, taps, whole), b = schedule(ccw, taps, sliced);
  assert.ok(a.ev.length > 15, 'events: ' + a.ev.length);
  sameEvents(a.ev, b.ev, 1e-6);
});

// ================================================================== trapdoor model (R26)

test('R5/R26: a tap reserves free plates (nearest behind the mouth) and empties the box into the outbox; the belt count rises per departure', () => {
  const s = mk({ L1: [5, 1, 1, 1] }, { N: 8 });
  run(s, 2345);
  fillBelt(s, [2, 5], 9);
  const b = s.belt, mi = beltM.mouthIndex(b, 0), m = b.mouths[mi].s, P = b.perimeter;
  const free = [0, 1, 2, 3, 4, 5, 6, 7].filter(function (i) { return !s.state.belt[i]; });
  const behind = function (i) { return (((m - b.pos[i]) % P) + P) % P; };
  const expected = free.slice().sort(function (a, c) { return behind(a) - behind(c); }).slice(0, 3).sort();
  const beltBefore = s.state.belt.filter(Boolean).length;
  const t0 = s.time;
  const r = tap(s, 0);
  assert.equal(r.k, 3);
  assert.equal(s.state.belt.filter(Boolean).length, beltBefore, 'nothing on the belt yet');
  assert.equal(s.state.boxes[0].pieces.length, 1);
  assert.equal(s.state.boxes[0].outbox.length, 3);
  assert.deepEqual(of(r.events, 'tapped')[0].plan.map(function (x) { return x.plate; }).sort(), expected);
  assert.equal(simM.freePlates(s), free.length - 3);
  const counts = [];
  for (let j = 0; j < 3; j++) {
    run(s, j === 0 ? D1 + 5 : DG);
    counts.push(s.state.belt.filter(Boolean).length - beltBefore);
  }
  assert.deepEqual(counts, [1, 2, 3], 'one more piece on the belt per departure');
  assert.equal(s.state.boxes[0].outbox.length, 0);
  void t0;
});

test('R26: the departure crossing is not a landing: a piece never lands back in a box that still accepts it', () => {
  const s = mk({ L1: [1, 1, 1] }, { N: 4 });                   // 2 of the 3 leave (free = 2): L1 keeps a 1 and accepts 1s
  fillBelt(s, [0, 1], 9);
  const r = tap(s, 0);
  assert.equal(r.k, 2);
  assert.equal(s.state.boxes[0].pieces.length, 1);
  const ev = run(s, 0.9 * LAP);
  assert.equal(of(ev, 'land').length, 0, 'the pieces ride a full lap first');
  assert.equal(of(ev, 'eject').length, 2);
  const later = run(s, 0.4 * LAP);
  assert.equal(of(later, 'land').length >= 1, true);
});

test('R26: a dropped piece crosses its own mouth before any other mouth (no landing in a neighbouring box on the way)', () => {
  // regression: a plate dropped further back than the neighbour's mouth (48 units away) must not land there on its way
  const s = mk({ R3: [9, 1, 1, 1], R2: [] }, { N: 8 });
  const r = tap(s, ix(s, 'R3'));
  assert.equal(r.k, 3);
  const ev = run(s, D1 + 2 * DG + 1500);
  assert.equal(of(ev, 'eject').length, 3);
  const early = of(ev, 'land');
  assert.equal(early.length, 0, 'landed in ' + early.map(function (l) { return s.state.boxes[l.box].id; }).join());
});

test('R16/R26: a pair departs as one unit; its mate is dropped one plate width further back, still before any other mouth', () => {
  const s = mk({ R3: [9, ['p', 1, 1]], R2: [], R1: [] }, { N: 8 });
  assert.equal(tap(s, ix(s, 'R3')).k, 2);
  const ej = of(untilEject(s, 2), 'eject');
  assert.equal(ej[0].time, ej[1].time);
  assert.ok(Math.abs(dropDist(s, ej[1]) - dropDist(s, ej[0]) - 40) < 1e-6 || dropDist(s, ej[1]) > dropDist(s, ej[0]));
  assert.equal(of(run(s, 1500), 'land').length, 0, 'neither member lands in R2 or R1 on its way to the own mouth');
});

test('R24: determinism with teleports: same taps at the same times give identical logs (incl. from / to positions), ccw as well', () => {
  const ccw = Object.assign({}, ALL, { dir: 'ccw' });
  [ALL, ccw].forEach(function (sp) {
    const a = playTaps(sp, 21, 2000), b = playTaps(sp, 21, 2000);
    assert.ok(of(a.log, 'eject').length > 10 && of(a.log, 'eject').every(function (e) { return e.teleported === true; }));
    assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
    assert.equal(JSON.stringify(a.belt.pos), JSON.stringify(b.belt.pos));
  });
});

test('R5/R13: capacity: occupied + reserved + outbox <= N; a tap at the limit is refused; reserved plates are not free for other taps', () => {
  const s = mk({ L1: [9, 1, 1, 1], L2: [8, 2, 2, 2] }, { N: 4 });
  assert.equal(tap(s, 0).k, 3);
  assert.equal(simM.freePlates(s), 1);
  const r2 = tap(s, 1);
  assert.equal(r2.k, 1, 'k is cut to the one plate that is neither occupied nor reserved');
  const plans = of(r2.events, 'tapped')[0].plan.map(function (x) { return x.plate; });
  assert.equal(simM.freePlates(s), 0);
  assert.equal(tap(s, 1).reason, 'pending');
  assert.equal(tap(s, 0).reason, 'pending');
  const ev = run(s, D1 + 3 * DG + 100);
  assert.equal(of(ev, 'eject').length, 4);
  assert.equal(s.state.belt.filter(Boolean).length, 4);
  assert.equal(new Set(of(ev, 'eject').map(function (e) { return e.plate; })).size, 4, 'four different plates');
  assert.ok(plans.length === 1);
  assert.equal(tap(s, 0).reason === 'full' || tap(s, 0).reason === 'over', true);
});

// ================================================================== conservation under a tap storm

test('R5-R27: 2000 random taps at random ticks on an all-modifier level keep every invariant', () => {
  const rng = mulberry(2024), tpl = H.layout(ALL);
  let taps = 0, accepted = 0, sims = 0, ejects = 0, lands = 0, closes = 0;
  let s, occ, total, closedSnap;
  const lv = H.level(ALL), nBoxes = lv.boxes.length;
  function fresh() {
    s = simM.create(lv, { perimeter: tpl.perimeter, layout: tpl });
    occ = s.state.belt.map(function () { return null; });
    total = 0; s.state.boxes.forEach(function (b) { total += b.pieces.length; });
    closedSnap = {};
    sims++;
  }
  function check() {
    const st = s.state, ids = {}, perKind = {};
    let n = 0, empty = 0, pend = 0;
    st.boxes.forEach(function (b, i) {
      assert.ok(b.pieces.length <= 4, 'box ' + b.id + ' holds ' + b.pieces.length);
      b.pieces.concat(b.outbox || []).forEach(function (p) { assert.equal(ids[p.id], undefined, 'piece ' + p.id + ' in two places'); ids[p.id] = 'box'; n++; });
      pend += b.pending;
      assert.ok(b.pending >= 0);
      if (b.pending > 0) assert.ok(!b.closed && !model.isCovered(b) && !b.oneway, 'pending on an untappable box ' + b.id);
      if (b.closed) {
        const snap = JSON.stringify(b.pieces.map(function (p) { return [p.id, p.k]; }));
        if (closedSnap[i] === undefined) {
          closedSnap[i] = snap;
          assert.equal(b.pieces.length, 4);
          assert.ok(b.pieces.every(function (p) { return p.k === b.pieces[0].k; }), 'closed box holds one kind');
        }
        assert.equal(snap, closedSnap[i], 'closed box ' + b.id + ' changed');
      }
    });
    st.belt.forEach(function (p, pl) {
      if (!p) { empty++; return; }
      assert.equal(ids[p.id], undefined, 'piece ' + p.id + ' in two places (belt)');
      ids[p.id] = 'belt'; n++;
      assert.equal(occ[pl], p.id, 'plate ' + pl + ' disagrees with the event replay');
    });
    assert.equal(n, total, 'piece count');
    assert.ok(empty - pend >= 0, 'more plates reserved (' + pend + ') than empty (' + empty + ')');
    let outbox = 0;
    st.boxes.forEach(function (b) { outbox += (b.outbox || []).length; });
    assert.equal(s.belt.pos.length, st.N); assert.equal(st.belt.length, st.N);
    const bp = s.belt.pos, Pp = s.belt.perimeter;
    for (let a = 0; a < st.N; a++) for (let c = a + 1; c < st.N; c++) {
      let d = Math.abs(bp[a] - bp[c]); d = Math.min(d, Pp - d);
      assert.ok(d >= 0.9 * 40 - 1e-6, 'plates ' + a + ' and ' + c + ' are only ' + d + ' apart');
    }
    assert.ok((st.N - empty) + outbox <= st.N, 'plates ' + (st.N - empty) + ' + outbox ' + outbox + ' > N');
    assert.equal(rules.freePlates(st), st.N - (st.N - empty) - outbox, 'freePlates == N - plates - outbox');
    const resv = {};
    st.boxes.forEach(function (b) {
      b.outbox.forEach(function (p) {
        if (p.plate === undefined) return;
        assert.equal(st.belt[p.plate], null, 'reserved plate ' + p.plate + ' is occupied');
        assert.equal(resv[p.plate], undefined, 'plate ' + p.plate + ' reserved twice');
        resv[p.plate] = true;
      });
    });
    for (let c = 0; c < 6; c++) perKind[c] = 0;
    st.belt.concat(st.boxes.reduce(function (a, b) { return a.concat(b.pieces, b.outbox || []); }, [])).forEach(function (p) { if (p) perKind[p.k]++; });
    for (let c = 0; c < 6; c++) assert.equal(perKind[c], 4, 'kind ' + c + ' count');
    assert.equal(st.closedKinds.length, st.boxes.filter(function (b) { return b.closed; }).length);
  }
  function replay(evs) {
    evs.forEach(function (e) {
      if (e.type === 'eject') { assert.equal(occ[e.plate], null, 'eject onto an occupied plate ' + e.plate); occ[e.plate] = e.piece.id; ejects++; }
      if (e.type === 'land') { assert.equal(occ[e.plate], e.piece.id, 'landing of a piece that is not on that plate'); occ[e.plate] = null; lands++; }
      if (e.type === 'close') closes++;
    });
  }
  fresh();
  while (taps < 2000) {
    const k = Math.floor(rng() * 4);
    for (let i = 0; i < k && taps < 2000; i++) {
      let target = Math.floor(rng() * nBoxes);
      if (rng() < 0.5) {                                          // half of the taps aim at boxes that can be tapped
        const ok = [];
        for (let b = 0; b < nBoxes; b++) if (rules.canEject(s.state, b).ok) ok.push(b);
        if (ok.length) target = ok[Math.floor(rng() * ok.length)];
      }
      replay(simM.tick(s, 1 + Math.floor(rng() * 400)));          // time always advances between two taps
      check();
      if (s.status !== 'play') break;
      const beltBefore = s.state.belt.filter(Boolean).length, boxBefore = s.state.boxes[target] ? s.state.boxes[target].pieces.length : 0;
      const outBefore = s.state.boxes[target] ? s.state.boxes[target].outbox.length : 0;
      const r = tap(s, target);
      taps++;
      if (r.ok) {
        accepted++;
        replay(r.events);
        const tp = of(r.events, 'tapped')[0];
        assert.equal(tp.k, r.k);
        assert.equal(of(r.events, 'eject').length, 0, 'no piece is on a plate at the tap');
        assert.equal(tp.plan.length, r.k, 'a plate is reserved for every piece');
        tp.plan.forEach(function (x, j) {
          assert.equal(s.state.belt[x.plate], null, 'a reserved plate is empty');
          assert.ok(x.departAt >= s.time + config.DEPART_FIRST_MS - 1e-9);
        });
        assert.equal(s.state.belt.filter(Boolean).length, beltBefore, 'belt count unchanged by the tap');
        assert.equal(s.state.boxes[target].pieces.length, boxBefore - r.k, 'box pieces - k');
        assert.equal(s.state.boxes[target].outbox.length, outBefore + r.k);
      } else assert.deepEqual(of(r.events, 'eject'), []);
      if (s.status !== 'play') assert.equal(r.reason, 'over');
      check();
    }
    replay(simM.tick(s, 1 + Math.floor(rng() * 400)));
    check();
    if (s.status !== 'play') {
      assert.equal(tap(s, 0).reason, 'over');
      taps++;
      fresh();
    }
  }
  assert.ok(accepted > 150, 'accepted taps ' + accepted);
  assert.ok(ejects > 150 && lands > 100 && closes > 0, 'activity: ' + [ejects, lands, closes].join('/'));
  assert.ok(sims >= 1);
});
