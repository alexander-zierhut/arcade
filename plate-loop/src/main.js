// src/main.js: boot and the app: loads the sprites, shows the title, runs a level or an endless round (sim.tick ->
// events -> scene / audio), and the state machine TITLE / MODES / HOWTO / PLAY / PAUSE / WIN / LOSE.
// window.PlateLoop.app is what the browser tests read: state, sim, level, mode, tier, noLuck, assets, start, tap, loop.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var doc = root.document;
  var Arcade = root.Arcade;
  var END_DELAY_MS = 600;
  var AUDIO_OF = { eject: 'eject', land: 'land', close: 'close', refuse: 'refuse', reveal: 'reveal', unlock: 'unlock', unwrap: 'unwrap', thaw: 'thaw', won: 'win', lost: 'lose' };
  var ALL_MECHS = ['hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'];

  var st = 'LOADING';
  var canvas = null, wrap = null;
  var running = false, lastTs = 0, dirty = false, ending = null, failed = false;
  var viewW = 0, viewH = 0, viewDpr = 0;
  var runSeed = 0, roundNo = 0, runBest = false, warned = {};

  var app = PL.app = {
    mode: 'level', tier: 'easy', noLuck: false, streak: 0,
    sim: null, level: null, scene: null, assets: null, attempt: 0, kindMap: null,
    start: start, tap: tap, loop: frame,
    playLevels: playLevels, startEndless: startEndless, pause: pause, resume: resume, restart: restart,
    toTitle: toTitle, next: next, replay: replay, retry: retry, setSound: setSound, resize: resize
  };
  // app.state is a plain string, except that the endless chooser card counts as MODES
  Object.defineProperty(app, 'state', {
    enumerable: true,
    get: function () { return st === 'TITLE' && PL.screens && PL.screens.current() === 'modes' ? 'MODES' : st; },
    set: function (v) { st = v; }
  });

  function warnOnce(key, msg, err) {
    if (warned[key]) return;
    warned[key] = true;
    if (root.console && root.console.warn) root.console.warn('[plate-loop] ' + msg, err || '');
  }
  function t(k, v) { return PL.strings ? PL.strings.t(k, v) : k; }
  function save() { return PL.save || null; }
  function soundOn() { return save() ? save().get().sound !== false : true; }
  function low() { try { return !!(Arcade && Arcade.perf && Arcade.perf.low()); } catch (e) { return false; } }
  function toast(msg) { try { if (Arcade && Arcade.toast) Arcade.toast(msg); } catch (e) { /* no kit */ } }
  function levelsTotal() { return PL.levels && PL.levels.length ? PL.levels.length : 100; }
  function missing() {
    var need = ['sim', 'scene', 'layouts', 'model'], out = [];
    for (var i = 0; i < need.length; i++) if (!PL[need[i]]) out.push('PlateLoop.' + need[i]);
    return out;
  }

  // ------------------------------------------------------------------ canvas size and the cheap mode
  function resize() {
    if (!canvas || !wrap) return;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    var dpr = low() ? 1 : Math.min(2, root.devicePixelRatio || 1);
    if (w === viewW && h === viewH && dpr === viewDpr) return;
    viewW = w; viewH = h; viewDpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var sc = app.scene;
    if (sc && typeof sc.resize === 'function') { try { sc.resize(w, h, dpr); } catch (e) { warnOnce('scene.resize', 'scene.resize failed', e); } }
    dirty = true; ensureLoop();
  }
  function applyPerf() {
    var sc = app.scene;
    if (sc && typeof sc.lowPerf === 'function') { try { sc.lowPerf(low()); } catch (e) { warnOnce('scene.lowPerf', 'scene.lowPerf failed', e); } }
    viewDpr = 0; resize();
  }

  // ------------------------------------------------------------------ the loop
  function needsFrames() { return !!(app.sim && app.scene && (st === 'PLAY' || st === 'WIN' || st === 'LOSE' || dirty)); }
  function ensureLoop() {
    if (running || !root.requestAnimationFrame) return;
    running = true; lastTs = 0;
    root.requestAnimationFrame(frame);
  }
  function frame(ts) {
    if (!needsFrames() || failed) { running = false; return; }
    var dt = lastTs ? Math.min(100, ts - lastTs) : 16;
    if (dt < 0) dt = 0;
    lastTs = ts;
    var playing = st === 'PLAY' || st === 'WIN' || st === 'LOSE';
    // a kit sheet (changelog, campaign, app hint) over a running level pauses the game; the belt must not tick behind a card
    if (st === 'PLAY' && !ending && root.Arcade && typeof Arcade.sheetOpen === 'function' && Arcade.sheetOpen()) { pause(); playing = false; }
    try {
      if (playing) {
        var events = PL.sim.tick(app.sim, dt) || [];
        for (var i = 0; i < events.length; i++) handleEvent(events[i]);
        if (st === 'PLAY' && !ending && app.sim.status && app.sim.status !== 'play') beginEnding(app.sim.status === 'won' ? 'won' : 'lost');
        if (ending) {
          ending.t += dt;
          if (ending.t >= END_DELAY_MS) { var kind = ending.kind; ending = null; finish(kind); }
        }
      }
      app.scene.render(app.sim, playing ? dt : 0);
    } catch (e) {
      failed = true;
      warnOnce('frame', 'the game loop stopped', e);
    }
    dirty = false;
    if (running) root.requestAnimationFrame(frame);
  }

  function handleEvent(ev) {
    if (!ev) return;
    if (app.scene && typeof app.scene.flash === 'function') app.scene.flash(ev);
    audio(ev.type);
    if (ev.type === 'won') beginEnding('won');
    else if (ev.type === 'lost') beginEnding('lost');
  }
  function audio(type) {
    var name = AUDIO_OF[type];
    if (!name || !PL.audio || typeof PL.audio.play !== 'function' || !soundOn()) return;
    try { PL.audio.play(name); } catch (e) { warnOnce('audio', 'audio.play failed', e); }
  }
  function beginEnding(kind) {
    if (ending || st !== 'PLAY') return;
    ending = { kind: kind, t: 0 };
  }

  // ------------------------------------------------------------------ rounds
  function pickLevel(id) {
    var list = PL.levels || [];
    if (list[id - 1] && list[id - 1].id === id) return list[id - 1];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** start(level | tier): a number starts that level of the fixed sequence, a tier name starts an endless run. */
  function start(arg) {
    if (typeof arg === 'string') return startEndless(arg, app.noLuck);
    var id = Math.max(1, Math.floor(Number(arg) || 1));
    var level = pickLevel(id);
    if (!level) { warnOnce('level' + id, 'level ' + id + ' is not available (PlateLoop.levels)'); return false; }
    app.mode = 'level'; app.tier = level.tier; app.noLuck = false; app.streak = 0;
    return startRound(level);
  }
  function playLevels() {
    var gone = missing();
    if (gone.length || !PL.levels) { warnOnce('modules', 'cannot play yet, missing: ' + gone.concat(PL.levels ? [] : ['PlateLoop.levels']).join(', ')); return; }
    var lvl = save() ? save().get().level : 1;
    start(Math.min(lvl, levelsTotal()));
  }

  function startRound(level) {
    var gone = missing();
    if (gone.length) { warnOnce('modules', 'cannot play yet, missing: ' + gone.join(', ')); return false; }
    if (PL.screens) PL.screens.show('board');
    resize();
    var attempt;
    if (app.mode === 'level' && save()) attempt = save().attempt(level.id);
    else { roundNo++; attempt = roundNo; }
    var layout = PL.layouts[level.layout], sim, scene;
    try {
      sim = PL.sim.create(level, { perimeter: layout.perimeter, lapMs: PL.config && PL.config.LAP_MS ? PL.config.LAP_MS : 8000, layout: layout });
      scene = PL.scene.create(canvas, layout);
    } catch (e) {
      warnOnce('create' + level.id, 'could not set up level ' + level.id, e);
      toast(t('preparing'));
      toTitle();
      return false;
    }
    app.level = level; app.sim = sim; app.scene = scene; app.attempt = attempt;
    app.kindMap = PL.model.permutation(level.id || level.seed || 0, attempt);   // endless levels have id 0: their seed varies the look instead
    if (typeof scene.kindMap === 'function') scene.kindMap(app.kindMap); else scene.kindMap = app.kindMap;
    if (typeof scene.noLuck === 'function') scene.noLuck(!!app.noLuck);
    if (typeof scene.lowPerf === 'function') scene.lowPerf(low());
    viewW = 0; resize();                                   // the new scene gets the canvas size
    ending = null; failed = false;
    if (PL.screens) PL.screens.setPill(app.mode === 'endless' ? { mode: 'endless', tier: app.tier, streak: app.streak } : { mode: 'level', level: level.id, tier: level.tier });
    var pages = PL.screens ? PL.screens.unseen(level) : [];
    if (app.mode === 'endless') pages = pages.filter(function (p) { return p === 'basics'; });
    dirty = true;
    if (pages.length) {
      st = 'HOWTO';
      PL.screens.show('howto', { pages: pages, back: 'title', onDone: begin });
      ensureLoop();
    } else begin();
    return true;
  }
  function begin() {
    st = 'PLAY';
    if (PL.screens) PL.screens.show('play');
    dirty = true; ensureLoop();
  }

  // ------------------------------------------------------------------ endless
  function startEndless(tier, noLuck) {
    var gone = missing();
    if (gone.length || !PL.generator) { warnOnce('modules', 'cannot play endless yet, missing: ' + gone.concat(PL.generator ? [] : ['PlateLoop.generator']).join(', ')); return; }
    app.mode = 'endless'; app.tier = tier || 'easy'; app.noLuck = !!noLuck; app.streak = 0; roundNo = 0; runBest = false;
    runSeed = Math.floor(Math.random() * 1000000) * 31 + 7;
    nextRound(true);
  }
  function generateLevel() {
    var allow = app.noLuck ? ALL_MECHS.filter(function (m) { return m !== 'hidden'; }) : ALL_MECHS.slice();
    var base = (runSeed + app.streak * 7919) >>> 0;
    for (var i = 0; i < 12; i++) {
      try {
        var out = PL.generator.generate({ tier: app.tier, seed: (base + i * 104729) >>> 0, allow: allow });
        if (out && out.level) { var lv = out.level; if (lv.id === undefined || lv.id === null) lv.id = (base + i * 104729) >>> 0; return lv; }
      } catch (e) { warnOnce('gen', 'generator failed', e); }
    }
    return null;
  }
  function nextRound(fromChooser) {
    var btn = doc.getElementById(fromChooser ? 'modes-start' : 'win-next');
    if (btn) { btn.disabled = true; btn.textContent = t('preparing'); }
    root.setTimeout(function () {
      var level = generateLevel();
      if (btn) { btn.disabled = false; btn.textContent = t(fromChooser ? 'start' : 'next_round'); }
      if (!level) { toast(t('preparing')); warnOnce('gen0', 'no level could be generated for ' + app.tier); return; }
      startRound(level);
    }, 40);
  }

  // ------------------------------------------------------------------ state changes
  function finish(kind) {
    var level = app.level, s = save();
    if (kind === 'won') {
      st = 'WIN';
      if (app.mode === 'endless') {
        app.streak++;
        if (s && s.bestStreak(app.tier, app.streak)) runBest = true;
        PL.screens.setPill({ mode: 'endless', tier: app.tier, streak: app.streak });
        PL.screens.show('win', { mode: 'endless', tier: app.tier, streak: app.streak });
      } else {
        if (s) s.cleared(level.id);
        PL.screens.show('win', { mode: 'level', level: level.id });
      }
    } else {
      st = 'LOSE';
      if (app.mode === 'endless') PL.screens.show('lose', { mode: 'endless', tier: app.tier, streak: app.streak, newBest: runBest });
      else PL.screens.show('lose', { mode: 'level', level: level.id });
    }
  }
  function pause() {
    if (st !== 'PLAY' || ending) return;
    st = 'PAUSE';
    PL.screens.show('pause');
  }
  function resume() {
    if (st !== 'PAUSE') return;
    st = 'PLAY';
    PL.screens.show('play');
    lastTs = 0; dirty = true; ensureLoop();
  }
  function restart() {
    if (!app.level) return;
    startRound(app.level);
  }
  function toTitle() {
    st = 'TITLE'; ending = null;
    app.sim = null; app.scene = null; app.level = null;
    if (PL.screens) PL.screens.show('title');
  }
  function next() {
    if (app.mode === 'endless') { nextRound(false); return; }
    var id = app.level ? app.level.id : 0;
    if (id >= levelsTotal()) { st = 'TITLE'; PL.screens.show('title'); PL.screens.show('modes', { back: 'title' }); return; }
    start(id + 1);
  }
  function replay() { if (app.level) startRound(app.level); }
  function retry() {
    if (app.mode === 'endless') { startEndless(app.tier, app.noLuck); return; }
    replay();
  }
  function setSound(on) {
    var a = PL.audio;
    if (!a) return;
    try { if (typeof a.setMuted === 'function') a.setMuted(!on); else a.muted = !on; } catch (e) { /* audio is optional */ }
  }

  /** tap(i): the player tapped box i (the input module calls this with scene.hit's result). */
  function tap(i) {
    if (st !== 'PLAY' || ending || !app.sim || app.sim.status !== 'play' || i === undefined || i === null || i < 0) return null;
    var r;
    try { r = PL.sim.tap(app.sim, i); } catch (e) { warnOnce('tap', 'sim.tap failed', e); return null; }
    if (r && !r.ok) {
      var ev = { type: 'refuse', box: i, reason: r.reason };
      if (app.scene && typeof app.scene.flash === 'function') app.scene.flash(ev);
      if (r.reason === 'full' || r.reason === 'pair' || r.reason === 'pending') audio('refuse');
    } else if (r && r.ok) {
      // the pieces leave the box at once onto teleported plates; the scene animates the trapdoors on the eject events
      if (app.scene && typeof app.scene.flash === 'function') {
        var evs = r.events && r.events.length ? r.events : [{ type: 'tapped', box: i, k: r.k }];   // tapped (with the departure plan), reveal, unlock
        for (var e = 0; e < evs.length; e++) app.scene.flash(evs[e]);
      }
      audio('eject');
    }
    return r;
  }

  // ------------------------------------------------------------------ boot
  function preloadImages(list, done) {
    var left = list.length, finished = false;
    function one() { if (--left <= 0) end(); }
    function end() { if (finished) return; finished = true; done(); }
    if (!left) { end(); return; }
    for (var i = 0; i < list.length; i++) {
      var im = list[i];
      if (im.complete) { one(); continue; }
      im.addEventListener('load', one); im.addEventListener('error', one);
    }
    root.setTimeout(end, 2500);
  }
  function titleReady() {
    if (st !== 'LOADING') return;
    var a = app.assets;
    if (!a || !Array.isArray(a.failed)) { a = app.assets = a || {}; if (!Array.isArray(a.failed)) a.failed = []; }
    st = 'TITLE';
    PL.screens.show('title');
    try { if (Arcade) Arcade.ready(); } catch (e) { /* no kit */ }
  }
  function boot() {
    if (!doc) return;
    canvas = doc.getElementById('board'); wrap = doc.getElementById('board-wrap');
    if (PL.screens) PL.screens.init();
    else warnOnce('screens', 'PlateLoop.screens is missing');
    applyPerf();
    if (PL.input && typeof PL.input.attach === 'function' && canvas) PL.input.attach(canvas, function (i) { tap(i); });
    else warnOnce('input', 'PlateLoop.input is missing: the board cannot be tapped yet');
    // the audio module reads the stored sound flag itself; writing it at boot would mark a first visit as a return

    var imgs = [];
    var q = doc.querySelectorAll('#logo-img, .end-img');
    for (var i = 0; i < q.length; i++) imgs.push(q[i]);
    var spritesDone = false, imagesDone = false, started = false;
    function check() {
      if (spritesDone && imagesDone && !started) { started = true; titleReady(); }
    }
    preloadImages(imgs, function () { imagesDone = true; check(); });
    if (PL.sprites && typeof PL.sprites.load === 'function') {
      var timer = root.setTimeout(function () {
        warnOnce('sprites-timeout', 'the sprites took too long, starting anyway');
        app.assets = { failed: ['timeout'], total: 0, loaded: 0 };
        spritesDone = true; check();
      }, 9000);
      try {
        PL.sprites.load('assets/sprites/', function () {
          root.clearTimeout(timer);
          if (spritesDone) return;
          try { app.assets = typeof PL.sprites.status === 'function' ? PL.sprites.status() : { failed: [] }; } catch (e) { app.assets = { failed: [] }; }
          spritesDone = true; check();
        }, function (done, total) {
          // the sprite loader reports a fraction 0..1 (or done, total)
          try { if (Arcade && Arcade.loading) Arcade.loading.progress(total === undefined ? done : done, total === undefined ? 1 : total); } catch (e) { /* no kit */ }
        });
      } catch (e) {
        root.clearTimeout(timer);
        warnOnce('sprites', 'PlateLoop.sprites.load failed', e);
        app.assets = { failed: ['load'], total: 0, loaded: 0 };
        spritesDone = true; check();
      }
    } else {
      warnOnce('sprites', 'PlateLoop.sprites is missing: starting without sprites');
      app.assets = { failed: [], total: 0, loaded: 0, missing: true };
      spritesDone = true; check();
    }

    root.addEventListener('resize', resize);
    root.addEventListener('orientationchange', function () { root.setTimeout(resize, 120); });
    if (root.ResizeObserver && wrap) { try { new root.ResizeObserver(resize).observe(wrap); } catch (e) { /* resize event is enough */ } }
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) pause(); });
    root.addEventListener('pagehide', pause);
    doc.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
      if (st === 'PLAY') { pause(); ev.preventDefault(); }
      else if (st === 'PAUSE' && PL.screens.current() === 'pause') { resume(); ev.preventDefault(); }
      else if (PL.screens && PL.screens.back()) ev.preventDefault();
    });
    doc.addEventListener('pointerdown', function first() {
      doc.removeEventListener('pointerdown', first);
      if (PL.audio && typeof PL.audio.unlock === 'function') { try { PL.audio.unlock(); } catch (e) { /* optional */ } }
    });
    if (Arcade && Arcade.on) Arcade.on('perf', applyPerf);
  }

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
