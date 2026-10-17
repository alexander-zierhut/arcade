// tests/levels.test.js: every level can be won, the choices matter, the riot levels riot, the curve has no cliff.
// The greedy bot (src/bot.js) plays each level with the shop a normal player can afford by then: it starts with
// nothing, keeps every coin it wins and buys the cheapest next upgrade whenever it can. Run with VERBOSE=1 to
// print the curve (penguins at the end, time, stars, shop) per level.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var H = require('./helpers.js');
var C = H.C, sim = H.sim, levels = H.levels, bot = H.bot;

var VERBOSE = !!process.env.VERBOSE;
var NONE = { size: 0, rate: 0, dmg: 0 };
var MAXED = { size: C.MAX_SHOP, rate: C.MAX_SHOP, dmg: C.MAX_SHOP };

test('levels: the authored strings decode, calibrate, validate and round-trip through encode', function () {
  assert.strictEqual(H.LEVEL_DATA.levels.length, C.AUTHORED_LEVELS);
  for (var n = 1; n <= C.AUTHORED_LEVELS; n++) {
    var def = levels.get(n);
    assert.strictEqual(def.n, n);
    assert.ok(def.entities.length >= 2, 'level ' + n + ' is empty');
    var again = levels.validate(levels.decode(levels.encode(def), n));
    again.entities.sort(function (a, b) { return a.z - b.z || a.x - b.x; });
    assert.deepStrictEqual(again.entities, def.entities, 'level ' + n + ' round trip');
    assert.strictEqual(def.riot, n % 4 === 0, 'level ' + n + ' riot flag');
    assert.ok(def.bossHp > 0);
  }
});

test('levels: generated levels are deterministic, valid, and encode/decode cleanly', function () {
  for (var n = C.AUTHORED_LEVELS + 1; n <= C.AUTHORED_LEVELS + 60; n++) {
    var a = levels.get(n), b = H.calibrate.calibrate(H.gen.generate(n));
    b.entities.sort(function (x, y) { return x.z - y.z || x.x - y.x; });
    assert.deepStrictEqual(a.entities, b.entities, 'level ' + n + ' differs between two generations');
    assert.strictEqual(a.bossHp, b.bossHp);
    var again = levels.validate(levels.decode(levels.encode(a), n));
    again.entities.sort(function (x, y) { return x.z - y.z || x.x - y.x; });
    assert.deepStrictEqual(again.entities, a.entities, 'generated level ' + n + ' round trip');
    assert.strictEqual(a.riot, (n - C.AUTHORED_LEVELS) % C.RIOT_EVERY_GEN === 0);
  }
  assert.throws(function () { levels.get(0); });
});

test('levels: the reference shop never runs ahead of what the economy affords', function () {
  var coins = 0, upgrades = { size: 0, rate: 0, dmg: 0 };
  for (var n = 1; n <= C.AUTHORED_LEVELS; n++) {
    var bought = bot.buyWhatYouCan(coins, upgrades);
    upgrades = bought.upgrades; coins -= bought.spent;
    var ref = C.refShop(n);
    var have = upgrades.size + upgrades.rate + upgrades.dmg, want = ref.size + ref.rate + ref.dmg;
    assert.ok(have >= want, 'level ' + n + ': economy gives ' + have + ' shop points, the reference assumes ' + want);
    var s = sim.run(sim.create(levels.get(n), upgrades), bot.greedy);
    coins += s.coins;
  }
});

test('levels: the greedy bot wins every authored level with the shop it can afford by then', function () {
  var coins = 0, upgrades = { size: 0, rate: 0, dmg: 0 }, lines = [];
  for (var n = 1; n <= C.AUTHORED_LEVELS; n++) {
    var bought = bot.buyWhatYouCan(coins, upgrades);
    upgrades = bought.upgrades; coins -= bought.spent;
    var def = levels.get(n);
    var s = sim.run(sim.create(def, upgrades), bot.greedy);
    lines.push('L' + n + ' ' + def.tag + ': ' + s.phase + ' n=' + s.n + ' peak=' + s.peak + ' lost=' + s.lost + ' t=' + s.t.toFixed(0) + 's stars=' + s.stars + ' boss=' + def.bossHp + ' shop=' + upgrades.size + '/' + upgrades.rate + '/' + upgrades.dmg + ' coins=' + (coins + s.coins));
    assert.strictEqual(s.phase, 'WON', lines.join('\n'));
    if (def.riot) assert.ok(s.peak >= 500, 'riot level ' + n + ' peaked at only ' + s.peak);
    coins += s.coins;
  }
  if (VERBOSE) console.log(lines.join('\n'));
});

