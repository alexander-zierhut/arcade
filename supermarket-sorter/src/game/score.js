// src/game/score.js: points, bonuses, efficiency and stars per branch (DESIGN 5.1, 5.2). Pure. Numbers in config.js.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var C = SS.config || (typeof require === 'function' ? require('../config.js') : {});
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  /** multiplier(combo) -> 1, 1.5, 2, ... capped at COMBO_MAX_MULT (timed branch, DESIGN 5.1). */
  function multiplier(combo) { var c = Math.max(1, combo | 0); return Math.min(num(C.COMBO_MAX_MULT, 4), 1 + num(C.COMBO_STEP, 0.5) * (c - 1)); }
  function matchPoints(combo) { return Math.round(num(C.MATCH_POINTS, 100) * multiplier(combo)); }
  /** efficiency(par, moves) -> 0..1000 (relaxed level score). */
  function efficiency(par, moves) { par = Math.max(1, par | 0); moves = Math.max(1, moves | 0); return Math.round(1000 * Math.min(1, par / moves)); }
  /** clearBonus(g, bunniesLeft) -> { level, time, bunnies, flawless, efficiency, total } */
  function clearBonus(g, bunniesLeft) {
    var out = { level: 0, time: 0, bunnies: 0, flawless: 0, efficiency: 0, total: 0 };
    if (g.mode === 'timed') {
      out.level = num(C.LEVEL_CLEAR_POINTS, 250);
      out.time = g.extended ? 0 : Math.max(0, Math.floor(num(g.timeLeftMs, 0) / 1000)) * num(C.TIME_BONUS_PER_S, 5);
      out.bunnies = (bunniesLeft || 0) * num(C.BUNNY_LEFT_POINTS, 150);
      out.flawless = g.flawless ? num(C.FLAWLESS_POINTS, 250) : 0;
    } else {
      out.efficiency = efficiency(g.level && g.level.par, g.moves);
    }
    out.total = out.level + out.time + out.bunnies + out.flawless + out.efficiency;
    return out;
  }
  /** stars(g) -> 1..3: timed by time left, relaxed by moves against par; a rescue caps at 2 (DESIGN 5.1 / 5.2). */
  function stars(g) {
    var st;
    if (g.mode === 'timed') {
      if (g.extended) st = 1;
      else { var total = Math.max(1, g.level.timeMs || 1), f = (g.timeLeftMs || 0) / total; st = f >= 0.5 ? 3 : f >= 0.25 ? 2 : 1; }
    } else {
      var par = Math.max(1, g.level.par || 1), m = g.moves || 0;
      st = m <= par ? 3 : m <= Math.ceil(1.5 * par) ? 2 : 1;
    }
    if (g.rescueUsed) st = Math.min(st, 2);
    return st;
  }
  /** weighted(score, n) -> relaxed top-10 weight: round(score * (100 + n) / 100). */
  function weighted(score, n) { return Math.round(score * (100 + n) / 100); }

  var score = { multiplier: multiplier, matchPoints: matchPoints, efficiency: efficiency, clearBonus: clearBonus, stars: stars, weighted: weighted };
  SS.score = score;
  if (typeof module !== 'undefined' && module.exports) module.exports = score;
})(typeof globalThis !== 'undefined' ? globalThis : this);
