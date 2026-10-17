// src/game/spawn.js: a part of CM.game. Seeded RNG and the spawn draw (DESIGN 2.7).
// rngNext (mulberry32 over g.rng), pickWeighted (5-entry weight arrays), drawSpawn.
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js') }
    : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.spawn = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var SP = (deps.config && deps.config.SPAWN) || {};
  var OPENING = num(SP.OPENING, 2);
  var TOP = 5;                                             // highest tier the launcher can ever hold
  var WEIGHTS = pad(SP.WEIGHTS && SP.WEIGHTS.length >= 5 ? SP.WEIGHTS : [0, 40, 30, 20, 10]);
  var STAGES = (SP.STAGES || []).map(function (st) { return { from: num(st.from, 99), weights: pad(st.weights || WEIGHTS) }; })
    .sort(function (a, b) { return a.from - b.from; });
  var MIN_CAP = num(SP.MIN_CAP, 2);
  var UNLOCK_TOP = 4;                                      // tiers 1-4 unlock with highestTier; tier 5 only via STAGES
  var T1_DROUGHT = num(SP.T1_DROUGHT, 7);
  var MAX_REPEAT = num(SP.MAX_REPEAT, 3);
  var HISTORY = num(SP.HISTORY, 8);

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function pad(w) { var o = w.slice(0, TOP + 1); o[0] = 0; while (o.length <= TOP) o.push(0); return o; }

  // Weights for the current progress: WEIGHTS, replaced by the last STAGES entry whose `from` is reached.
  function stageWeights(highestTier) {
    var w = WEIGHTS;
    for (var i = 0; i < STAGES.length; i++) if (highestTier >= STAGES[i].from) w = STAGES[i].weights;
    return w.slice(0, TOP + 1);
  }

  // mulberry32: advances the uint32 state g.rng and returns a float in [0, 1).
  function rngNext(g) {
    var a = (g.rng + 0x6D2B79F5) | 0;
    g.rng = a >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // w is indexed by tier (5 or 6 entries, w[0] = 0). Returns a tier 1..(w.length-1).
  function pickWeighted(w, u) {
    var top = w.length - 1, s = 0, t;
    for (t = 1; t <= top; t++) s += w[t];
    if (!(s > 0)) return 1;
    u *= s;
    for (t = 1; t <= top; t++) {
      if (u < w[t]) return t;
      u -= w[t];
    }
    for (var k = top; k >= 1; k--) if (w[k] > 0) return k;   // float edge
    return 1;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function record(g, t) {
    var h = g.spawnHistory;
    h.push(t);
    while (h.length > HISTORY) h.shift();
    g.spawnCount += 1;
    return t;
  }

  function lastNEqual(h, n, t) {
    if (h.length < n) return false;
    for (var i = h.length - n; i < h.length; i++) if (h[i] !== t) return false;
    return true;
  }

  function noOneInLast(h, n) {
    if (h.length < n) return false;
    for (var i = h.length - n; i < h.length; i++) if (h[i] === 1) return false;
    return true;
  }

  // drawSpawn(g) -> tier 1..5, in exactly the order of DESIGN 2.7 (tier 5 only once a STAGE is reached).
  function drawSpawn(g) {
    var h = g.spawnHistory;
    var script = g.rules && g.rules.spawnScript;
    // 1. script (tests only)
    if (script && script.length) return record(g, script[g.spawnCount % script.length]);
    // 2. opening
    if (g.spawnCount < OPENING) return record(g, 1);
    // 3. progressive unlock (tiers 1-4 follow highestTier; tier 5 comes only from a reached STAGE)
    var cap = clamp(g.highestTier, MIN_CAP, UNLOCK_TOP);
    var shift = (g.rules && typeof g.rules.STAGE_SHIFT === 'number') ? g.rules.STAGE_SHIFT : 0;
    var w = stageWeights(g.highestTier + shift);        // Standard reaches each stage one tier earlier (2.13)
    for (var k = cap + 1; k <= UNLOCK_TOP; k++) w[k] = 0;
    // 4. draw
    var t = pickWeighted(w, rngNext(g));
    // 5. repeat rules
    var last = h.length ? h[h.length - 1] : 0;
    if (t >= 4 && last === t) {
      w[t] = 0;                                         // rule A: no back-to-back big glass (4 or 5)
      t = pickWeighted(w, rngNext(g));
    } else if (lastNEqual(h, MAX_REPEAT, t)) {
      w[t] = 0;                                         // rule B: no 4 equal in a row
      t = pickWeighted(w, rngNext(g));
    }
    if (noOneInLast(h, T1_DROUGHT)) t = 1;              // rule C: T1 drought
    // 6. record
    return record(g, t);
  }
  /* @pure-end */
  return { rngNext: rngNext, pickWeighted: pickWeighted, drawSpawn: drawSpawn, stageWeights: stageWeights };
});
