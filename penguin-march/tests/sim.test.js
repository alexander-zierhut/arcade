// tests/sim.test.js: the rules, one at a time, on tiny hand-made levels.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var H = require('./helpers.js');
var C = H.C, sim = H.sim;

var NONE = { size: 0, rate: 0, dmg: 0 };
var steer = function (x) { return function () { return x; }; };

test('gates: the side the waddle is on applies; +, -, x and / do what they say', function () {
  var def = H.level('t|80|1|g@20:-1,-2 g@30:x3,-1 g@40:-4,/2');
  var s = sim.create(def, NONE);
  sim.run(s, function (st) { return st.z < 25 ? -0.5 : st.z < 35 ? -0.5 : 0.5; });
  // 4 -1 = 3, x3 = 9, /2 = 4, then the boss (1 hp) dies at once
  assert.strictEqual(s.phase, 'WON');
  assert.strictEqual(s.n, 4);
  var right = sim.create(def, NONE);
  sim.run(right, steer(0.5));                      // -2 -> 2, -1 -> 1, /2 -> 0: lost
  assert.strictEqual(right.phase, 'LOST');
  assert.strictEqual(right.n, 0);
});

test('gates: a gate in the middle of the road is resolved by the side the waddle leans to', function () {
  var def = H.level('t|60|1|g@20:-1,-2');        // two bad gates: nothing to shoot up, the arithmetic is exact
  var l = sim.run(sim.create(def, NONE), steer(-0.01));
  var r = sim.run(sim.create(def, NONE), steer(0.01));
  assert.strictEqual(l.n, 3);
  assert.strictEqual(r.n, 2);
});

test('gates: shooting a + gate raises it up to double, x and bad gates do not change', function () {
  var def = H.level('t|80|1|g@40:+5,-2');
  var s = sim.create(def, { size: 5, rate: 5, dmg: 5 });   // 25 penguins at rate 3.2 -> 80 shots/s on the gate
  sim.run(s, steer(-0.5));
  assert.strictEqual(s.n, 25 + 10, 'the + gate was raised to the cap: n=' + s.n);
  var bad = sim.run(sim.create(def, { size: 5, rate: 5, dmg: 5 }), steer(0.5));
  assert.strictEqual(bad.n, 23, 'a -2 gate stays -2 no matter how much it is shot');
  var mul = sim.run(sim.create(H.level('t|80|1|g@40:x2,-2'), { size: 5, rate: 5, dmg: 5 }), steer(-0.5));
  assert.strictEqual(mul.n, 50, 'x2 stays x2');
});

test('walls: shot down before contact nothing happens, otherwise the remaining hp is lost', function () {
  // 4 penguins shoot 4 x 1.6 x 0.12 = 0.77 per second, about 3.6 over the ~4.7 s a wall is in range
  var small = H.level('t|60|1|w@30:3');
  var s = sim.run(sim.create(small, NONE), steer(0));
  assert.strictEqual(s.n, 4, 'a 3 hp wall breaks');
  var thick = H.level('t|60|1|w@30:200');
  var t = sim.run(sim.create(thick, NONE), steer(0));
  assert.strictEqual(t.phase, 'LOST', '200 hp wall kills a waddle of 4');
  var mid = H.level('t|60|1|w@30:5');
  var m = sim.run(sim.create(mid, NONE), steer(0));
  assert.ok(m.n >= 1 && m.n < 4, 'a few penguins lost: n=' + m.n);
});

test('walls: a lane wall is avoided by the other lane', function () {
  var def = H.level('t|60|1|wL@30:500');
  assert.strictEqual(sim.run(sim.create(def, NONE), steer(0.5)).phase, 'WON');
  assert.strictEqual(sim.run(sim.create(def, NONE), steer(-0.5)).phase, 'LOST');
});

test('packs: seals come toward the waddle, each kill costs SEAL_HP, survivors bite', function () {
  var def = H.level('t|70|1|p@40:2');
  var s = sim.create(def, NONE);
  var z0 = s.entities[0].z;
  sim.step(s, 0.5, 0);
  assert.ok(s.entities[0].z < z0, 'the pack moved');
  sim.run(s, steer(0));
  assert.strictEqual(s.n, 4, '2 seals die before contact (0.77 dps over ~3.3 s)');
  var herd = H.level('t|70|1|p@40:30');
  var h = sim.run(sim.create(herd, NONE), steer(0));
  assert.strictEqual(h.phase, 'LOST');
  assert.strictEqual(h.lost, 4, 'every penguin was bitten');
});

