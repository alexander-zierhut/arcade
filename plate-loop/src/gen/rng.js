// src/gen/rng.js: seeded random numbers (mulberry32), the only source of randomness for generator, bot and permutations
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  // create(seed) -> { next() in [0,1), int(n) in [0,n), pick(arr), shuffle(arr) in place }
  function create(seed) {
    var a = seed | 0;
    function next() {
      // mulberry32; keeping `a` in int32 range gives the same bits as the unbounded `seed += 0x6D2B79F5` form
      var t = (a = (a + 0x6D2B79F5) | 0);
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    function int(n) { return Math.floor(next() * n); }
    function pick(arr) { return arr[int(arr.length)]; }
    function shuffle(arr) {            // Fisher-Yates, in place, returns arr
      for (var i = arr.length - 1; i > 0; i--) {
        var j = int(i + 1);
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    }
    return { next: next, int: int, pick: pick, shuffle: shuffle };
  }

  // permutation(n, seed) -> shuffled [0..n-1]
  function permutation(n, seed) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    return create(seed).shuffle(arr);
  }

  PL.rng = { create: create, permutation: permutation };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.rng;
})(typeof window !== 'undefined' ? window : globalThis);
