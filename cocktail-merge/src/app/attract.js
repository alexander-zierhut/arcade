// src/app/attract.js: the attract-mode game behind the title (DESIGN 3.5, 5.7).
// A separate game (seed 42, the current mode), muted, launching every 1.2 s at botAim with its own
// seeded noise RNG; it resets silently on lose, on win and after 43,200 ticks. Its events reach
// only render.fx (dispatch.js). It also picks its own background scene (CM.art.backgrounds).
// Browser-only.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var app = CM.app = CM.app || {};
  var C = CM.config;
  var SEED = 42;
  var LAUNCH_EVERY = 288;                 // 1.2 s at 240 Hz
  var AIM_LEAD = 132;                     // pick the target 0.55 s before the launch, then glide to it
  var GLIDE_U_S = 90;                     // aim glide speed (u/s), so the launcher never jumps
  var RESET_TICKS = (C && C.APP && C.APP.ATTRACT_RESET_TICKS) || 43200;
  var DT = (C && C.LOOP && C.LOOP.DT) || 1 / 240;

  var noise = 0x2545F491;                 // seeded noise RNG state (mulberry32), audio-free and DOM-free
  var nextLaunch = 0, target = null;

  function rand() {
    var a = (noise + 0x6D2B79F5) | 0;
    noise = a >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function ctx() { return CM.app.ctx; }
  function mode() { var s = ctx().save; return (s && s.relaxed === false) ? 'standard' : 'relaxed'; }

  // A fresh attract game (silent; also used after win, lose and the time limit).
  function reset() {
    var c = ctx();
    c.attract = CM.game.createGame(SEED, { mode: mode() });
    nextLaunch = c.attract.tick + LAUNCH_EVERY;
    target = null;
    if (c.state === 'TITLE') CM.app.guard('fx', CM.render && CM.render.fx && CM.render.fx.clear);
  }

  // Picks a scene for the title (never the one shown last) and starts loading it; done(ok) once settled.
  function pickBackground(done) {
    var c = ctx(), bg = CM.art && CM.art.backgrounds;
    if (!bg || typeof bg.pick !== 'function') { if (done) done(false); return; }
    var prev = c.attractBgKey || c.playBgKey || null;
    c.attractBgKey = CM.app.guard('backgrounds', bg.pick, prev, Math.random()) || null;
    c.bgKey = c.attractBgKey;
    CM.app.loadScene(c.attractBgKey, done);
  }

  // start(done?): creates or resets the attract game and picks its scene (on every entry to TITLE).
  function start(done) {
    reset();
    pickBackground(done);
  }

  // step(g): the per-tick bot, called by the loop before each attract tick (5.8).
  function step(g) {
    if (!g) { reset(); return; }
    if (g.phase === 'over' || g.wonOnce || g.tick >= RESET_TICKS) { reset(); return; }
    var G = CM.game;
    if (target === null && g.tick >= nextLaunch - AIM_LEAD) target = G.botAim(g, rand());
    if (target !== null) {
      var d = target - g.aimX, max = GLIDE_U_S * DT;
      if (Math.abs(d) > max) G.nudgeAim(g, d > 0 ? max : -max);
      else G.setAim(g, target);
    }
    if (g.tick >= nextLaunch) {
      if (target !== null) G.setAim(g, target);
      G.requestLaunch(g, 'key');
      nextLaunch = g.tick + LAUNCH_EVERY;
      target = null;
    }
  }

  app.attract = { start: start, step: step, reset: reset, pickBackground: pickBackground };
})(typeof globalThis !== 'undefined' ? globalThis : this);
