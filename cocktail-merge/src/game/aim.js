// src/game/aim.js: a part of CM.game. Aim sweep (firstHit) and the bot aim (botAim) (DESIGN 5.5).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js') }
    : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.aim = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var TABLE = (deps.config && deps.config.TABLE) || {};

  function ruleNum(g, key, d) {
    var v = g.rules ? g.rules[key] : undefined;
    if (typeof v === 'number' && isFinite(v)) return v;
    v = TABLE[key];
    return (typeof v === 'number' && isFinite(v)) ? v : d;
  }

  function launchY(g) { return ruleNum(g, 'LAUNCH_Y', 144); }
  function tableW(g) { return ruleNum(g, 'W', 100); }

  function radiusOf(g, tier) {
    var R = g.rules && g.rules.RADII;
    if (R && typeof R[tier] === 'number') return R[tier];
    var T = deps.config && deps.config.TIERS;
    return (T && T[tier]) ? T[tier].radius : 6;
  }

  function hitOf(b, y, blocked) {
    return { y: y, id: b.id, tier: b.tier, age: b.age, launched: !!b.launched, blocked: blocked };
  }

  // spawnBlocker(g, x, r): the first body (ascending id) overlapping the spawn circle at
  // (x, LAUNCH_Y), or null. The single predicate for "is the launch blocked?", used by both
  // firstHit (the aim guide) and tick's launch step, in the form of 2.12 / 5.6: d < r + b.r.
  function spawnBlocker(g, x, r) {
    var LY = launchY(g);
    var bodies = g.bodies;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var dx = b.x - x, dy = b.y - LY;
      if (Math.sqrt(dx * dx + dy * dy) < r + b.r) return b;
    }
    return null;
  }

  // firstHit(g, x, r): sweep a circle of radius r from (x, LAUNCH_Y) toward y = 0.
  // A start circle that overlaps any body (first by ascending id, as in tick step 3) is blocked.
  // The sweep ignores bodies whose centre y >= LAUNCH_Y. The far wall reports id 0, tier 0, y = r.
  function firstHit(g, x, r) {
    var LY = launchY(g);
    var bodies = g.bodies;
    var i, b, dx, rr;
    var blocker = spawnBlocker(g, x, r);
    if (blocker) return hitOf(blocker, LY, true);
    var best = null, bestY = r;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.y >= LY) continue;
      dx = b.x - x; rr = r + b.r;
      if (dx >= rr || dx <= -rr) continue;
      var cy = b.y + Math.sqrt(rr * rr - dx * dx);   // centre y of the swept circle at contact
      if (cy > bestY || (best && cy === bestY && b.id < best.id)) { bestY = cy; best = b; }
    }
    if (best) return hitOf(best, bestY, false);
    return { y: r, id: 0, tier: 0, age: 0, launched: false, blocked: false };
  }

  // botAim(g, u[, spread]) -> x. Scans x in 1-u steps; prefers a same-tier first hit.
  // spread defaults to 4 (smart bot, the 5.5 signature botAim(g, u)); Appendix 9 and the tuning
  // script pass 12 for the sloppy bot. App code calls it with two arguments.
  function botAim(g, u, spread) {
    var sp = (typeof spread === 'number' && isFinite(spread)) ? spread : 4;
    var r = radiusOf(g, g.current);
    var W = tableW(g);
    var bestX = r, bestScore = -Infinity;
    for (var i = 0; r + i <= W - r; i++) {
      var x = r + i;
      var h = firstHit(g, x, r);
      var s;
      if (h.blocked) s = -1e9;
      else if (h.id !== 0 && h.tier === g.current) s = 1000 + 0.1 * h.y;
      else s = -h.y;
      if (s > bestScore) { bestScore = s; bestX = x; }
    }
    var out = bestX + (u - 0.5) * sp;
    return out < r ? r : (out > W - r ? W - r : out);
  }
  /* @pure-end */
  return { firstHit: firstHit, botAim: botAim, spawnBlocker: spawnBlocker };
});
