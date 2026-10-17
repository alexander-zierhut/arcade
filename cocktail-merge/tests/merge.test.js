// tests/merge.test.js: merge-rule cases beyond the spec's numbered tests (2.6, 2.9, 2.10, 2.11):
// sort keys, bookkeeping, bonuses with the multiplier, the chain window, TOUCH_EPS edges,
// merge velocity, clamp and shove details, mergeEnabled and per-game MULT overrides.
'use strict';
var assert = require('assert');
var H = require('./helpers.js');
var G = require('../src/game/game.js');

var newGame = H.newGame, stepN = H.stepN, place = H.place, ofType = H.ofType;
var eq = assert.strictEqual, deq = assert.deepStrictEqual, ok = assert.ok;
var P0 = { PULL: 0 };
// Geometry follows the configured radii (rules.RADII), so a radius retune never breaks placements.
function R(g, t) { return g.rules.RADII[t]; }

function types(ev, keep) { return ev.filter(function (e) { return keep.indexOf(e.type) >= 0; }).map(function (e) { return e.type; }); }
function pairTier(e) { return e.a + ',' + e.b + ':' + e.tier; }

test('17 ordering: tier ascending is the first key (T1 ids 1,2 before T3 ids 3,4)', function () {
  var g = newGame(1, P0);
  place(g, 1, 20, 50); place(g, 1, 20 + 2 * R(g, 1), 50);   // ids 1, 2
  place(g, 3, 60, 80); place(g, 3, 60 + 2 * R(g, 3), 80);   // ids 3, 4
  deq(ofType(G.tick(g), 'merge').map(pairTier), ['1,2:2', '3,4:4']);
});

test('merge bookkeeping: discover after merge, runMask and highestTier', function () {
  var g = newGame(1, P0);
  place(g, 1, 20, 50); place(g, 1, 20 + 2 * R(g, 1), 50);
  var ev = G.tick(g);
  deq(types(ev, ['merge', 'discover']), ['merge', 'discover']);
  deq(ofType(ev, 'discover').map(function (e) { return e.tier; }), [2]);
  ok(g.runMask & 2); eq(g.highestTier, 2);
  place(g, 3, 60, 100); place(g, 3, 60 + 2 * R(g, 3), 100);
  ev = G.tick(g);
  deq(ofType(ev, 'discover').map(function (e) { return e.tier; }), [4]);
  eq(g.highestTier, 4); eq(g.runMask, 1 | 2 | 8);
  place(g, 1, 20, 140); place(g, 1, 20 + 2 * R(g, 1), 140);            // a second T2: no discover
  ev = G.tick(g);
  eq(ofType(ev, 'merge').length, 1); eq(ofType(ev, 'discover').length, 0);
});

test('22 bonuses use the merge multiplier: depth-2 win and depth-2 jug burst', function () {
  var g = newGame(1, P0);
  stepN(g, 20);
  place(g, 8, 30, 30, 0, 0, { bornTick: g.tick - 10, chainDepth: 1 });
  place(g, 8, 30 + 2 * R(g, 8), 30);
  var before = g.score, ev = G.tick(g);
  deq([ofType(ev, 'merge')[0].depth, ofType(ev, 'merge')[0].points, ofType(ev, 'win')[0].points], [2, 540, 1500]);
  eq(g.score - before, 2040);
  while (g.tick < g.dangerSuspendUntil) G.tick(g);
  g.bodies = [];                                         // clear the board; ids stay ascending
  place(g, 9, 25, 100, 0, 0, { bornTick: g.tick - 10, chainDepth: 1 });
  place(g, 9, 25 + 2 * R(g, 9), 100);
  before = g.score;
  ev = G.tick(g);
  var jb = ofType(ev, 'jugBurst');
  deq([jb.length, jb[0].depth, jb[0].points, g.score - before], [1, 2, 1500, 1500]);
  eq(ofType(ev, 'merge').length, 0, 'T9 + T9 creates no tier 10');
  eq(g.bodies.length, 0);
});

test('chain window: a parent born 240 ticks ago passes no depth, 239 ticks ago it does', function () {
  [[240, 1], [239, 4]].forEach(function (c) {
    var g = newGame(1, P0);
    stepN(g, 300);
    place(g, 2, 40, 50, 0, 0, { bornTick: g.tick + 1 - c[0], chainDepth: 3, age: 300 });
    place(g, 2, 40 + 2 * R(g, 2), 50);
    var m = ofType(G.tick(g), 'merge');
    eq(m.length, 1); eq(m[0].depth, c[1], 'age of lineage ' + c[0]);
  });
});

