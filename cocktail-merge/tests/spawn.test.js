// Spawn, RNG, chime, save, aim and state (snapshot/hash) tests: DESIGN 6.2 tests 24-30, 38 (aim part), 41, 42, 45, 46.
'use strict';
var assert = require('assert');
var spawn = require('../src/game/spawn.js');
var chime = require('../src/game/chime.js');
var save = require('../src/game/save.js');
var aim = require('../src/game/aim.js');
var state = require('../src/game/state.js');

function game() { return require('../src/game/game.js'); }

// Independent mulberry32 for test-side randomness (aims, bot u values).
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A minimal spawn state, already past the opening (history [1, 1], spawnCount 2).
function fakeGame(seed, highestTier) {
  return { rng: seed >>> 0, spawnHistory: [1, 1], spawnCount: 2, highestTier: highestTier, rules: {} };
}

function drawMany(g, n) {
  var out = new Array(n);
  for (var i = 0; i < n; i++) out[i] = spawn.drawSpawn(g);
  return out;
}

// ---------- 24. Chime math ----------
test('24 chimeFreqs: finite f in range, grace for k >= 7, (9,6).grace', function () {
  for (var k = 2; k <= 9; k++) {
    for (var d = 1; d <= 10; d++) {
      var c = chime.chimeFreqs(k, d);
      assert.ok(isFinite(c.f) && c.f >= 523.25 && c.f <= 3135.96, 'f for ' + k + ',' + d);
      if (k >= 7) assert.ok(isFinite(c.grace), 'grace for ' + k + ',' + d);
      else assert.strictEqual(c.grace, null);
    }
  }
  assert.strictEqual(chime.chimeFreqs(9, 6).grace, 3135.96);
  assert.strictEqual(chime.chimeFreqs(2, 1).f, 523.25);
  var bad = chime.chimeFreqs(NaN, -50);
  assert.ok(isFinite(bad.f));
  assert.ok(isFinite(chime.chimeFreqs(99, 99).grace));
});

// ---------- 25. Golden RNG ----------
test('25 golden RNG: seed 42 sequence, repeatability, seeds differ', function () {
  var g = { rng: 42 };
  var want = [0.6011037519, 0.4482905590, 0.8524657935, 0.6697340414, 0.1748138987];
  for (var i = 0; i < want.length; i++) assert.ok(Math.abs(spawn.rngNext(g) - want[i]) < 1e-9, 'value ' + i);
  var a = { rng: 7 }, b = { rng: 7 };
  for (i = 0; i < 1000; i++) assert.strictEqual(spawn.rngNext(a), spawn.rngNext(b));
  var s1 = { rng: 1 }, s2 = { rng: 2 }, differ = false;
  for (i = 0; i < 10; i++) if (spawn.rngNext(s1) !== spawn.rngNext(s2)) differ = true;
  assert.ok(differ);
});

// ---------- 26. Opening ----------
test('26 opening (spawn part): 1, 1 without RNG; third draw consumes exactly one value', function () {
  for (var seed = 1; seed <= 50; seed++) {
    var g = { rng: seed >>> 0, spawnHistory: [], spawnCount: 0, highestTier: 1, rules: {} };
    assert.strictEqual(spawn.drawSpawn(g), 1);
    assert.strictEqual(spawn.drawSpawn(g), 1);
    assert.strictEqual(g.spawnCount, 2);
    assert.deepStrictEqual(g.spawnHistory, [1, 1]);
    assert.strictEqual(g.rng, seed >>> 0);
    var clone = { rng: g.rng };
    spawn.rngNext(clone);
    spawn.drawSpawn(g);
    assert.strictEqual(g.rng, clone.rng);
  }
});

