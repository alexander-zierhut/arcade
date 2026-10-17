// tests/game.test.js: merges and chains (13-23), danger, launch and aim (31-40). DESIGN 6.2.
// Tests 24, 41, 42, 45 and 46 live in spawn.test.js (next to chime, state and save); the soak,
// scoring and config guards (43, 44, 47) in soak.test.js; extra merge cases in merge.test.js;
// extra danger/launch cases in danger.test.js; restore validation in state.test.js.
'use strict';
var assert = require('assert');
var H = require('./helpers.js');
var G = require('../src/game/game.js');

var newGame = H.newGame, stepN = H.stepN, place = H.place, ofType = H.ofType;
var eq = assert.strictEqual, deq = assert.deepStrictEqual, ok = assert.ok;
var P0 = { PULL: 0, DANGER_Y: 130, GRACE_TICKS: 600 };   // classic line/grace pinned: the exact-tick tests assume them
// Geometry follows the configured radii (rules.RADII), so a radius retune never breaks placements.
function R(g, t) { return g.rules.RADII[t]; }

// Runs n ticks and records every event with the tick it happened on (field `at`).
function record(g, n) {
  var out = [];
  for (var i = 0; i < n; i++) G.tick(g).forEach(function (e) { out.push(Object.assign({ at: g.tick }, e)); });
  return out;
}
function pluck(list, fn) { return list.map(fn); }
function byId(g, id) { return g.bodies.filter(function (b) { return b.id === id; })[0]; }
function removeBody(g, b) { g.bodies.splice(g.bodies.indexOf(b), 1); }
function restoreBody(g, b) { g.bodies.push(b); g.bodies.sort(function (p, q) { return p.id - q.id; }); }
function levels(ev) { return pluck(ofType(ev, 'danger'), function (e) { return e.level; }); }
function pairOf(e) { return e.a + ',' + e.b; }

// ---------------------------------------------------------------- merges and chains

test('13 basic merge', function () {
  var g = newGame(1, P0);
  place(g, 1, 40, 50); place(g, 1, 40 + 2 * R(g, 1), 50);
  var m = ofType(G.tick(g), 'merge');
  eq(m.length, 1); eq(g.bodies.length, 1);
  var c = g.bodies[0];
  eq(c.tier, 2);
  H.approx(c.x, (m[0].ax + m[0].bx) / 2, 1e-9, 'x'); H.approx(c.y, (m[0].ay + m[0].by) / 2, 1e-9, 'y');
  H.approx(c.x, 40 + R(g, 1), 1e-9, 'x'); H.approx(c.y, 50, 1e-9, 'y');
  deq([g.score, m[0].points, m[0].depth], [10, 10, 1]);
});

test('14 immunity of merge-born bodies (exact ticks)', function () {
  var g = newGame(1, P0);
  var other = place(g, 2, 85, 120);
  place(g, 1, 30, 50); place(g, 1, 30 + 2 * R(g, 1), 50);
  eq(ofType(G.tick(g), 'merge').length, 1, 'merge in tick t = 1');
  var child = g.bodies[g.bodies.length - 1];
  eq(G.isMergeEligible(g, child, other), false, 'after tick t');
  for (var k = 1; k <= 23; k++) {
    G.tick(g);
    eq(G.isMergeEligible(g, child, other), false, 'after tick t+' + k);
  }
  G.tick(g);
  eq(G.isMergeEligible(g, child, other), true, 'after tick t+24');
  // Integration: a T2 placed after tick t+23, overlapping the child by 0.3 u, merges in tick t+24.
  var h = newGame(1, P0);
  place(h, 1, 30, 50); place(h, 1, 30 + 2 * R(h, 1), 50);
  G.tick(h);
  var kid = h.bodies[0];
  stepN(h, 23);
  place(h, 2, kid.x + kid.r + h.rules.RADII[2] - 0.3, kid.y);
  var m = ofType(G.tick(h), 'merge');
  eq(h.tick, 25); eq(m.length, 1, 'merges in tick t+24'); eq(m[0].a, kid.id);
});