test('TOUCH_EPS edges: gaps 0.45 and 0.5 merge, 0.6 does not', function () {
  [[0.45, 1], [0.5, 1], [0.6, 0]].forEach(function (c) {
    var g = newGame(1, P0);
    place(g, 1, 40, 50); place(g, 1, 40 + 2 * R(g, 1) + c[0], 50);
    eq(ofType(stepN(g, 3), 'merge').length, c[1], 'gap ' + c[0]);
  });
});

test('merge velocity: mass-weighted average x 0.5', function () {
  var g = newGame(1, { PULL: 0, DRAG: 0, FRICTION: 0 });
  place(g, 1, 40, 80, 40, 0); place(g, 1, 40 + 2 * R(g, 1), 80, -20, 0);
  var m = ofType(G.tick(g), 'merge');
  eq(m.length, 1);
  var c = g.bodies[0];
  H.approx(c.vx, 0.5 * (40 - 20) / 2, 1e-9, 'vx'); H.approx(c.vy, 0, 1e-9, 'vy');
});

test('merge position: the midpoint is clamped to [r0, W - r0]', function () {
  var g = newGame(1, P0);
  var r2 = R(g, 2), rs = 0.8 * r2;
  var a = place(g, 2, rs, 80);
  a.r = rs; a.invM = 1 / ((rs / 6) * (rs / 6));          // a smaller T2 (as if still growing)
  place(g, 2, r2, 80 + Math.sqrt((rs + r2) * (rs + r2) - (r2 - rs) * (r2 - rs)));   // touching, against the left wall
  var m = ofType(G.tick(g), 'merge');
  eq(m.length, 1);
  H.approx((m[0].ax + m[0].bx) / 2, (rs + r2) / 2, 1e-9, 'raw midpoint');
  eq(m[0].x, g.rules.RADII[2]); eq(g.bodies[0].x, g.rules.RADII[2]);
});

test('shove skips bodies used or created this tick', function () {
  var g = newGame(1, P0);
  place(g, 1, 40, 50); place(g, 1, 40 + 2 * R(g, 1), 50);   // pair (1, 2)
  place(g, 1, 40, 64); place(g, 1, 40 + 2 * R(g, 1), 64);   // pair (3, 4): merges first, within shove range
  var m = ofType(G.tick(g), 'merge');
  deq(m.map(function (e) { return e.a + ',' + e.b; }), ['3,4', '1,2']);
  g.bodies.forEach(function (b) { deq([b.vx, b.vy], [0, 0], 'body ' + b.id + ' was shoved'); });
});

test('mergeEnabled: false turns merging off', function () {
  var g = newGame(1, { PULL: 0, mergeEnabled: false });
  place(g, 1, 40, 50); place(g, 1, 52, 50);
  eq(ofType(stepN(g, 10), 'merge').length, 0);
  eq(g.bodies.length, 2);
});

test('MULT_* overrides apply to merges, the win and the jug burst alike', function () {
  var g = newGame(1, { PULL: 0, MULT_MAX: 1 });
  stepN(g, 20);
  place(g, 2, 40, 50, 0, 0, { bornTick: g.tick - 10, chainDepth: 1 });
  place(g, 2, 40 + 2 * R(g, 2), 50);
  var m = ofType(G.tick(g), 'merge')[0];
  deq([m.depth, m.points], [2, 30]);
  place(g, 8, 30, 120, 0, 0, { bornTick: g.tick - 10, chainDepth: 1 });
  place(g, 8, 30 + 2 * R(g, 8), 120);
  var w = ofType(G.tick(g), 'win')[0];
  eq(w.points, 1000);
});

// 2.6's rationale says the launch exemption "cannot cause instant merges at the launcher", but
// the rules as written allow it: the launch refuses only a true overlap (d < r + r_o) while a
// merge accepts d <= r + r_o + TOUCH_EPS. This pins the rules as written (spec owner to decide).
test('2.6 as written: a launch 0.3 u from a same-tier glass merges in the launch tick', function () {
  var g = newGame(1, P0);
  G.debugAddBody(g, 1, 50 + 2 * R(g, 1) + 0.3, 144, 0, 0, { age: 0, launched: true });
  G.setAim(g, 50);
  eq(G.requestLaunch(g), 'queued');
  var ev = G.tick(g);
  deq(types(ev, ['launch', 'launchBlocked', 'merge']), ['launch', 'merge']);
  eq(ofType(ev, 'merge')[0].tier, 2);
});
