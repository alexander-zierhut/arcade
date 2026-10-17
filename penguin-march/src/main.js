// src/main.js: wires everything up. One app object (window.PM.app) holds the screen state and the running sim;
// the loop steps the sim in fixed 1/60 s slices and draws every frame. Screens: TITLE, MAP, SHOP, PLAY, PAUSE,
// END. The tests and the preview tools drive the game through PM.app (start, setBot, state).
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config, S = PM.sim, L = PM.levels, SV = PM.save, R = PM.render, UI = PM.ui, IN = PM.input, AU = PM.audio;

  var app = {
    state: 'BOOT',          // screen
    save: null,
    levelNo: 1,
    sim: null,              // the running sim state
    bot: false,             // let the greedy bot steer (preview tools)
    coinsWon: 0,
    assets: null,
    from: 'title'           // where Back on map/shop goes
  };

  var DT = 1 / 60, acc = 0, last = 0, clock = 0;

  function start(n) {
    app.levelNo = n;
    app.sim = S.create(L.get(n), app.save.upgrades);
    app.coinsWon = 0; milestone = 0;
    R.clearEffects(); IN.reset();
    UI.show(null); UI.hud(app.sim, n);
    app.state = 'PLAY';                     // after show(null): onScreen leaves PLAY/PAUSE alone
    AU.play('click');
  }

  function finish() {
    var s = app.sim, won = s.phase === 'WON';
    if (won) {
      app.coinsWon = SV.recordWin(app.save, app.levelNo, s.stars, s.coins);   // a replay pays a share
      SV.save(app.save);
      UI.hud(s, app.levelNo);
    } else AU.play('lose');
    UI.end(won, s, app.coinsWon);          // shows the end screen; onScreen sets app.state = 'END'
  }

  var MILESTONES = [100, 500, 1000, 5000, 10000, 100000, 1000000];
  var milestone = 0;

  function step(dt) {
    var s = app.sim;
    var target = app.bot ? PM.bot.greedy(s) : IN.target(s.x);
    S.step(s, dt, target == null ? s.x : target);
    if (s.events.length) { R.events(s.events, s); s.events.length = 0; }
    while (milestone < MILESTONES.length && s.n >= MILESTONES[milestone]) {
      R.banner(R.fmt(MILESTONES[milestone]) + ' PENGUINS!');
      milestone++;
    }
    if (s.phase === 'WON' || s.phase === 'LOST') {
      app.endAt = clock + (s.phase === 'WON' ? 1.6 : 1.0);
      app.state = 'ENDING';
    }
  }

  function frame(ts) {
    root.requestAnimationFrame(frame);
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    clock += dt;
    if (app.state === 'PLAY') {
      acc += dt;
      var guard = 0;
      while (acc >= DT && guard++ < 6 && app.state === 'PLAY') { step(DT); acc -= DT; }
      if (guard >= 6) acc = 0;
    } else if (app.state === 'ENDING' && clock >= app.endAt) finish();
    R.draw(app.sim, clock, dt);
  }

  function boot() {
    app.save = SV.load();
    AU.setMuted(app.save.muted);
    var canvas = root.document.getElementById('game');
    R.init(canvas);
    root.addEventListener('resize', R.resize);
    IN.attach(canvas, R.toRoadX);
    IN.onPress = function () { AU.unlock(); };
    IN.onKey = function (e) {
      AU.unlock();
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (app.state === 'PLAY') app.pause(); else if (app.state === 'PAUSE') app.resume(); }
    };
    root.document.addEventListener('pointerdown', function () { AU.unlock(); }, { passive: true });
    UI.init({
      get save() { return app.save; },
      start: start,
      pause: app.pause, resume: app.resume, retry: app.retry, quitToMap: app.quitToMap, next: app.next,
      buy: function (key) { var ok = SV.buy(app.save, key); if (ok) { SV.save(app.save); AU.play('click'); } return ok; },
      toggleMute: function () { app.save.muted = !app.save.muted; AU.setMuted(app.save.muted); SV.save(app.save); },
      backTo: function () { return app.sim && (app.sim.phase === 'WON' || app.sim.phase === 'LOST') ? 'end' : 'title'; },
      // the menus change the screen on their own; the app state follows (PLAY/PAUSE/END are set by the app itself)
      onScreen: function (name) { if (name === 'map') app.state = 'MAP'; else if (name === 'shop') app.state = 'SHOP'; else if (name === 'title') app.state = 'TITLE'; else if (name === 'end') app.state = 'END'; }
    });
    PM.assets.load('assets/sprites/', function (st) { app.assets = st; });
    app.state = 'TITLE';
    UI.show('title');
    root.requestAnimationFrame(frame);
  }

  app.start = start;
  app.pause = function () { if (app.state !== 'PLAY') return; app.state = 'PAUSE'; UI.show('pause'); };
  app.resume = function () { if (app.state !== 'PAUSE') return; UI.show(null); IN.reset(); app.state = 'PLAY'; };
  app.retry = function () { start(app.levelNo); };
  app.next = function () { start(app.levelNo + 1); };
  app.quitToMap = function () { app.sim = null; app.state = 'MAP'; UI.show('map'); };
  app.showTitle = function () { app.sim = null; app.state = 'TITLE'; UI.show('title'); };
  app.setBot = function (on) { app.bot = !!on; };
  app.reset = function () { SV.clear(); app.save = SV.fresh(); };

  PM.app = app;
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
