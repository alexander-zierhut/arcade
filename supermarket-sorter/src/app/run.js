// src/app/run.js: progress and the Serie (DESIGN 5.1-5.4, 8.8): level loading by (mode, n), the run record per mode,
// banking a timed Serie, per-level records, and the coach-mark schedule per level (7.6). Browser-only; sets SS.app.run.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var app = SS.app = SS.app || {};
  var C = SS.config || {};
  function st() { return SS.ui && SS.ui.storage; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }

  /** levelFor(mode, n) -> level for createGame (baked, authored, generated or remixed; always verified) or null. */
  function levelFor(mode, n) {
    try { return SS.levels.get(mode, n, SS.catalog); } catch (e) { if (root.console) root.console.error('[levels]', e); return null; }
  }
  function reached(save, mode) { return Math.max(1, save.records[mode].reached || 1); }

  // ---------- run record per mode ----------
  function store(ctx) {
    if (!st() || !ctx.mode) return;
    var rec = { v: 2, rulesVersion: C.RULES_VERSION || 2, mode: ctx.mode, levelNo: ctx.levelNo, game: ctx.game && ctx.game.status === 'playing' ? SS.game.snapshot(ctx.game) : null, phaseMs: SS.ui.belts ? SS.ui.belts.phaseMs() : {} };
    st().saveRun(ctx.mode, rec);
  }
  function load(mode) { return st() ? st().loadRun(mode) : null; }
  function clear(mode) { if (st()) st().clearRun(mode); }

  // ---------- records ----------
  /** onCleared(ctx, cleared) -> { newBest, levelBest, improved }: writes the per-level record and advances progress and the Serie. */
  function onCleared(ctx, cleared) {
    var g = ctx.game, s = ctx.save, n = g.level.n, mode = ctx.mode;
    var prev = s.records[mode].levels[String(n)], levelBest = prev ? prev.best : 0;
    var r = SS.save.recordLevel(s, mode, n, { score: g.levelScore, stars: cleared.stars, moves: g.moves, badges: cleared.badges, date: today() });
    ctx.save = r.save;
    var newBest = false;
    if (mode === 'timed') {
      var ser = ctx.save.records.timed.serie;
      ser.score += g.levelScore;
      newBest = ser.score > ctx.save.records.timed.best;
    } else newBest = r.newBest;
    return { newBest: newBest, levelBest: Math.max(levelBest, g.levelScore), improved: r.improved };
  }
  /** bank(ctx, includeLevelPoints) -> { score, rank, newBest, nextLevel }: writes the Serie into the top 10 and resets it. */
  function bank(ctx, includeLevelPoints) {
    var s = ctx.save, ser = s.records.timed.serie, score = ser.score + (includeLevelPoints && ctx.game ? ctx.game.levelScore : 0);
    var res = { score: score, rank: -1, newBest: false, nextLevel: ctx.levelNo };
    if (score > 0) { var r = SS.save.recordRun(s, 'timed', { score: score, level: ctx.levelNo, fromLevel: ser.fromLevel, date: today() }); ctx.save = r.save; res.rank = r.rank; res.newBest = r.newBest; }
    ctx.save.records.timed.serie = { score: 0, fromLevel: ctx.levelNo };
    return res;
  }
  function serieScore(ctx) { return ctx.save && ctx.save.records.timed.serie ? ctx.save.records.timed.serie.score : 0; }

  // ---------- coach marks (DESIGN 7.6) ----------
  var TIPS = [
    { key: 'drag', at: function (m, n) { return n === 1; } },
    { key: 'tap', at: function (m, n) { return n === 2; } },
    { key: 'layers', at: function (m, n, lv) { return n >= 3 && lv.comps.some(function (c) { return c.layers.length > 1; }); } },
    { key: 'bunny', at: function (m, n, lv) { return n >= 6 && (lv.comps.some(function (c) { return c.layers.some(function (l) { return l.indexOf('*') >= 0; }); }) || lv.belts.some(function (b) { return b.cells.some(function (c) { return c === '*'; }); })); } },
    { key: 'lock', at: function (m, n, lv) { return lv.comps.some(function (c) { return c.lockAt > 0; }); } },
    { key: 'belts', at: function (m, n, lv) { return lv.belts.some(function (b) { return b.id === 'L' || b.id === 'R'; }); } },
    { key: 'beltBunny', at: function (m, n, lv) { return m === 'timed' && lv.belts.some(function (b) { return b.cells.some(function (c) { return c === '*'; }); }); } },
    { key: 'sil', at: function (m, n, lv) { return lv.silhouettes > 0; } },
    { key: 'hbelt', at: function (m, n, lv) { return lv.belts.some(function (b) { return b.id === 'H'; }); } },
    { key: 'turbo', at: function (m, n, lv) { return !!lv.turbo; } },
    { key: 'drift', at: function (m, n, lv) { return m === 'relaxed' && (lv.beltSpeed100 || 0) > 0; } }
  ];
  /** tipsFor(mode, level, save) -> [{ key, text }] not yet seen, in teaching order. */
  function tipsFor(mode, lv, save) {
    var out = [];
    TIPS.forEach(function (tip) {
      if (save.seenTips[tip.key]) return;
      if (tip.key === 'depth' && !save.showDepth) return;
      if (!tip.at(mode, lv.n, lv)) return;
      var vars = {};
      if (tip.key === 'lock') { var lock = lv.comps.filter(function (c) { return c.lockAt > 0; })[0]; vars.n = lock ? lock.lockAt : 2; }
      out.push({ key: tip.key, text: SS.t('coach_' + tip.key, vars) });
    });
    return out;
  }
  /** introLine(mode, lv, save) -> one sentence about the newest mechanic of this level, or ''. */
  function introLine(mode, lv, save) { var tips = tipsFor(mode, lv, save); return tips.length ? tips[0].text : ''; }

  app.run = { levelFor: levelFor, reached: reached, store: store, load: load, clear: clear, onCleared: onCleared, bank: bank, serieScore: serieScore, tipsFor: tipsFor, introLine: introLine, today: today };
})(typeof globalThis !== 'undefined' ? globalThis : this);
