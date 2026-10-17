// src/game/merge.js (a part of CM.game)
// Merge rule (DESIGN 2.6), the first-win bonus (2.9) and the jug burst (2.10).
// Runs after physics.stepWorld in every tick (5.6 step 5).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js'), physics: require('../physics.js') }
    : { config: root.CM.config, physics: root.CM.physics };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.merge = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var bombMod = null;
  function bombPart() {
    if (bombMod) return bombMod;
    if (typeof module === 'object' && module && module.exports) { try { bombMod = require('./bomb.js'); } catch (e) { bombMod = null; } }
    else bombMod = (typeof CM !== 'undefined' && CM.gameParts && CM.gameParts.bomb) || null;
    return bombMod;
  }
  var config = deps.config;
  var physics = deps.physics;
  var MAX_TIER = 9;

  // Reused scratch storage: candidates are rare, so this only avoids per-tick garbage.
  var cand = [];      // candidate pair records {a, b, tier, hi, lo}
  var nCand = 0;

  // ---- scoring -----------------------------------------------------------

  // mult(d) = min(MULT_MAX, 1 + MULT_STEP * (d - 1)) under a rules object. The game uses
  // g.rules, so createGame overrides of MULT_* apply to merges, the win and the jug burst alike.
  function mult(rules, depth) {
    return Math.min(rules.MULT_MAX, 1 + rules.MULT_STEP * (depth - 1));
  }

  // Public (5.5, no g): the config defaults, mult(d) = min(4, 1 + 0.5 * (d - 1)).
  function multiplier(depth) { return mult(config.RULES, depth); }

  // round(BASE[tier] * mult(depth)); BASE comes from the tier table (2.5).
  function pointsFor(tier, depth) {
    return Math.round(config.TIERS[tier].points * multiplier(depth));
  }

  // ---- eligibility (tier, age and win rules; not distance) --------------

  function isMergeEligible(g, a, b) {
    var immune = g.rules.MERGE_IMMUNE_TICKS;
    if (a.tier !== b.tier) return false;
    if (!(a.bornTick < 0 || a.age >= immune)) return false;   // merge-born bodies are immune
    if (!(b.bornTick < 0 || b.age >= immune)) return false;   // launched bodies: from age 0
    if (a.tier < MAX_TIER) return true;
    return !!g.wonOnce && a.age >= immune && b.age >= immune && g.tick >= g.dangerSuspendUntil;
  }

  // Lineage depth a parent passes on: only merge-born parents inside the chain span count.
  function parentDepth(g, p) {
    return (p.bornTick >= 0 && g.tick - p.bornTick < g.rules.CHAIN_WINDOW_TICKS) ? p.chainDepth : 0;
  }

  // ---- candidate collection and ordering --------------------------------

  function pushCandidate(a, b) {
    var c = cand[nCand];
    if (!c) { c = { a: null, b: null, tier: 0, hi: 0, lo: 0 }; cand[nCand] = c; }
    c.a = a; c.b = b; c.tier = a.tier;
    c.hi = a.id > b.id ? a.id : b.id;
    c.lo = a.id > b.id ? b.id : a.id;
    nCand += 1;
  }

  // tier ascending, newest glass first (max id descending), then min id ascending.
  function compareCandidates(p, q) {
    if (p.tier !== q.tier) return p.tier - q.tier;
    if (p.hi !== q.hi) return q.hi - p.hi;
    return p.lo - q.lo;
  }

  function collectCandidates(g) {
    var bodies = g.bodies;
    var n = bodies.length;
    var eps = g.rules.TOUCH_EPS;
    nCand = 0;
    for (var i = 0; i < n; i++) {
      var a = bodies[i];
      for (var j = i + 1; j < n; j++) {
        var b = bodies[j];
        if (a.tier !== b.tier) continue;
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var reach = a.r + b.r + eps;
        if (Math.sqrt(dx * dx + dy * dy) > reach) continue;
        if (!isMergeEligible(g, a, b)) continue;
        pushCandidate(a, b);
      }
    }
  }

  // ---- helpers for applying one accepted pair ---------------------------

  function removeBody(g, body) {
    var bodies = g.bodies;
    for (var i = 0; i < bodies.length; i++) {
      if (bodies[i] === body) { bodies.splice(i, 1); return; }
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Every body not used and not created this tick, within range, is pushed away from the midpoint
  // (2.6). The growth itself moves neighbours kinematically (physics 1b), so this is the only kick.
  function shove(g, mx, my, newTier, used, createdIds) {
    var rules = g.rules;
    var rNew = rules.RADII[newTier];
    var bodies = g.bodies;
    for (var i = 0; i < bodies.length; i++) {
      var o = bodies[i];
      if (used.indexOf(o) >= 0 || createdIds.indexOf(o.id) >= 0) continue;
      var range = rNew + o.r + rules.SHOVE_PAD;
      var dx = o.x - mx;
      var dy = o.y - my;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d >= range) continue;
      var nx = 1;
      var ny = 0;
      if (d > 1e-9) { nx = dx / d; ny = dy / d; }
      // Gentle and clamped: the shove never raises the outward speed above SHOVE_V.
      var vn = o.vx * nx + o.vy * ny;
      var dv = rules.SHOVE_V * (1 - d / range);
      if (vn + dv > rules.SHOVE_V) dv = rules.SHOVE_V - vn;
      if (dv <= 0) continue;
      o.vx += nx * dv;
      o.vy += ny * dv;
    }
  }

  // Birth radius (2.6, revision 4): the larger parent's radius, reduced so the newborn starts
  // overlap-free against every other body (walls are left to the position clamp), but never
  // below R0_MIN of it. The growth to R[tier + 1] then pushes neighbours aside kinematically.
  function birthRadius(g, a, b, mx, my) {
    var rMax = a.r > b.r ? a.r : b.r;
    var r0 = rMax;
    var bodies = g.bodies;
    for (var i = 0; i < bodies.length; i++) {
      var o = bodies[i];
      if (o === a || o === b) continue;
      var dx = o.x - mx;
      var dy = o.y - my;
      var free = Math.sqrt(dx * dx + dy * dy) - o.r;
      if (free < r0) r0 = free;
    }
    var floor = rMax * g.rules.R0_MIN;
    return r0 > floor ? r0 : floor;
  }

  function discover(g, tier, ev) {
    var bit = 1 << (tier - 1);
    if ((g.runMask & bit) === 0) {
      g.runMask |= bit;
      ev.push({ type: 'discover', tier: tier });
    }
  }

  // First tier-9 of a run (2.9): bonus, suspension of the danger rule.
  function win(g, body, depth, ev) {
    var rules = g.rules;
    var points = Math.round(rules.WIN_BONUS * mult(rules, depth));
    ev.push({ type: 'win', id: body.id, points: points });
    g.score += points;
    g.wonOnce = true;
    g.dangerTicks = 0;
    g.dangerTickEmitted = -1;
    g.dangerSuspendUntil = g.tick + rules.WIN_SUSPEND_TICKS;
  }

  // Two tier-9 jugs (2.10): both removed, no body created.
  function jugBurst(g, a, b, depth, ev) {
    var points = Math.round(g.rules.JUG_BURST * mult(g.rules, depth));
    var x = (a.x + b.x) / 2;
    var y = (a.y + b.y) / 2;
    removeBody(g, a);
    removeBody(g, b);
    g.score += points;
    ev.push({ type: 'jugBurst', a: a.id, b: b.id, x: x, y: y, depth: depth, points: points });
    if (bombPart()) bombPart().earnBomb(g, ev);           // owner: two Sangrias earn a bomb
  }

  function mergePair(g, a, b, depth, used, createdIds, ev) {
    var rules = g.rules;
    var tier = a.tier + 1;
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2;
    var r0 = birthRadius(g, a, b, mx, my);
    var x = clamp(mx, r0, rules.W - r0);
    var y = clamp(my, r0, rules.L - r0);
    var ma = physics.massOf(a.r);
    var mb = physics.massOf(b.r);
    var keep = rules.MERGE_VEL_KEEP;
    var vx = (a.vx * ma + b.vx * mb) / (ma + mb) * keep;
    var vy = (a.vy * ma + b.vy * mb) / (ma + mb) * keep;

    var body = physics.makeBody(g.nextId, tier, x, y, vx, vy, rules.RADII[tier], r0);
    g.nextId += 1;
    body.px = x;
    body.py = y;
    body.age = 0;
    body.cleared = true;
    body.launched = false;
    body.bornTick = g.tick;
    body.chainDepth = depth;
    createdIds.push(body.id);

    shove(g, mx, my, tier, used, createdIds);

    // Bookkeeping, in the normative order.
    removeBody(g, a);
    removeBody(g, b);
    g.bodies.push(body);          // new ids are the largest, so id order is kept
    g.merges += 1;
    var points = Math.round(config.TIERS[tier].points * mult(rules, depth));
    g.score += points;
    ev.push({
      type: 'merge', a: a.id, b: b.id, id: body.id, tier: tier, x: x, y: y,
      ax: a.x, ay: a.y, bx: b.x, by: b.y, depth: depth, points: points
    });
    discover(g, tier, ev);
    if (tier > g.highestTier) g.highestTier = tier;
    if (tier === MAX_TIER && !g.wonOnce) win(g, body, depth, ev);
  }

  // ---- the merge pass ------------------------------------------------------

  function resolveMerges(g, ev) {
    collectCandidates(g);
    if (nCand === 0) return;

    var list = cand.slice(0, nCand);
    list.sort(compareCandidates);

    // Greedy disjoint matching over the sorted list.
    var used = [];
    var accepted = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (used.indexOf(c.a) >= 0 || used.indexOf(c.b) >= 0) continue;
      used.push(c.a, c.b);
      accepted.push(c.a, c.b);
    }

    var createdIds = [];
    for (var k = 0; k < accepted.length; k += 2) {
      var a = accepted[k];
      var b = accepted[k + 1];
      if (a.id > b.id) { var t = a; a = b; b = t; }
      var depth = 1 + Math.max(parentDepth(g, a), parentDepth(g, b));
      if (a.tier >= MAX_TIER) jugBurst(g, a, b, depth, ev);
      else mergePair(g, a, b, depth, used, createdIds, ev);
    }

    // Release references held by the scratch records.
    for (var m = 0; m < nCand; m++) { cand[m].a = null; cand[m].b = null; }
    nCand = 0;
  }
  /* @pure-end */

  return {
    isMergeEligible: isMergeEligible,
    resolveMerges: resolveMerges,
    multiplier: multiplier,
    pointsFor: pointsFor,
    parentDepth: parentDepth
  };
});
