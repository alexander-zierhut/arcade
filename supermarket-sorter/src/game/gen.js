// src/game/gen.js: level generation (DESIGN 3.3, 4.2-4.7). Pure, integer RNG only, same code offline (bake) and on the
// phone (tail). knobs() gives the difficulty row of a level; bandedDeal() deals a board from it; invariants() checks
// G1-G11; generate() runs the solver gate and returns a level with its witness; remix() transforms a baked level.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var C = SS.config || (typeof require === 'function' ? require('../config.js') : {});
  var RNG = SS.rng || (typeof require === 'function' ? require('./rng.js') : null);
  var B = SS.board || (typeof require === 'function' ? require('./board.js') : null);
  var R = SS.rules || (typeof require === 'function' ? require('./rules.js') : null);
  var SOL = SS.solver || (typeof require === 'function' ? require('./solver.js') : null);
  var CODES = '0123456789abcdefghijklmn';                 // up to 24 type codes
  var BUNNY = '*';

  // ---------- knob tables L1-60 (DESIGN 4.4 timed, 4.5 relaxed) ----------
  // L tag shape F0 plan rueck locks side v horiz types bunny sil items
  var TIMED = [
    '1 t A4 3 - - - - - - 3 - - 9', '2 t A5 3 - - - - - - 4 - - 12', '3 n A6 6 L2x2 1-2 - - - - 5 - - 15', '4 n A6 3 L2x4 1-2 - - - - 7 - - 21',
    '5 n A7 3 L2x5 1-2 - - - - 9 - - 27', '6 n A7 3 L2x6 1-2 - - - - 9 1 - 27', '7 n A8 3 L2x6 1-2 1xN2 - - - 10 - - 30', '8 n A8 3 L2x6,L3x2 1-2 - - - - 11 - - 33',
    '9 n A8 4 L2x5 1-2 - - - - 9 - - 27', '10 v A9 3 L2x9,L3x3 1-3 - - - - 11 1 - 48', '11 p A8 4 L2x6 1-2 - - - - 10 - - 30', '12 n A8 4 L2x6 1-2 - 7/6 20 - 11 - - 42',
    '13 n A8 4 L2x8 1-2 1xN3 7/6 20 - 12 - - 45', '14 n A9 4 L2x9 1-2 - 7/6 20 - 12 - - 51', '15 h A9 4 L2x9,L3x3 1-3 - 7/6 20 - 12 1 - 60', '16 n A8 4 L2x8,L3x2 1-2 1xN3 7/6 20 - 12 - - 48',
    '17 n A9 4 L2x9,L3x3 1-2 - 7/6 20 - 13 - - 54', '18 n A9 4 L2x9,L3x3 1-2 1xN3 7/6 20 - 13 - - 54', '19 n A9 4 L2x9,L3x4 1-2 - 7/6 20 - 13 - - 57', '20 v A10 4 L2x10,L3x5 2-3 - 9/8 20 - 14 1 - 81',
    '21 p A9 5 L2x9 1-2 - 7/6 21 - 11 - - 51', '22 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 22 - 12 - - 54', '23 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 23 - 12 B - 54', '24 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 24 - 12 - 2S 54',
    '25 h A10 5 L2x10,L3x3 1-3 - 9/8 25 - 12 1 20 69', '26 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 26 - 12 - 21 54', '27 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 27 - 12 - 22 54', '28 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 28 - 12 - 23 54',
    '29 n A9 5 L2x9,L3x3 1-2 1xN3 7/6 29 - 12 - 24 54', '30 v A10 5 L2x10,L3x4 2-3 - 9/8 35 - 14 1 25 78', '31 p A9 5 L2x9 1-2 - 7/6 31+ - 12 - 13 51', '32 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 32+ - 13 - 27 57',
    '33 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 33+ - 13 B 28 57', '34 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 34+ 50 13 - 29 63', '35 h A10 5 L2x10,L3x5 1-3 - 9/8 35+ 40 13 1 30 81', '36 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 36+ - 13 - 31 57',
    '37 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 37+ - 13 - 32 57', '38 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 38+ - 13 - 33 57', '39 n A9 5 L2x9,L3x4 1-2 1xN3 7/6 39+ - 13 - 34 57', '40 v A10 5 L2x10,L3x6 2-3 - 9/8 45+ S 14 1 35 90',
    '41 p A9 5 L2x9 1-2 - 8/6 41+ - 13 - 18 51', '42 n A10 4 L2x10,L3x7 1-2 2xN4 10/8 42+ - 14 - 37 72', '43 n A10 4 L2x10,L3x7 1-2 2xN4 10/8 43+ - 14 B 38 72', '44 n A10 4 L2x10,L3x7 1-2 2xN4 10/8 44+ - 14 - 39 72',
    '45 h A10 4 L2x10,L3x7,L4x2 1-3 - 10/8 45+ 40 14 1 40 90', '46 n A10 4 L2x10,L3x7 1-2 2xN4 10/8 46+ - 14 - 41 72', '47 n A10 4 L2x10,L3x8 1-2 2xN4 10/8 47+ - 14 - 42 72', '48 n A10 4 L2x10,L3x8 1-2 2xN4 10/8 48+ - 14 - 43 72',
    '49 n A10 4 L2x10,L3x8 1-2 2xN4 10/8 49+ - 14 - 44 72', '50 v A10 4 L2x10,L3x8,L4x2 2-3 - 10/8 55+ S 15 1 45 102', '51 p A9 5 L2x9 1-2 - 8/6 51+ - 14 - 23 51', '52 n A10 4 L2x10,L3x9 1-2 2xN4 10/8 52+ - 15 - 47 75',
    '53 n A10 4 L2x10,L3x9 1-2 2xN4 10/8 53+ - 15 B 48 75', '54 n A10 4 L2x10,L3x9 1-2 2xN4 10/8 54+ - 15 - 49 75', '55 h A10 4 L2x10,L3x9,L4x3 1-3 - 10/8 55+ 40 15 1 50 96', '56 n A10 4 L2x10,L3x9 1-2 2xN4 10/8 56+ - 15 - 51 75',
    '57 n A10 4 L2x10,L3x10 1-2 2xN4 10/8 57+ - 15 - 52 75', '58 n A10 4 L2x10,L3x10 1-2 2xN4 10/8 58+ - 15 - 53 75', '59 n A10 4 L2x10,L3x10 1-2 2xN4 10/8 59+ - 15 - 54 75', '60 v A10 4 L2x10,L3x9,L4x2 2-3 - 10/8 65+ S 16 1 55 105'
  ];
  var RELAXED = [
    '1 t A4 3 - - - - - - 3 - - 9', '2 t A5 3 - - - - - - 4 - - 12', '3 n A6 6 L2x2 1-2 - - - - 5 - - 15', '4 n A6 3 L2x4 1-2 - - - - 7 - - 21',
    '5 n A7 3 L2x5 1-2 - - - - 9 - - 27', '6 n A7 3 L2x6 1-2 - - - - 9 1 - 27', '7 n A8 3 L2x6 1-2 1xN2 - - - 10 - - 30', '8 n A8 3 L2x6,L3x2 1-2 - - - - 11 - - 33',
    '9 n A8 4 L2x5 1-2 - - - - 9 - - 27', '10 v A9 3 L2x9,L3x3 1-3 - - - - 11 1 - 48', '11 p A8 4 L2x6 1-2 - - - - 10 - - 30', '12 n A8 4 L2x6 1-2 - 6/6 0 - 11 - - 42',
    '13 n A8 4 L2x8 1-2 1xN3 6/6 0 - 12 - - 45', '14 n A9 4 L2x9 1-2 - 6/6 0 - 12 - - 48', '15 h A9 4 L2x9,L3x3 1-3 - 6/6 0 - 12 1 - 60', '16 n A8 4 L2x8,L3x2 1-2 1xN3 6/6 0 - 12 - - 48',
    '17 n A9 4 L2x9,L3x3 1-2 - 6/6 0 - 13 - - 54', '18 n A9 4 L2x9,L3x3 1-2 1xN3 6/6 0 - 13 - - 54', '19 n A9 4 L2x9,L3x4 1-2 - 6/6 0 - 13 - - 54', '20 v A10 4 L2x10,L3x5 2-3 - 8/8 0 - 14 1 - 81',
    '21 p A10 4 L2x10,L3x4 1-2 - 8/8 0 - 14 - - 63', '22 n A10 3 L2x10,L3x4,L4x2 1-2 2xN3 8/8 0 - 14 - - 66', '23 n A10 3 L2x10,L3x4,L4x2 1-2 2xN3 8/8 0 - 14 - - 66', '24 n A10 3 L2x10,L3x4,L4x2 1-2 2xN3 8/8 0 - 14 - 2S 66',
    '25 h A10 3 L2x10,L3x5,L4x2 1-3 - 8/8 0 - 15 1 20 75', '26 n A10 3 L2x10,L3x5,L4x2 1-2 2xN3 8/8 0 - 15 - 21 69', '27 n A10 3 L2x10,L3x5,L4x3 1-2 2xN3 8/8 0 - 15 - 22 69', '28 n A10 3 L2x10,L3x5,L4x3 1-2 2xN3 8/8 0 - 15 - 23 69',
    '29 n A10 3 L2x10,L3x6,L4x3 1-2 2xN3 8/8 0 - 15 - 24 72', '30 v A10 3 L2x10,L3x6,L4x3 2-3 - 8/8 0 - 16 1 25 87', '31 p A10 4 L2x10,L3x4 1-2 - 8/8 0 - 14 - 13 63', '32 n A10 3 L2x10,L3x6,L4x3 1-2 2xN4 8/8 0 - 16 - 27 72',
    '33 n A10 3 L2x10,L3x7,L4x4 1-2 2xN4 8/8 0 - 16 - 28 75', '34 n A10 3 L2x10,L3x7,L4x4 1-2 2xN4 8/8 0 - 16 - 29 75', '35 h A10 3 L2x10,L3x7,L4x4,L5x1 1-3 - 8/8 0 - 17 1 30 84', '36 n A10 3 L2x10,L3x7,L4x4 1-2 2xN4 8/8 0 - 17 - 31 75',
    '37 n A10 3 L2x10,L3x8,L4x4 1-2 2xN4 8/8 0 - 17 - 32 75', '38 n A10 3 L2x10,L3x8,L4x4 1-2 2xN4 8/8 0 - 17 - 33 75', '39 n A10 3 L2x10,L3x8,L4x5 1-2 2xN4 8/8 0 - 17 - 34 78', '40 v A10 3 L2x10,L3x8,L4x5,L5x1 2-3 - 8/8 0 - 18 1 35 96',
    '41 p A10 4 L2x10,L3x4 1-2 - 9/8 8 - 16 - 18 66', '42 n A10 3 L2x10,L3x9,L4x5,L5x2 1-2 3xN4 9/8 8 - 18 - 37 84', '43 n A10 3 L2x10,L3x9,L4x5,L5x2 1-2 3xN4 9/8 8 - 18 - 38 84', '44 n A10 3 L2x10,L3x9,L4x5,L5x2 1-2 3xN4 9/8 8 - 18 - 39 84',
    '45 h A10 3 L2x10,L3x10,L4x6,L5x2 1-3 - 9/8 8 - 19 1 40 96', '46 n A10 3 L2x10,L3x10,L4x6,L5x2 1-2 3xN4 9/8 8 - 19 - 41 87', '47 n A10 3 L2x10,L3x10,L4x6,L5x2 1-2 3xN4 9/8 8 - 19 - 42 87', '48 n A10 3 L2x10,L3x10,L4x6,L5x2 1-2 3xN4 9/8 8 - 19 - 43 87',
    '49 n A10 3 L2x10,L3x10,L4x6,L5x2 1-2 3xN4 9/8 8 - 19 - 44 87', '50 v A10 3 L2x10,L3x10,L4x6,L5x2,L6x2 2-3 - 9/8 8 - 20 1 45 111', '51 p A10 4 L2x10,L3x5 1-2 - 9/8 8 - 18 - 23 66', '52 n A10 3 L2x10,L3x10,L4x7,L5x3 1-2 3xN5 9/8 8 - 20 - 47 90',
    '53 n A10 3 L2x10,L3x10,L4x7,L5x3 1-2 3xN5 9/8 8 - 20 - 48 90', '54 n A10 3 L2x10,L3x10,L4x7,L5x3 1-2 3xN5 9/8 8 - 20 - 49 90', '55 h A10 3 L2x10,L3x10,L4x7,L5x3,L6x1 1-3 - 9/8 8 - 21 1 50 102', '56 n A10 3 L2x10,L3x10,L4x8,L5x3,L6x1 1-2 3xN5 9/8 8 - 21 - 51 93',
    '57 n A10 3 L2x10,L3x10,L4x8,L5x3,L6x1 1-2 3xN5 9/8 8 - 21 - 52 93', '58 n A10 3 L2x10,L3x10,L4x8,L5x3,L6x1 1-2 3xN5 9/8 8 - 21 - 53 93', '59 n A10 3 L2x10,L3x10,L4x8,L5x3,L6x1 1-2 3xN5 9/8 8 - 21 - 54 93', '60 v A10 3 L2x10,L3x10,L4x8,L5x3,L6x2 2-3 - 9/8 8 - 22 1 55 114'
  ];
  var TAGS = { t: 'tut', n: 'normal', p: 'pause', h: 'hard', v: 'vhard' };

  function parseRow(line, mode) {
    var f = line.split(' '), k = { L: +f[0], tag: TAGS[f[1]], shape: f[2], F0: +f[3], plan: {}, rueck: [1, 2], locks: null, belts: null, hbelt: null, types: +f[10], bunny: 0, silPermille: 0, silExact: 0, items: +f[13] };
    if (f[4] !== '-') f[4].split(',').forEach(function (p) { var m = /L(\d)x(\d+)/.exec(p); k.plan[+m[1]] = +m[2]; });
    if (f[5] !== '-') { var rr = f[5].split('-'); k.rueck = [+rr[0], +rr[1]]; }
    if (f[6] !== '-') { var lm = /(\d)xN(\d+)/.exec(f[6]); k.locks = { k: +lm[1], N: +lm[2] }; }
    if (f[7] !== '-') { var sb = f[7].split('/'); k.belts = { Nb: +sb[0], Wv: +sb[1], moving: mode === 'timed' || parseInt(f[8], 10) > 0 }; }
    if (f[9] !== '-') k.hbelt = f[9] === 'S' ? 'start' : +f[9];
    if (f[11] === '1') k.bunny = 'back'; else if (f[11] === 'B') k.bunny = 'belt';
    if (f[12] === '2S') k.silExact = 2; else if (f[12] !== '-') k.silPermille = +f[12];
    return k;
  }
  /** knobs(mode, L) -> the knob row of level L (table L1-60, formulas beyond; DESIGN 4.7). */
  function knobs(mode, L) {
    var table = mode === 'timed' ? TIMED : RELAXED;
    if (L >= 1 && L <= 60) return parseRow(table[L - 1], mode);
    var t = R.tag(L), band = Math.floor((L - 61) / 20), k;
    if (mode === 'timed') {
      k = { L: L, tag: t, shape: t === 'pause' ? 'A9' : 'A10', F0: t === 'pause' ? 5 : (t === 'normal' && L >= 121 ? 3 : 4), plan: {}, rueck: [1, 2], locks: null, belts: null, hbelt: null, types: Math.min(18, 16 + Math.floor((L - 61) / 40)), bunny: 0, silPermille: 0, silExact: 0, items: 0 };
      if (t === 'pause') k.plan = { 2: 9 };
      else { k.plan = { 2: 10, 3: 10, 4: Math.min(6, 1 + band) }; }
      if (t === 'hard') { k.plan[4] = Math.min(10, (k.plan[4] || 0) + 2); k.rueck = [1, 3]; }
      if (t === 'vhard') { k.plan[4] = Math.min(10, (k.plan[4] || 0) + 2); k.rueck = [2, 3]; if (L >= 121) k.plan[5] = 2; }
      if (t === 'normal') k.locks = { k: 2, N: L >= 121 ? 5 : 4 };
      k.belts = { Nb: 8 + R.hidden('timed', L), Wv: 8, moving: true };
      if (t === 'vhard') k.hbelt = 'start'; else if (t === 'hard') k.hbelt = 40; else if (t === 'normal' && (L >= 101 || R.idx(L) === 2 || R.idx(L) === 7)) k.hbelt = 50;
      if (t === 'hard' || t === 'vhard') k.bunny = 'back'; else if (R.idx(L) === 2) k.bunny = 'belt';
    } else {
      k = { L: L, tag: t, shape: 'A10', F0: t === 'pause' ? 4 : 3, plan: {}, rueck: [1, 2], locks: null, belts: { Nb: 9, Wv: 8, moving: R.speed100('relaxed', L) > 0 }, hbelt: null, types: Math.min(24, 22 + Math.floor((L - 61) / 50)), bunny: 0, silPermille: 0, silExact: 0, items: 0 };
      if (t === 'pause') k.plan = { 2: 10, 3: 5 };
      else {
        k.plan = { 2: 10, 3: 10, 4: Math.min(10, 8 + band), 5: Math.min(8, 3 + band), 6: Math.min(6, 1 + Math.floor((L - 61) / 30)) };
        if (t === 'hard') { k.plan[6] = Math.min(10, k.plan[6] + 1); k.rueck = [1, 3]; }
        if (t === 'vhard') { k.plan[6] = Math.min(10, k.plan[6] + 2); k.rueck = [2, 3]; }
        if (t === 'normal') k.locks = { k: 3, N: Math.min(6, 5 + Math.floor((L - 61) / 40)) };
      }
      if (t === 'hard' || t === 'vhard') k.bunny = 'back';
    }
    k.silPermille = 55 + Math.floor(195 * (L - 60) / (L - 60 + 300));
    if (t === 'pause') k.silPermille = Math.floor(k.silPermille / 2);
    return k;
  }
  function wband(L) { return L <= 60 ? 15 : 15 + Math.floor(9 * (L - 60) / (L - 60 + 200)); }
  function confusablePairs(mode, L) {
    if (mode === 'timed') return L < 31 ? 0 : L < 61 ? 1 : L < 151 ? 2 : 3;
    return L < 21 ? 0 : L < 31 ? 1 : L < 46 ? 2 : L < 61 ? 3 : L < 101 ? 3 : 4;
  }

  // ---------- banded deal (DESIGN 3.3.1) ----------
  function capItems(mode) { return mode === 'timed' ? 110 : 120; }
  /** bandedDeal(k, mode, rng, relax) -> level spec with type codes, or null. relax = { F0: +n, deep: -n, locks: -n }. */
  function bandedDeal(k, mode, rng, relax) {
    relax = relax || {};
    var lay = R.layout(k.shape), Cn = lay.length, ci, li, s;
    var F0 = k.F0 + (relax.F0 || 0);
    var lockCount = k.locks ? Math.max(0, k.locks.k - (relax.locks || 0)) : 0;
    // which compartments are locked: full fronts, no bunny; chosen at random
    var order = rng.shuffle(lay.map(function (_, i) { return i; }));
    var locked = {}, lockAt = {};
    for (var q = 0; q < lockCount && q < Cn - 1; q++) { locked[order[q]] = 1; lockAt[order[q]] = k.locks.N + q; }
    // layers per compartment: nested plan (a compartment with layer 3 also has layer 2)
    var depth = [];
    for (ci = 0; ci < Cn; ci++) depth.push(1);
    var maxLayer = 1;
    for (var lk = 2; lk <= 6; lk++) if (k.plan[lk]) maxLayer = lk;
    var cand = rng.shuffle(lay.map(function (_, i) { return i; }));
    for (lk = 2; lk <= maxLayer; lk++) {
      var want = Math.min(Cn, k.plan[lk] || 0), got = 0;
      var pref = cand.filter(function (i) { return depth[i] === lk - 1; });
      for (var p = 0; p < pref.length && got < want; p++) { depth[pref[p]] = lk; got += 1; }
    }
    // front holes: F0 empty slots over unlocked compartments, at most 2 per compartment (G1)
    var holes = [], unlocked = lay.map(function (_, i) { return i; }).filter(function (i) { return !locked[i]; });
    var perComp = {};
    var tries = 0;
    while (holes.length < F0 && tries++ < 500) {
      var hc = rng.pick(unlocked);
      if ((perComp[hc] || 0) >= 2) continue;
      perComp[hc] = (perComp[hc] || 0) + 1; holes.push(hc);
    }
    if (holes.length < F0) return null;
    // sizes of every layer
    var sizes = [];                                          // sizes[ci][li]
    for (ci = 0; ci < Cn; ci++) {
      var arr = [3 - (perComp[ci] || 0)];
      for (li = 2; li <= depth[ci]; li++) {
        var lo = li <= 3 ? k.rueck[0] : 1, hi = li <= 3 ? k.rueck[1] : 2;
        if (relax.deep && li >= 4) hi = Math.max(1, hi - relax.deep);
        arr.push(rng.range(lo, Math.max(lo, hi)));
      }
      sizes.push(arr);
    }
    // belts
    var belts = [];
    if (k.belts) {
      var Nb = k.belts.Nb;
      belts.push({ id: 'L', axis: 'y', appearAt: 0, n: Nb }); belts.push({ id: 'R', axis: 'y', appearAt: 0, n: Nb });
    }
    var beltItems = 0;
    belts.forEach(function (bt) { beltItems += bt.n; });
    var bunnyOnBelt = k.bunny === 'belt' && belts.length > 0;
    if (bunnyOnBelt) beltItems -= 1;
    var total = beltItems;
    for (ci = 0; ci < Cn; ci++) for (li = 0; li < sizes[ci].length; li++) total += sizes[ci][li];
    // the horizontal belt (timed): its share of matches decides appearAt; cells 8 (Wv 5)
    var hItems = 0;
    if (k.hbelt !== null && k.hbelt !== undefined) { hItems = 8; total += hItems; }
    // item cap: trim from the deepest layers first (DESIGN 4.7 "trimmed from the deepest layer")
    var cap = capItems(mode), trimGuard = 0;
    while (total > cap && trimGuard++ < 300) {
      var deepest = -1, dci = -1;
      for (ci = 0; ci < Cn; ci++) { var dl = sizes[ci].length - 1; if (dl >= 1 && dl > deepest) { deepest = dl; dci = ci; } }
      if (dci < 0) break;
      if (sizes[dci][deepest] > 1) { sizes[dci][deepest] -= 1; total -= 1; }
      else { sizes[dci].pop(); total -= 1; }
    }
    if (total > cap) return null;
    // make the total a multiple of 3 by +-1 on random back layers (never below 1), else on belts
    var guard = 0;
    while (total % 3 !== 0 && guard++ < 200) {
      var cands = [];
      for (ci = 0; ci < Cn; ci++) for (li = 1; li < sizes[ci].length; li++) cands.push([ci, li]);
      if (!cands.length) { if (!belts.length) return null; var bb = belts[rng.int(belts.length)]; if (bb.n > 2) { bb.n -= 1; total -= 1; beltItems -= 1; } else return null; continue; }
      var pick = rng.pick(cands), up = (3 - total % 3 === 1) || rng.int(2) === 0;
      if (up && sizes[pick[0]][pick[1]] < 3) { sizes[pick[0]][pick[1]] += 1; total += 1; }
      else if (sizes[pick[0]][pick[1]] > 1) { sizes[pick[0]][pick[1]] -= 1; total -= 1; }
    }
    if (total % 3 !== 0 || total > capItems(mode) + 6) return null;
    // the deal sequence: t1 t1 t1 t2 t2 t2 ... (types round robin; extra triples become 6-copy types)
    var T = Math.min(k.types, CODES.length), triples = total / 3, seq = [];
    for (var tr = 0; tr < triples; tr++) { var code = CODES[tr % T]; seq.push(code, code, code); }
    // rack slots sorted shallow first with jitter, belt positions spread evenly through the sequence
    var slots = [];
    for (ci = 0; ci < Cn; ci++) for (li = 0; li < sizes[ci].length; li++) for (s = 0; s < sizes[ci][li]; s++) slots.push({ ci: ci, li: li, key: li * 1000 + Math.floor(rng.int(1000) * 0.6) });
    slots.sort(function (a, b) { return a.key - b.key; });
    var W = wband(k.L), step = Math.max(1, Math.floor(W / 2));
    for (var w0 = 0; w0 + 1 < seq.length; w0 += step) {                // local shuffle in windows
      var end = Math.min(seq.length, w0 + W);
      for (var i = end - 1; i > w0; i--) { var j = w0 + rng.int(i - w0 + 1), tmp = seq[i]; seq[i] = seq[j]; seq[j] = tmp; }
    }
    var beltSeq = [], rackSeq = [], nBelt = beltItems + hItems;
    if (nBelt > 0) {
      var every = seq.length / nBelt, marks = {}, m;
      for (m = 0; m < nBelt; m++) { var pos = Math.min(seq.length - 1, Math.floor(m * every + rng.int(Math.max(1, Math.floor(every))))); while (marks[pos]) pos = (pos + 1) % seq.length; marks[pos] = 1; }
      for (var z = 0; z < seq.length; z++) (marks[z] ? beltSeq : rackSeq).push(seq[z]);
    } else rackSeq = seq;
    if (rackSeq.length !== slots.length) return null;
    // place into layers
    var comps = [];
    for (ci = 0; ci < Cn; ci++) { var layers = []; for (li = 0; li < sizes[ci].length; li++) layers.push([null, null, null]); comps.push({ layers: layers, lockAt: lockAt[ci] || 0, row: lay[ci].row, col: lay[ci].col }); }
    var fillIdx = {};
    for (var si = 0; si < slots.length; si++) {
      var sl = slots[si], key = sl.ci + '/' + sl.li, pos2 = fillIdx[key] || 0;
      // front holes: put items into the first (3 - holes) positions, later shuffled per layer for variety
      comps[sl.ci].layers[sl.li][pos2] = rackSeq[si]; fillIdx[key] = pos2 + 1;
    }
    comps.forEach(function (c) { c.layers.forEach(function (layer) { rng.shuffle(layer); }); });
    // belts: cells in order L, R, (H); the belt bunny replaces one cell
    var bi = 0, cellsPer = belts.map(function (bt) { return []; });
    var hCells = [];
    for (var e = 0; e < beltSeq.length; e++) {
      if (e < beltItems) { var target = bi % belts.length; cellsPer[target].push(beltSeq[e]); bi += 1; }
      else hCells.push(beltSeq[e]);
    }
    if (bunnyOnBelt) { cellsPer[rng.int(belts.length)].splice(rng.int(belts[0].n - 1), 0, BUNNY); }
    var beltSpecs = belts.map(function (bt, i) { return { id: bt.id, axis: bt.axis, appearAt: 0, cells: cellsPer[i] }; });
    if (hItems) {
      var hAppear = 0;
      if (k.hbelt !== 'start') hAppear = Math.max(1, Math.floor(k.hbelt * triples / 100));
      beltSpecs.push({ id: 'H', axis: 'x', appearAt: hAppear, cells: hCells });
    }
    // bunny in a back layer 1-3 (a free position; else a random position of a 1-2 item layer gets widened)
    if (k.bunny === 'back') {
      var spots = [];
      comps.forEach(function (c, i) { if (c.lockAt) return; for (li = 1; li < Math.min(4, c.layers.length); li++) for (s = 0; s < 3; s++) if (c.layers[li][s] === null) spots.push([i, li, s]); });
      if (!spots.length) return null;
      var sp = rng.pick(spots); comps[sp[0]].layers[sp[1]][sp[2]] = BUNNY;
    }
    return { shape: k.shape, tag: k.tag, n: k.L, comps: comps, belts: beltSpecs, types: T, F0: F0, items: total, locks: lockCount };
  }

  // ---------- invariants G1-G11 (DESIGN 3.3.2) ----------
  function invariants(level, mode) {
    var errs = [], counts = {}, ci, li, s, t;
    level.comps.forEach(function (c, i) {
      var front = c.layers[0], n = 0;
      for (s = 0; s < 3; s++) if (front[s] !== null) n += 1;
      if (n === 0) errs.push('G1 front empty ' + i);
      if (c.lockAt && n !== 3) errs.push('G6 locked not full ' + i);
      if (c.layers.length > 6) errs.push('G8 depth ' + i);
      c.layers.forEach(function (layer, k) {
        var cnt = {}, items = 0;
        for (s = 0; s < 3; s++) { t = layer[s]; if (t === null) continue; items += 1; if (t === BUNNY) { if (c.lockAt) errs.push('G6 bunny in lock ' + i); if (k === 0 || k > 3) errs.push('G7 bunny layer ' + k); continue; } cnt[t] = (cnt[t] || 0) + 1; counts[t] = (counts[t] || 0) + 1; }
        for (var u in cnt) if (cnt[u] >= 3) errs.push('G3 triple ' + i + '/' + k);
        if (k >= 3 && items > 2) errs.push('G8 deep layer ' + i + '/' + k + ' holds ' + items);
      });
    });
    (level.belts || []).forEach(function (bt) {
      bt.cells.forEach(function (cell) { if (cell !== BUNNY) counts[cell] = (counts[cell] || 0) + 1; });
      if (bt.id !== 'H' && bt.cells.length < 1) errs.push('G5 empty belt');
    });
    var total = 0, T = 0;
    for (t in counts) { T += 1; total += counts[t]; if (counts[t] % 3 !== 0) errs.push('G2 count ' + t + '=' + counts[t]); }
    if (T > 24) errs.push('G9 types ' + T);
    if (total > capItems(mode)) errs.push('G10 items ' + total);
    var b = B.createBoard(level);
    if (B.totalFree(b) < 1) errs.push('G4 no free slot');
    if (!B.progressPossible(b)) errs.push('G4 no progress at start');
    return errs;
  }

  // ---------- the gate (DESIGN 3.3) ----------
  /** gate(level, nodeBudget, playoutCount, rng) -> { witness, nodes } or null. The witness is verified through board.js. */
  function gate(level, nodeBudget, playoutCount, rng) {
    var b = B.createBoard(level), st = SOL.compile(b);
    var r = SOL.solveP(st, nodeBudget, 4);
    if (r.solved === null) { var p = SOL.playouts(st, playoutCount, rng, 120); if (p.best) r = { solved: true, path: p.best.path, nodes: r.nodes }; }
    if (!r.solved) return null;
    var witness = SOL.witnessToTypes(st, r.path);
    var v = SOL.verify(b, witness);
    if (!v.ok) throw new Error('solver/rules mismatch at ' + v.at + ': ' + v.reason);
    return { witness: witness, nodes: r.nodes };
  }
  /** shorten(level, witness, rng, playoutCount) -> the shortest verified witness among playouts (bake only). */
  function shorten(level, witness, rng, playoutCount) {
    var b = B.createBoard(level), st = SOL.compile(b), best = witness;
    var p = SOL.playouts(st, playoutCount || 31, rng, 120);
    if (p.best && p.best.moves < best.length) { var w = SOL.witnessToTypes(st, p.best.path); if (SOL.verify(b, w).ok) best = w; }
    return best;
  }
  /** winRate(level, rng, count) -> agent win rate over noisy playouts (acceptance metric). */
  function winRate(level, rng, count) { var st = SOL.compile(B.createBoard(level)); return SOL.playouts(st, count || 40, rng, 120).rate; }
  var WINDOWS = [[1, 20, { normal: [85, 100], hard: [70, 95], vhard: [55, 90], pause: [95, 100], tut: [95, 100] }],
    [21, 40, { normal: [70, 100], hard: [50, 85], vhard: [35, 75], pause: [90, 100] }],
    [41, 60, { normal: [55, 90], hard: [35, 70], vhard: [20, 55], pause: [85, 100] }],
    [61, 1e9, { normal: [45, 85], hard: [25, 65], vhard: [12, 45], pause: [80, 100] }]];
  function window_(L, tag) { for (var i = 0; i < WINDOWS.length; i++) if (L >= WINDOWS[i][0] && L <= WINDOWS[i][1]) return WINDOWS[i][2][tag] || WINDOWS[i][2].normal; return [0, 100]; }

  /** generate(mode, n, opts) -> { level, witness, par, attempt, nodes, rate } or null.
   *  opts: { attempts (12), nodes (30000), playouts (64), windows (false), relax: ladder on/off (true) } */
  function generate(mode, n, opts) {
    opts = opts || {};
    var attempts = opts.attempts || 12, nodes = opts.nodes || 30000, pcount = opts.playouts || 64;
    var k = knobs(mode, n), ladder = [{}, { F0: 1 }, { F0: 1, deep: 1 }, { F0: 1, deep: 1, locks: 1 }];
    for (var step = 0; step < (opts.relax === false ? 1 : ladder.length); step++) {
      for (var a = 0; a < attempts; a++) {
        var seed = 'gen' + (C.GEN_VERSION || 1) + '-' + mode + '-' + n + '-' + (step * 1000 + a);
        var rng = RNG.create(seed);
        var level = bandedDeal(k, mode, rng, ladder[step]);
        if (!level) continue;
        if (invariants(level, mode).length) continue;
        var g = gate(level, nodes, pcount, rng);
        if (!g) continue;
        var rate = -1;
        if (opts.windows) {
          rate = Math.round(winRate(level, RNG.create(seed + '-win'), 40) * 100);
          var win = window_(n, k.tag);
          if (rate < win[0] || rate > win[1]) continue;
        }
        var witness = opts.windows ? shorten(level, g.witness, RNG.create(seed + '-short'), 31) : g.witness;
        var par = Math.ceil(1.25 * witness.length);
        level.par = par; level.relax = step; level.attempt = a;
        return { level: level, witness: witness, par: par, attempt: a, relax: step, nodes: g.nodes, rate: rate, knobs: k };
      }
    }
    return null;
  }

  /** remix(level, witness, seed) -> { level, witness }: relabel types and mirror columns; the witness is transformed alongside. */
  function remix(level, witness, seed) {
    var rng = RNG.create(seed), codes = [], seen = {};
    level.comps.forEach(function (c) { c.layers.forEach(function (l) { l.forEach(function (t) { if (t && t !== BUNNY && !seen[t]) { seen[t] = 1; codes.push(t); } }); }); });
    (level.belts || []).forEach(function (bt) { bt.cells.forEach(function (t) { if (t && t !== BUNNY && !seen[t]) { seen[t] = 1; codes.push(t); } }); });
    var perm = rng.shuffle(codes.slice()), map = {};
    codes.forEach(function (c, i) { map[c] = perm[i]; });
    var mirror = rng.int(2) === 1;
    function mt(t) { return t === null || t === BUNNY ? t : map[t]; }
    var out = { shape: level.shape, tag: level.tag, n: level.n, types: level.types, F0: level.F0, items: level.items, locks: level.locks, par: level.par,
      comps: level.comps.map(function (c) { return { layers: c.layers.map(function (l) { return l.map(mt); }), lockAt: c.lockAt, row: c.row, col: mirror && c.col !== 'c' ? 1 - c.col : c.col }; }),
      belts: (level.belts || []).map(function (bt) { return { id: bt.id, axis: bt.axis, appearAt: bt.appearAt, cells: bt.cells.map(mt) }; }) };
    var w = witness.map(function (m) { return [m[0], mt(m[1]), m[2]]; });
    return { level: out, witness: w };
  }

  var gen = { knobs: knobs, wband: wband, confusablePairs: confusablePairs, bandedDeal: bandedDeal, invariants: invariants, gate: gate, shorten: shorten, winRate: winRate, generate: generate, remix: remix, CODES: CODES, BUNNY: BUNNY };
  SS.gen = gen;
  if (typeof module !== 'undefined' && module.exports) module.exports = gen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
