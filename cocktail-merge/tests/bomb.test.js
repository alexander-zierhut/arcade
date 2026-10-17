// tests/bomb.test.js: the bomb (owner feature): earned by a jug burst, spent on a circle that clears about
// half the table; charges are capped, snapshotted, hashed and never usable after a loss.
'use strict';
var assert = require('assert');
var H = require('./helpers.js');
var G = require('../src/game/game.js');
var C = require('../src/config.js');
var newGame = H.newGame, place = H.place, stepN = H.stepN;   // test() is the runner global
var eq = assert.strictEqual, ok = assert.ok, deq = assert.deepStrictEqual;
var P0 = { PULL: 0, DANGER_Y: 130, GRACE_TICKS: 600 };
function R(g, t) { return g.rules.RADII[t]; }
function ofType(ev, type) { return ev.filter(function (e) { return e.type === type; }); }

test('bomb: a jug burst earns one charge and emits bombEarned; charges cap at BOMB_MAX', function () {
  var g = newGame(1, P0);
  eq(g.bombs, 0);
  var r9 = R(g, 9), ev = [];
  for (var round = 0; round < C.RULES.BOMB_MAX + 1; round++) {
    place(g, 9, 30, 40, 0, 0, { age: 24, cleared: true }); place(g, 9, 30 + 2 * r9 - 0.1, 40, 0, 0, { age: 24, cleared: true });
    g.wonOnce = true;                                    // a burst needs the win already taken (2.10)
    ev = stepN(g, 3);
    ok(ofType(ev, 'jugBurst').length === 1, 'round ' + round + ' bursts');
  }
  eq(g.bombs, C.RULES.BOMB_MAX, 'capped');
  var last = ofType(ev, 'bombEarned')[0];
  ok(last && last.gained === false && last.bombs === C.RULES.BOMB_MAX, 'the capped burst reports gained=false');
});

test('bomb: useBomb needs a charge, clears only the glasses inside the circle, scores per tier, spends one charge', function () {
  var g = newGame(2, P0);
  eq(G.useBomb(g, 50, 80), null, 'no charge: null, nothing happens');
  g.bombs = 2;
  var inside = [place(g, 3, 50, 80), place(g, 5, 58, 88), place(g, 1, 45, 70)];        // all within 16.5 u of (50, 80)
  var outside = [place(g, 4, 5, 5), place(g, 2, 95, 155), place(g, 2, 50, 100)];   // 20 u away: just outside
  var r = C.RULES.BOMB_RADIUS;
  var e = G.useBomb(g, 50, 80);
  ok(e && e.type === 'bomb'); eq(e.r, r); eq(e.removed.length, 3); eq(g.bombs, 1);
  deq(e.removed.map(function (b) { return b.id; }).sort(), inside.map(function (b) { return b.id; }).sort());
  deq(g.bodies.map(function (b) { return b.id; }).sort(), outside.map(function (b) { return b.id; }).sort());
  eq(e.points, C.RULES.BOMB_POINTS_PER_TIER * (3 + 5 + 1)); eq(g.score, e.points);
  ok(e.removed.every(function (b) { var dx = b.x - 50, dy = b.y - 80; return dx * dx + dy * dy <= r * r; }));
  // the centre is clamped into the table
  var e2 = G.useBomb(g, -40, 999); eq(e2.x, 0); eq(e2.y, g.rules.L); eq(g.bombs, 0);
  eq(G.useBomb(g, 50, 80), null, 'spent');
});

test('bomb: clearing the glasses over the line ends the danger; nothing works after a loss', function () {
  var g = newGame(3, P0);
  g.bombs = 1;
  var b = place(g, 5, 50, 135 - R(g, 5));
  stepN(g, 300);
  ok(g.dangerTicks > 0 && g.overIds.indexOf(b.id) >= 0, 'in danger');
  var e = G.useBomb(g, 50, 130);
  eq(e.removed.length, 1); deq(g.overIds, []);
  stepN(g, 400);                                         // the danger counter decays (DECAY per tick) once nothing is over the line
  eq(g.dangerLevel, 0, 'calm again after the blast'); eq(g.dangerTicks, 0);
  var h = newGame(4, P0); h.bombs = 3; h.phase = 'over';
  eq(G.useBomb(h, 50, 80), null, 'over: no bomb');
});

test('bomb: charges survive snapshot/restore and change the hash; old records without bombs restore with 0', function () {
  var g = newGame(5, P0); g.bombs = 2; place(g, 2, 50, 50); stepN(g, 10);
  var s = G.snapshot(g), r = G.restoreGame(s);
  eq(r.bombs, 2); eq(G.hash(r), G.hash(g));
  delete s.bombs;
  var r0 = G.restoreGame(s);
  ok(r0 && r0.bombs === 0, 'missing bombs field restores as 0');
  var h1 = G.hash(g); g.bombs = 1;
  ok(G.hash(g) !== h1, 'bombs are part of the hash');
});
