// src/app/loop.js: the first app file (DESIGN 5.2, 5.5, 5.8). It creates the shared app context
// CM.app.ctx and owns the fixed-step loop: time scale (hit-stop, win slow-mo), applyIntents,
// guard()/fail() fault isolation and the adaptive DPR fallback (7, item 7).
// Browser-only. Later app files (dispatch, attract, states, main) are reached at call time only.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var app = CM.app = CM.app || {};
  var C = CM.config;
  var LOOP = (C && C.LOOP) || { DT: 1 / 240, MAX_FRAME: 0.1, MAX_STEPS: 24 };
  var FX = (C && C.FX) || {};
  var DT = LOOP.DT, MAX_FRAME = LOOP.MAX_FRAME, MAX_STEPS = LOOP.MAX_STEPS;
  var WORK_LIMIT_MS = 12, WORK_WINDOW_MS = 2000;

  // The single shared mutable app context (5.5). Fields after newBestShown are additions that
  // other files may read at call time; every app file reads and writes app state only here.
  var ctx = app.ctx = {
    state: 'BOOT', game: null, attract: null, save: null, lay: null, intents: null,
    acc: 0, last: 0, timeScale: 1, bestAtRunStart: 0, newBestShown: false,
    bgKey: null,           // background scene drawn now (render passes it to CM.art.backgrounds.draw)
    playBgKey: null,       // scene of the current / last play game
    attractBgKey: null,    // scene behind the title (attract mode)
    prevState: null,       // the state before the current one
    seqStartMs: 0,         // real-time start of WIN_SEQ / LOSE_SEQ (render reads it for the flash and dim)
    hitStopMs: 0,          // remaining hit-stop (3.8): the accumulator is not fed meanwhile
    slowmoStartMs: -1,     // WIN_SEQ slow-mo start (performance.now() ms), -1 when off
    guardUntilMs: 0,       // launch intents are dropped before this performance.now() time (3.6)
    notReadyAtMs: -1,      // last refused launch (render may shake the launcher from it)
    heldS: 0, heldDir: 0,  // keyboard aim acceleration (3.6)
    dprCap: 2, lowFx: false, lowGfx: false,   // adaptive fallback (7, item 7) + manual Performance mode; render halves particles on lowFx
    debug: false,
    errors: {},            // per-consumer error counters, shown in ?debug=1
    stats: { fps: 0, steps: 0, simMs: 0, workMs: 0 }
  };

  var logged = {};
  function log(name, e) {
    var msg = name + ': ' + (e && e.message ? e.message : String(e));
    if (logged[msg]) return;
    logged[msg] = true;
    if (root.console && root.console.error) root.console.error('[CM] ' + msg, e && e.stack ? e.stack : '');
  }

  // guard(name, fn): runs fn in a try/catch, logs the first occurrence of each message, counts
  // errors per consumer and never rethrows (5.8). Extra arguments are passed to fn.
  function guard(name, fn) {
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(null, Array.prototype.slice.call(arguments, 2));
    } catch (e) {
      ctx.errors[name] = (ctx.errors[name] || 0) + 1;
      log(name, e);
      return undefined;
    }
  }

  // fail(e): an exception from the play game's tick. The save is stored, the possibly corrupt run
  // record discarded and the OOPS overlay shown (5.8, 5.9).
  var failing = false;
  function fail(e) {
    log('sim', e);
    ctx.errors.sim = (ctx.errors.sim || 0) + 1;
    if (failing) return;
    failing = true;
    try {
      var st = CM.ui && CM.ui.storage;
      if (st && ctx.save) {
        if (ctx.game && ctx.game.score > ctx.save.best) ctx.save.best = ctx.game.score;
        guard('storage', st.save, ctx.save);
      }
      if (st) guard('storage', st.clearRun);
      if (ctx.game) ctx.game.phase = 'over';
      guard('states', CM.app.setState, 'OOPS');
    } finally { failing = false; }
  }

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  // 0 during hit-stop; the win slow-mo (0.25, eased in over 100 ms, back to 1 at 900 ms); else 1.
  function updateTimeScale(realS) {
    var ts = 1;
    if (ctx.slowmoStartMs >= 0) {
      var t = now() - ctx.slowmoStartMs, lo = FX.WIN_SLOWMO || 0.25;
      var tin = FX.WIN_SLOWMO_IN_MS || 100, tout = FX.WIN_SLOWMO_OUT_MS || 900;
      if (t < tin) ts = 1 + (lo - 1) * (t / tin);
      else if (t < tout) ts = lo;
      else if (t < tout + 100) ts = lo + (1 - lo) * ((t - tout) / 100);
      else { ts = 1; ctx.slowmoStartMs = -1; }
    }
    if (ctx.hitStopMs > 0) {
      ctx.hitStopMs -= realS * 1000;
      ts = 0;
    }
    ctx.timeScale = ts;
    return ts;
  }

  function keySpeed(dir) {
    if (dir !== ctx.heldDir) { ctx.heldDir = dir; ctx.heldS = 0; }
    var s = 35 + 150 * ctx.heldS;
    ctx.heldS += DT;
    return s < 110 ? s : 110;
  }

  // Step boundary (5.8): aim (if dirty) -> held-key nudge -> latched launch (consumed once).
  function applyIntents(g) {
    var it = ctx.intents, input = CM.ui && CM.ui.input;
    if (!it) return;
    if (it.bomb) {                                        // bomb (owner feature): clear part of the table
      var at = it.bomb; it.bomb = null; it.bombMode = false; it.bombAt = null; it.launch = null;
      var be = CM.game.useBomb ? CM.game.useBomb(g, at.x, at.y) : null;
      if (be) CM.app.dispatch([be], 'play');
    }
    if (it.bombMode) { it.launch = null; }
    if (it.aimDirty) { CM.game.setAim(g, it.aimX); it.aimDirty = false; }
    var dir = input && input.heldDir ? input.heldDir() : 0;
    if (dir) {
      var precise = input.precise && input.precise();
      CM.game.nudgeAim(g, dir * keySpeed(dir) * DT * (precise ? 0.35 : 1));
    } else if (ctx.heldDir) { ctx.heldDir = 0; ctx.heldS = 0; }
    if (it.launch) {
      var mode = it.launch;
      it.launch = null;
      if (now() < ctx.guardUntilMs) return;            // 250 ms input guard after overlays (3.6)
      var res = CM.game.requestLaunch(g, mode);
      if (res === 'rejected') {
        ctx.notReadyAtMs = now();
        guard('ui', CM.ui && CM.ui.notReady);            // hud.js: not-ready sound + launcher shake
      }
    }
  }

  // Adaptive fallback (7, item 7): over 2 s windows in PLAY, either the mean JS work (sim + render) above
  // 12 ms, OR the real frame interval running at more than 1.6x the display period (GPU/raster bound: a phone
  // can show tiny JS work and still crawl), drops the DPR cap 2 -> 1.5 -> 1.25 and sets lowFx (fewer
  // particles). The display period is the fastest interval ever seen (so iOS Low Power Mode at 30 Hz, where
  // every interval is long, is not mistaken for a slow game). A manual Performance mode (save.lowGfx) pins 1.25.
  var perf = { sum: 0, n: 0, t0: 0, frames: 0, fpsT0: 0, dts: [] };
  var DPR_STEPS = [2, 1.25, 1], DT_RATIO = 1.6, SLOW_MS = 22, NEED_SLOW = 2;   // a steady 60 fps on a 120 Hz phone is NOT slow; a resize blinks, so step rarely
  var slowWindows = 0;
  function trackWork(workMs, nowMs, realMs, simMs, steps) {
    ctx.stats.workMs = workMs;
    perf.frames += 1;
    if (CM.app.perf) CM.app.perf.record(realMs, workMs, simMs, steps, nowMs);
    if (nowMs - perf.fpsT0 >= 1000) { ctx.stats.fps = Math.round(perf.frames * 1000 / (nowMs - perf.fpsT0)); perf.frames = 0; perf.fpsT0 = nowMs; }
    if (ctx.state !== 'PLAY' || ctx.dprCap <= 1 || ctx.lowGfx) { perf.sum = 0; perf.n = 0; perf.dts.length = 0; perf.t0 = nowMs; return; }
    perf.sum += workMs; perf.n += 1; if (realMs > 0) perf.dts.push(realMs);
    if (nowMs - perf.t0 < WORK_WINDOW_MS) return;
    var mean = perf.sum / Math.max(1, perf.n), dts = perf.dts.slice().sort(function (a, b) { return a - b; });
    var p50 = dts.length ? dts[dts.length >> 1] : 0, base = CM.app.perf ? CM.app.perf.baseline() : Infinity;
    perf.sum = 0; perf.n = 0; perf.dts.length = 0; perf.t0 = nowMs;
    var slow = mean > WORK_LIMIT_MS || (isFinite(base) && dts.length >= 30 && p50 > Math.max(SLOW_MS, base * DT_RATIO));
    slowWindows = slow ? slowWindows + 1 : 0;
    if (slowWindows >= NEED_SLOW) {
      slowWindows = 0;
      for (var i = 0; i < DPR_STEPS.length - 1; i++) if (ctx.dprCap > DPR_STEPS[i + 1]) { ctx.dprCap = DPR_STEPS[i + 1]; break; }
      ctx.lowFx = true;
      if (root.console && root.console.info) root.console.info('[CM] adaptive fallback: mean work ' + mean.toFixed(1) + ' ms, frame p50 ' + p50.toFixed(1) + ' ms (display ' + (isFinite(base) ? base.toFixed(1) : '?') + ' ms), DPR cap ' + ctx.dprCap);
      guard('main', CM.main && CM.main.relayout);
    }
  }

  function frame(nowMs) {
    root.requestAnimationFrame(frame);           // scheduled FIRST: no exception below can stop the loop
    var t0 = now();
    var real = ctx.last > 0 ? Math.min(Math.max(0, (nowMs - ctx.last) / 1000), MAX_FRAME) : 0;
    ctx.last = nowMs;
    var ts = updateTimeScale(real);
    var n = 0, isAttract = false;
    try {
      if (CM.app.simulating && CM.app.simulating()) {
        isAttract = ctx.state === 'TITLE';
        var source = isAttract ? 'attract' : 'play';
        ctx.acc += real * ts;
        while (ctx.acc >= DT && n < MAX_STEPS) {
          if (!CM.app.simulating() || (ctx.state === 'TITLE') !== isAttract) break;   // a state change mid-frame
          var g = isAttract ? ctx.attract : ctx.game;                                  // re-read: attract may reset
          if (!g) break;
          if (ctx.state === 'PLAY') applyIntents(g);
          else if (isAttract) CM.app.attract.step(g);
          g = isAttract ? ctx.attract : ctx.game;
          var ev = CM.game.tick(g);
          if (ev.length) CM.app.dispatch(ev, source);
          ctx.acc -= DT; n++;
        }
        if (n === MAX_STEPS) ctx.acc = 0;        // no spiral of death
      } else {
        ctx.acc = 0;
      }
    } catch (e) {
      if (isAttract) {                            // a broken attract game never reaches OOPS
        log('attract', e);
        ctx.attract = null;
        guard('attract', CM.app.attract && CM.app.attract.reset);
      } else fail(e);
    }
    ctx.stats.steps = n;
    ctx.stats.simMs = now() - t0;
    guard('states', CM.app.update, nowMs);       // sequence timers, periodic run save (states.js)
    guard('render', function () { CM.render.draw(ctx, ctx.acc / DT, real, nowMs); });
    trackWork(now() - t0, nowMs, real * 1000, ctx.stats.simMs, n);
  }

  var started = false;
  // Starts the rAF loop once (main.boot calls it). last = 0 makes the first frame advance nothing.
  function start() {
    if (started) return;
    started = true;
    ctx.last = 0; ctx.acc = 0;
    root.requestAnimationFrame(frame);
  }

  // Forget the frame clock (resume, pageshow, visible again): no time jump on the next frame.
  function resetClock() { ctx.last = 0; ctx.acc = 0; }

  app.frame = frame;
  app.guard = guard;
  app.fail = fail;
  app.start = start;
  app.resetClock = resetClock;
  app.now = now;
  app.applyIntents = applyIntents;
})(typeof globalThis !== 'undefined' ? globalThis : this);
