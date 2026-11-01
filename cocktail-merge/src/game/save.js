// src/game/save.js: a part of CM.game. Pure save normalisation and merging (DESIGN 2.11, 5.9).
// Since 1.2.0 the best score is kept per mode (`bests.easy / normal / hard`, 2.13); `best` stays the best over
// all modes (older code and the arcade read it) and a pre-1.2.0 save's single `best` becomes the best of the
// mode it was playing (`relaxed` true = easy, false = normal), so nobody's record is lost. `mode` is the mode
// chosen last (the chooser preselects it); `relaxed` is still written for a downgrade.
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode ? { config: require('../config.js') } : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.save = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var C = deps.config || {};
  var MAX_TIER = (C.TIERS && C.TIERS.length - 1) || 10;
  var MASK = (1 << MAX_TIER) - 1;                          // 10 tiers, bit t-1
  var MODES = C.MODE_LIST || ['easy', 'normal', 'hard'];
  var DEFAULT_MODE = C.DEFAULT_MODE || 'easy';
  var ALIASES = C.MODE_ALIASES || { relaxed: 'easy', standard: 'normal' };
  var LADDER = C.LADDER || [1, 2, 3, 4, 5, 10, 6, 7, 8, 9];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isNonNegInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0; }
  function bool(v, d) { return typeof v === 'boolean' ? v : d; }
  function modeOf(v) {
    if (typeof v === 'string' && has(ALIASES, v)) v = ALIASES[v];
    return MODES.indexOf(v) >= 0 ? v : null;
  }
  // The higher tier on the full ladder (ids are not ordered by size since the punch is id 10).
  function rank(t) { var i = LADDER.indexOf(t); return i < 0 ? 0 : i + 1; }
  function higherTier(a, b) { return rank(b) > rank(a) ? b : a; }
  function emptyBests() { var o = {}; for (var i = 0; i < MODES.length; i++) o[MODES[i]] = 0; return o; }
  function maxBest(bests) { var m = 0; for (var i = 0; i < MODES.length; i++) if (bests[MODES[i]] > m) m = bests[MODES[i]]; return m; }

  function defaults() {
    return { v: 1, best: 0, bestTier: 1, muted: false, ambience: false, music: true, showNumbers: false,
             relaxed: true, lowGfx: false, wins: 0, discovered: 0, mode: DEFAULT_MODE, bests: emptyBests() };
  }

  // normalizeSave(raw) -> Save. Accepts a JSON string, an object or anything else.
  function normalizeSave(raw) {
    var o = raw, i, m;
    if (typeof o === 'string') {
      try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    var s = defaults();
    if (!o || typeof o !== 'object' || Array.isArray(o)) return s;
    s.best = isNonNegInt(o.best) ? o.best : 0;
    s.wins = isNonNegInt(o.wins) ? o.wins : 0;
    s.bestTier = (isNonNegInt(o.bestTier) && rank(o.bestTier) > 0) ? o.bestTier : 1;
    s.muted = bool(o.muted, false);
    s.showNumbers = bool(o.showNumbers, false);
    s.ambience = bool(o.ambience, false);   // owner: waves off by default (they muddy the music)
    s.music = bool(o.music, true);
    s.relaxed = bool(o.relaxed, true);
    s.lowGfx = bool(o.lowGfx, false);     // Performance mode (lower resolution, fewer effects)
    // 5.9 writes (n >>> 0) & MASK; only non-negative integers count, so a corrupt -1 does not
    // unlock the whole collection (it would become MASK) and garbage gives the default 0.
    s.discovered = isNonNegInt(o.discovered) ? ((o.discovered >>> 0) & MASK) : 0;
    // The mode chosen last: `mode` (1.2.0+), else the pre-1.2.0 `relaxed` switch.
    s.mode = modeOf(o.mode) || (s.relaxed ? 'easy' : 'normal');
    s.relaxed = s.mode === 'easy';
    if (o.bests && typeof o.bests === 'object' && !Array.isArray(o.bests)) {
      for (i = 0; i < MODES.length; i++) { m = MODES[i]; if (isNonNegInt(o.bests[m])) s.bests[m] = o.bests[m]; }
    }
    // A record older than the per-mode bests (or written by an older version in between): it belongs to the
    // mode that was set at the time; the all-modes best is never lower than any mode's best.
    if (s.best > maxBest(s.bests)) s.bests[s.mode] = s.best;
    s.best = maxBest(s.bests);
    s.v = 1;
    return s;
  }

  // mergeSave(stored, next) -> Save. Records take the max (discovered is ORed), settings take next.
  function mergeSave(stored, next) {
    var a = normalizeSave(stored);
    var b = normalizeSave(next);
    var bests = emptyBests(), i, m;
    for (i = 0; i < MODES.length; i++) { m = MODES[i]; bests[m] = Math.max(a.bests[m], b.bests[m]); }
    return {
      v: 1,
      best: maxBest(bests),
      bests: bests,
      bestTier: higherTier(a.bestTier, b.bestTier),
      muted: b.muted,
      ambience: b.ambience,
      music: b.music,
      showNumbers: b.showNumbers,
      mode: b.mode,
      relaxed: b.mode === 'easy',
      lowGfx: b.lowGfx,
      wins: Math.max(a.wins, b.wins),
      discovered: (a.discovered | b.discovered) & MASK
    };
  }

  /** bestFor(save, mode) -> the best score of that mode (0 when unknown). */
  function bestFor(save, mode) {
    var m = modeOf(mode), b = save && save.bests;
    return (m && b && isNonNegInt(b[m])) ? b[m] : 0;
  }

  /** recordScore(save, mode, score) -> true when it raised that mode's best (and the all-modes best); mutates save. */
  function recordScore(save, mode, score) {
    var m = modeOf(mode);
    if (!save || !m || !isNonNegInt(score)) return false;
    if (!save.bests || typeof save.bests !== 'object') save.bests = emptyBests();
    if (!(score > (save.bests[m] | 0))) return false;
    save.bests[m] = score;
    if (score > (save.best | 0)) save.best = score;
    return true;
  }
  /* @pure-end */
  return { normalizeSave: normalizeSave, mergeSave: mergeSave, bestFor: bestFor, recordScore: recordScore, rankOf: rank };
});
