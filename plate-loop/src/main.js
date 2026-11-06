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

  var st = 'LOADING';
  var canvas = null, wrap = null;
  var running = false, lastTs = 0, dirty = false, ending = null, failed = false;
  var viewW = 0, viewH = 0, viewDpr = 0;
  var runSeed = 0, roundNo = 0, runBest = false, warned = {}, lostReason = 'jam';
  var worker = null, workerBroken = false, pending = {}, msgId = 0, searchToken = 0, hunt = null;
  // the recording of the round on screen (every frame's dt and the taps between frames: the sim is deterministic, so
  // this replays the round bit for bit) and the replay in progress
  var rec = { frames: [], taps: [] }, lastEnd = null, rp = null;
  var REPLAY_SECONDS = 30, REPLAY_MAX_SPEED = 120, REPLAY_HOLD_MS = 1200, REPLAY_WORK_MS = 8;
  var HUNT_CHUNK_MS = 2500;
  var WORKER_URL = 'src/gen/worker.js';

  var app = PL.app = {
    mode: 'level', tier: 'easy', difficulty: 1, noLuck: false, disabled: [], streak: 0, code: null,
    sim: null, level: null, scene: null, assets: null, attempt: 0, kindMap: null,
    start: start, tap: tap, loop: frame, step: step,
    playLevels: playLevels, startEndless: startEndless, playCode: playCode, startHunt: startHunt, huntPlay: huntPlay, huntStop: huntStop,
    pause: pause, resume: resume, restart: restart,
    toTitle: toTitle, next: next, replay: replay, retry: retry, setSound: setSound, setPlain: setPlain, setBelt: setBelt, resize: resize,
    watchReplay: watchReplay, stopReplay: stopReplay, hasReplay: function () { return !!(lastEnd && rec.frames.length); }
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
  function plainOn() { return save() ? save().get().plain === true : false; }
  function beltStyle() { return plainOn() ? 'stream' : (save() ? save().get().belt : 'plates'); }   // plain graphics never show plates
  function updateSlots() {
    var sc = app.scene, stream;
    if (!PL.screens || !app.sim) return;
    stream = sc && typeof sc.stream === 'function' ? sc.stream() : beltStyle() === 'stream';   // the scene knows the effective style
    if (!stream) { PL.screens.setSlots(null); return; }
    PL.screens.setSlots(PL.sim.freePlates(app.sim), app.sim.state.N);
  }
  function difficultyOf(d) { d = Math.round(Number(d) || 1); return d < 1 ? 1 : d > 10 ? 10 : d; }
  function diffSpec(d) { return PL.generator && PL.generator.DIFFICULTY ? PL.generator.DIFFICULTY[difficultyOf(d)] : { tier: 'easy', H: [0, 1], budgetMs: 3000 }; }
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
  function needsFrames() { return !!(app.sim && app.scene && (st === 'PLAY' || st === 'WIN' || st === 'LOSE' || st === 'REPLAY' || dirty)); }
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
    step(dt);
    if (running) root.requestAnimationFrame(frame);
  }
  // step(dt): one frame of the game with that many ms (the browser tests fast-forward with it; it never schedules a frame)
  function step(dt) {
    if (failed || !app.sim || !app.scene) return;
    var playing = st === 'PLAY' || st === 'WIN' || st === 'LOSE';
    // a kit sheet (changelog, campaign, app hint) over a running level pauses the game; the belt must not tick behind a card
    if (st === 'PLAY' && !ending && root.Arcade && typeof Arcade.sheetOpen === 'function' && Arcade.sheetOpen()) { pause(); playing = false; }
    try {
      if (st === 'REPLAY') { replayFrame(dt); dirty = false; return; }
      if (playing) {
        if (st === 'PLAY' || ending) rec.frames.push(dt);
        var events = PL.sim.tick(app.sim, dt) || [];
        for (var i = 0; i < events.length; i++) handleEvent(events[i]);
        if (st === 'PLAY' && !ending && app.sim.status && app.sim.status !== 'play') beginEnding(app.sim.status === 'won' ? 'won' : 'lost');
        if (ending) {
          ending.t += dt;
          if (ending.t >= END_DELAY_MS) { var kind = ending.kind; ending = null; finish(kind); }
        }
      }
      app.scene.render(app.sim, playing ? dt : 0);
      if (playing) updateSlots();
    } catch (e) {
      failed = true;
      warnOnce('frame', 'the game loop stopped', e);
    }
    dirty = false;
  }

  function handleEvent(ev) {
    if (!ev) return;
    if (app.scene && typeof app.scene.flash === 'function') app.scene.flash(ev);
    audio(ev.type);
    if (ev.type === 'won') beginEnding('won');
    else if (ev.type === 'lost') { lostReason = ev.reason === 'hopeless' ? 'hopeless' : 'jam'; beginEnding('lost'); }
  }
  function audio(type) {
    var name = AUDIO_OF[type];
    if (!name || !PL.audio || typeof PL.audio.play !== 'function' || !soundOn() || st === 'REPLAY') return;
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
    rec = { frames: [], taps: [] }; lastEnd = null; rp = null;
    app.kindMap = PL.model.permutation(level.id || level.seed || 0, attempt);   // endless levels have id 0: their seed varies the look instead
    if (typeof scene.kindMap === 'function') scene.kindMap(app.kindMap); else scene.kindMap = app.kindMap;
    if (typeof scene.noLuck === 'function') scene.noLuck(!!app.noLuck);
    if (typeof scene.plain === 'function') scene.plain(plainOn());
    if (typeof scene.beltStyle === 'function') scene.beltStyle(beltStyle());
    if (typeof scene.lowPerf === 'function') scene.lowPerf(low());
    viewW = 0; resize();                                   // the new scene gets the canvas size
    ending = null; failed = false;
    if (PL.screens) PL.screens.setPill(app.mode === 'endless' ? { mode: 'endless', difficulty: app.difficulty, tier: app.tier, streak: app.streak } : { mode: 'level', level: level.id, tier: level.tier });
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

  // ------------------------------------------------------------------ endless: the level search off the main thread
  // search(msg, onProgress) -> Promise of the worker's reply (src/gen/worker.js). A Web Worker when the browser has one
  // (the phone stays responsive while the generator hunts for a hard level); the same code inline otherwise.
  function post(msg) { var w = getWorker(); if (w) { w.postMessage(msg); return true; } return false; }
  // the addresses of the engine scripts and of the worker file, as the page loaded them (content-hashed names included)
  function scriptUrls() {
    var tags = doc.querySelectorAll('script[src]'), engine = [], workerUrl = null, i, src, abs;
    for (i = 0; i < tags.length; i++) {
      src = tags[i].getAttribute('src') || '';
      try { abs = new root.URL(src, root.location.href).href; } catch (e) { abs = src; }
      if (/src\/gen\/worker(\.[0-9a-f]+)?\.js$/.test(src)) workerUrl = abs;
      else if (/src\/(config|engine\/[a-z]+|gen\/[a-z]+|levels\/layouts)(\.[0-9a-f]+)?\.js$/.test(src)) engine.push(abs);
    }
    return { engine: engine, worker: workerUrl || WORKER_URL };
  }
  function getWorker() {
    if (worker || workerBroken || !root.Worker) return worker;
    var urls = scriptUrls();
    try {
      worker = new root.Worker(urls.worker);
      worker.onmessage = function (ev) {
        var r = ev.data || {}, cb = pending[r.id];
        if (!cb) return;
        if (r.progress !== undefined) { if (cb.progress) cb.progress(r.progress, r.hard); return; }
        delete pending[r.id];
        cb.done(r);
      };
      worker.onerror = function (e) {
        warnOnce('worker', 'the level worker failed, searching inline instead', e && e.message);
        workerBroken = true;
        try { worker.terminate(); } catch (err) { /* already gone */ }
        worker = null;
        for (var id in pending) if (pending.hasOwnProperty(id)) { var cb = pending[id]; delete pending[id]; runInline(cb.msg, cb); }
      };
      worker.postMessage({ id: 0, cmd: 'init', scripts: urls.engine });
    } catch (e) { warnOnce('worker', 'no level worker', e); workerBroken = true; worker = null; }
    return worker;
  }
  function runInline(msg, cb) {
    root.setTimeout(function () {
      if (!PL.search) { cb.done({ ok: false, error: 'no search module' }); return; }
      PL.search.run(msg, function (r) {
        if (r.progress !== undefined) { if (cb.progress) cb.progress(r.progress, r.hard); return; }
        cb.done(r);
      });
    }, 30);
  }
  function search(msg, onProgress) {
    return new Promise(function (resolve) {
      msg.id = ++msgId;
      var cb = { msg: msg, progress: onProgress, done: resolve };
      pending[msg.id] = cb;
      if (!post(msg)) { delete pending[msg.id]; runInline(msg, cb); }
    });
  }

  // setRun(difficulty, disabled): the settings of an endless run. `disabled` is the list of mechanics switched off (or
  // a "no luck" boolean); difficulties that force "no luck" add hidden to it.
  function setRun(difficulty, disabled) {
    var g = PL.generator, list = g && g.disabledOf ? g.disabledOf(disabled) : [];
    app.mode = 'endless'; app.difficulty = difficultyOf(difficulty); app.tier = diffSpec(app.difficulty).tier;
    if (diffSpec(app.difficulty).noLuck && !diffSpec(app.difficulty).luckAllowed && list.indexOf('hidden') < 0) list.push('hidden');   // 10 allows luck as the chooser's choice
    app.disabled = g && g.disabledOf ? g.disabledOf(list) : list;
    app.noLuck = app.disabled.indexOf('hidden') >= 0;
    app.streak = 0; app.code = null; roundNo = 0; runBest = false;
    runSeed = Math.floor(Math.random() * 1000000) * 31 + 7;
  }
  function ready() {
    var gone = missing();
    if (gone.length || !PL.generator) { warnOnce('modules', 'cannot play endless yet, missing: ' + gone.concat(PL.generator ? [] : ['PlateLoop.generator']).join(', ')); return false; }
    return true;
  }
  function startEndless(difficulty, disabled) {
    if (!ready()) return;
    huntStop();
    setRun(difficulty, disabled);
    nextRound(true);
  }

  // ------------------------------------------------------------------ the hunt: search without end, keep the hardest
  // startHunt(difficulty, disabled): chunks of HUNT_CHUNK_MS in the worker, each returning its hardest candidate; the
  // main thread keeps the overall best and reports { candidates, best, bestAt, ready } to the chooser after every
  // candidate. huntPlay() starts the best level (after the running chunk returns, it may hold a better one),
  // huntStop() drops everything.
  function huntChunk() {
    var h = hunt, spec, seed;
    if (!h || h.stopped) return;
    spec = diffSpec(h.difficulty);
    seed = (runSeed + h.chunk * 7919) >>> 0;
    h.chunk++;
    h.running = true;
    search({ cmd: 'search', tier: spec.tier, seed: seed, allow: PL.generator.allowOf(h.disabled), hardness: [0, 9], look: h.look, hardest: true,
      verify: { games: 12, maxRate: 0, top: 3 }, buffer: spec.buffer || 'prefer', tight: !!spec.tight, candidates: 100000, budgetMs: HUNT_CHUNK_MS }, function (n, hh) {
      if (h.stopped || h.token !== searchToken) return;
      h.candidates++;
      if (hh > h.bestH) { h.bestH = hh; h.bestAt = Date.now(); }
      huntReport();
    }).then(function (r) {
      h.running = false;
      if (h.stopped || h.token !== searchToken) return;
      if (r.ok && r.level) {
        var br = typeof r.bot === 'number' ? r.bot : 1;
        if (!h.best || br < h.best.bot || (br === h.best.bot && r.hard > h.best.hard)) h.best = { level: r.level, hard: r.hard, bot: br, seed: r.level.seed };
      }
      huntReport();
      if (h.wantPlay) { huntStart(); return; }
      huntChunk();
    });
  }
  function huntReport() {
    var h = hunt;
    if (!h || !PL.screens || typeof PL.screens.huntStatus !== 'function') return;
    PL.screens.huntStatus({ candidates: h.candidates, best: h.bestH, bestAt: h.bestAt, since: h.start, ready: !!h.best, bot: h.best ? h.best.bot : null });
  }
  function huntStart() {
    var h = hunt, lv;
    if (!h || !h.best) return;
    lv = h.best.level;
    hunt = null;
    if (PL.screens && typeof PL.screens.huntStatus === 'function') PL.screens.huntStatus(null);
    if (lv.id === undefined || lv.id === null || lv.id === 0) lv.id = lv.seed >>> 0;
    app.code = PL.generator.encodeCode(app.difficulty, app.disabled, lv.seed, !!lv.tight);
    startRound(lv);
  }
  function startHunt(difficulty, disabled, look) {
    if (!ready()) return false;
    huntStop();
    setRun(difficulty, disabled);
    hunt = { token: ++searchToken, difficulty: app.difficulty, disabled: app.disabled, look: (look === null || look === undefined) ? (diffSpec(app.difficulty).look || 0) : look,
      chunk: 0, candidates: 0, bestH: -1, bestAt: 0, best: null, start: Date.now(), stopped: false, wantPlay: false, running: false };
    huntReport();
    huntChunk();
    return true;
  }
  function huntPlay() {
    var h = hunt;
    if (!h) return false;
    if (h.running) { h.wantPlay = true; return true; }     // the running chunk may hold the best: start when it returns
    huntStart();
    return true;
  }
  function huntStop() {
    if (!hunt) return;
    hunt.stopped = true; searchToken++; hunt = null;
    if (PL.screens && typeof PL.screens.huntStatus === 'function') PL.screens.huntStatus(null);
  }
  /** playCode(code): starts an endless run with the level behind a shared code; false when the code is not one. */
  function playCode(code) {
    var d = PL.generator && PL.generator.decodeCode ? PL.generator.decodeCode(code) : null;
    if (!d || !ready()) return false;
    huntStop();
    setRun(d.difficulty, d.disabled);
    var token = ++searchToken, btn = doc.getElementById('modes-code-go');
    if (btn) { btn.disabled = true; btn.textContent = t('preparing'); }
    search({ cmd: 'replay', code: PL.generator.encodeCode(d.difficulty, app.disabled, d.seed, d.tight) }).then(function (r) {
      if (btn) { btn.disabled = false; btn.textContent = t('code_go'); }
      if (token !== searchToken) return;
      if (!r.ok || !r.level) { toast(t('code_bad')); return; }
      app.code = r.code;
      if (!r.level.id) r.level.id = r.level.seed >>> 0;
      startRound(r.level);
    });
    return true;
  }
  function nextRound(fromChooser) {
    var btn = doc.getElementById(fromChooser ? 'modes-start' : 'win-next'), d = app.difficulty, spec = diffSpec(d), token = ++searchToken;
    var base = (runSeed + app.streak * 7919) >>> 0, best = -1;
    if (btn) { btn.disabled = true; btn.textContent = t('searching', { n: 0 }); }
    search({ cmd: 'search', tier: spec.tier, seed: base, allow: PL.generator.allowOf(app.disabled), hardness: spec.H, look: spec.look || 0, hardest: !!spec.hardest, verify: spec.verify || null, buffer: spec.buffer || null, tight: !!spec.tight,
      candidates: 150, budgetMs: low() ? Math.round(spec.budgetMs * 0.6) : spec.budgetMs }, function (n, h) {
      if (token !== searchToken || !btn) return;
      if (h > best) best = h;
      btn.textContent = d >= 7 ? t('searching_best', { n: n, h: best.toFixed(1) }) : t('searching', { n: n });
    }).then(function (r) {
      if (btn) { btn.disabled = false; btn.textContent = t(fromChooser ? 'start' : 'next_round'); }
      if (token !== searchToken) return;                       // the player left the chooser or started something else
      if (!r.ok || !r.level) { toast(t('preparing')); warnOnce('gen0', 'no level could be generated for difficulty ' + d + ': ' + r.error); return; }
      var lv = r.level;
      if (lv.id === undefined || lv.id === null || lv.id === 0) lv.id = lv.seed >>> 0;
      app.code = PL.generator.encodeCode(d, app.disabled, lv.seed, !!lv.tight);
      startRound(lv);
    });
  }

  // ------------------------------------------------------------------ state changes
  function finish(kind) {
    var level = app.level, s = save();
    lastEnd = { kind: kind };
    if (kind === 'won') {
      st = 'WIN';
      if (app.mode === 'endless') {
        app.streak++;
        if (s && s.bestStreak(app.difficulty, app.streak)) runBest = true;
        PL.screens.setPill({ mode: 'endless', difficulty: app.difficulty, tier: app.tier, streak: app.streak });
        lastEnd.data = { mode: 'endless', difficulty: app.difficulty, tier: app.tier, streak: app.streak, code: app.code, hard: level.hard };
      } else {
        if (s) s.cleared(level.id);
        lastEnd.data = { mode: 'level', level: level.id, hard: level.hard };
      }
      PL.screens.show('win', lastEnd.data);
    } else {
      st = 'LOSE';
      lastEnd.data = app.mode === 'endless'
        ? { mode: 'endless', difficulty: app.difficulty, tier: app.tier, streak: app.streak, newBest: runBest, reason: lostReason, code: app.code, hard: level.hard }
        : { mode: 'level', level: level.id, reason: lostReason, hard: level.hard };
      PL.screens.show('lose', lastEnd.data);
    }
  }

  // ------------------------------------------------------------------ replays
  // watchReplay(): the round just played, again, sped up so that it fits into REPLAY_SECONDS: a fresh sim of the same
  // level and kind permutation, the recorded taps applied before the recorded frames, `speed` recorded frames per real
  // frame. The end card comes back when the recording is over (or on the pause button).
  function watchReplay() {
    if (!lastEnd || !rec.frames.length || !app.level || (st !== 'WIN' && st !== 'LOSE')) return false;
    var layout = PL.layouts[app.level.layout], sim, scene, total = 0, i;
    try {
      sim = PL.sim.create(app.level, { perimeter: layout.perimeter, lapMs: PL.config && PL.config.LAP_MS ? PL.config.LAP_MS : 8000, layout: layout });
      scene = PL.scene.create(canvas, layout);
    } catch (e) { warnOnce('replay', 'could not set up the replay', e); return false; }
    for (i = 0; i < rec.frames.length; i++) total += rec.frames[i];
    app.sim = sim; app.scene = scene;
    if (typeof scene.kindMap === 'function') scene.kindMap(app.kindMap);
    if (typeof scene.noLuck === 'function') scene.noLuck(!!app.noLuck);
    if (typeof scene.plain === 'function') scene.plain(plainOn());
    if (typeof scene.beltStyle === 'function') scene.beltStyle(beltStyle());
    if (typeof scene.lowPerf === 'function') scene.lowPerf(low());
    viewW = 0; resize();
    rp = { i: 0, tap: 0, speed: Math.max(1, Math.min(REPLAY_MAX_SPEED, Math.ceil(total / (REPLAY_SECONDS * 1000)))), budget: 0, hold: 0 };
    st = 'REPLAY';
    if (PL.screens) PL.screens.show('replay', { speed: rp.speed });
    lastTs = 0; dirty = true; ensureLoop();
    return true;
  }
  // One real frame of the replay: `speed` recorded frames of engine time, ONE render. The engine steps are cheap (a
  // belt advance and a few crossings), the render is not, so a fast replay costs no more frames per second than play;
  // the pieces simply jump further between renders. REPLAY_WORK_MS caps the engine work per frame so a weak phone
  // keeps its frame rate (the replay then takes a little longer than 30 s instead of stuttering).
  function replayFrame(dt) {
    var r = rp, before, events, i, res, t0 = (root.performance && root.performance.now) ? root.performance.now() : 0, steps = 0;
    if (!r || !app.sim) return;
    before = app.sim.time;
    r.budget += dt * r.speed;
    while (r.budget > 0 && r.i < rec.frames.length) {
      if (t0 && (++steps & 7) === 0 && root.performance.now() - t0 > REPLAY_WORK_MS) { r.budget = 0; break; }
      while (r.tap < rec.taps.length && rec.taps[r.tap].i === r.i) {
        res = PL.sim.tap(app.sim, rec.taps[r.tap].box);
        if (res && res.ok && app.scene) for (i = 0; i < res.events.length; i++) app.scene.flash(res.events[i]);
        r.tap++;
      }
      events = PL.sim.tick(app.sim, rec.frames[r.i]) || [];
      for (i = 0; i < events.length; i++) if (app.scene) app.scene.flash(events[i]);
      r.budget -= rec.frames[r.i];
      r.i++;
    }
    app.scene.render(app.sim, Math.max(dt, app.sim.time - before));
    updateSlots();
    if (r.i >= rec.frames.length) {
      r.hold += dt;
      if (r.hold >= REPLAY_HOLD_MS) stopReplay();
    }
  }
  function stopReplay() {
    if (st !== 'REPLAY' || !lastEnd) return;
    rp = null;
    st = lastEnd.kind === 'won' ? 'WIN' : 'LOSE';
    if (PL.screens) {
      PL.screens.setPill(app.mode === 'endless' ? { mode: 'endless', difficulty: app.difficulty, tier: app.tier, streak: app.streak } : { mode: 'level', level: app.level.id, tier: app.level.tier });
      PL.screens.show(lastEnd.kind === 'won' ? 'win' : 'lose', lastEnd.data);
    }
    dirty = true; ensureLoop();
  }
  function pause() {
    if (st === 'REPLAY') { stopReplay(); return; }
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
    st = 'TITLE'; ending = null; searchToken++; huntStop();
    if (PL.screens) PL.screens.setSlots(null);
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
    if (app.mode === 'endless') { startEndless(app.difficulty, app.disabled); return; }
    replay();
  }
  /** setPlain(on): plain graphics (flat coloured cubes, simple boxes) on or off; the scene redraws at once. */
  function setPlain(on) {
    var sc = app.scene;
    if (sc && typeof sc.plain === 'function') { try { sc.plain(!!on); dirty = true; ensureLoop(); } catch (e) { warnOnce('scene.plain', 'scene.plain failed', e); } }
    updateSlots();
  }
  /** setBelt(style): 'plates' or 'stream'; the scene redraws at once and the slot counter shows for the stream. */
  function setBelt(style) {
    var sc = app.scene;
    if (sc && typeof sc.beltStyle === 'function') { try { sc.beltStyle(style); dirty = true; ensureLoop(); } catch (e) { warnOnce('scene.belt', 'scene.beltStyle failed', e); } }
    updateSlots();
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
      rec.taps.push({ i: rec.frames.length, box: i });
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
  function codeInAddress() {
    try {
      var m = /[?&#]code=([^&#]+)/.exec(root.location.search + root.location.hash);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function titleReady() {
    if (st !== 'LOADING') return;
    var a = app.assets, code;
    if (!a || !Array.isArray(a.failed)) { a = app.assets = a || {}; if (!Array.isArray(a.failed)) a.failed = []; }
    st = 'TITLE';
    PL.screens.show('title');
    try { if (Arcade) Arcade.ready(); } catch (e) { /* no kit */ }
    try { if (save() && save().migrated()) warnOnce('migrated', 'save from the first beta: level number kept, levels rebuilt'); } catch (e) { /* storage */ }
    code = codeInAddress();
    if (code && PL.generator && PL.generator.decodeCode(code)) {
      try { if (root.history && root.history.replaceState) root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* file:// */ }
      if (!playCode(code)) toast(t('code_bad'));
    }
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
      if (st === 'PLAY' || st === 'REPLAY') { pause(); ev.preventDefault(); }
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
