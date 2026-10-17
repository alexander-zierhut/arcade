// tests/physics.test.js: DESIGN 6.2 tests 1-12. Drives physics.stepWorld directly with a flat
// rules object, so these tests need only config.js and physics.js. Test 9 (bounds, no NaN) is
// checked after every tick of every test here, through run().
'use strict';
var assert = require('assert');
var config = require('../src/config.js');
var physics = require('../src/physics.js');
var H = require('./helpers.js');

var R = config.TIERS.map(function (t) { return t ? t.radius : 0; });
var VMAX = config.PHYS.VMAX, DT = config.PHYS.DT, GROW = config.RULES.GROW_TICKS;

// A tiny sandbox: world + bodies + tick counter.
function sandbox(overrides) {
  var rules = H.physicsRules(overrides);
  return { rules: rules, world: physics.createWorld(rules), bodies: [], tick: 0, nextId: 1 };
}
function add(s, tier, x, y, vx, vy, r0) {
  var b = r0 === undefined
    ? physics.makeBody(s.nextId++, tier, x, y, vx || 0, vy || 0, R[tier])
    : physics.makeBody(s.nextId++, tier, x, y, vx || 0, vy || 0, R[tier], r0);
  s.bodies.push(b);
  return b;
}
// run(s, n, onTick?): n steps, bounds checked after each (test 9); returns all events.
function run(s, n, onTick) {
  var all = [];
  for (var i = 0; i < n; i++) {
    s.tick += 1;
    var ev = [];
    physics.stepWorld(s.world, s.bodies, s.tick, ev, s.rules);
    H.assertBounds(s.bodies, s.rules.W, s.rules.L, 1e-12);
    for (var k = 0; k < ev.length; k++) all.push(ev[k]);
    if (onTick) onTick(s, ev);
  }
  return all;
}
function pen(a, b) { return a.r + b.r - Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
function maxSpeed(bodies) { return bodies.reduce(function (m, b) { return Math.max(m, H.speed(b)); }, 0); }

// The settled pile of test 7 (seed 3), reused by test 10.
function settledPile() {
  var s = sandbox();
  var rnd = H.mulberry32(3);
  for (var i = 0; i < 25; i++) {
    var t = 1 + Math.floor(rnd() * 6);
    add(s, t, R[t] + rnd() * (100 - 2 * R[t]), 20 + rnd() * 100, 0, 0);
  }
  run(s, 4800);
  return s;
}
var pileCache = null;
// A fresh deep copy of the cached pile for every caller, so tests 7 and 10 are order-independent.
function pile() {
  if (!pileCache) pileCache = settledPile();
  var s = sandbox();
  s.bodies = JSON.parse(JSON.stringify(pileCache.bodies));
  s.world.seen = new Map(pileCache.world.seen);
  s.world.poolGrowths = pileCache.world.poolGrowths;
  s.tick = pileCache.tick; s.nextId = pileCache.nextId;
  return s;
}

test('physics 1: a T1 comes to rest at the far wall', function () {
  var s = sandbox(); var b = add(s, 1, 50, 100);
  run(s, 1200);
  assert.ok(Math.abs(b.y - R[1]) < 0.01, 'y ' + b.y);
  assert.ok(H.speed(b) < 0.5, 'speed ' + H.speed(b));
});

test('physics 2/3a: launch travel, far-wall impact and wall restitution', function () {
  var s = sandbox(); var b = add(s, 1, 50, 144, 0, -150);
  var reach = null, hit = null, rebound = null;
  run(s, 600, function (s2, ev) {
    if (reach === null && b.y <= 20) reach = s2.tick;
    ev.forEach(function (e) {
      if (e.type === 'impact' && e.wall === 2 && hit === null) { hit = e; rebound = b.vy; }
    });
  });
  assert.ok(reach !== null && reach >= 192 && reach <= 228, 'reached y <= 20 at tick ' + reach);
  assert.ok(hit, 'no far-wall impact');
  H.inRange(hit.vn, 125, 145, 'far-wall vn');
  assert.strictEqual(hit.a, b.id); assert.strictEqual(hit.b, null);
  assert.strictEqual(hit.growing, false, 'a fully grown body is not growing');
  H.inRange(rebound, 0.30 * hit.vn * 0.85, 0.30 * hit.vn * 1.15, 'rebound');
  H.inRange(rebound, 0.30 * 136 * 0.85, 0.30 * 136 * 1.15, 'rebound vs 136');
});

test('physics 3b: a slow wall touch does not bounce', function () {
  var s = sandbox(); var b = add(s, 1, 50, R[1] + 0.05, 0, -15);
  var maxUp = -Infinity;
  run(s, 60, function () { if (b.vy > maxUp) maxUp = b.vy; });
  assert.ok(maxUp <= 0.5, 'rebound ' + maxUp);
});

test('physics 4: overlap resolution in one tick', function () {
  var s = sandbox({ PULL: 0 });
  var a = add(s, 5, 40, 80), b = add(s, 5, 40 + 2 * R[5] - 2, 80);
  run(s, 1);
  assert.ok(pen(a, b) < 0.05, 'pen ' + pen(a, b));
});

test('physics 5: MAX_CORR caps the per-tick correction', function () {
  var s = sandbox({ PULL: 0 });
  var a = add(s, 5, 40, 80), b = add(s, 5, 40 + 2 * R[5] - 10, 80);
  run(s, 1);
  assert.ok(H.speed(a) <= VMAX && H.speed(b) <= VMAX, 'speeds ' + H.speed(a) + ', ' + H.speed(b));
  assert.ok(pen(a, b) <= 10 - 0.5 * 10 + 0.01, 'pen after 1 tick ' + pen(a, b));
  run(s, 29);
  assert.ok(pen(a, b) < 0.05, 'pen after 30 ticks ' + pen(a, b));
});

test('physics 6: momentum is conserved and energy does not grow', function () {
  var s = sandbox({ PULL: 0, DRAG: 0, FRICTION: 0, TAN_DAMP: 0 });
  var a = add(s, 2, 30, 80, 100, 0), b = add(s, 6, 60, 80, -50, 0);
  function mom() {
    return s.bodies.reduce(function (m, x) { var k = physics.massOf(x.r); m[0] += k * x.vx; m[1] += k * x.vy; return m; }, [0, 0]);
  }
  function ke() { return s.bodies.reduce(function (e, x) { return e + 0.5 * physics.massOf(x.r) * (x.vx * x.vx + x.vy * x.vy); }, 0); }
  var p0 = mom(), e0 = ke(), touched = false;
  run(s, 120, function () { if (pen(a, b) > -0.5) touched = true; });
  assert.ok(touched, 'the bodies never met');
  var p1 = mom();
  var scale = Math.abs(p0[0]) + Math.abs(p0[1]);
  assert.ok(Math.abs(p1[0] - p0[0]) / scale < 1e-9 && Math.abs(p1[1] - p0[1]) / scale < 1e-9,
    'momentum ' + p0 + ' -> ' + p1);
  assert.ok(ke() <= e0 + 1e-9, 'kinetic energy ' + e0 + ' -> ' + ke());
  assert.ok(a.vx < b.vx + 1e-9, 'bodies still approaching');
});

test('physics 7: a dropped pile settles (seed 3, 25 bodies, 20 s)', function () {
  var s = pile();
  assert.strictEqual(s.bodies.length, 25);
  assert.ok(maxSpeed(s.bodies) < 1, 'max speed ' + maxSpeed(s.bodies));
  assert.ok(H.maxPenetration(s.bodies) < 0.05, 'max pen ' + H.maxPenetration(s.bodies));
  assert.strictEqual(s.world.poolGrowths, 0);
});

test('physics 8: no tunnelling', function () {
  assert.ok(VMAX * DT < R[1]);
  var s = sandbox();
  var rest = add(s, 1, 50, R[1]), shot = add(s, 1, 50, 60, 0, -VMAX);
  run(s, 240, function () {
    var d = Math.sqrt((shot.x - rest.x) * (shot.x - rest.x) + (shot.y - rest.y) * (shot.y - rest.y));
    assert.ok(d >= R[1], 'centre distance ' + d + ' at tick ' + s.tick);
    assert.ok(shot.y > rest.y, 'passed through at tick ' + s.tick);
  });
});

test('physics 9: bounds hold for bodies thrown hard at every wall', function () {
  var s = sandbox();
  add(s, 9, 22, 22, -VMAX, -VMAX); add(s, 8, 80, 140, VMAX, VMAX);
  add(s, 1, 6, 154, -VMAX, VMAX); add(s, 3, 91, 9, VMAX, -VMAX);
  run(s, 480);   // run() asserts bounds and finiteness after every tick
});

test('physics 10a/b: a settled pile is silent; a launch into it clinks', function () {
  var s = pile();
  var ev = run(s, 480);
  assert.strictEqual(H.ofType(ev, 'impact').length, 0, 'resting pile emitted impacts');
  var shot = add(s, 1, 50, 144, 0, -150);
  ev = run(s, 480);
  var mine = H.ofType(ev, 'impact').filter(function (e) { return e.a === shot.id || e.b === shot.id; });
  assert.ok(mine.length >= 1, 'no impact from the launched glass');
});

test('physics 10c: a re-touch within 12 ticks emits only one impact', function () {
  var s = sandbox({ PULL: 0 });
  var a = add(s, 1, 40, 80, 100, 0), b = add(s, 1, 60, 80, -100, 0);
  var phase = 0, sepTick = -1, retouched = false;
  var ev = run(s, 200, function (s2, tickEv) {
    var p = pen(a, b);
    if (phase === 0 && tickEv.length) phase = 1;                  // first contact (impact)
    else if (phase === 1 && p < -0.01) { phase = 2; sepTick = s2.tick; }
    else if (phase === 2 && s2.tick === sepTick + 2) { a.vx = 100; b.vx = -100; phase = 3; }
    else if (phase === 3 && p > -1e-9 && s2.tick <= sepTick + 12) retouched = true;
  });
  assert.strictEqual(phase, 3, 'scenario did not run (phase ' + phase + ')');
  assert.ok(retouched, 'the pair did not re-touch within 12 ticks');
  var pairImpacts = H.ofType(ev, 'impact').filter(function (e) { return e.b !== null; });
  assert.strictEqual(pairImpacts.length, 1, 'impacts: ' + pairImpacts.length);
  assert.strictEqual(pairImpacts[0].growing, false, 'two grown bodies: not growing');
});

test('physics 10d: impacts with a growing body are flagged', function () {
  var s = sandbox({ PULL: 0 });
  var grower = add(s, 5, 50, 80, 0, 0, 6);
  var shot = add(s, 1, 50, 80 + 6 + 6 + 3, 0, -200);
  var hit = null, growAtHit = -1;
  run(s, 10, function (s2, ev) {
    ev.forEach(function (e) { if (!hit && e.type === 'impact' && e.b !== null) { hit = e; growAtHit = grower.growTick; } });
  });
  assert.ok(hit, 'no impact');
  assert.ok(growAtHit < GROW, 'grower still growing at the impact tick (' + growAtHit + ')');
  assert.strictEqual(hit.growing, true);
  assert.deepStrictEqual([hit.a, hit.b].sort(), [grower.id, shot.id].sort());
});

test('physics 11: coincident centres separate along +x', function () {
  var s = sandbox({ PULL: 0 });
  var a = add(s, 3, 50, 80), b = add(s, 3, 50, 80);
  run(s, 60);
  assert.ok(b.x > a.x, 'b.x ' + b.x + ' a.x ' + a.x);
  assert.ok(Math.abs(a.y - 80) < 1e-9 && Math.abs(b.y - 80) < 1e-9, 'moved off the x axis');
  assert.ok(pen(a, b) < 0.05, 'still overlapping ' + pen(a, b));
});

test('physics 12: ids, pair keys and wall bookkeeping', function () {
  assert.throws(function () { physics.makeBody(1048576, 1, 50, 50, 0, 0, 6); });
  assert.throws(function () { physics.makeBody(1.5, 1, 50, 50, 0, 0, 6); });
  physics.makeBody(1048575, 1, 50, 50, 0, 0, 6);
  assert.strictEqual(physics.pairKey(3, 7), 3 * 1048576 + 7);
  assert.strictEqual(physics.pairKey(7, 3), 3 * 1048576 + 7);
  var s = sandbox(); var b = add(s, 1, 50, R[1] + 0.5, 0, -40);
  var wallTick = -1;
  run(s, 5, function (s2, ev) {
    ev.forEach(function (e) { if (e.type === 'impact' && e.wall === 2) { wallTick = s2.tick; assert.strictEqual(b.wallSeen[2], s2.tick); } });
  });
  assert.ok(wallTick > 0, 'no far-wall impact');
  run(s, 240);   // now resting against the far wall: touching every tick
  assert.strictEqual(b.wallSeen[2], s.tick, 'wallSeen[2] tracks the last touching tick');
  assert.strictEqual(b.wallSeen[0], -1e9);
});

test('physics: makeBody fields and growth', function () {
  var b = physics.makeBody(4, 2, 10, 20, 1, 2, 7.4);
  assert.strictEqual(b.r, 7.4); assert.strictEqual(b.growTick, GROW);
  assert.strictEqual(b.px, 10); assert.strictEqual(b.py, 20);
  assert.deepStrictEqual(b.wallSeen, [-1e9, -1e9, -1e9, -1e9]);
  assert.strictEqual(physics.massOf(6), 1);
  var s = sandbox({ PULL: 0 });
  var g = add(s, 3, 50, 80, 0, 0, 0.8 * R[3]);
  var prev = g.r;
  run(s, GROW, function () { assert.ok(g.r >= prev); prev = g.r; });
  assert.strictEqual(g.r, R[3]);
  assert.strictEqual(g.invM, 1 / physics.massOf(R[3]));
});

test('physics 10e: a wall re-touch within 12 ticks emits only one impact', function () {
  var s = sandbox({ PULL: 0 });
  var b = add(s, 1, 50, 30, 0, -100);
  var first = -1, kicked = false, retouch = -1, n = 0;
  run(s, 120, function (s2, ev) {
    ev.forEach(function (e) { if (e.type === 'impact' && e.wall === 2) { n++; if (first < 0) first = s2.tick; } });
    if (first > 0 && !kicked && s2.tick === first + 2) { b.vy = -100; kicked = true; }
    else if (kicked && retouch < 0 && b.wallSeen[2] > first) retouch = b.wallSeen[2];
  });
  assert.ok(first > 0 && kicked, 'scenario did not run');
  assert.ok(retouch > first && retouch <= first + 12, 're-touch at ' + retouch + ', first ' + first);
  assert.strictEqual(n, 1, 'far-wall impacts: ' + n);
});

test('physics 10f: a slow glass-glass contact (15 u/s) does not bounce (REST_V)', function () {
  var s = sandbox({ PULL: 0, DRAG: 0, FRICTION: 0 });
  var a = add(s, 1, 40, 80, 7.5, 0), b = add(s, 1, 52.5, 80, -7.5, 0);
  var touched = false, maxSep = -Infinity;
  run(s, 60, function () {
    if (pen(a, b) > -1e-9) touched = true;
    if (touched) maxSep = Math.max(maxSep, b.vx - a.vx);
  });
  assert.ok(touched, 'never touched');
  assert.ok(maxSep <= 0.5, 'separation speed ' + maxSep);
});

test('physics 10g: world.seen is pruned every 240 ticks', function () {
  var s = sandbox({ PULL: 0 });
  add(s, 1, 40, 80, 20, 0); add(s, 1, 54, 80, -20, 0);
  var sizeAt = {};
  run(s, 480, function (s2) { if (s2.tick === 30 || s2.tick === 240 || s2.tick === 480) sizeAt[s2.tick] = s2.world.seen.size; });
  assert.strictEqual(sizeAt[30], 1, 'the pair was recorded');
  assert.strictEqual(sizeAt[240], 0, 'pruned at tick 240');
  assert.strictEqual(sizeAt[480], 0);
});

test('physics: a full contact pool grows by one record at a time and is counted', function () {
  var s = sandbox({ PULL: 0, CONTACT_POOL: 4 });
  for (var i = 0; i < 6; i++) add(s, 1, 30 + 6 * i, 80 + (i % 2) * 3);   // a zig-zag: 6 contacts
  var before = H.maxPenetration(s.bodies);
  run(s, 1);   // bounds and finiteness asserted by run()
  assert.ok(s.world.poolGrowths > 0, 'poolGrowths ' + s.world.poolGrowths);
  assert.strictEqual(s.world.pool.length, 4 + s.world.poolGrowths);
  assert.ok(s.world.nContacts > 4);
  assert.ok(H.maxPenetration(s.bodies) < before, 'penetration not reduced');
});

// ---- revision 4: gentle merges (owner playtest: neighbours were flung back to the launch row) ----

// The touching pair nearest the launcher (largest y) in a settled pile: where merges happen in play.
function frontPair(bodies) {
  var best = null;
  bodies.forEach(function (a) {
    bodies.forEach(function (b) {
      if (a.id >= b.id || -pen(a, b) > 0.5) return;
      if (!best || a.y + b.y > best[0].y + best[1].y) best = [a, b];
    });
  });
  return best;
}
// Replaces the pair with a body growing from the larger parent's radius (the worst case: the
// rev-3 birth radius, up to ~4 u inside its neighbours) to the next tier's radius.
function growInPile(s) {
  var p = frontPair(s.bodies), a = p[0], b = p[1];
  var t = Math.max(a.tier, b.tier) + 1, r0 = Math.max(a.r, b.r);
  s.bodies = s.bodies.filter(function (o) { return o !== a && o !== b; });
  return add(s, t, (a.x + b.x) / 2, (a.y + b.y) / 2, 0, 0, r0);
}

test('physics 13: growth is kinematic: an overlap made by growth never becomes velocity', function () {
  var s = sandbox({ PULL: 0 });
  var g = add(s, 6, 50, 80, 0, 0, R[5]), nb = add(s, 5, 50 + 2 * R[5] - 4, 80);   // 4 u inside at birth
  var peak = 0;
  run(s, 60, function () { peak = Math.max(peak, H.speed(nb), H.speed(g)); });
  assert.ok(peak < 0.5, 'growth produced velocity ' + peak);   // rev 3: ~240 u/s
  assert.ok(pen(g, nb) < 0.01, 'still overlapping ' + pen(g, nb));
  assert.strictEqual(g.r, R[6]);
});

test('physics 14: a merge-sized growth in a settled 25-glass pile is gentle and settles', function () {
  for (var seed = 1; seed <= 10; seed++) {
    var s = sandbox(), rnd = H.mulberry32(seed);
    for (var i = 0; i < 25; i++) {
      var t = 1 + Math.floor(rnd() * 6);
      add(s, t, R[t] + rnd() * (100 - 2 * R[t]), 20 + rnd() * 100, 0, 0);
    }
    run(s, 4800);
    var grower = growInPile(s), peak = 0, lastMoving = 0;
    run(s, 960, function (s2) {
      var k = s2.tick - 4800, m = 0;
      s2.bodies.forEach(function (o) { if (o !== grower) m = Math.max(m, H.speed(o)); });
      if (k <= 60) peak = Math.max(peak, m);
      if (Math.max(m, H.speed(grower)) >= 1) lastMoving = k;
    });
    // rev 3 measured 150-310 u/s here (the PBD push-out became velocity).
    assert.ok(peak < 30, 'seed ' + seed + ': neighbour peak ' + peak.toFixed(1) + ' u/s in 60 ticks');
    // Seed 3 is test 7's pile: back below 1 u/s within 4 s (later gravity creep into freed space
    // is legitimate pile physics, so only the canonical pile is held to the settle time).
    if (seed === 3) assert.ok(lastMoving < 960, 'seed 3: still moving at 4 s');
  }
});
