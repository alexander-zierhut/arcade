// tests/helpers.js: shared helpers for the unit tests (DESIGN 6.1).
// newGame, stepN and place wrap CM.game; game.js is required lazily so tests that use
// only physics or projection do not depend on it.
'use strict';
var assert = require('assert');

function game() { return require('../src/game/game.js'); }

// newGame(seed, overrides): CM.game.createGame.
function newGame(seed, overrides) {
  return game().createGame(seed, overrides);
}

// stepN(g, n): n calls to tick(g); returns all events concatenated in order.
function stepN(g, n) {
  var all = [];
  var tick = game().tick;
  for (var i = 0; i < n; i++) {
    var ev = tick(g);
    for (var k = 0; k < ev.length; k++) all.push(ev[k]);
  }
  return all;
}

// place(g, tier, x, y, vx = 0, vy = 0, opts = {age: 24, cleared: true}): wraps debugAddBody.
// Keys given in opts override the defaults one by one.
function place(g, tier, x, y, vx, vy, opts) {
  var o = { age: 24, cleared: true };
  if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
  return game().debugAddBody(g, tier, x, y, vx || 0, vy || 0, o);
}

// --- assertions and small utilities ---

// approx(actual, expected, eps, msg): |actual - expected| <= eps.
function approx(actual, expected, eps, msg) {
  if (!(Math.abs(actual - expected) <= eps)) {
    assert.fail((msg ? msg + ': ' : '') + 'expected ' + expected + ' ± ' + eps + ', got ' + actual);
  }
}

// inRange(v, lo, hi, msg): lo <= v <= hi.
function inRange(v, lo, hi, msg) {
  if (!(v >= lo && v <= hi)) assert.fail((msg ? msg + ': ' : '') + v + ' not in [' + lo + ', ' + hi + ']');
}

// assertBounds(bodies, W = 100, L = 160, eps = 1e-12): test 9 (bounds and no NaN).
function assertBounds(bodies, W, L, eps) {
  W = W === undefined ? 100 : W; L = L === undefined ? 160 : L; eps = eps === undefined ? 1e-12 : eps;
  for (var i = 0; i < bodies.length; i++) {
    var b = bodies[i];
    var vals = [b.x, b.y, b.vx, b.vy, b.r];
    for (var k = 0; k < vals.length; k++) {
      if (!isFinite(vals[k])) assert.fail('body ' + b.id + ' has a non-finite field');
    }
    if (b.x < b.r - eps || b.x > W - b.r + eps || b.y < b.r - eps || b.y > L - b.r + eps) {
      assert.fail('body ' + b.id + ' out of bounds at (' + b.x + ', ' + b.y + ') r ' + b.r);
    }
  }
}

// ofType(events, type): the events of one type.
function ofType(events, type) {
  return events.filter(function (e) { return e.type === type; });
}

// speed(b): |v|.
function speed(b) { return Math.sqrt(b.vx * b.vx + b.vy * b.vy); }

// maxPenetration(bodies): the largest pairwise overlap (0 if none).
function maxPenetration(bodies) {
  var m = 0;
  for (var i = 0; i < bodies.length; i++) {
    for (var j = i + 1; j < bodies.length; j++) {
      var a = bodies[i], b = bodies[j];
      var p = a.r + b.r - Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      if (p > m) m = p;
    }
  }
  return m;
}

// mulberry32(seed): a seeded uniform [0, 1) generator, the same algorithm as rngNext (2.7).
function mulberry32(seed) {
  var s = seed >>> 0;
  return function () {
    var a = (s + 0x6D2B79F5) | 0; s = a >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// physicsRules(overrides): a flat rules object (TABLE + PHYS + RULES + overrides) for
// tests that drive physics.stepWorld directly, the same shape createGame resolves (2.13).
function physicsRules(overrides) {
  var config = require('../src/config.js');
  var r = {};
  [config.TABLE, config.PHYS, config.RULES, overrides || {}].forEach(function (src) {
    Object.keys(src).forEach(function (k) { r[k] = src[k]; });
  });
  return r;
}

module.exports = {
  newGame: newGame,
  stepN: stepN,
  place: place,
  approx: approx,
  inRange: inRange,
  assertBounds: assertBounds,
  ofType: ofType,
  speed: speed,
  maxPenetration: maxPenetration,
  mulberry32: mulberry32,
  physicsRules: physicsRules
};