test('15 launched glasses are exempt from immunity', function () {
  var g = newGame(1, P0);
  var target = place(g, 1, 50, 128);
  G.setAim(g, 50);
  eq(G.requestLaunch(g), 'queued');
  var ev = record(g, 11);
  var launch = ofType(ev, 'launch')[0];
  ok(launch, 'launched');
  var ids = target.id + ',' + launch.id, mi = -1;
  for (var i = 0; i < ev.length && mi < 0; i++) {
    if (ev[i].type === 'impact' && ev[i].b !== null && pairOf(ev[i]) === ids) assert.fail('impact before merge');
    if (ev[i].type === 'merge' && pairOf(ev[i]) === ids) mi = i;
  }
  ok(mi >= 0, 'merge happened');
  ok(ev[mi].at - launch.at <= 10, 'within 10 ticks');
});

test('16 triple: (1, 3) merge, T1 #2 remains', function () {
  var g = newGame(1, P0);
  var r1 = R(g, 1);
  place(g, 1, 50 - r1, 50); place(g, 1, 50 + r1, 50); place(g, 1, 50, 50 - Math.sqrt(3) * r1);
  var m = ofType(G.tick(g), 'merge');
  deq(pluck(m, pairOf), ['1,3']);
  deq(pluck(g.bodies, function (b) { return b.tier; }).sort(), [1, 2]);
  eq(byId(g, 2).tier, 1);
});

test('17 merge ordering', function () {
  var g = newGame(1, P0);
  place(g, 3, 20, 80); place(g, 3, 20 + 2 * R(g, 3), 80);            // ids 1, 2
  place(g, 2, 85, 20); place(g, 4, 85, 110);           // fillers 3, 4
  place(g, 1, 60, 50); place(g, 1, 60 + 2 * R(g, 1), 50);   // ids 5, 6
  var m = ofType(G.tick(g), 'merge');
  deq(pluck(m, function (e) { return pairOf(e) + ':' + e.tier; }), ['5,6:2', '1,2:4']);
  var h = newGame(1, P0);
  place(h, 1, 20, 50); place(h, 1, 20 + 2 * R(h, 1), 50); place(h, 1, 60, 50); place(h, 1, 60 + 2 * R(h, 1), 50);
  deq(pluck(ofType(G.tick(h), 'merge'), pairOf), ['3,4', '1,2'], 'newest first');
});

test('18 chain lineage', function () {
  var g = newGame(1, P0);
  place(g, 1, 44, 50); place(g, 1, 44 + 2 * R(g, 1), 50);
  var ev = stepN(g, 23);                                // the child T2 is born in tick 1
  var kid = g.bodies[0];
  place(g, 2, kid.x + kid.r + g.rules.RADII[2] + 0.1, kid.y);   // an existing T2, just touching
  ev = ev.concat(stepN(g, 5));
  deq(pluck(ofType(ev, 'merge'), function (e) { return e.depth; }), [1, 2]);
  eq(g.score, 55);
  var h = newGame(1, P0);
  place(h, 1, 20, 50); place(h, 1, 20 + 2 * R(h, 1), 50); place(h, 1, 60, 50); place(h, 1, 60 + 2 * R(h, 1), 50);
  deq(pluck(ofType(G.tick(h), 'merge'), function (e) { return e.depth; }), [1, 1]);
});

test('19 growth', function () {
  var g = newGame(1, P0);
  place(g, 1, 40, 50); place(g, 1, 40 + 2 * R(g, 1), 50);
  G.tick(g);
  var c = g.bodies[0], last = c.r;
  eq(c.r, R(g, 1), 'r = max(rA, rB) at birth (no neighbours)');
  for (var k = 1; k <= 60; k++) {
    G.tick(g);
    ok(c.r >= last, 'monotonic'); last = c.r;
    if (k >= 29) eq(c.r, g.rules.RADII[2], 'exact after birth + 29 (k=' + k + ')');
    else ok(c.r < g.rules.RADII[2]);
  }
});

test('20 shove', function () {
  var g = newGame(1, P0);
  place(g, 1, 40, 50); place(g, 1, 40 + 2 * R(g, 1), 50);
  var d = g.rules.RADII[2] + g.rules.RADII[3] + 1, range = g.rules.RADII[2] + g.rules.RADII[3] + 6;
  var nb = place(g, 3, 40 + R(g, 1), 50 + d);
  G.tick(g);
  var want = g.rules.SHOVE_V * (1 - d / range);
  H.approx(nb.vy, want, want * 0.05, 'dv along +y'); H.approx(nb.vx, 0, 1e-9, 'no sideways dv');
});

