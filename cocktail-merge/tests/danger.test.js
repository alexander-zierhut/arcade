// tests/danger.test.js: danger, launch and aim cases beyond the spec's numbered tests (2.8, 2.9,
// 2.12, 5.6, 5.10): Relaxed DANGER_Y, threat reset, lose payload, rejected requests,
// continueAfterWin, the shared spawn-blocker predicate, GROW_TICKS overrides and the aim sweep.
'use strict';
var assert = require('assert');
var H = require('./helpers.js');
var G = require('../src/game/game.js');

var newGame = H.newGame, stepN = H.stepN, place = H.place, ofType = H.ofType;
var eq = assert.strictEqual, deq = assert.deepStrictEqual, ok = assert.ok;
var P0 = { PULL: 0, DANGER_Y: 130, GRACE_TICKS: 600 };   // classic line/grace pinned: the exact-tick tests assume them
// Geometry follows the configured radii (rules.RADII), so a radius retune never breaks placements.
function R(g, t) { return g.rules.RADII[t]; }

function levels(ev) { return ofType(ev, 'danger').map(function (e) { return e.level; }); }

test('28 Relaxed DANGER_Y: y + r = 131.5 is over the line in Standard only', function () {
  ['standard', 'relaxed'].forEach(function (mode) {
    var g = newGame(1, { mode: mode, PULL: 0 });
    place(g, 5, 50, 131.5 - g.rules.RADII[5]);
    stepN(g, 5);
    eq(g.dangerTicks, mode === 'standard' ? 5 : 0, mode);
  });
});

test('36 threat: threatTicks resets when the threat ends (no summing of short threats)', function () {
  var g = newGame(1, P0);
  var b = place(g, 5, 50, 127 - R(g, 5));
  var ev = stepN(g, 100);
  b.y = 120 - R(g, 5);                                       // below the threat band for one tick
  ev = ev.concat(stepN(g, 1));
  eq(g.threatTicks, 0);
  b.y = 127 - R(g, 5);
  ev = ev.concat(stepN(g, 100));
  deq(levels(ev), [], 'two 100-tick threats never reach level 1');
  ev = stepN(g, 20);
  deq(levels(ev), [1], 'after 120 continuous ticks');
});

test('31 lose payload and side effects', function () {
  var g = newGame(1, P0);
  var b = place(g, 5, 50, 135 - R(g, 5));
  stepN(g, 519);
  G.setAim(g, 20); eq(G.requestLaunch(g), 'queued');
  stepN(g, 70);                                           // launch on tick 520; cooldown to 616
  eq(G.requestLaunch(g, 'pointer'), 'buffered'); eq(g.launchPending, true);
  var lose = ofType(stepN(g, 600 - g.tick), 'lose');
  eq(g.tick, 600); eq(lose.length, 1);
  deq(lose[0].ids, [b.id]); deq(g.overIds, [b.id]);
  eq(g.launchPending, false, 'the loss clears a buffered launch');
  eq(G.requestLaunch(g, 'pointer'), 'rejected'); eq(g.launchPending, false);
  deq(G.tick(g), []); eq(g.tick, 600, 'the clock stops');
});

test('37 rejected requests queue nothing; key boundary at cooldown 37', function () {
  var g = newGame(1, P0);
  G.setAim(g, 50); G.requestLaunch(g, 'key'); G.tick(g);   // launch on tick L = 1
  stepN(g, 50);
  eq(G.requestLaunch(g, 'key'), 'rejected'); eq(g.launchPending, false);
  stepN(g, 9);
  eq(g.cooldown, 37); eq(g.tick, 60, 'L + 59');
  eq(G.requestLaunch(g, 'key'), 'rejected', 'cooldown 37 is outside the key buffer');
  eq(g.launchPending, false);
  eq(ofType(stepN(g, 200), 'launch').length, 0, 'no launch from rejected requests');
});