test('levels: the greedy bot also wins every authored level with exactly the reference shop', function () {
  for (var n = 1; n <= C.AUTHORED_LEVELS; n++) {
    var s = sim.run(sim.create(levels.get(n), C.refShop(n)), bot.greedy);
    assert.strictEqual(s.phase, 'WON', 'level ' + n + ' with the reference shop: n=' + s.n + ' lost=' + s.lost);
  }
});

test('levels: there is a game: the random-gate bot fails a good share of the non-riot levels', function () {
  var failed = 0, total = 0;
  for (var n = 5; n <= C.AUTHORED_LEVELS; n++) {
    var def = levels.get(n);
    if (def.riot) continue;
    total++;
    var s = sim.run(sim.create(def, C.refShop(n)), bot.random(n));
    if (s.phase === 'LOST') failed++;
  }
  assert.ok(failed >= total * 0.5, 'random play lost only ' + failed + ' of ' + total);
});

test('levels: a maxed shop wins every generated level 51-300, riot levels riot', function () {
  var lines = [];
  for (var n = C.AUTHORED_LEVELS + 1; n <= 300; n++) {
    var def = levels.get(n);
    var s = sim.run(sim.create(def, MAXED), bot.greedy);
    lines.push('L' + n + ' ' + def.tag + ': ' + s.phase + ' n=' + s.n + ' peak=' + s.peak + ' lost=' + s.lost + ' t=' + s.t.toFixed(0) + 's boss=' + def.bossHp);
    assert.strictEqual(s.phase, 'WON', lines.slice(-5).join('\n'));
    if (def.riot) assert.ok(s.peak >= 500, 'riot level ' + n + ' peaked at only ' + s.peak);
  }
  if (VERBOSE) console.log(lines.filter(function (l, i) { return i % 10 === 0; }).join('\n'));
});

test('levels: the first generated levels are winnable with a shop one step short of maxed', function () {
  var shop = { size: 5, rate: 5, dmg: 4 };
  for (var n = C.AUTHORED_LEVELS + 1; n <= C.AUTHORED_LEVELS + 10; n++) {
    var s = sim.run(sim.create(levels.get(n), shop), bot.greedy);
    assert.strictEqual(s.phase, 'WON', 'level ' + n + ' with a 5/5/4 shop: n=' + s.n);
  }
});

test('knobs: the curve is monotone after level 50 and plateaus', function () {
  var prev = null;
  for (var n = C.AUTHORED_LEVELS + 1; n <= 400; n++) {
    var k = H.knobs(n);
    if (prev) {
      assert.ok(k.bossSecs >= prev.bossSecs && k.wallShare[1] >= prev.wallShare[1] && k.laneShare[1] >= prev.laneShare[1] && k.length >= prev.length, 'knobs dip at ' + n);
    }
    assert.ok(k.wallShare[1] <= 1.0 && k.packShare[1] <= 1.0, 'a full-width threat must stay below what the waddle can shoot');
    prev = k;
  }
  assert.ok(H.knobs(400).bossSecs < 15, 'the boss must die before it reaches the waddle');
  // the join: level 51 is not a cliff after the authored level 50 (fight seconds and road length, as authored;
  // hit points differ by the waddle each level ends with, e.g. the big penguin doubling level 50's fire)
  var l50 = levels.decode(H.LEVEL_DATA.levels[C.AUTHORED_LEVELS - 1], C.AUTHORED_LEVELS), k51 = H.knobs(C.AUTHORED_LEVELS + 1);
  assert.ok(k51.bossSecs >= l50.bossSecs * 0.6 && k51.bossSecs <= l50.bossSecs * 1.5, 'walrus seconds jump from ' + l50.bossSecs + ' to ' + k51.bossSecs);
  assert.ok(k51.length >= l50.length - 20, 'road length drops from ' + l50.length + ' to ' + k51.length);
});
