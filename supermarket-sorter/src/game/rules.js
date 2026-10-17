// src/game/rules.js: per-branch rules that are derived at runtime and never baked (DESIGN 4.6, 5.1, 5.2, 8.2):
// rack shapes, level tags, time limit, belt speed, turbo levels, in-level ramp, win/stuck wrappers. Pure, integer arithmetic.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var C = SS.config || (typeof require === 'function' ? require('../config.js') : {});
  var B = SS.board || (typeof require === 'function' ? require('./board.js') : null);

  /** SHAPES: two columns of 3-slot compartments plus centred caps (DESIGN 1.2). comps in index order: top cap, rows left-right, bottom cap. */
  var SHAPES = {
    A4: { gridRows: 2, caps: '', C: 4, rackRows: 2, Wv: 3 },
    A5: { gridRows: 2, caps: 'top', C: 5, rackRows: 3, Wv: 4 },
    A6: { gridRows: 3, caps: '', C: 6, rackRows: 3, Wv: 4 },
    A7: { gridRows: 3, caps: 'top', C: 7, rackRows: 4, Wv: 5 },
    A8: { gridRows: 3, caps: 'both', C: 8, rackRows: 5, Wv: 6 },
    A9: { gridRows: 4, caps: 'top', C: 9, rackRows: 5, Wv: 6 },
    A10: { gridRows: 4, caps: 'both', C: 10, rackRows: 6, Wv: 8 }
  };
  /** layout(shape) -> [{ row, col }] with col 0 | 1 | 'c' (cap), rows counted from the top. */
  function layout(shape) {
    var sh = SHAPES[shape];
    if (!sh) return null;
    var out = [], row = 0, r;
    if (sh.caps === 'top' || sh.caps === 'both') { out.push({ row: row, col: 'c' }); row += 1; }
    for (r = 0; r < sh.gridRows; r++) { out.push({ row: row, col: 0 }); out.push({ row: row, col: 1 }); row += 1; }
    if (sh.caps === 'both') out.push({ row: row, col: 'c' });
    return out;
  }

  function idx(L) { return (L - 1) % 10; }
  /** tag(L) -> 'tut' | 'normal' | 'pause' | 'hard' | 'vhard' (DESIGN 4.1). */
  function tag(L) {
    if (L <= 2) return 'tut';
    if (L <= 9) return 'normal';
    var i = idx(L);
    if (i === 0 && L >= 11) return 'pause';
    if (i === 4) return 'hard';
    if (i === 9) return 'vhard';
    return 'normal';
  }
  function squeeze(L) { return L <= 150 ? 1000 : 1000 - Math.floor(150 * (L - 150) / (L - 150 + 300)); }
  /** tauMs(L): ms per witness input the clock allows (DESIGN 4.6). */
  function tauMs(L) { return Math.floor(Math.max(1800, 3300 - 30 * (L - 1)) * squeeze(L) / 1000); }   // tightened after the first playtest (L14 cleared with 1:30 of 3:45 left)
  /** isTurbo(mode, L): "Turbo-Regal" challenge levels (timed, every level with index 6 from L27: 27, 37, 47, ...) run the belts
   *  at 1.8x, at least 1.08 cells/s and at most 1.8 cells/s (v0.3.2: 40% slower than the 3x / 1.8..3 of v0.3, which was too fast).
   *  Never on a tutorial, pause, hard or very hard level (difficulty does not stack). */
  function isTurbo(mode, L) { return mode === 'timed' && L >= 27 && idx(L) === 6; }
  /** speed100(mode, L, t) -> belt speed in centi-cells per second (0 = still). */
  function speed100(mode, L, t) {
    if (mode === 'timed') {
      var v;
      if (L < 12) return 0;
      if (L <= 20) v = 20;
      else if (L <= 100) v = Math.min(100, 20 + (L - 20)) + (t === 'vhard' ? 5 : 0);
      else v = 100 + Math.floor(40 * (L - 100) / (L - 100 + 400));
      if (isTurbo(mode, L)) v = Math.min(180, Math.max(108, Math.round(v * 18 / 10)));   // v0.3.2: 40% slower than the 3x / 180..300 of v0.3
      return v;
    }
    if (L < 41) return 0;
    if (L <= 100) return 8;
    return 8 + Math.floor(4 * (L - 100) / (L - 100 + 300));
  }
  /** hidden(mode, L) -> hidden cells per moving belt (DESIGN 4.6 h). */
  function hidden(mode, L) { if (mode === 'timed') return L <= 40 ? 1 : L <= 80 ? 2 : 3; return speed100(mode, L) > 0 ? 1 : 0; }
  /** rampRate(g) -> playback rate permille for the belts (DESIGN R-B8): 1000 + 300 * matches / totalMatches from timed L31. */
  function rampRate(g) {
    if (g.mode !== 'timed' || !g.level || g.level.n < 31 || !g.level.totalMatches) return 1000;
    return 1000 + Math.floor(300 * g.matches / g.level.totalMatches);
  }
  /** timeLimitS(mode, L, t, witnessLen, waitsS) -> seconds (DESIGN 4.6 timeS without the casual-bot step). */
  function timeLimitS(mode, L, t, witnessLen, waitsS) {
    if (mode !== 'timed') return 0;
    var m = L <= 9 ? 1500 : t === 'pause' ? 1100 : t === 'hard' ? 1100 : t === 'vhard' ? 1200 : 1000;
    if (isTurbo(mode, L)) m += 150;                                            // turbo shelves: the challenge is the speed, not a harsher clock
    var raw = Math.ceil((tauMs(L) * witnessLen / 1000 + (waitsS || 0) + 20) * m / 1000);
    var s = 5 * Math.ceil(raw / 5), tmin = L <= 6 ? 120 : L <= 20 ? 90 : 75;
    return Math.max(tmin, Math.min(480, s));
  }
  function isWon(b) { return B.isCleared(b); }
  function isStuck(b) { return !B.isCleared(b) && !B.progressPossible(b); }

  var rules = { SHAPES: SHAPES, layout: layout, tag: tag, idx: idx, squeeze: squeeze, tauMs: tauMs, speed100: speed100, isTurbo: isTurbo, hidden: hidden, rampRate: rampRate,
    timeLimitS: timeLimitS, isWon: isWon, isStuck: isStuck };
  SS.rules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