test('19b birth radius: overlap-free against neighbours (rev 4), never below R0_MIN', function () {
  function scene(over) {
    var g = newGame(1, Object.assign({ PULL: 0 }, over || {}));
    var r1 = R(g, 1), r3 = R(g, 3);
    var D = Math.sqrt((r1 + r3 + 0.1) * (r1 + r3 + 0.1) - r1 * r1);   // clear of both parents
    place(g, 1, 40, 50); place(g, 1, 40 + 2 * r1, 50);
    place(g, 3, 40 + r1, 50 + D);                                    // but inside a parent-sized birth circle
    G.tick(g);
    return { g: g, kid: g.bodies.filter(function (b) { return b.tier === 2; })[0], free: D - r3, r1: r1 };
  }
  var a = scene();
  ok(a.free < a.r1 && a.free > a.g.rules.R0_MIN * a.r1, 'scene sanity');
  H.approx(a.kid.r0, a.free, 1e-9, 'r0 shrinks to the free radius');
  var b = scene({ R0_MIN: 0.9 });
  H.approx(b.kid.r0, 0.9 * b.r1, 1e-9, 'never below R0_MIN of the larger parent');
});

test('20b shove is clamped: it never raises the outward speed above SHOVE_V', function () {
  var g = newGame(1, P0);
  place(g, 1, 40, 50); place(g, 1, 40 + 2 * R(g, 1), 50);
  var d = R(g, 2) + R(g, 3) + 1;
  var fast = place(g, 3, 40 + R(g, 1), 50 + d, 0, 35);       // already moving outward at 35 u/s
  G.tick(g);
  ok(fast.vy <= g.rules.SHOVE_V + 1e-9, 'vy ' + fast.vy);
  ok(fast.vy >= 35 - 1, 'not slowed by the shove');
});

// Owner playtest (rev 4): neighbours of a tier 5/6 merge were thrown at 150-260 u/s and flew back
// to the launch row. Bot play, as in the repro: no resting glass may exceed 90 u/s within 60 ticks
// of a merge, and no resting glass may race back toward the line.
test('merge feel: bot play never flings resting glasses (rev 4 regression)', function () {
  function flying(b) { return b.launched && b.age < 300; }
  ['relaxed', 'standard'].forEach(function (mode) {
    [1, 2].forEach(function (seed) {
      var g = newGame(seed, { mode: mode }), watch = [], worst = 0, backs = 0, merges = 0;
      for (var i = 0; i < 200 && g.phase !== 'over' && !g.wonOnce; i++) {
        G.setAim(g, G.botAim(g, ((i * 7919) % 1000) / 1000));
        G.requestLaunch(g, 'key');
        for (var k = 0; k < 336 && g.phase !== 'over'; k++) {
          G.tick(g).forEach(function (e) { if (e.type === 'merge') { merges++; watch.push({ until: g.tick + 60, id: e.id }); } });
          watch = watch.filter(function (w) { return g.tick <= w.until; });
          g.bodies.forEach(function (b) {
            if (flying(b)) return;
            var sp = H.speed(b);
            if (watch.length && sp > worst && watch.every(function (w) { return w.id !== b.id; })) worst = sp;
            if (b.vy > 40 && b.y + b.r > g.rules.DANGER_Y - 10 && b.age > 30) backs++;
          });
        }
      }
      ok(merges > 50, mode + ' seed ' + seed + ': only ' + merges + ' merges');
      ok(worst <= 90, mode + ' seed ' + seed + ': a resting glass reached ' + worst.toFixed(0) + ' u/s after a merge');
      eq(backs, 0, mode + ' seed ' + seed + ': glasses raced back toward the line');
    });
  });
});