test('26 opening (createGame): current 1, next 1, history [1, 1], rng untouched', function () {
  var G = game();
  for (var seed = 1; seed <= 50; seed++) {
    var g = G.createGame(seed);
    assert.strictEqual(g.current, 1);
    assert.strictEqual(g.next, 1);
    assert.strictEqual(g.spawnCount, 2);
    assert.deepStrictEqual(g.spawnHistory, [1, 1]);
    assert.strictEqual(g.rng, seed >>> 0);
    assert.strictEqual(g.runMask, 1);
    assert.strictEqual(g.highestTier, 1);
    var clone = { rng: g.rng };
    spawn.rngNext(clone);
    G.drawSpawn(g);
    assert.strictEqual(g.rng, clone.rng);
  }
});

// ---------- 27. Unlock ----------
test('27 unlock: highestTier 2 gives no 3/4, highestTier 3 gives no 4; weights 40/30/20/10', function () {
  var d2 = drawMany(fakeGame(5, 2), 10000);
  assert.ok(d2.every(function (t) { return t === 1 || t === 2; }));
  var d3 = drawMany(fakeGame(6, 3), 10000);
  assert.ok(d3.every(function (t) { return t >= 1 && t <= 3; }));
  var c = [0, 0, 0, 0, 0], n = 100000, rnd = mulberry32(11);
  for (var i = 0; i < n; i++) c[spawn.pickWeighted([0, 40, 30, 20, 10], rnd())]++;
  [0.40, 0.30, 0.20, 0.10].forEach(function (p, k) {
    assert.ok(Math.abs(c[k + 1] / n - p) < 0.01, 'tier ' + (k + 1) + ': ' + c[k + 1] / n);
  });
});

test('27 unlock: the allowed tiers do appear (MIN_CAP 2 when highestTier is 1)', function () {
  function seen(ht) {
    var c = [0, 0, 0, 0, 0];
    drawMany(fakeGame(40 + ht, ht), 2000).forEach(function (t) { c[t]++; });
    return c;
  }
  var c1 = seen(1), c2 = seen(2), c3 = seen(3), c4 = seen(4);
  assert.ok(c1[2] > 0 && c1[3] === 0 && c1[4] === 0, 'highestTier 1: ' + c1);
  assert.ok(c2[2] > 0 && c2[3] === 0, 'highestTier 2: ' + c2);
  assert.ok(c3[3] > 0 && c3[4] === 0, 'highestTier 3: ' + c3);
  assert.ok(c4[4] > 0, 'highestTier 4: ' + c4);
});

// ---------- 28. pickWeighted edges ----------
test('28 pickWeighted edges', function () {
  assert.strictEqual(spawn.pickWeighted([0, 40, 30, 0, 0], 0.999), 2);
  assert.strictEqual(spawn.pickWeighted([0, 40, 30, 0, 0], 0), 1);
  assert.strictEqual(spawn.pickWeighted([0, 0, 0, 0, 0], 0.5), 1);
  assert.strictEqual(spawn.pickWeighted([0, 0, 30, 0, 0], 0.9999999999), 2);
  assert.strictEqual(spawn.pickWeighted([0, 0, 30, 0, 0], 1), 2);   // float edge falls through
});

// ---------- 29 / 30. Rules and distribution ----------
var big = null;
function bigDraws() {
  if (!big) big = drawMany(fakeGame(2024, 4), 100000);
  return big;
}

test('29 rules: 1..4, no "4, 4", no four equal in a row, never 8 without a T1', function () {
  var h = bigDraws(), noOne = 0;
  for (var i = 0; i < h.length; i++) {
    assert.ok(h[i] >= 1 && h[i] <= 4);
    if (i > 0) assert.ok(!(h[i] === 4 && h[i - 1] === 4), '4,4 at ' + i);
    if (i > 2) assert.ok(!(h[i] === h[i - 1] && h[i] === h[i - 2] && h[i] === h[i - 3]), 'four equal at ' + i);
    noOne = h[i] === 1 ? 0 : noOne + 1;
    assert.ok(noOne < 8, 'drought at ' + i);
  }
});

