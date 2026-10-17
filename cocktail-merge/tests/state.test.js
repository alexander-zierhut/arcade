// tests/state.test.js: snapshot/restore beyond test 42 (5.5, 5.9): range validation of untrusted
// records, override round trips, Relaxed / buffered-launch / win-suspension round trips, hash
// coverage of body fields, seed coercion and the state.js dependency rule (5.2).
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var H = require('./helpers.js');
var G = require('../src/game/game.js');

var eq = assert.strictEqual, ok = assert.ok;

function rt(g) { return JSON.parse(JSON.stringify(G.snapshot(g))); }

// Bot intents shared by both games of a comparison: a launch every 336 ticks when ready.
function drive(g, rnd, n, events) {
  for (var i = 0; i < n; i++) {
    if (g.phase === 'ready' && !g.launchPending && g.tick % 336 === 0) {
      G.setAim(g, G.botAim(g, rnd())); G.requestLaunch(g, 'key');
    }
    var ev = G.tick(g);
    for (var k = 0; k < ev.length; k++) events.push(ev[k]);
  }
}
function sameFuture(g, label) {
  var r = G.restoreGame(rt(g));
  ok(r, label + ': restored');
  eq(G.hash(r), G.hash(g), label + ': hash at restore');
  var e1 = [], e2 = [];
  drive(g, H.mulberry32(6), 1000, e1);
  drive(r, H.mulberry32(6), 1000, e2);
  eq(JSON.stringify(e2), JSON.stringify(e1), label + ': events');
  eq(G.hash(r), G.hash(g), label + ': hash after 1000 ticks');
}

function base() {
  var g = G.createGame(9);
  G.debugAddBody(g, 3, 50, 60, 0, 0, { age: 30 });
  G.debugAddBody(g, 2, 20, 90, 0, 0, { age: 30 });
  H.stepN(g, 5);
  return rt(g);
}

test('42 restore rejects finite but out-of-range records', function () {
  var s0 = base();
  ok(G.restoreGame(s0), 'the base snapshot restores');
  var bad = {
    'current 5.5': function (s) { s.current = 5.5; }, 'current 0': function (s) { s.current = 0; },
    'current 6': function (s) { s.current = 6; }, 'next 0': function (s) { s.next = 0; },
    'nextId reuses an id': function (s) { s.nextId = 1; }, 'nextId 2^20': function (s) { s.nextId = 1048576; },
    'tier 12': function (s) { s.bodies[0].tier = 12; }, 'tier 0': function (s) { s.bodies[0].tier = 0; },
    'tier 1.5': function (s) { s.bodies[0].tier = 1.5; }, 'growTick -1e6': function (s) { s.bodies[0].growTick = -1e6; },
    'growTick 30': function (s) { s.bodies[0].growTick = 30; }, 'tick 1.5': function (s) { s.tick = 1.5; },
    'spawnHistory [9,9,9]': function (s) { s.spawnHistory = [9, 9, 9]; },
    'spawnHistory too long': function (s) { s.spawnHistory = [1, 1, 1, 1, 1, 1, 1, 1, 1]; },
    'runMask 0x200': function (s) { s.runMask = 0x200; }, 'highestTier 10': function (s) { s.highestTier = 10; },
    'ids out of order': function (s) { s.bodies.reverse(); },
    'duplicate ids': function (s) { s.bodies[1].id = s.bodies[0].id; },
    'r 0': function (s) { s.bodies[0].r = 0; }, 'rTarget -1': function (s) { s.bodies[0].rTarget = -1; },
    'invM 0': function (s) { s.bodies[0].invM = 0; }, 'x 500': function (s) { s.bodies[0].x = 500; },
    'age -1': function (s) { s.bodies[0].age = -1; },
    'ready with cooldown': function (s) { s.phase = 'ready'; s.cooldown = 5; },
    'cooldown phase at 0': function (s) { s.phase = 'cooldown'; s.cooldown = 0; },
    'cooldown 97': function (s) { s.phase = 'cooldown'; s.cooldown = 97; },
    'dangerLevel 3': function (s) { s.dangerLevel = 3; }, 'rng -1': function (s) { s.rng = -1; },
    'rng 2^32': function (s) { s.rng = 4294967296; }, 'phase toString': function (s) { s.phase = 'toString'; },
    'wallSeen of 3': function (s) { s.bodies[0].wallSeen = [0, 0, 0]; },
    'seen pair NaN': function (s) { s.world.seen = [[1, NaN]]; },
    'override string': function (s) { s.overrides = { PULL: 'x' }; },
    'override unknown key': function (s) { s.overrides = { FOO: 1 }; },
    'override spawnScript [9]': function (s) { s.overrides = { spawnScript: [9] }; },
    'NaN body field': function (s) { s.bodies[0].vx = NaN; }
  };
  Object.keys(bad).forEach(function (k) {
    var s = JSON.parse(JSON.stringify(s0));
    bad[k](s);
    eq(G.restoreGame(s), null, k);
  });
  var far = JSON.parse(JSON.stringify(s0)); far.aimX = -500;
  eq(G.restoreGame(far).aimX, G.restoreGame(s0).rules.RADII[far.current], 'aim re-clamped');
  // 5.9 restores record.game; a whole RunRecord is not a snapshot.
  eq(G.restoreGame({ v: 1, rulesVersion: 2, game: s0, meta: {} }), null);
});