test('allies: break the ice for penguins or the big one, walk past it and nothing happens', function () {
  var def = H.level('t|70|1|aL@30:+7/2 aR@44:big/2');
  var s = sim.create(def, NONE);
  sim.run(s, function (st) { return st.z < 36 ? -0.5 : 0.5; });
  assert.strictEqual(s.n, 11);
  assert.strictEqual(s.big, true);
  var miss = sim.run(sim.create(def, NONE), steer(0.5));
  assert.strictEqual(miss.big, true, 'went right: got the big one');
  assert.strictEqual(miss.n, 4, 'but not the +7 on the left');
});

test('fish: +1 each when the waddle runs over them', function () {
  var def = H.level('t|80|1|fC@20:12');
  assert.strictEqual(sim.run(sim.create(def, NONE), steer(0)).n, 16);
  assert.strictEqual(sim.run(sim.create(def, NONE), steer(0.6)).n, 4, 'fish in the middle, waddle on the right');
});

test('boss: the fight starts BOSS_DIST before the end; a big waddle wins, a tiny one is eaten', function () {
  var def = H.level('t|60|300|');
  var s = sim.create(def, { size: 5, rate: 5, dmg: 5 });
  sim.run(s, steer(0));
  assert.strictEqual(s.phase, 'WON');
  assert.ok(s.z <= 60 - C.BOSS_DIST + 0.2, 'the waddle stopped at the fight');
  assert.ok(s.coins > 0 && s.stars >= 1);
  var tiny = sim.run(sim.create(H.level('t|60|100000|'), NONE), steer(0));
  assert.strictEqual(tiny.phase, 'LOST');
  assert.ok(tiny.lost >= 4);
});

test('stars: 3 when almost nothing was lost, fewer when the waddle shrank', function () {
  var clean = sim.run(sim.create(H.level('t|60|1|g@20:+20,-1'), NONE), steer(-0.5));
  assert.strictEqual(clean.stars, 3);
  var bled = sim.run(sim.create(H.level('t|90|1|g@20:+20,-1 g@40:-24,-24'), NONE), steer(-0.5));
  assert.strictEqual(bled.phase, 'WON');
  assert.strictEqual(bled.stars, 1, 'n=' + bled.n + ' peak=' + bled.peak);
});

test('events: gate, pickup, hit, break and win are reported with position and text', function () {
  var def = H.level('t|90|1|g@20:-1,-2 fC@30:2 w@45:5 w@60:30');   // 25 penguins, 4.8 dps: the 5 hp wall breaks, 30 hp leaves ~8
  var s = sim.create(def, { size: 5, rate: 0, dmg: 0 });
  var types = {};
  while (s.phase === 'RUN' || s.phase === 'BOSS') {
    sim.step(s, 1 / 60, -0.3);
    s.events.forEach(function (e) { types[e.type] = (types[e.type] || 0) + 1; assert.ok(typeof e.z === 'number' && typeof e.x === 'number'); });
    s.events.length = 0;
  }
  assert.ok(types.gate === 1 && types.pickup === 2 && types.break >= 1 && types.hit === 1 && types.win === 1, JSON.stringify(types));
});

test('determinism: the same level and steering give the same run', function () {
  var def = H.levels.get(7);
  var a = sim.run(sim.create(def, NONE), H.bot.greedy), b = sim.run(sim.create(def, NONE), H.bot.greedy);
  assert.strictEqual(a.n, b.n); assert.strictEqual(a.t, b.t); assert.strictEqual(a.phase, b.phase);
});

test('shooting: the cap keeps a riot waddle fast but finite; the big penguin doubles the rate', function () {
  var s = sim.create(H.level('t|60|1|'), NONE);
  s.n = 100000;
  assert.strictEqual(sim.shooters(s), C.SHOOT_CAP);
  s.n = 10; s.big = true;
  assert.strictEqual(sim.shooters(s), 20);
});