test('21 area invariant and radius ratios', function () {
  ['standard', 'relaxed'].forEach(function (mode) {
    var R = newGame(1, { mode: mode }).rules.RADII;
    for (var t = 1; t <= 8; t++) {
      ok(2 * R[t] * R[t] > R[t + 1] * R[t + 1], mode + ' area t=' + t);
      ok(R[t + 1] > R[t], mode + ' increasing t=' + t);
      if (t >= 2) H.inRange(R[t + 1] / R[t], 1.14, 1.25, mode + ' ratio t=' + t);
    }
    ok(R[2] / R[1] >= 1.08, mode + ' R2/R1');
  });
});

test('22 tier 9: win, later jugs, jug burst', function () {
  var g = newGame(1, P0);
  var j1 = place(g, 9, 25, 100), j2 = place(g, 9, 25 + 2 * R(g, 9), 100);
  var ev = stepN(g, 30);
  eq(ofType(ev, 'merge').length + ofType(ev, 'jugBurst').length, 0, 'T9s before a win just collide');
  ok(byId(g, j1.id) && byId(g, j2.id));
  place(g, 8, 30, 30); place(g, 8, 30 + 2 * R(g, 8), 30);
  ev = G.tick(g);
  deq(pluck(ev.filter(function (e) { return e.type === 'merge' || e.type === 'win'; }), function (e) { return e.type; }),
    ['merge', 'win']);
  deq([ofType(ev, 'merge')[0].points, ofType(ev, 'win')[0].points, g.score], [360, 1000, 1360]);
  eq(g.dangerSuspendUntil, g.tick + 720);
  var before = g.score;
  ev = [];
  while (g.tick < g.dangerSuspendUntil - 1) ev = ev.concat(G.tick(g));
  eq(ofType(ev, 'jugBurst').length, 0, 'no burst while suspended');
  var jb = ofType(G.tick(g), 'jugBurst');
  eq(jb.length, 1, 'burst at dangerSuspendUntil');
  deq([jb[0].a, jb[0].b], [j1.id, j2.id]);
  ok(!byId(g, j1.id) && !byId(g, j2.id), 'both jugs removed');
  deq([jb[0].depth, jb[0].points, g.score - before], [1, 1000, 1000], 'depth-1 burst scores exactly 1000');
  place(g, 8, 30, 121); place(g, 8, 30 + 2 * R(g, 8), 121);
  ev = stepN(g, 2);
  eq(ofType(ev, 'merge').filter(function (e) { return e.tier === 9; }).length, 1);
  eq(ofType(ev, 'win').length, 0, 'a second T9 emits no win');
  g.bodies.forEach(function (b) { ok(b.tier <= 9, 'no tier 10'); });   // T9 + T9: merge.test.js; every tick: soak
});

test('23 win beats lose', function () {
  var g = newGame(1, P0);
  place(g, 5, 80, 135 - R(g, 5));
  stepN(g, 599);
  eq(g.dangerTicks, 599);
  place(g, 8, 30, 30); place(g, 8, 30 + 2 * R(g, 8) - 0.1, 30);
  var ev = G.tick(g);
  deq([g.tick, ofType(ev, 'win').length, ofType(ev, 'lose').length, g.dangerTicks], [600, 1, 0, 0]);
  assert.notStrictEqual(g.phase, 'over');
  ev = [];
  while (g.tick < 600 + 720) ev = ev.concat(G.tick(g));
  eq(ofType(ev, 'lose').length, 0);
});

// ---------------------------------------------------------------- danger, launch, aim

function lossRun(mode, edge) {
  var g = newGame(1, mode === 'standard' ? { mode: mode, PULL: 0, DANGER_Y: 130, GRACE_TICKS: 600 } : { mode: mode, PULL: 0 });
  place(g, 5, 50, edge - g.rules.RADII[5]);
  return { g: g, ev: record(g, g.rules.GRACE_TICKS + 5) };
}
function beats(ev) { return pluck(ofType(ev, 'dangerTick'), function (e) { return [e.n, e.at]; }); }

test('31 exact loss tick (Standard)', function () {
  var r = lossRun('standard', 135);
  deq(beats(r.ev), [[0, 1], [1, 121], [2, 241], [3, 361], [4, 481]]);
  deq(pluck(ofType(r.ev, 'lose'), function (e) { return e.at; }), [600]);
  eq(r.g.phase, 'over');
  deq(G.tick(r.g), []);
});

