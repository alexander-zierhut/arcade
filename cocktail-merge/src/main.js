// src/main.js: boot, viewport measuring and resize wiring, lifecycle, the settings toggles and the
// handlers given to CM.ui.init (DESIGN 3.1, 3.10, 5.5, 5.7, 5.9). Defines CM.main and re-exports the
// public app parts (5.5). The iOS page guards (pinch, rubber-band, callout) live in ui/input.js.
// Browser-only; the last script before the inline boot guard.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var C = CM.config;
  var doc = root.document;
  var BOOT_WAIT_MS = 1500, DEBOUNCE_MS = 150, LATE_ROTATE_MS = 500;
  var canvas = null, inputLayer = null, probe = null, booted = false;

  function ctx() { return CM.app.ctx; }
  function guard() { return CM.app.guard.apply(null, arguments); }

  // ---- viewport (3.1, 3.10) ---------------------------------------------------------------

  // JS px viewport: visualViewport unless it is missing or pinch-zoomed; never 100vh.
  function measure() {
    var vv = root.visualViewport, w, h;
    if (vv && !(vv.scale > 1.01) && vv.width > 0 && vv.height > 0) { w = vv.width; h = vv.height; }
    else { w = root.innerWidth || doc.documentElement.clientWidth; h = root.innerHeight || doc.documentElement.clientHeight; }
    return { vw: Math.max(1, Math.round(w)), vh: Math.max(1, Math.round(h)) };
  }

  // The hidden safe-area probe of 3.1 (created here when index.html has none).
  function readSafe() {
    if (!probe) {
      probe = doc.getElementById('safe-probe');
      if (!probe) {
        probe = doc.createElement('div');
        probe.id = 'safe-probe';
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
        doc.body.appendChild(probe);
      }
    }
    var cs = root.getComputedStyle(probe);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0,
             left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 };
  }

  function isCoarse() {
    try { return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }

  function sizeEl(el, vw, vh) {
    if (!el) return;
    el.style.width = vw + 'px';
    el.style.height = vh + 'px';
  }

  // Recomputes the layout and pushes it to render, ui and the ROTATE check (every resize).
  function relayout() {
    var c = ctx(), m = measure(), safe = readSafe();
    var dpr = Math.min(root.devicePixelRatio || 1, c.dprCap || 2);
    var lay = CM.projection.computeLayout(m.vw, m.vh, dpr, safe, { coarse: isCoarse() });
    c.lay = lay;
    var de = doc.documentElement.style;
    de.setProperty('--vw', m.vw + 'px');
    de.setProperty('--vh', m.vh + 'px');
    de.setProperty('--stage-x', lay.stage.x + 'px');
    de.setProperty('--stage-w', lay.S + 'px');
    sizeEl(canvas, m.vw, m.vh);
    sizeEl(inputLayer, m.vw, m.vh);
    var roots = doc.querySelectorAll('[data-viewport], #overlays, #ui');
    for (var i = 0; i < roots.length; i++) sizeEl(roots[i], m.vw, m.vh);
    guard('render', CM.render && CM.render.resize, lay);
    guard('ui', CM.ui && (CM.ui.applyLayout || CM.ui.layout), lay);
    if (c.game && c.state !== 'TITLE') guard('hud', function () { CM.ui.setHud(c.game, c.save); });
    guard('states', CM.app.checkPortrait, lay);
    return lay;
  }

  var resizeTimer = 0;
  function scheduleRelayout() {
    if (resizeTimer) root.clearTimeout(resizeTimer);
    resizeTimer = root.setTimeout(function () { resizeTimer = 0; guard('main', relayout); }, DEBOUNCE_MS);
  }

  function wireViewport() {
    if (root.visualViewport) root.visualViewport.addEventListener('resize', scheduleRelayout);
    root.addEventListener('resize', scheduleRelayout);
    root.addEventListener('orientationchange', function () {
      scheduleRelayout();
      root.setTimeout(function () { guard('main', relayout); }, LATE_ROTATE_MS);   // iOS reports late
    });
  }

  // ---- lifecycle (3.10, 5.9) --------------------------------------------------------------

  function persistNow() {
    var c = ctx();
    if (c.state === 'PLAY') CM.app.setState('PAUSE');          // saves and stores the run
    else { CM.app.writeSave(); CM.app.storeRun(); }
  }

  function wireLifecycle() {
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'hidden') guard('lifecycle', persistNow);
      else CM.app.resetClock();
    });
    root.addEventListener('pagehide', function () { guard('lifecycle', persistNow); });
    root.addEventListener('pageshow', function (e) {
      CM.app.resetClock();
      if (e && e.persisted) guard('main', relayout); else scheduleRelayout();
    });
  }

  // Music starts after the first user gesture (iOS); audio's own unlock listeners run first.
  function wireMusicStart() {
    var types = ['pointerup', 'touchend', 'click', 'keydown'], done = false;
    function kick() {
      if (done) return;
      done = true;
      types.forEach(function (t) { root.removeEventListener(t, kick, true); });
      guard('audio', applyMusic);
    }
    types.forEach(function (t) { root.addEventListener(t, kick, true); });
  }

  // ?debug=1: key 9 places two touching T8s (age 24) at y 30 around x 50 (5.10 says (40, 30) and (60, 30);
  // those only touch while R8 >= 10, so the pair is placed 2*R8 apart instead) to test the win.
  function wireDebug() {
    root.addEventListener('keydown', function (e) {
      var c = ctx();
      if (!c.debug || e.key !== '9' || c.state !== 'PLAY' || !c.game) return;
      var r = c.game.rules.RADII[8];
      CM.game.debugAddBody(c.game, 8, 50 - r, 30, 0, 0, { age: 24, cleared: true });
      CM.game.debugAddBody(c.game, 8, 50 + r, 30, 0, 0, { age: 24, cleared: true });
    });
  }

  // ---- settings toggles and the ui handlers (5.5 CM.ui.init) -----------------------------------

  var AMBIENT_STATES = { TITLE: 1, PLAY: 1, WIN_SEQ: 1, WIN_MENU: 1, LOSE_SEQ: 1, OVER_MENU: 1 };
  var HUD_STATES = { PLAY: 1, WIN_SEQ: 1, LOSE_SEQ: 1, WIN_MENU: 1, OVER_MENU: 1 };

  // b: the new value (the ui passes it) or undefined to flip the stored one.
  function setting(key, b) {
    var s = ctx().save;
    if (!s) return false;
    var cur = key === 'music' ? s.music !== false : !!s[key];
    s[key] = typeof b === 'boolean' ? b : !cur;
    return s[key];
  }

  function syncUi() {
    var c = ctx();
    if (c.game && HUD_STATES[c.state]) guard('hud', function () { CM.ui.setHud(c.game, c.save); });
    else guard('hud', CM.ui && CM.ui.setMuteIcons, !!(c.save && c.save.muted));
    guard('overlays', CM.ui && (CM.ui.refreshSettings || CM.ui.syncSettings), c.save);
  }

  // Music (owner round 2): its own persisted toggle, default on; it sounds only once the context runs.
  function applyMusic() {
    var s = ctx().save, on = !!(s && s.music !== false), a = CM.audio;
    if (!a) return;
    if (typeof a.setMusic === 'function') guard('audio', a.setMusic, on);
    if (a.music && typeof a.music.start === 'function') guard('audio', a.music.start);
  }

  function toggleMute(b) {
    var on = setting('muted', b);
    guard('audio', CM.audio && CM.audio.setMuted, !!on);
    CM.app.writeSave(); syncUi();
  }
  function toggleAmbience(b) {
    var on = setting('ambience', b);
    guard('audio', CM.audio && CM.audio.setAmbience, !!on);
    guard('audio', CM.audio && CM.audio.ambience, !!(on && AMBIENT_STATES[ctx().state]));
    CM.app.writeSave(); syncUi();
  }
  function toggleMusic(b) { setting('music', b); applyMusic(); CM.app.writeSave(); syncUi(); }
  function toggleNumbers(b) { setting('showNumbers', b); CM.app.writeSave(); syncUi(); }
  function toggleRelaxed(b) { setting('relaxed', b); CM.app.writeSave(); syncUi(); }
  // Performance mode (owner): pins the DPR cap at 1.25 and halves the particles; off restores the adaptive cap.
  function applyLowGfx(on) {
    var c = ctx(); c.lowGfx = !!on; c.dprCap = on ? 1.25 : 2; c.lowFx = !!on;
    guard('main', CM.main && CM.main.relayout);
  }
  // Bomb button: arm (choose a spot on the table) or disarm. Only in PLAY with a charge left.
  function toggleBomb() {
    var c = ctx(), it = c.intents, g = c.game;
    if (!it) return;
    if (it.bombMode) { it.bombMode = false; it.bombAt = null; it.bomb = null; return; }
    if (c.state !== 'PLAY' || !g || !(g.bombs > 0)) return;
    it.bombMode = true; it.bombAt = null; it.bomb = null; it.launch = null;
  }
  function toggleLowGfx(b) { var on = setting('lowGfx', b); applyLowGfx(on); CM.app.writeSave(); syncUi(); }

  // The handlers given to CM.ui.init (5.5) plus onPause, onToggleMusic, onPlayAgain and onTitle.
  function handlers() {
    var A = CM.app;
    return {
      onPlay: function () { A.newGame(); },
      onContinue: function () { A.continueRun(); },
      onNewGame: function () { A.newGame(); },
      onPlayAgain: function () { A.newGame(); },
      onRestart: function () { A.newGame(); },
      onPause: function () { if (ctx().state === 'PLAY') A.setState('PAUSE'); },
      onResume: function () { if (ctx().state === 'PAUSE') A.setState('PLAY'); },
      onQuit: function () { A.quitToTitle(); },
      onTitle: function () { A.quitToTitle(); },
      onKeepPlaying: function () { A.keepPlaying(); },
      onToggleMute: toggleMute,
      onToggleAmbience: toggleAmbience,
      onToggleMusic: toggleMusic,
      onToggleNumbers: toggleNumbers,
      onToggleRelaxed: toggleRelaxed,
      onToggleLowGfx: toggleLowGfx,
      onBomb: toggleBomb
    };
  }

  // Keys outside PLAY reach CM.ui.keyAction(code) (ui/input.js). overlays.js normally owns it; this
  // fallback keeps Esc / P / R working (5.7) if it does not. Returns true when the key was used.
  function fallbackKeyAction(code) {
    var A = CM.app, s = ctx().state;
    if (code === 'Escape') {
      if (s === 'PAUSE' || s === 'WIN_MENU' || s === 'OVER_MENU') { A.back('esc'); return true; }
    } else if (code === 'KeyP') {
      if (s === 'PAUSE') { A.setState('PLAY'); return true; }
    } else if (code === 'KeyR') {
      if (s === 'PAUSE' || s === 'WIN_MENU' || s === 'OVER_MENU') { A.keyRestart(); return true; }
    }
    return false;
  }

  function makeIntents() {
    var c = ctx();
    return {
      aimX: 50, aimDirty: false, launch: null, playing: false,
      bombMode: false, bombAt: null, bomb: null,          // bomb aiming (owner feature): set by the HUD button / input
      bombKey: function () { guard('settings', toggleBomb); },
      pause: function (key) { guard('states', CM.app.back, key); },
      escape: function () { guard('states', CM.app.back, 'Escape'); },
      mute: function () { guard('settings', toggleMute); },
      restart: function () { guard('states', CM.app.keyRestart); },
      state: function () { return c.state; }
    };
  }

  // ---- boot (5.7: BOOT -> TITLE) ----------------------------------------------------------

  function boot() {
    if (booted) return;
    booted = true;
    var c = ctx();
    c.debug = /[?&]debug=1\b/.test((root.location && root.location.search) || '');
    if (typeof root.CM_DEDICATION !== 'string' && root.console) {
      root.console.warn('[CM] src/dedication.js did not define its text; the title shows "' + C.DEDICATION_FALLBACK + '".');
    }
    var st = CM.ui && CM.ui.storage;
    c.save = (st && guard('storage', st.load)) || CM.game.normalizeSave(null);
    if (typeof c.save.music !== 'boolean') c.save.music = true;          // default on (see amendments/app.md)

    canvas = doc.getElementById('game') || doc.querySelector('canvas');
    inputLayer = doc.getElementById('input') || canvas;
    guard('render', CM.render && CM.render.init, canvas);
    guard('audio', CM.audio && CM.audio.init, { muted: !!c.save.muted, ambience: c.save.ambience !== false, music: c.save.music !== false });
    guard('audio', CM.audio && CM.audio.setMuted, !!c.save.muted);
    guard('audio', CM.audio && CM.audio.setAmbience, c.save.ambience !== false);
    guard('audio', applyMusic);
    if (c.save.lowGfx) guard('main', applyLowGfx, true);   // Performance mode persists across loads
    if (c.save.lowGfx) guard('main', applyLowGfx, true);

    c.intents = makeIntents();
    guard('ui', CM.ui && CM.ui.init, handlers());
    if (CM.ui && typeof CM.ui.keyAction !== 'function') CM.ui.keyAction = fallbackKeyAction;
    guard('input', function () {
      CM.ui.input.attach(inputLayer, function () { return ctx().lay; },
        function () { return (CM.render && CM.render.view) ? CM.render.view() : { zoom: 1, aboutX: 0, aboutY: 0 }; },
        c.intents);
    });

    wireViewport();
    wireLifecycle();
    wireMusicStart();
    wireDebug();
    guard('main', relayout);

    // Wait for the optional PNG overrides and the title scene, at most 1500 ms in total.
    var pending = 2, finished = false;
    function settle() {
      pending -= 1;
      if (pending > 0 || finished) return;
      finished = true;
      guard('main', enterTitle);
    }
    root.setTimeout(function () { pending = 0; settle(); }, BOOT_WAIT_MS);
    guard('art', function () {
      if (CM.config.PNG_OVERRIDES && CM.art && typeof CM.art.loadOverrides === 'function') CM.art.loadOverrides(BOOT_WAIT_MS, settle);
      else settle();                                      // overrides off (config.PNG_OVERRIDES): no probing, no wait
    });
    guard('attract', CM.app.attract.start, settle);               // attract game + title scene (settles once loaded)
  }

  var titled = false;
  function enterTitle() {
    if (titled) return;
    titled = true;
    CM.app.setState('TITLE');
    guard('main', relayout);                                      // ROTATE check now that BOOT is over
    CM.app.start();
  }

  // Boots after every classic script (and the inline boot guard) ran, unless the guard failed.
  // index.html may also call CM.main.boot() itself; boot() runs once.
  function autoBoot() {
    if (booted || CM.bootFailed || doc.getElementById('boot-error') || /boot-failed/.test(doc.body.className)) return;
    if (!doc.querySelector('canvas')) return;
    boot();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', autoBoot);
  else root.setTimeout(autoBoot, 0);

  CM.main = {
    boot: boot,
    relayout: relayout,
    handlers: handlers,
    toggleMute: toggleMute,
    setState: function (n) { return CM.app.setState(n); },
    newGame: function (seed) { return CM.app.newGame(seed); },
    continueRun: function () { return CM.app.continueRun(); },
    frame: function (t) { return CM.app.frame(t); },
    dispatch: function (ev, src) { return CM.app.dispatch(ev, src); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
