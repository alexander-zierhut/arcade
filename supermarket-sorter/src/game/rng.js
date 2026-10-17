// src/game/rng.js: seeded RNG (mulberry32) so levels and tests are reproducible. Pure.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    var s = String(seed === undefined || seed === null ? 'seed' : seed), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** create(seed) -> { seed, next(), int(n), range(lo, hi), pick(arr), shuffle(arr), state() } */
  function create(seed) {
    var a = hashSeed(seed);
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function int(n) { return Math.floor(next() * n); }
    function range(lo, hi) { return lo + int(hi - lo + 1); }
    function pick(arr) { return arr[int(arr.length)]; }
    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) { var j = int(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    }
    return { seed: a, next: next, int: int, range: range, pick: pick, shuffle: shuffle, state: function () { return a; } };
  }

  var rng = { create: create, hashSeed: hashSeed };
  SS.rng = rng;
  if (typeof module !== 'undefined' && module.exports) module.exports = rng;
})(typeof globalThis !== 'undefined' ? globalThis : this);
