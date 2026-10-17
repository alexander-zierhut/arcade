// src/game/save.js: a part of CM.game. Pure save normalisation and merging (DESIGN 2.11, 5.9).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = {};
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.save = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var MASK = 0x1FF;   // 9 tiers, bit t-1

  function defaults() {
    return { v: 1, best: 0, bestTier: 1, muted: false, ambience: false, music: true, showNumbers: false,
             relaxed: true, lowGfx: false, wins: 0, discovered: 0 };
  }

  function isNonNegInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0; }
  function bool(v, d) { return typeof v === 'boolean' ? v : d; }

  // normalizeSave(raw) -> Save. Accepts a JSON string, an object or anything else.
  function normalizeSave(raw) {
    var o = raw;
    if (typeof o === 'string') {
      try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    var s = defaults();
    if (!o || typeof o !== 'object' || Array.isArray(o)) return s;
    s.best = isNonNegInt(o.best) ? o.best : 0;
    s.wins = isNonNegInt(o.wins) ? o.wins : 0;
    s.bestTier = (isNonNegInt(o.bestTier) && o.bestTier >= 1 && o.bestTier <= 9) ? o.bestTier : 1;
    s.muted = bool(o.muted, false);
    s.showNumbers = bool(o.showNumbers, false);
    s.ambience = bool(o.ambience, false);   // owner: waves off by default (they muddy the music)
    s.music = bool(o.music, true);
    s.relaxed = bool(o.relaxed, true);
    s.lowGfx = bool(o.lowGfx, false);     // Performance mode (lower resolution, fewer effects)
    // 5.9 writes (n >>> 0) & 0x1FF; only non-negative integers count, so a corrupt -1 does not
    // unlock the whole collection (it would become 0x1FF) and garbage gives the default 0.
    s.discovered = isNonNegInt(o.discovered) ? ((o.discovered >>> 0) & MASK) : 0;
    s.v = 1;
    return s;
  }

  // mergeSave(stored, next) -> Save. Records take the max (discovered is ORed), settings take next.
  function mergeSave(stored, next) {
    var a = normalizeSave(stored);
    var b = normalizeSave(next);
    return {
      v: 1,
      best: Math.max(a.best, b.best),
      bestTier: Math.max(a.bestTier, b.bestTier),
      muted: b.muted,
      ambience: b.ambience,
      music: b.music,
      showNumbers: b.showNumbers,
      relaxed: b.relaxed,
      lowGfx: b.lowGfx,
      wins: Math.max(a.wins, b.wins),
      discovered: (a.discovered | b.discovered) & MASK
    };
  }
  /* @pure-end */
  return { normalizeSave: normalizeSave, mergeSave: mergeSave };
});