test('32 exact loss tick (Relaxed)', function () {
  var r = lossRun('relaxed', 138);
  deq(beats(r.ev), [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return [i, 1 + 120 * i]; }));
  deq(pluck(ofType(r.ev, 'lose'), function (e) { return e.at; }), [960]);
});

test('33 decay', function () {
  var g = newGame(1, P0);
  var b = place(g, 5, 50, 135 - R(g, 5));
  stepN(g, 240);
  eq(g.dangerTicks, 240);
  removeBody(g, b);
  stepN(g, 119);
  eq(g.dangerTicks, 2);
  var ev = stepN(g, 1);
  eq(g.dangerTicks, 0); eq(ofType(ev, 'lose').length, 0);
  assert.notStrictEqual(g.phase, 'over');
});

test('34 no heartbeat re-emission', function () {
  var g = newGame(1, P0);
  var b = place(g, 5, 50, 135 - R(g, 5));
  var ev = stepN(g, 241);
  eq(g.dangerTicks, 241);
  eq(ofType(ev, 'dangerTick').filter(function (e) { return e.n === 2; }).length, 1);
  removeBody(g, b); G.tick(g);
  eq(g.dangerTicks, 239);
  restoreBody(g, b);
  ev = stepN(g, 2);
  eq(g.dangerTicks, 241); eq(ofType(ev, 'dangerTick').length, 0, 'no second dangerTick{2}');
  ev = [];
  while (g.dangerTicks < 400) ev = ev.concat(G.tick(g).map(function (e) { e.dt = g.dangerTicks; return e; }));
  deq(pluck(ofType(ev, 'dangerTick'), function (e) { return [e.n, e.dt]; }), [[3, 361]]);
  removeBody(g, b);
  while (g.dangerTicks > 0) G.tick(g);
  eq(g.dangerTickEmitted, -1);
  restoreBody(g, b);
  deq(pluck(ofType(G.tick(g), 'dangerTick'), function (e) { return e.n; }), [0]);
});

test('35 eligibility', function () {
  var g = newGame(1, P0);
  G.debugAddBody(g, 1, 50, 140, 0, 0, { launched: true, cleared: false, age: 0 });
  stepN(g, 288);
  eq(g.dangerTicks, 0, 'not counted while age <= 288');
  G.tick(g);
  eq(g.dangerTicks, 1, 'counts from age 289');
  var h = newGame(1);
  G.setAim(h, 50); G.requestLaunch(h);
  stepN(h, 80);
  eq(h.bodies[0].cleared, true); eq(h.dangerTicks, 0);
});

test('36 danger levels', function () {
  var g = newGame(1, P0);
  place(g, 5, 50, 127 - R(g, 5));
  deq(pluck(ofType(record(g, 200), 'danger'), function (e) { return [e.level, e.at]; }), [[1, 120]]);
  var h = newGame(1, P0);
  place(h, 5, 50, 122 - R(h, 5));
  deq(levels(stepN(h, 300)), []); eq(h.dangerLevel, 0);
  var k = newGame(1, P0);
  var b = place(k, 5, 50, 135 - R(k, 5));
  deq(levels(G.tick(k)), [2]);
  stepN(k, 10);
  removeBody(k, b);
  deq(levels(G.tick(k)), [1], 'decaying');
  deq(levels(stepN(k, 20)), [0], 'calm');
  eq(k.dangerTicks, 0);
});

// Fires one launch at tick L = 1 and returns the game.
function launched() {
  var g = newGame(1, P0);
  G.setAim(g, 50); G.requestLaunch(g, 'key'); G.tick(g);
  eq(g.phase, 'cooldown');
  return g;
}
function launchTick(g, n) {
  var l = ofType(record(g, n), 'launch');
  return l.length ? l[0].at : -1;
}

