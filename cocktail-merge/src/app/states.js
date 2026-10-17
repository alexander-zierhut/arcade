// src/app/states.js: the app state machine (DESIGN 5.7): setState, newGame, continueRun,
// simulating, the win / lose sequences, the per-frame update (sequence timers, 10-s run save),
// and the handlers behind the overlay buttons and the P / Esc / M / R intents.
// States: BOOT TITLE PLAY PAUSE WIN_SEQ WIN_MENU LOSE_SEQ OVER_MENU ROTATE OOPS.
// Overlay ids passed to CM.ui.showOverlay: 'title' 'pause' 'win' 'over' 'rotate' 'oops' (null = none).
// Browser-only.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var app = CM.app = CM.app || {};
  var C = CM.config;
  var APP = (C && C.APP) || { INPUT_GUARD_MS: 250, RUN_SAVE_EVERY_MS: 10000, ARM_MS: 2000 };
  var FX = (C && C.FX) || {};
  var WIN_MENU_MS = FX.WIN_MENU_MS || 1600, LOSE_MENU_MS = FX.LOSE_MENU_MS || 1400;
  var OVERLAY = { TITLE: 'title', PAUSE: 'pause', WIN_MENU: 'win', OVER_MENU: 'over', ROTATE: 'rotate', OOPS: 'oops' };
  var HUD_ON = { PLAY: 1, WIN_SEQ: 1, LOSE_SEQ: 1, WIN_MENU: 1, OVER_MENU: 1 };
  var AMBIENCE_ON = { TITLE: 1, PLAY: 1, WIN_SEQ: 1, WIN_MENU: 1, LOSE_SEQ: 1, OVER_MENU: 1 };

  function ctx() { return CM.app.ctx; }
  function guard() { return CM.app.guard.apply(null, arguments); }
  function now() { return CM.app.now(); }
  function bgApi() { return CM.art && CM.art.backgrounds; }
  function tierName(t) { var T = C.TIERS[t]; return T ? T.name : ''; }

  function coarse() {
    try { return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }

  function urlSeed() {
    var m = /[?&]seed=(\d+)/.exec((root.location && root.location.search) || '');
    return m ? (Number(m[1]) >>> 0) : null;
  }

  // The saved run, validated with restoreGame (5.9); an invalid record is discarded silently.
  function savedRun() {
    var st = CM.ui && CM.ui.storage, rec = st && guard('storage', st.loadRun);
    if (!rec) return null;
    var g = rec && rec.game ? guard('restore', CM.game.restoreGame, rec.game) : null;
    if (!g || g.phase === 'over') { guard('storage', st.clearRun); return null; }
    return { record: rec, game: g };
  }

  function credits() {
    var bg = bgApi(), out = [];
    if (!bg) return out;
    if (typeof bg.credits === 'function') return guard('backgrounds', bg.credits) || out;
    var list = (typeof bg.list === 'function' && bg.list()) || (C && C.BACKGROUNDS && C.BACKGROUNDS.scenes) || [];
    for (var i = 0; i < list.length; i++) {
      var line = list[i] && (list[i].credit ||
        (typeof bg.creditLine === 'function' ? guard('backgrounds', bg.creditLine, list[i].key) : ''));
      if (line && out.indexOf(line) < 0) out.push(line);
    }
    return out;
  }

  function creditFor(key) {
    var bg = bgApi();
    if (!bg || !key) return '';
    if (typeof bg.creditLine === 'function') return guard('backgrounds', bg.creditLine, key) || '';
    var list = (typeof bg.list === 'function' && bg.list()) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return list[i].credit || '';
    return '';
  }

  // Everything an overlay might show; the ui picks what it needs.
  function overlayData(name) {
    var c = ctx(), s = c.save || {}, g = c.game, d = {
      state: name, save: s, game: g, lay: c.lay, coarse: coarse(),
      best: s.best || 0, wins: s.wins || 0, bestTier: s.bestTier || 1, highestName: tierName(s.bestTier || 1),
      score: g ? g.score : 0, newBest: !!(g && c.bestAtRunStart > 0 && g.score > c.bestAtRunStart)
    };
    if (name === 'TITLE') {
      var run = savedRun();
      d.run = run ? run.record : null;           // RunRecord (overlays.js reads run.game.score)
      d.hasRun = !!run;
      d.runScore = run ? run.game.score : 0;
      d.compact = !!(c.lay && c.lay.H < 700);
      d.credit = creditFor(c.attractBgKey);
      d.credits = credits();
    } else if (g) {
      d.highestTier = g.highestTier;
      d.highestTierName = tierName(g.highestTier);
      d.runMask = g.runMask;
    }
    return d;
  }

  function leavePlay() {
    var c = ctx();
    if (c.game) guard('game', CM.game.cancelLaunch, c.game);
    guard('input', CM.ui && CM.ui.input && CM.ui.input.reset);
    if (c.intents) { c.intents.launch = null; c.intents.aimDirty = false; c.intents.bombMode = false; c.intents.bombAt = null; c.intents.bomb = null; }
    c.heldDir = 0; c.heldS = 0;
  }

  function enterPlay(fromOverlay) {
    var c = ctx(), d = root.document, t = now();
    c.acc = 0; c.last = 0;                                   // resume: no time jump (5.7)
    if (fromOverlay) {
      c.guardUntilMs = t + APP.INPUT_GUARD_MS;
      guard('input', CM.ui && CM.ui.input && CM.ui.input.guardUntil, c.guardUntilMs);
    }
    guard('focus', function () {
      if (d.activeElement && d.activeElement !== d.body && d.activeElement.blur) d.activeElement.blur();
      var cv = d.getElementById('game') || d.querySelector('canvas');
      if (cv && cv.focus) cv.focus({ preventScroll: true });
    });
  }

  function setHudVisible(on) { guard('hud', CM.ui && CM.ui.setHudVisible, !!on); }

  // setState(name) (5.5, 5.7).
  function setState(name) {
    var c = ctx(), prev = c.state;
    if (prev === 'PLAY' && name !== 'PLAY') leavePlay();
    c.prevState = prev;
    c.state = name;
    if (c.intents) c.intents.playing = name === 'PLAY';

    if (name === 'TITLE' && prev !== 'TITLE' && prev !== 'ROTATE' && !(prev === 'BOOT' && c.attract)) {
      guard('attract', CM.app.attract.start);
    }
    showScene(name === 'TITLE' ? (c.attractBgKey || c.playBgKey) : (c.playBgKey || c.attractBgKey));
    if (name === 'TITLE' && prev !== 'TITLE' && prev !== 'ROTATE') preloadNextScene();
    if (name === 'PAUSE' && prev !== 'ROTATE') { CM.app.writeSave(); CM.app.storeRun(); }
    if (name === 'PLAY') enterPlay(prev !== 'PLAY' && prev !== 'WIN_SEQ' && prev !== 'BOOT');
    if (name === 'WIN_SEQ' || name === 'LOSE_SEQ') c.seqStartMs = now();
    if (name !== 'WIN_SEQ') c.slowmoStartMs = -1;
    if (name === 'PLAY' || name === 'TITLE') c.armedUntilMs = 0;

    guard('overlays', function () {
      var id = OVERLAY[name] || null;
      CM.ui.showOverlay(id, id ? overlayData(name) : undefined);
    });
    setHudVisible(!!HUD_ON[name]);
    if (HUD_ON[name] && c.game) guard('hud', function () { CM.ui.setHud(c.game, c.save); });
    guard('audio', CM.audio && CM.audio.ambience, !!(AMBIENCE_ON[name] && c.save && c.save.ambience !== false));
  }

  // ---- background scenes (CM.art.backgrounds) ----------------------------------------------
  // Works with the keyed API (pick, load(key, done), creditLine) and with the single-current-scene
  // API (pick, setScene(key, done), start(u, done, ms), current(), credits()).

  // Already the current scene: report once it has settled (polled, at most 2.5 s).
  function waitScene(bg, key, cb, left) {
    var st = typeof bg.state === 'function' ? bg.state() : 'flat';
    if (st !== 'loading' || left <= 0 || bg.current() !== key) { cb(st !== 'failed' && st !== 'loading'); return; }
    root.setTimeout(function () { waitScene(bg, key, cb, left - 1); }, 100);
  }

  // loadScene(key, done?): starts loading key; done(ok) once settled (never when there is no API).
  function loadScene(key, done) {
    var bg = bgApi(), cb = typeof done === 'function' ? done : function () {};
    if (!bg || !key) { cb(false); return; }
    if (typeof bg.load === 'function') guard('backgrounds', bg.load, key, cb);
    else if (typeof bg.setScene === 'function') {
      if (typeof bg.current === 'function' && bg.current() === key) waitScene(bg, key, cb, 25);
      else guard('backgrounds', bg.setScene, key, cb);
    } else cb(false);
  }

  // Makes key the scene drawn now (ctx.bgKey) and makes sure it is loading or loaded.
  function showScene(key) {
    var c = ctx();
    if (!key) return;
    c.bgKey = key;
    loadScene(key);
  }

  // Preloads the next game's scene while the title shows (keyed API only: setScene would switch).
  function preloadNextScene() {
    var c = ctx(), bg = bgApi();
    if (!bg || typeof bg.pick !== 'function' || typeof bg.load !== 'function') return;
    guard('backgrounds', function () {
      if (!c.nextPlayBgKey || c.nextPlayBgKey === c.playBgKey) c.nextPlayBgKey = bg.pick(c.playBgKey || null, Math.random());
      bg.load(c.nextPlayBgKey, function () {});
    });
  }

  // A new random scene for every new game, never the previous game's.
  function pickPlayScene() {
    var c = ctx(), bg = bgApi();
    if (!bg) return;
    guard('backgrounds', function () {
      var key = null;
      if (c.nextPlayBgKey && c.nextPlayBgKey !== c.playBgKey) key = c.nextPlayBgKey;
      else if (typeof bg.load !== 'function' && typeof bg.start === 'function') {
        key = bg.start(Math.random(), function () {}, 2500);     // remembers the last scene across reloads
      } else if (typeof bg.pick === 'function') key = bg.pick(c.playBgKey || null, Math.random());
      c.nextPlayBgKey = null;
      if (key) { c.playBgKey = key; loadScene(key); }
    });
  }

  function resetPresentation() {
    var c = ctx();
    c.hitStopMs = 0; c.slowmoStartMs = -1;
    guard('fx', CM.render && CM.render.fx && CM.render.fx.clear);
    guard('fx', CM.render && CM.render.setZoom, 1, null, 0);
  }

  // newGame(seed?) (5.7): mode from save.relaxed, bestAtRunStart, runMask ORed into discovered,
  // the stored run cleared, fx cleared, a new background scene.
  function newGame(seed) {
    var c = ctx(), s = c.save;
    var sd = (typeof seed === 'number' && isFinite(seed)) ? (seed >>> 0)
      : (urlSeed() !== null ? urlSeed() : ((Date.now() ^ 0x9E3779B9) >>> 0));
    var g = CM.game.createGame(sd, { mode: (s && s.relaxed === false) ? 'standard' : 'relaxed' });
    if (CM.app.scenario) guard('scenario', CM.app.scenario, g);   // ?scenario=jugs|fiesta|bomb|full (app/scenarios.js)
    c.game = g;
    c.bestAtRunStart = s ? s.best : 0;
    c.newBestShown = false;
    if (s) s.discovered = (s.discovered | g.runMask) & 0x1FF;
    CM.app.writeSave();
    CM.app.clearRun();
    resetPresentation();
    pickPlayScene();
    c.runSavedAtMs = now();
    setState('PLAY');
    return g;
  }

  // continueRun() (5.9): restores the stored run; on an invalid record the title shows Play again.
  function continueRun() {
    var c = ctx(), run = savedRun();
    if (!run) { setState('TITLE'); return false; }
    var meta = run.record.meta || {};
    c.game = run.game;
    c.bestAtRunStart = typeof meta.bestAtRunStart === 'number' ? meta.bestAtRunStart : (c.save ? c.save.best : 0);
    c.newBestShown = !!meta.newBestShown;
    resetPresentation();
    if (meta.bgKey && typeof meta.bgKey === 'string') c.playBgKey = meta.bgKey;
    else pickPlayScene();
    c.runSavedAtMs = now();
    setState('PLAY');
    return true;
  }

  // simulating() (5.8): PLAY and WIN_SEQ tick the play game, TITLE ticks the attract game.
  function simulating() {
    var s = ctx().state;
    return s === 'PLAY' || s === 'WIN_SEQ' || s === 'TITLE';
  }

  // ---- sequences --------------------------------------------------------------------------

  // The flash, rays, confetti and the 1.10 zoom about the jug come from render.fx on the win event.
  function onWin() {
    setState('WIN_SEQ');
    ctx().slowmoStartMs = now();
  }

  function onLose() { setState('LOSE_SEQ'); }

  function keepPlaying() {
    var c = ctx();
    if (c.state !== 'WIN_MENU' || !c.game) return;
    CM.game.continueAfterWin(c.game);
    CM.app.writeSave();
    guard('fx', CM.render && CM.render.setZoom, 1, null, FX.UNZOOM_MS || 400);   // about: the jug (kept)
    setState('PLAY');
  }

  // Per frame (loop.js): sequence timers and the 10-s run snapshot (5.9).
  function update() {
    var c = ctx(), t = now();
    if (c.state === 'WIN_SEQ' && t - c.seqStartMs >= WIN_MENU_MS) setState('WIN_MENU');
    else if (c.state === 'LOSE_SEQ' && t - c.seqStartMs >= LOSE_MENU_MS) setState('OVER_MENU');
    else if (c.state === 'PLAY' && t - (c.runSavedAtMs || 0) >= APP.RUN_SAVE_EVERY_MS) {
      c.runSavedAtMs = t;
      CM.app.storeRun();
    }
  }

  // ---- ROTATE (3.1) -----------------------------------------------------------------------

  var RETURN_TO = { PLAY: 'PAUSE', WIN_SEQ: 'WIN_MENU', LOSE_SEQ: 'OVER_MENU' };
  function checkPortrait(lay) {
    var c = ctx();
    if (!lay || c.state === 'BOOT') return;
    if (lay.needsPortrait && c.state !== 'ROTATE') {
      var back = RETURN_TO[c.state] || c.state;
      if (c.state === 'PLAY') setState('PAUSE');
      c.rotateReturn = back;
      setState('ROTATE');
    } else if (!lay.needsPortrait && c.state === 'ROTATE') {
      setState(c.rotateReturn || 'TITLE');
    }
  }

  // ---- intents and handlers ---------------------------------------------------------------

  function quitToTitle() {
    var c = ctx();
    if (c.state === 'PAUSE' || c.state === 'WIN_MENU') CM.app.storeRun();
    CM.app.writeSave();
    setState('TITLE');
  }

  // P / Esc: PLAY <-> PAUSE, Esc = Keep Playing in WIN_MENU and Title in OVER_MENU (5.7).
  function back(key) {
    var s = ctx().state;
    if (s === 'PLAY') setState('PAUSE');
    else if (s === 'PAUSE') setState('PLAY');
    else if (s === 'WIN_MENU') keepPlaying();
    else if (s === 'OVER_MENU' && key !== 'p' && key !== 'P') quitToTitle();
  }

  // R: armed in PAUSE when the score > 0; immediate in WIN_MENU and OVER_MENU (3.5, 3.6).
  function keyRestart() {
    var c = ctx(), s = c.state, t = now();
    if (s === 'WIN_MENU' || s === 'OVER_MENU') { newGame(); return; }
    if (s !== 'PAUSE') return;
    if (!c.game || c.game.score <= 0 || t < (c.armedUntilMs || 0)) { newGame(); return; }
    c.armedUntilMs = t + APP.ARM_MS;
    guard('overlays', CM.ui && CM.ui.armRestart);
  }

  app.setState = setState;
  app.newGame = newGame;
  app.continueRun = continueRun;
  app.simulating = simulating;
  app.update = update;
  app.onWin = onWin;
  app.onLose = onLose;
  app.keepPlaying = keepPlaying;
  app.quitToTitle = quitToTitle;
  app.back = back;
  app.keyRestart = keyRestart;
  app.checkPortrait = checkPortrait;
  app.showScene = showScene;
  app.loadScene = loadScene;
  app.overlayData = overlayData;
})(typeof globalThis !== 'undefined' ? globalThis : this);