test('42 overrides round-trip with the snapshot', function () {
  var h = G.createGame(1, { PULL: 0, mergeEnabled: false, spawnScript: [1, 3] });
  H.place(h, 1, 40, 50); H.place(h, 1, 52, 50);
  var r = G.restoreGame(rt(h));
  ok(r);
  ok(r.rules.PULL === 0 && r.rules.mergeEnabled === false);
  assert.deepStrictEqual(r.rules.spawnScript, [1, 3]);
  var e1 = H.stepN(h, 10), e2 = H.stepN(r, 10);
  eq(H.ofType(e2, 'merge').length, 0);
  eq(JSON.stringify(e2), JSON.stringify(e1));
  eq(G.hash(r), G.hash(h));
  var plain = rt(G.createGame(2));
  assert.deepStrictEqual(plain.overrides, {}, 'a default game stores no overrides');
});

test('42 round trips: Relaxed, a buffered launch, the win suspension', function () {
  var a = G.createGame(78, { mode: 'relaxed' });
  drive(a, H.mulberry32(5), 2000, []);
  eq(a.mode, 'relaxed');
  sameFuture(a, 'relaxed');

  var b = G.createGame(79);
  drive(b, H.mulberry32(7), 1500, []);
  eq(b.phase !== 'over', true);
  while (b.phase !== 'cooldown') { if (b.phase === 'ready') G.requestLaunch(b); G.tick(b); }
  eq(G.requestLaunch(b, 'pointer'), 'buffered');
  sameFuture(b, 'launchPending');

  var c = G.createGame(80, { mode: 'relaxed' });
  H.place(c, 8, 30, 30); H.place(c, 8, 30 + 2 * c.rules.RADII[8], 30);
  eq(H.ofType(G.tick(c), 'win').length, 1);
  H.stepN(c, 10);
  ok(c.tick < c.dangerSuspendUntil);
  sameFuture(c, 'win suspension');
});

test('41 hash covers per-body fields (age, cleared, vx)', function () {
  var g = G.createGame(4);
  G.debugAddBody(g, 2, 30, 60, 1, 0, { age: 30 });
  var h0 = G.hash(g);
  [function (b) { b.age += 1; }, function (b) { b.cleared = !b.cleared; }, function (b) { b.vx += 0.01; }]
    .forEach(function (fn, i) {
      var c = Object.assign({}, g, { bodies: g.bodies.map(function (b) { return Object.assign({}, b); }) });
      fn(c.bodies[0]);
      assert.notStrictEqual(G.hash(c), h0, 'variant ' + i);
    });
});

test('createGame coerces the seed like 2.7 (seed >>> 0)', function () {
  eq(G.createGame('7').seed, 7);
  eq(G.hash(G.createGame('7')), G.hash(G.createGame(7)));
  eq(G.createGame(-1).rng, 4294967295);
  eq(G.createGame('x').seed, 0);
  eq(G.createGame().seed, 0);
});

test('5.2: state.js depends only on config and physics (no back-reference to game.js)', function () {
  var src = fs.readFileSync(path.join(__dirname, '../src/game/state.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/\.\/game\.js|CM\.game\b(?!Parts)/.test(src));
});