test('30 distribution of 100,000 default draws', function () {
  var h = bigDraws(), c = [0, 0, 0, 0, 0];
  h.forEach(function (t) { c[t]++; });
  var f = c.map(function (x) { return x / h.length; });
  assert.ok(f[1] >= 0.38 && f[1] <= 0.42, 'T1 ' + f[1]);
  assert.ok(f[2] >= 0.29 && f[2] <= 0.32, 'T2 ' + f[2]);
  assert.ok(f[3] >= 0.19 && f[3] <= 0.22, 'T3 ' + f[3]);
  assert.ok(f[4] >= 0.085 && f[4] <= 0.10, 'T4 ' + f[4]);
});

// An independent transcription of 2.7 (steps 2-6) used as the reference for exact RNG use.
function refDraw(g) {
  var h = g.spawnHistory, t;
  function pick(w, u) {
    var s = w[1] + w[2] + w[3] + w[4];
    if (s <= 0) return 1;
    u *= s;
    for (var k = 1; k <= 4; k++) { if (u < w[k]) return k; u -= w[k]; }
    for (k = 4; k >= 1; k--) if (w[k] > 0) return k;
    return 1;
  }
  if (g.spawnCount < 2) t = 1;
  else {
    var cap = Math.min(4, Math.max(2, g.highestTier)), w = [0, 40, 30, 20, 10];
    for (var k = cap + 1; k <= 4; k++) w[k] = 0;
    t = pick(w, spawn.rngNext(g));
    var n = h.length, last = h[n - 1];
    if (t === 4 && last === 4) { w[4] = 0; t = pick(w, spawn.rngNext(g)); }
    else if (n >= 3 && h[n - 1] === t && h[n - 2] === t && h[n - 3] === t) { w[t] = 0; t = pick(w, spawn.rngNext(g)); }
    if (n >= 7 && h.slice(-7).indexOf(1) < 0) t = 1;
  }
  h.push(t); if (h.length > 8) h.shift();
  g.spawnCount += 1;
  return t;
}

// First seed whose first rngNext value lies in [lo, hi).
function seedWithFirstU(lo, hi) {
  for (var s = 1; ; s++) { var u = spawn.rngNext({ rng: s }); if (u >= lo && u < hi) return s; }
}

test('35-golden spawn: exact draws and RNG state match a reference of 2.7 (2000 draws per cap)', function () {
  [1, 2, 3, 4].forEach(function (ht) {
    var g = fakeGame(42 + ht, ht), r = fakeGame(42 + ht, ht);
    for (var i = 0; i < 2000; i++) {
      assert.strictEqual(spawn.drawSpawn(g), refDraw(r), 'draw ' + i + ' (highestTier ' + ht + ')');
      assert.strictEqual(g.rng, r.rng, 'rng after draw ' + i);
    }
  });
});

test('spawn rules A, B, C: exact RNG use per rule', function () {
  // Rule A: last 4 and a first u that picks 4 -> exactly two rngNext calls, result not 4.
  var sa = seedWithFirstU(0.9, 1), a = { rng: sa, spawnHistory: [1, 4], spawnCount: 5, highestTier: 4, rules: {} };
  var c = { rng: sa }; spawn.rngNext(c);
  var want = spawn.pickWeighted([0, 40, 30, 20, 0], spawn.rngNext(c));
  var t = spawn.drawSpawn(a);
  assert.strictEqual(t, want); assert.notStrictEqual(t, 4); assert.strictEqual(a.rng, c.rng);
  // Rule B: history 2, 2, 2 and a first u that picks 2 -> two calls, result not 2.
  var sb = seedWithFirstU(0.4, 0.7), b = { rng: sb, spawnHistory: [2, 2, 2], spawnCount: 5, highestTier: 4, rules: {} };
  c = { rng: sb }; spawn.rngNext(c);
  want = spawn.pickWeighted([0, 40, 0, 20, 10], spawn.rngNext(c));
  t = spawn.drawSpawn(b);
  assert.strictEqual(t, want); assert.notStrictEqual(t, 2); assert.strictEqual(b.rng, c.rng);
  // Rule C: 7 entries without a 1 -> result 1 after exactly one draw call.
  var sc = seedWithFirstU(0.4, 0.7), d = { rng: sc, spawnHistory: [2, 3, 2, 3, 2, 3, 2], spawnCount: 9, highestTier: 4, rules: {} };
  c = { rng: sc }; spawn.rngNext(c);
  assert.strictEqual(spawn.drawSpawn(d), 1); assert.strictEqual(d.rng, c.rng);
});

