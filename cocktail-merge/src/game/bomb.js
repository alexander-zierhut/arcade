// src/game/bomb.js: a part of CM.game. The bomb (owner feature, 2026-10-03): a jug burst (two Sangria Verde
// touching) earns a bomb charge; useBomb clears every glass whose centre lies inside a circle of BOMB_RADIUS
// table units around the chosen point (diameter = a third of the table width) and scores BOMB_POINTS_PER_TIER per tier.
// Pure: no DOM, deterministic, snapshot-friendly (g.bombs is a plain integer).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode ? { config: require('../config.js') } : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.bomb = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var R = (deps.config && deps.config.RULES) || {};
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function maxBombs(rules) { return num(rules && rules.BOMB_MAX, num(R.BOMB_MAX, 3)); }
  function radius(rules) { return num(rules && rules.BOMB_RADIUS, num(R.BOMB_RADIUS, 16.5)); }
  function pointsPerTier(rules) { return num(rules && rules.BOMB_POINTS_PER_TIER, num(R.BOMB_POINTS_PER_TIER, 5)); }

  /** earnBomb(g, ev): one more charge (capped); pushes {type:'bombEarned', bombs, gained}. Returns the count. */
  function earnBomb(g, ev) {
    var cap = maxBombs(g.rules), before = g.bombs | 0;
    g.bombs = Math.min(cap, before + 1);
    if (ev) ev.push({ type: 'bombEarned', bombs: g.bombs, gained: g.bombs > before });
    return g.bombs;
  }

  /** clampCentre(g, x, y) -> {x, y}: the blast centre kept inside the table (any depth, launch row included). */
  function clampCentre(g, x, y) {
    var W = num(g.rules.W, 100), L = num(g.rules.L, 160);
    return { x: Math.max(0, Math.min(W, num(x, W / 2))), y: Math.max(0, Math.min(L, num(y, L / 2))) };
  }

  /** inBlast(g, x, y, body) -> boolean: the body's centre lies within the blast circle. */
  function inBlast(g, x, y, b) {
    var r = radius(g.rules), dx = b.x - x, dy = b.y - y;
    return dx * dx + dy * dy <= r * r;
  }

  /**
   * useBomb(g, x, y) -> event | null. Spends a charge and removes every glass inside the circle at (x, y).
   * Returns null without a charge or when the game is over. The event lists the removed glasses (id, tier, x,
   * y, r) so render can play their ghosts; the danger state is recomputed by the next tick.
   */
  function useBomb(g, x, y) {
    if (!g || g.phase === 'over' || !(g.bombs > 0)) return null;
    var c = clampCentre(g, x, y), ppt = pointsPerTier(g.rules), removed = [], keep = [], points = 0, i, b;
    for (i = 0; i < g.bodies.length; i++) {
      b = g.bodies[i];
      if (inBlast(g, c.x, c.y, b)) { removed.push({ id: b.id, tier: b.tier, x: b.x, y: b.y, r: b.r }); points += ppt * b.tier; }
      else keep.push(b);
    }
    g.bodies = keep;
    g.bombs -= 1;
    g.score += points;
    if (removed.length) {                               // a glass over the line that is gone no longer counts
      g.overIds = g.overIds.filter(function (id) { for (var k = 0; k < removed.length; k++) if (removed[k].id === id) return false; return true; });
    }
    return { type: 'bomb', x: c.x, y: c.y, r: radius(g.rules), removed: removed, points: points, bombs: g.bombs };
  }
  /* @pure-end */
  return { earnBomb: earnBomb, useBomb: useBomb, bombRadius: radius, maxBombs: maxBombs, clampCentre: clampCentre, inBlast: inBlast };
});
