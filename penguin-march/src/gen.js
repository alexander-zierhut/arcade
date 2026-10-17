// src/gen.js: procedural levels for n > AUTHORED_LEVELS, forever. generate(n) is deterministic (the seed is the
// level number) and returns the same def shape levels.js decodes from the authored strings, with relative numbers
// that calibrate.js fixes by playing the level. Difficulty comes from knobs.js; this file only places things.
// Every generated level is checked by the greedy bot in the tests. Pure.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);
  var knobs = PM.knobs || (typeof require === 'function' ? require('./knobs.js') : null);

  function between(rnd, range) { return range[0] + rnd() * (range[1] - range[0]); }
  function pickInt(rnd, range) { return range[0] + Math.floor(rnd() * (range[1] - range[0] + 1)); }
  function choice(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function gate(z, left, right, pair) {
    var l = { type: 'gate', z: z, x: -0.5, w: 0.5, op: left.op, pair: pair };
    var r = { type: 'gate', z: z, x: 0.5, w: 0.5, op: right.op, pair: pair };
    if (left.valRel != null) l.valRel = left.valRel; else l.val = left.val;
    if (right.valRel != null) r.valRel = right.valRel; else r.val = right.val;
    return [l, r];
  }

  function generate(n) {
    var K = knobs(n);
    var rnd = C.rng(n * 7919 + 13);
    var def = { n: n, tag: K.riot ? 'riot' : 'gen', length: K.length, bossSecs: K.riot ? K.riotBossSecs : K.bossSecs, riot: K.riot, entities: [] };
    var es = def.entities, pair = 0;
    var first = 16, last = K.length - C.BOSS_DIST - 8;

    if (K.riot) {
      // the show: two absurd gates, a long fish chain, toy threats, another absurd gate, a boss that melts
      es.push.apply(es, gate(first, { op: 'x', val: K.riotMul }, { op: '+', val: K.riotAdd }, ++pair));
      es.push.apply(es, gate(first + 14, { op: '+', val: Math.round(K.riotAdd / 2) }, { op: 'x', val: 10 }, ++pair));
      var fz = first + 28, lane = choice(rnd, [-0.5, 0, 0.5]);
      for (var i = 0; i < K.riotFish; i++) es.push({ type: 'fish', z: Math.round((fz + i * C.FISH_GAP) * 1000) / 1000, x: lane, w: 0.22 });
      var z = fz + K.riotFish * C.FISH_GAP + 10;
      while (z < last - 20) {
        var r = rnd();
        if (r < 0.4) es.push.apply(es, gate(z, { op: 'x', val: pickInt(rnd, [2, 5]) }, { op: '+', val: pickInt(rnd, [200, 900]) }, ++pair));
        else if (r < 0.7) es.push({ type: 'pack', z: z, x: 0, w: 1, hpRel: 0.1 });
        else es.push({ type: 'wall', z: z, x: choice(rnd, [-0.5, 0.5]), w: 0.5, hpRel: 0.1 });
        z += 16;
      }
      es.push.apply(es, gate(Math.min(z, last), { op: 'x', val: 3 }, { op: 'x', val: 4 }, ++pair));
      return def;
    }

    // a regular level: rows every ~gap units, mixed by weights; the first rows only build the waddle up,
    // never two packs in a row, the last row is a gate so the boss is met with a choice made
    var gap = (last - first) / (K.rows - 1);
    var prev = '', muls = 0;
    for (var row = 0; row < K.rows; row++) {
      var zr = Math.round(first + row * gap + (rnd() - 0.5) * gap * 0.3);
      var kind;
      if (row === 0 || row === K.rows - 1) kind = 'gate';
      else if (row < 3) kind = choice(rnd, ['gate', 'fish', 'ally', 'gate']);
      else {
        var w = rnd();
        kind = w < 0.36 ? 'gate' : w < 0.56 ? 'wall' : w < 0.74 ? 'pack' : w < 0.86 ? 'ally' : 'fish';
        if (kind === 'pack' && prev === 'pack') kind = 'gate';
        if (kind === 'fish' && prev === 'fish') kind = 'wall';
      }
      prev = kind;
      var late = row / (K.rows - 1);                                  // 0 at the start, 1 at the end: threats grow along the road
      if (kind === 'gate') {
        var mul = rnd() < K.mulChance && muls < K.maxMuls;
        if (mul) muls++;
        var good = mul ? { op: 'x', val: rnd() < 0.15 ? 3 : 2 } : { op: '+', valRel: r2(between(rnd, K.gateAdd)) };
        var style = row < 4 ? rnd() * 0.85 : rnd();                                           // no lesser-evil gates early
        var bad = rnd() < 0.3 ? { op: '/', val: 2 } : { op: '-', valRel: r2(between(rnd, K.gateSub)) };
        var l, rr;
        if (style < 0.7) { l = good; rr = bad; }                                                // one good, one bad
        else if (style < 0.85) { l = good; rr = { op: '+', valRel: r2(between(rnd, K.gateAdd) * 0.5) }; }   // both good, one better
        else { l = { op: '/', val: 2 }; rr = { op: '-', valRel: r2(K.gateSub[0]) }; }            // lesser evil: halve or lose a little
        if (rnd() < 0.5) { var tmp = l; l = rr; rr = tmp; }
        es.push.apply(es, gate(zr, l, rr, ++pair));
      } else if (kind === 'wall') {
        var full = rnd() < 0.4;
        var share = full ? between(rnd, K.wallShare) : between(rnd, K.laneShare);
        es.push({ type: 'wall', z: zr, x: full ? 0 : choice(rnd, [-0.5, 0.5]), w: full ? 1 : 0.5, hpRel: r2(share * (0.6 + 0.4 * late)) });
      } else if (kind === 'pack') {
        var fullP = rnd() < 0.5;
        var pshare = fullP ? between(rnd, K.packShare) : between(rnd, K.laneShare);
        es.push({ type: 'pack', z: zr, x: fullP ? 0 : choice(rnd, [-0.5, 0.5]), w: fullP ? 1 : 0.5, hpRel: r2(pshare * (0.6 + 0.4 * late)) });
      } else if (kind === 'ally') {
        var ally = { type: 'ally', z: zr, x: choice(rnd, [-0.5, 0.5]), w: 0.3, hpRel: r2(between(rnd, K.allyLock)) };
        if (rnd() < 0.2) ally.gift = 'big'; else ally.giftRel = r2(between(rnd, K.allyGift));
        es.push(ally);
      } else {
        var count = Math.min(pickInt(rnd, K.fishChain), Math.floor((last - zr) / C.FISH_GAP) + 1), lx = choice(rnd, [-0.5, 0, 0.5]);
        for (var f = 0; f < count; f++) es.push({ type: 'fish', z: Math.round((zr + f * C.FISH_GAP) * 1000) / 1000, x: lx, w: 0.22 });
      }
    }
    return def;
  }

  PM.gen = { generate: generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = PM.gen;
})(typeof window !== 'undefined' ? window : globalThis);