test('35 a launched glass passing the line never feeds the danger timer', function () {
  var g = newGame(1);
  G.setAim(g, 50); G.requestLaunch(g);
  var ev = [];
  for (var i = 0; i < 120; i++) {
    ev = ev.concat(G.tick(g));
    eq(g.dangerTicks, 0, 'dangerTicks at tick ' + g.tick);
  }
  eq(levels(ev).indexOf(2), -1, 'no danger{2}');
  eq(g.bodies[0].cleared, true);
});

test('continueAfterWin resets the danger timer and nothing else', function () {
  var g = newGame(1, P0);
  place(g, 8, 30, 30); place(g, 8, 30 + 2 * R(g, 8), 30);
  eq(ofType(G.tick(g), 'win').length, 1);
  while (g.tick < g.dangerSuspendUntil) G.tick(g);
  place(g, 5, 80, 135 - R(g, 5));
  stepN(g, 130);
  ok(g.dangerTicks > 0 && g.dangerTickEmitted >= 0);
  var keep = JSON.stringify([g.score, g.bodies, g.wonOnce, g.dangerSuspendUntil, g.tick, g.rng]);
  G.continueAfterWin(g);
  deq([g.dangerTicks, g.dangerTickEmitted], [0, -1]);
  eq(JSON.stringify([g.score, g.bodies, g.wonOnce, g.dangerSuspendUntil, g.tick, g.rng]), keep);
});

test('aim guide and launch agree on "blocked" at exact tangency', function () {
  var rnd = H.mulberry32(17), disagree = 0;
  for (var i = 0; i < 300; i++) {
    var g = newGame(1, P0), tier = 1 + Math.floor(rnd() * 5), ang = rnd() * Math.PI;
    G.setAim(g, 50);
    var d = g.rules.RADII[1] + g.rules.RADII[tier];
    G.debugAddBody(g, tier, 50 + d * Math.cos(ang), 144 - d * Math.sin(ang), 0, 0, { age: 30, cleared: true });
    var guide = G.firstHit(g, 50, g.rules.RADII[1]).blocked;
    G.requestLaunch(g);
    var blocked = ofType(G.tick(g), 'launchBlocked').length === 1;
    if (guide !== blocked) disagree++;
  }
  eq(disagree, 0);
  var h = newGame(1, P0);                                 // the reviewer's repro
  G.debugAddBody(h, 5, 48.76809081220015, 125.64128545477614, 0, 0, { age: 30, cleared: true });
  G.setAim(h, 50);
  var guided = G.firstHit(h, 50, 6).blocked;
  G.requestLaunch(h);
  eq(ofType(G.tick(h), 'launchBlocked').length === 1, guided);
});

test('GROW_TICKS override: launched and debug bodies start fully grown', function () {
  var g = newGame(1, { PULL: 0, GROW_TICKS: 40 });
  var d = G.debugAddBody(g, 3, 50, 127, 0, 0, { age: 30 });   // a T3 just above the launcher
  eq(d.growTick, 40);
  G.setAim(g, 50); G.requestLaunch(g);
  var ev = G.tick(g);
  var shot = g.bodies.filter(function (b) { return b.launched; })[0];
  eq(shot.growTick, 40, 'right after the launch tick');
  ev = ev.concat(stepN(g, 10));                           // the hit comes within the old 11-tick gap
  var hits = ofType(ev, 'impact');
  ok(hits.length > 0, 'the launch hit something');
  hits.forEach(function (e) { eq(e.growing, false, 'impact ' + e.a + '/' + e.b); });
});

test('38 firstHit ignores bodies whose centre is behind the launcher (y >= LAUNCH_Y)', function () {
  var g = newGame(1, P0);
  place(g, 1, 60, 158);                                   // in sideways reach, start circle clear
  var h = G.firstHit(g, 50, 6);
  deq([h.blocked, h.id, h.y], [false, 0, 6]);
});