test('spawnScript overrides the opening and cycles by spawnCount', function () {
  var g = { rng: 3, spawnHistory: [], spawnCount: 0, highestTier: 1, rules: { spawnScript: [2, 3] } };
  assert.deepStrictEqual(drawMany(g, 5), [2, 3, 2, 3, 2]);
  assert.strictEqual(g.rng, 3);
  assert.strictEqual(g.spawnCount, 5);
});

test('spawn history keeps at most 8 entries', function () {
  var g = fakeGame(9, 4);
  drawMany(g, 50);
  assert.strictEqual(g.spawnHistory.length, 8);
  assert.strictEqual(g.spawnCount, 52);
});

// ---------- 38 (aim part). firstHit ----------
function aimGame(bodies, current) {
  return { bodies: bodies, current: current || 1, rules: { LAUNCH_Y: 144, W: 100,
    RADII: [0, 6, 7.4, 9, 10.6, 12.4, 14.4, 16.6, 19, 22] } };
}
function body(id, tier, x, y, r) {
  return { id: id, tier: tier, x: x, y: y, r: r, age: 24, launched: false };
}

test('38 firstHit: blocked start circle, centre-below bodies ignored, far wall', function () {
  var g = aimGame([body(1, 4, 50, 144, 10.6)]);
  var h = aim.firstHit(g, 50, 6);
  assert.strictEqual(h.blocked, true);
  assert.strictEqual(h.y, 144);
  assert.strictEqual(h.id, 1);
  var w = aim.firstHit(g, 80, 6);
  assert.strictEqual(w.blocked, false);
  assert.strictEqual(w.id, 0);
  assert.strictEqual(w.tier, 0);
  assert.strictEqual(w.y, 6);
});

test('firstHit: nearest body along the sweep; contact y exact', function () {
  var g = aimGame([body(1, 2, 50, 40, 7.4), body(2, 3, 53, 80, 9), body(3, 1, 90, 100, 6)]);
  var h = aim.firstHit(g, 50, 6);
  var rr = 6 + 9;
  assert.strictEqual(h.id, 2);
  assert.ok(Math.abs(h.y - (80 + Math.sqrt(rr * rr - 9))) < 1e-12);
  assert.strictEqual(h.blocked, false);
  assert.strictEqual(h.tier, 3);
});

test('botAim: prefers a same-tier target and stays inside the aim bounds', function () {
  var g = aimGame([body(1, 3, 20, 60, 9), body(2, 1, 70, 60, 6)], 1);
  var x = aim.botAim(g, 0.5);
  assert.ok(Math.abs(x - 70) <= 6 + 1e-9, 'aimed at ' + x);
  var lo = aim.botAim(aimGame([], 4), 0), hi = aim.botAim(aimGame([], 4), 1);
  assert.ok(lo >= 10.6 && hi <= 100 - 10.6);
  assert.ok(Math.abs(aim.botAim(g, 1) - aim.botAim(g, 0) - 4) < 1e-9);
});

