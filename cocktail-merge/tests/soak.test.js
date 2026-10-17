// tests/soak.test.js: soak (43, including play after the win), scoring (44) and the config and
// dedication guards (47). DESIGN 6.2. Split out of game.test.js to keep files small (5.1).
'use strict';
var assert = require('assert');
var vm = require('vm');
var fs = require('fs');
var path = require('path');
var H = require('./helpers.js');
var G = require('../src/game/game.js');
var C = require('../src/config.js');

var newGame = H.newGame, ofType = H.ofType;
var eq = assert.strictEqual, deq = assert.deepStrictEqual, ok = assert.ok;

// Every tick: bounds and no NaN, ids strictly ascending (so unique), no tier above 9.
function checkBodies(g) {
  var bs = g.bodies;
  H.assertBounds(bs, g.rules.W, g.rules.L, 1e-9);
  for (var i = 0; i < bs.length; i++) {
    if (!(bs[i].tier >= 1 && bs[i].tier <= 9)) assert.fail('tier ' + bs[i].tier);
    if (i > 0 && !(bs[i].id > bs[i - 1].id)) assert.fail('id order ' + bs[i - 1].id + ', ' + bs[i].id);
    if (!(bs[i].id < g.nextId)) assert.fail('id ' + bs[i].id + ' >= nextId');
  }
}

test('43 soak (continuing after the win)', function () {
  var t0 = Date.now(), contacts = 0, bad = 0, maxOver = 0, wins = 0, postWinTicks = 0;
  ['standard', 'relaxed'].forEach(function (mode) {
    [11, 22, 33, 44, 55].forEach(function (seed) {
      var g = newGame(seed, { mode: mode }), rnd = H.mulberry32(seed * 31 + 7), maxBodies = 0;
      for (var n = 0; n < 400 && g.phase !== 'over'; n++) {
        G.setAim(g, G.botAim(g, rnd())); G.requestLaunch(g);
        for (var k = 0; k < 336 && g.phase !== 'over'; k++) {
          var ev = G.tick(g), bs = g.bodies;
          if (ofType(ev, 'win').length) { wins++; G.continueAfterWin(g); }
          if (g.wonOnce) postWinTicks++;
          checkBodies(g);
          if (bs.length > maxBodies) maxBodies = bs.length;
          for (var i = 0; i < bs.length; i++) {
            var a = bs[i];
            if (a.age <= 24) continue;
            for (var j = i + 1; j < bs.length; j++) {
              var o = bs[j];
              if (o.age <= 24) continue;
              var pen = a.r + o.r - Math.sqrt((a.x - o.x) * (a.x - o.x) + (a.y - o.y) * (a.y - o.y));
              if (pen <= 0) continue;
              contacts++;
              if (pen > 0.5) bad++;
              if (pen > maxOver) maxOver = pen;
            }
          }
        }
      }
      ok(maxBodies <= 45, mode + ' ' + seed + ' max bodies ' + maxBodies);
      eq(g.world.poolGrowths, 0);
    });
  });
  ok(contacts > 0);
  ok(wins > 0 && postWinTicks > 0, 'the soak reached post-win play (wins ' + wins + ')');
  ok(bad / contacts < 0.0005, 'overlap > 0.5 u fraction ' + bad / contacts);
  ok(maxOver < 8, 'max overlap ' + maxOver);
  ok(Date.now() - t0 < 40000, 'runtime ' + (Date.now() - t0) + ' ms');
});

test('44 scoring', function () {
  var BASE = [0, 0, 10, 30, 60, 100, 150, 210, 280, 360];
  for (var t = 1; t <= 9; t++) { eq(C.TIERS[t].points, BASE[t]); eq(G.pointsFor(t, 1), BASE[t]); }
  deq([1, 2, 3, 4, 5, 6, 7, 8].map(G.multiplier), [1, 1.5, 2, 2.5, 3, 3.5, 4, 4]);
  eq(G.pointsFor(3, 2), 45);
});

test('47 config and dedication guards', function () {
  eq(typeof global.CM_DEDICATION, 'undefined');
  eq(C.DEDICATION, 'For you, with love.');
  var ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/dedication.js'), 'utf8'), ctx);
  ok(typeof ctx.CM_DEDICATION === 'string' && ctx.CM_DEDICATION.trim().length > 0);
  for (var t = 1; t <= 9; t++) ok(/^#[0-9A-F]{6}$/i.test(C.TIERS[t].color), 'colour ' + t);
  ok(/^#[0-9A-F]{6}$/i.test(C.TIERS[9].accent));
  deq([C.TIERS[9].color, C.TIERS[9].accent], ['#0F8A5F', '#FFD23F']);
  var w = C.SPAWN.WEIGHTS;
  eq(w[0], 0); eq(w.reduce(function (s, x) { return s + x; }, 0), 100);
  ['standard', 'relaxed'].forEach(function (mode) {
    var r = newGame(1, { mode: mode }).rules;
    ok(r.DANGER_Y <= r.LAUNCH_Y - r.RADII[4] - 0.4 + 1e-9, mode + ' danger guard');
    ok(r.LAUNCH_Y + r.RADII[4] <= r.L, mode + ' launcher fits');
  });
  eq(C.AUDIO.SCALE.length, 15);
  // 5.2: deep-frozen, so no test (or game code) can leak a mutation into later files.
  [C, C.TABLE, C.PHYS, C.RULES, C.MODES, C.MODES.relaxed, C.TIERS, C.TIERS[3], C.SPAWN.WEIGHTS]
    .forEach(function (o, i) { ok(Object.isFrozen(o), 'frozen #' + i); });
  eq(C.LOOP.DT, C.PHYS.DT, 'one fixed step');
});

test('47 mode rules: Relaxed and Standard resolve as 2.13 says', function () {
  var s = newGame(1).rules, r = newGame(1, { mode: 'relaxed' }).rules;
  var T = C.TIERS, k = C.MODES.relaxed.RADIUS_SCALE;     // radii and the rung come from config (gate, Appendix 9)
  deq([s.mode, s.DANGER_Y, s.GRACE_TICKS, s.RADII[2]], ['standard', 120, 480, T[2].radius]);
  deq([r.mode, r.DANGER_Y, r.GRACE_TICKS, r.RADII[1]], ['relaxed', 133, 960, T[1].radius]);
  H.approx(r.RADII[2], T[2].radius * k, 1e-12, 'relaxed R2');
  H.approx(r.RADII[9], T[9].radius * k, 1e-12, 'relaxed R9');
  eq(newGame(1, { mode: 'relaxed', DANGER_Y: 131 }).rules.DANGER_Y, 131, 'overrides beat the mode');
});