test('37 cooldown, buffer, cancel (exact)', function () {
  var L = 1;
  var a = launched();
  stepN(a, 50);
  eq(G.requestLaunch(a, 'key'), 'rejected', '(a) early key press');
  eq(a.launchPending, false, '(a) a rejected request queues nothing');
  stepN(a, 10);
  eq(a.cooldown, 36);
  eq(G.requestLaunch(a, 'key'), 'buffered', '(a) key inside the buffer');
  eq(launchTick(a, 60), L + 96);
  var b = launched();
  stepN(b, 96);
  eq(G.requestLaunch(b, 'key'), 'queued', '(b)');
  eq(launchTick(b, 5), L + 97);
  var c = launched();
  stepN(c, 10);
  eq(G.requestLaunch(c, 'pointer'), 'buffered', '(c)');
  eq(launchTick(c, 120), L + 96);
  var d = launched();
  stepN(d, 60);
  eq(G.requestLaunch(d, 'key'), 'buffered', '(d)');
  G.cancelLaunch(d);
  eq(launchTick(d, 200), -1);
});

test('38 refused launch', function () {
  var g = newGame(1, P0);
  var t4 = place(g, 4, 50, 144);
  G.setAim(g, 50);
  var before = [g.current, g.next, g.phase, false];
  eq(G.requestLaunch(g), 'queued');
  var ev = G.tick(g);
  deq(pluck(ofType(ev, 'launchBlocked'), function (e) { return e.blockerId; }), [t4.id]);
  eq(ofType(ev, 'launch').length, 0); eq(g.bodies.length, 1);
  deq([g.current, g.next, g.phase, g.launchPending], before);
  for (var i = 0; i < 60; i++) {
    G.tick(g);
    g.bodies.forEach(function (b) { ok(isFinite(b.x) && isFinite(b.y) && H.speed(b) <= 160); });
  }
  var r1 = R(g, 1), hit = G.firstHit(g, 50, r1), far = G.firstHit(g, 80, r1);
  deq([hit.blocked, hit.y], [true, 144]);
  deq([far.blocked, far.id, far.y], [false, 0, r1]);
});

test('39 aim clamps and re-clamps', function () {
  var g = newGame(1, P0);
  G.setAim(g, -5); eq(g.aimX, g.rules.RADII[g.current]);
  G.setAim(g, 1e6); eq(g.aimX, 100 - g.rules.RADII[g.current]);
  var b = G.aimBounds(g); deq([b.min, b.max], [R(g, 1), 100 - R(g, 1)]);
  G.nudgeAim(g, -100); eq(g.aimX, R(g, 1));
  G.setAim(g, 95);
  g.next = 4;
  G.requestLaunch(g); G.tick(g);
  eq(g.current, 4); eq(g.aimX, 100 - R(g, 4));
});

test('40 launch body and discovery', function () {
  var g = newGame(1, { PULL: 0, DRAG: 0, FRICTION: 0 });
  G.setAim(g, 37.5); G.requestLaunch(g);
  var l = ofType(G.tick(g), 'launch')[0];
  var b = byId(g, l.id);
  deq([l.x, b.x, b.vx, b.launched, b.bornTick, b.chainDepth], [37.5, 37.5, 0, true, -1, 0]);
  H.approx(b.vy, -150, 1e-6, 'vy');
  // Discovery. spawnScript [1, 1, 2]: the opening is 1, 1 under either reading of 2.7, and T2
  // then sits only in NEXT for one whole cooldown before it reaches the launcher.
  var h = newGame(5, { PULL: 0, spawnScript: [1, 1, 2] });
  deq([h.current, h.next, h.runMask], [1, 1, 1]);
  G.setAim(h, 20); G.requestLaunch(h);
  var e1 = G.tick(h).concat(stepN(h, 120));
  deq([h.current, h.next], [1, 2], 'T2 is only NEXT');
  eq(ofType(e1, 'discover').length, 0, 'NEXT never discovers'); eq(h.runMask & 2, 0);
  G.setAim(h, 80); eq(G.requestLaunch(h), 'queued');
  var e2 = record(h, 1);
  eq(h.current, 2);
  deq(pluck(ofType(e2, 'discover'), function (d) { return d.tier + '@' + d.at; }), ['2@' + h.tick]);
  ok(h.runMask & 2);
  // Whatever a script puts in the launcher at the start counts as discovered.
  eq(newGame(5, { spawnScript: [2] }).runMask, 2);
  eq(newGame(5, { spawnScript: [1, 2] }).runMask, 1);
});