// ---------- 45 / 46. Saves ----------
test('45 normalizeSave: garbage yields defaults; valid values preserved', function () {
  var D = { v: 1, best: 0, bestTier: 1, muted: false, ambience: false, music: true, showNumbers: false,
            relaxed: true, lowGfx: false, wins: 0, discovered: 0 };
  assert.deepStrictEqual(save.normalizeSave('{'), D);
  assert.deepStrictEqual(save.normalizeSave(null), D);
  assert.deepStrictEqual(save.normalizeSave({ best: -5 }), D);
  assert.deepStrictEqual(save.normalizeSave({ best: 'x' }), D);
  assert.strictEqual(save.normalizeSave({ discovered: 1e9 }).discovered, (1e9 >>> 0) & 0x1FF);
  assert.ok(save.normalizeSave({ discovered: 1e9 }).discovered <= 0x1FF);
  assert.strictEqual(save.normalizeSave({ bestTier: 12 }).bestTier, 1);
  assert.strictEqual(save.normalizeSave({ discovered: -1 }).discovered, 0, 'a negative mask is garbage, not 0x1FF');
  assert.strictEqual(save.normalizeSave({ discovered: '31' }).discovered, 0);
  assert.strictEqual(save.normalizeSave({ discovered: 2.5 }).discovered, 0);
  var s = save.normalizeSave({ v: 1, best: 1234, muted: true, wins: 2, discovered: 31, relaxed: false });
  assert.strictEqual(s.best, 1234);
  assert.strictEqual(s.muted, true);
  assert.strictEqual(s.wins, 2);
  assert.strictEqual(s.discovered, 31);
  assert.strictEqual(s.relaxed, false);
  assert.strictEqual(s.ambience, false);   // default off (owner)
  assert.strictEqual(save.normalizeSave(JSON.stringify({ v: 7, best: 50 })).best, 50);
  assert.strictEqual(save.normalizeSave({ v: 7 }).v, 1);
});

test('46 mergeSave: records take the max, discovered ORed, settings from next', function () {
  var m = save.mergeSave(
    { v: 1, best: 900, bestTier: 6, wins: 2, discovered: 3, muted: false, ambience: true, showNumbers: false, relaxed: true },
    { v: 1, best: 500, bestTier: 7, wins: 1, discovered: 4, muted: true, ambience: false, showNumbers: true, relaxed: false });
  assert.strictEqual(m.best, 900);
  assert.strictEqual(m.bestTier, 7);
  assert.strictEqual(m.wins, 2);
  assert.strictEqual(m.discovered, 7);
  assert.strictEqual(m.muted, true);
  assert.strictEqual(m.ambience, false);
  assert.strictEqual(m.showNumbers, true);
  assert.strictEqual(m.relaxed, false);
});

// ---------- 41 / 42. Replay, hash, snapshot ----------
function replay(seed, aims) {
  var G = game(), g = G.createGame(seed);
  for (var i = 0; i < aims.length && g.phase !== 'over'; i++) {
    G.setAim(g, aims[i]);
    G.requestLaunch(g);
    for (var k = 0; k < 288; k++) G.tick(g);
  }
  return g;
}

test('41 replay and hash', function () {
  var G = game(), rnd = mulberry32(99), aims = [];
  for (var i = 0; i < 60; i++) aims.push(rnd() * 100);
  var g1 = replay(1234, aims), g2 = replay(1234, aims);
  assert.strictEqual(G.hash(g1), G.hash(g2));
  assert.ok(/^[0-9a-f]{8}$/.test(G.hash(g1)));
  var aims2 = aims.slice(); aims2[0] += 0.01;
  assert.notStrictEqual(G.hash(replay(1234, aims2)), G.hash(g1));
  assert.notStrictEqual(G.hash(replay(1235, aims)), G.hash(g1));
  var base = G.hash(g1);
  function variant(fn) { var c = Object.assign({}, g1, { spawnHistory: g1.spawnHistory.slice() }); fn(c); return G.hash(c); }
  assert.notStrictEqual(variant(function (c) { c.dangerTicks += 1; }), base);
  assert.notStrictEqual(variant(function (c) { c.spawnHistory[0] = c.spawnHistory[0] === 1 ? 2 : 1; }), base);
  assert.notStrictEqual(variant(function (c) { c.cooldown += 1; }), base);
  assert.notStrictEqual(variant(function (c) { c.launchPending = !c.launchPending; }), base);
});

function botTicks(G, g, rnd, n, events) {
  for (var i = 0; i < n; i++) {
    if (g.phase === 'ready' && !g.launchPending && g.tick % 336 === 0) {
      G.setAim(g, G.botAim(g, rnd()));
      G.requestLaunch(g, 'key');
    }
    var ev = G.tick(g);
    if (events) for (var k = 0; k < ev.length; k++) events.push(ev[k]);
  }
}

