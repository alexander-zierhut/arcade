// src/app/dispatch.js: event routing and save writes (DESIGN 5.7, 2.11, 5.9).
// dispatch(events, 'attract') reaches only render.fx; dispatch(events, 'play') reaches render.fx,
// audio, ui, the save logic and the state machine, each inside its own guard (5.8). ui.consume runs
// before the save logic, so hud.js still sees the old discovered mask ("NEW COCKTAIL" vs "NEW"); the
// discovery and "Another Sangria!" toasts and the NEW BEST badge are hud.js's.
// Browser-only. states.js loads later, so CM.app.setState and friends are looked up at call time.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var app = CM.app = CM.app || {};
  var C = CM.config;
  var FX = (C && C.FX) || {};
  var HIT_STOP_MS = FX.HIT_STOP_MS || [0, 0, 0, 0, 0, 0, 0, 50, 70, 0];
  var BEST_WRITE_GAP_MS = 2000;

  var lastBestWriteMs = -1e9;

  function ctx() { return CM.app.ctx; }
  function guard(name, fn) { return CM.app.guard.apply(null, arguments); }
  function storage() { return CM.ui && CM.ui.storage; }

  // Writes the save (merged with the stored value by storage.save, 5.9).
  function writeSave() {
    var c = ctx(), st = storage();
    if (st && c.save) guard('storage', st.save, c.save);
  }

  // Stores the run record of the play game (5.9) unless the run is over.
  function storeRun() {
    var c = ctx(), st = storage(), g = c.game;
    if (!st || !g || g.phase === 'over') return;
    guard('storage', function () {
      st.saveRun({
        v: 1, rulesVersion: C.RULES_VERSION, game: CM.game.snapshot(g),
        meta: { bestAtRunStart: c.bestAtRunStart, newBestShown: c.newBestShown, bgKey: c.playBgKey }
      });
    });
  }

  function clearRun() {
    var st = storage();
    if (st) guard('storage', st.clearRun);
  }

  // 2.11: the live best follows the score; while the score is a new best the save is written at most
  // once per 2 s. The "NEW BEST!" badge and ctx.newBestShown belong to ui/hud.js (setHud).
  function trackBest(g) {
    var c = ctx(), s = c.save;
    if (!s || !g) return;
    if (g.score > s.best) {
      s.best = g.score;
      var t = CM.app.now();
      if (t - lastBestWriteMs >= BEST_WRITE_GAP_MS) { lastBestWriteMs = t; writeSave(); }
    }
  }

  function routePlay(events) {
    var c = ctx(), g = c.game, s = c.save, i, e;
    var hasWin = false, hasLose = false, hudDirty = false, wroteSave = false, winEvent = null;

    guard('fx', function () { CM.render.fx.consume(events, g, c.lay); });
    guard('audio', function () { CM.audio.consume(events, g); });
    guard('ui', function () { CM.ui.consume(events, g); });

    guard('save', function () {
      for (i = 0; i < events.length; i++) {
        e = events[i];
        if (e.type === 'win') { hasWin = true; winEvent = e; }
        else if (e.type === 'lose') hasLose = true;
      }
      for (i = 0; i < events.length; i++) {
        e = events[i];
        switch (e.type) {
          case 'merge':
            hudDirty = true;
            if (HIT_STOP_MS[e.tier] > c.hitStopMs) c.hitStopMs = HIT_STOP_MS[e.tier];   // 3.8 hit-stop
            break;
          case 'discover':
            hudDirty = true;
            if (s) {
              s.discovered = (s.discovered | (1 << (e.tier - 1))) & 0x1FF;
              if (e.tier > s.bestTier) s.bestTier = e.tier;
              wroteSave = true;
            }
            break;
          case 'launch': case 'next': case 'jugBurst': case 'danger':
            hudDirty = true;
            break;
          default: break;
        }
      }
      trackBest(g);
      if (hasWin && s) {                         // saved synchronously on the event (5.7, 2.11)
        s.wins += 1;
        s.discovered = (s.discovered | (1 << 8)) & 0x1FF;
        if (s.bestTier < 9) s.bestTier = 9;
        if (g.score > s.best) s.best = g.score;
        writeSave();
        storeRun();
        wroteSave = false;
      }
      if (hasLose && s) {
        if (g.score > s.best) s.best = g.score;
        writeSave();
        clearRun();
        wroteSave = false;
      }
      if (wroteSave) writeSave();
    });

    if (hudDirty || hasWin || hasLose) guard('hud', function () { CM.ui.setHud(g, s); });

    // The state machine last, so every consumer has seen the events first.
    if (hasWin && c.state === 'PLAY') guard('states', CM.app.onWin, winEvent);
    if (hasLose && (c.state === 'PLAY' || c.state === 'WIN_SEQ')) guard('states', CM.app.onLose);
  }

  // dispatch(events, source: 'play' | 'attract') (5.5, 5.7).
  function dispatch(events, source) {
    if (!events || !events.length) return;
    var c = ctx();
    if (source === 'attract') {
      // Visuals only: never ui, audio, save, haptics, the run record or setState. Resets are
      // handled by attract.step (win / lose / time limit).
      guard('fx', function () { CM.render.fx.consume(events, c.attract, c.lay); });
      return;
    }
    routePlay(events);
  }

  app.dispatch = dispatch;
  app.writeSave = writeSave;
  app.storeRun = storeRun;
  app.clearRun = clearRun;
})(typeof globalThis !== 'undefined' ? globalThis : this);