test('42 snapshot round trip is bit-identical; invalid snapshots are rejected', function () {
  var G = game(), g = G.createGame(77);
  botTicks(G, g, mulberry32(5), 3000);
  var snap = JSON.parse(JSON.stringify(G.snapshot(g)));
  var r = G.restoreGame(snap);
  assert.ok(r, 'restored');
  assert.strictEqual(G.hash(r), G.hash(g));
  var e1 = [], e2 = [];
  botTicks(G, g, mulberry32(6), 1000, e1);
  botTicks(G, r, mulberry32(6), 1000, e2);
  assert.strictEqual(JSON.stringify(e2), JSON.stringify(e1));
  assert.strictEqual(G.hash(r), G.hash(g));

  var wrong = JSON.parse(JSON.stringify(snap)); wrong.rulesVersion = 1;
  assert.strictEqual(G.restoreGame(wrong), null);
  var nan = JSON.parse(JSON.stringify(snap));
  assert.ok(nan.bodies.length > 0, 'the snapshot has bodies to corrupt');
  nan.bodies[0].x = NaN; assert.strictEqual(G.restoreGame(nan), null);
  var missing = JSON.parse(JSON.stringify(snap)); delete missing.score;
  assert.strictEqual(G.restoreGame(missing), null);
  assert.strictEqual(G.restoreGame(null), null);
});

test('state: snapshot is JSON-plain, keeps world.seen pairs and omits rules', function () {
  var G = game(), g = G.createGame(3);
  botTicks(G, g, mulberry32(8), 1500);
  var s = state.snapshot(g);
  assert.strictEqual(s.rules, undefined);
  assert.ok(Array.isArray(s.world.seen));
  assert.strictEqual(s.world.seen.length, g.world.seen.size);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
  var r = state.restoreGame(s);
  assert.ok(r.world.seen instanceof Map);
  assert.strictEqual(r.world.seen.size, g.world.seen.size);
  assert.strictEqual(r.mode, g.mode);
  assert.ok(r.rules && r.rules.RADII);
});


// ---------- Progressive stages (owner decision, 2026-10-03): the tier-5 glass enters the launcher late ----------
test('spawn stages: no tier 5 before highestTier 6; tier 5 appears from 6 on; never two 5s in a row', function () {
  [1, 2, 3, 4, 5].forEach(function (ht) {
    assert.ok(drawMany(fakeGame(100 + ht, ht), 3000).every(function (t) { return t >= 1 && t <= 4; }), 'ht ' + ht);
  });
  [6, 7, 8, 9].forEach(function (ht) {
    var h = drawMany(fakeGame(200 + ht, ht), 20000), c = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < h.length; i++) {
      c[h[i]]++;
      assert.ok(h[i] >= 1 && h[i] <= 5, 'range at ' + i);
      if (i > 0) assert.ok(!(h[i] === 5 && h[i - 1] === 5), '5,5 at ' + i + ' (ht ' + ht + ')');
      if (i > 0) assert.ok(!(h[i] === 4 && h[i - 1] === 4), '4,4 at ' + i + ' (ht ' + ht + ')');
    }
    assert.ok(c[5] > 0, 'tier 5 never drawn at ht ' + ht);
    var w = spawn.stageWeights(ht), want5 = w[5] / (w[1] + w[2] + w[3] + w[4] + w[5]);
    // rule A trims some 5s; allow a generous band around the raw weight
    assert.ok(c[5] / h.length > want5 * 0.6 && c[5] / h.length < want5 * 1.1, 'tier-5 share at ht ' + ht + ': ' + (c[5] / h.length).toFixed(3) + ' vs weight ' + want5.toFixed(3));
  });
  assert.deepStrictEqual(spawn.stageWeights(4), [0, 40, 30, 20, 10, 0]);
  assert.ok(spawn.stageWeights(8)[5] > spawn.stageWeights(6)[5], 'stages get heavier');
});
