// src/app/states.js: the state machine (DESIGN 7.1): TITLE -> INTRO -> PLAY <-> PAUSE; PLAY -> WIN -> INTRO (next);
// PLAY -> TIMEOUT -> PLAY (+30 s) | LOSE (Serie banked) -> INTRO (same level). Stuck is a sheet over PLAY.
// Routes player actions into SS.game and the events into the board view, HUD, audio and persistence.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var app = SS.app = SS.app || {};
  var ctx = { state: 'BOOT', save: null, mode: null, levelNo: 1, game: null, lay: null, lowGfx: false, stuckOpen: false, debug: false };   // debug: ?level=N test mode, nothing is recorded
  var timer = 0;

  function guard(where, fn) {
    var args = Array.prototype.slice.call(arguments, 2);
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(null, args); } catch (e) { if (root.console) root.console.error('[' + where + ']', e); return undefined; }
  }
  function ui() { return SS.ui || {}; }
  function snd() { return SS.sounds || {}; }
  function R() { return app.run; }
  function vibrate(ms) { if (ctx.save && ctx.save.haptics === false) return; try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(ms); } catch (e) { /* none */ } }
  function writeSave() { if (ui().storage && ctx.save) ctx.save = guard('save', ui().storage.save, ctx.save) || ctx.save; if (ui().overlays) ui().overlays.setSave(ctx.save); }
  function boardOpts() { return { stillBelts: !!ctx.save.stillBelts, showDepth: !!ctx.save.showDepth }; }
  function refreshHud() { if (ctx.game) guard('hud', ui().hud.update, ctx.game, ctx.save, R().serieScore(ctx)); }
  function clearTimer() { if (timer) { root.clearTimeout(timer); timer = 0; } }
  function after(ms, fn) { clearTimer(); timer = root.setTimeout(function () { timer = 0; fn(); }, ms); }

  // ---------- states ----------
  function setState(name) {
    var prev = ctx.state; ctx.state = name;
    var O = ui().overlays, B = ui().board, H = ui().hud, BE = ui().belts;
    clearTimer();
    if (name === 'TITLE') {
      if (B) { B.setEnabled(false); B.setGame(null); }
      H.show(false); root.document.getElementById('board').hidden = true;
      ctx.game = null; ctx.stuckOpen = false;
      O.show('title', { save: ctx.save });
      app.loop.want('clock', false);
    } else if (name === 'INTRO') {
      root.document.getElementById('board').hidden = false; H.show(true); refreshHud();
      B.setEnabled(false);
      if (BE) BE.pause();
      O.show('intro', { level: ctx.game.level, line: R().introLine(ctx.mode, ctx.game.level, ctx.save) });
      guard('relayout', SS.main && SS.main.relayout);
    } else if (name === 'PLAY') {
      root.document.getElementById('board').hidden = false; H.show(true);
      O.show(null); refreshHud();
      ctx.game.frozen = false;
      if (prev === 'INTRO') showTips(); else resumePlay();
    } else if (name === 'PAUSE') {
      B.setEnabled(false); ctx.game.frozen = true; if (BE) BE.pause();
      app.loop.want('clock', false);
      store();
      O.show('pause', { game: ctx.game, save: ctx.save, serie: R().serieScore(ctx) });
    } else if (name === 'WIN' || name === 'TIMEOUT' || name === 'LOSE') {
      B.setEnabled(false); ctx.game.frozen = true; if (BE) BE.pause();
      app.loop.want('clock', false);
    }
  }
  function resumePlay() {
    var B = ui().board, BE = ui().belts;
    if (ui().coach && ui().coach.isOpen()) return;
    B.setEnabled(true); ctx.game.frozen = false;
    if (BE) BE.resume();
    app.loop.want('clock', ctx.mode === 'timed');
    app.resetClock();
  }
  function showTips() {
    var tips = R().tipsFor(ctx.mode, ctx.game.level, ctx.save), coach = ui().coach;
    if (!tips.length) { resumePlay(); return; }
    ctx.game.frozen = true; ui().board.setEnabled(false);
    tips.forEach(function (tip, i) {
      coach.show(tip.key, tip.text, function (key) {
        ctx.save.seenTips[key] = true; writeSave();
        if (i === tips.length - 1 && ctx.state === 'PLAY') resumePlay();
      });
    });
  }

  // ---------- levels ----------
  function loadLevel(n) {
    var lv = R().levelFor(ctx.mode, n);
    if (!lv) { ui().overlays.toast('Level ' + n + ' konnte nicht geladen werden'); setState('TITLE'); return; }
    ctx.levelNo = n;
    ctx.game = SS.game.createGame(lv, ctx.mode, { score: 0 });
    ui().hud.reset();
    var g = ctx.game;
    SS.sprites.preload(lv.types, function () { if (ctx.game !== g) return; ui().board.setGame(g, boardOpts()); store(); setState('INTRO'); }, 1500);
  }
  /** debugLevel(mode, n): the ?level=N&mode=timed test entry (main.js): plays any level without touching the player's progress. */
  function debugLevel(mode, n) {
    ctx.mode = mode === 'relaxed' ? 'relaxed' : 'timed'; ctx.debug = true;
    loadLevel(Math.max(1, n | 0));
    ui().overlays.toast(SS.t('debug_mode', { n: n }));
  }
  function store() { if (!ctx.debug) R().store(ctx); }
  /** startMode(mode): continues a stored board of that mode or starts its reached level. */
  function startMode(mode) {
    ctx.mode = mode; ctx.debug = false;
    var rec = R().load(mode);
    if (rec && rec.game) {
      try {
        ctx.game = SS.game.restore(rec.game); ctx.levelNo = rec.levelNo;
        ui().hud.reset();
        var g = ctx.game;
        SS.sprites.preload(g.level.types || [], function () { if (ctx.game !== g) return; ui().board.setGame(g, boardOpts()); setState('INTRO'); }, 1500);
        return;
      } catch (e) { if (root.console) root.console.warn('[run] stored board dropped', e); R().clear(mode); }
    }
    loadLevel(R().reached(ctx.save, mode));
  }
  function nextLevel() { loadLevel(ctx.levelNo + 1); }
  function retryLevel() { loadLevel(ctx.levelNo); }
  function restartLevel() {
    if (ctx.debug) { loadLevel(ctx.levelNo); return; }
    if (ctx.mode === 'timed') { var res = R().bank(ctx, true); writeSave(); if (res.score > 0) ui().overlays.toast(SS.t('serie_banked', { score: res.score, rank: res.rank + 1 })); }
    R().clear(ctx.mode);
    loadLevel(ctx.levelNo);
  }
  function quitToTitle() {
    if (ctx.debug) { ctx.debug = false; ctx.game = null; setState('TITLE'); return; }
    if (ctx.game && ctx.game.status === 'playing') R().store(ctx); else if (ctx.mode) R().clear(ctx.mode);
    writeSave();
    setState('TITLE');
  }

  // ---------- actions and events ----------
  function act(fn) {
    if (ctx.state !== 'PLAY' || !ctx.game) return null;
    var events = fn();
    if (!events || !events.length) return null;
    dispatch(events);
    return events;
  }
  function onDrop(itemId, comp, slot) { return act(function () { return SS.game.moveItem(ctx.game, itemId, comp, slot); }); }
  function onShift(itemId, slot) { return act(function () { return SS.game.shiftItem(ctx.game, itemId, slot); }); }
  function onCollect(itemId) { return act(function () { return SS.game.collect(ctx.game, itemId); }); }
  function onSpend(comp) { var ev = act(function () { return SS.game.spend(ctx.game, comp); }); ui().hud.setArmed(false); return ev; }
  function onTouch() { if (ctx.game && ctx.mode === 'timed' && !ctx.game.started && !ctx.game.frozen) { SS.game.start(ctx.game); app.resetClock(); } }
  function undo() {
    if (!ctx.game || (ctx.state !== 'PLAY' && ctx.state !== 'TIMEOUT')) return;
    var ev = SS.game.undo(ctx.game);
    if (!ev.length) return;
    if (ctx.state === 'TIMEOUT') { ui().overlays.show(null); setState('PLAY'); }
    ui().board.apply(ev, false);
    guard('snd', snd().drop);
    dispatch(ev);
  }
  function toggleBunny() {
    if (ctx.state !== 'PLAY' || !ctx.game || ctx.game.board.bunnies < 1) return;
    var arm = !ui().hud.isArmed();
    ui().hud.setArmed(arm); ui().board.armSpend(arm);
    if (arm) ui().overlays.toast(SS.t('bunny_arm'));
  }
  function rescue() {
    if (!ctx.game) return;
    var ev = SS.game.rescue(ctx.game);
    if (ev.length) { dispatch(ev); ui().overlays.hide('stuck'); ctx.stuckOpen = false; toggleBunny(); }
  }
  function hint() {
    if (ctx.state !== 'PLAY' || !ctx.game || ctx.mode !== 'relaxed') return;
    var m = SS.solver.hint(ctx.game.board, 25000);
    if (!m) { ui().overlays.toast(SS.t('hint_none')); return; }
    ctx.game.usedHint = true;
    ui().board.select(m.item);
    var el = root.document.querySelector('#shelf .comp[data-ci="' + m.to + '"]');
    if (el) { el.classList.add('target'); root.setTimeout(function () { el.classList.remove('target'); }, 1500); }
  }
  function dispatch(events) {
    var g = ctx.game, S = snd(), O = ui().overlays;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      switch (e.type) {
        case 'move': guard('snd', S.drop); break;
        case 'shift': guard('snd', S.drop); break;
        case 'take': guard('snd', S.drop); break;
        case 'match': guard('snd', S.match, e.combo); vibrate(e.combo > 1 ? [20, 30, 20] : 20); break;
        case 'combo': guard('snd', S.combo, e.combo); if (e.combo >= 3) O.toast(SS.t('toast_combo', { n: e.combo })); break;
        case 'reveal': guard('snd', S.pick); break;
        case 'unlock': guard('snd', S.clear); break;
        case 'bar': guard('snd', S.refuse); break;
        case 'collect': guard('snd', S.combo, 3); O.toast(SS.t('bunny_found')); break;
        case 'spend': guard('snd', S.clear); vibrate([30, 40]); break;
        case 'bunnyEarned': if (e.reason === 'combo5') O.toast(SS.t('bunny_earned')); break;   // the HUD pops the bunny button when its count rises
        case 'sweep': if (e.first) O.toast(SS.t('orphan')); break;
        case 'warnSpace': if (e.first) O.toast(SS.t('warn_space')); break;
        case 'beltAppear': O.toast(SS.t('belt_appear')); break;
        case 'timeWarn': if (e.level === 'red') guard('snd', S.tick); break;
        case 'comboEnd': break;
        case 'stuck': onStuck(e); break;
        case 'unstuck': if (ctx.stuckOpen) { O.hide('stuck'); ctx.stuckOpen = false; } break;
        case 'cleared': onCleared(e); break;
        case 'timeout': onTimeout(e); break;
      }
    }
    refreshHud();
    if (g && g.status === 'playing') store();
  }
  function onStuck(e) {
    var g = ctx.game; ctx.stuckOpen = true;
    guard('snd', snd().lose);
    ui().overlays.show('stuck', { game: g, rescueAvailable: e.rescueAvailable, bunnies: g.board.bunnies, canUndo: g.undo.length > 0 });
    if (ctx.mode === 'relaxed' && ui().belts) ui().belts.pause();
  }
  function onCleared(e) {
    var res = { newBest: false, levelBest: 0 };
    if (!ctx.debug) { res = R().onCleared(ctx, e); writeSave(); R().clear(ctx.mode); }
    guard('snd', snd().clear); vibrate([30, 40, 60]);
    setState('WIN');
    var serie = R().serieScore(ctx);
    after(1100, function () { ui().overlays.show('win', { game: ctx.game, cleared: e, newBest: res.newBest, levelBest: res.levelBest, serie: serie }); });
  }
  function onTimeout(e) {
    guard('snd', snd().timeout);
    if (e.canExtend) { setState('TIMEOUT'); ui().overlays.show('timeout', { game: ctx.game }); }
    else endSerie();
  }
  function extend() {
    if (!ctx.game || ctx.game.status !== 'timeout') return;
    var ev = SS.game.extend(ctx.game);
    if (!ev.length) return;
    ui().hud.flashExtend();
    ui().overlays.show(null);
    setState('PLAY');
    refreshHud();
  }
  function endSerie() {
    if (!ctx.game) return;
    SS.game.giveUp(ctx.game);
    var res = { score: 0, rank: -1, newBest: false, nextLevel: ctx.levelNo };
    if (!ctx.debug) { res = R().bank(ctx, true); writeSave(); R().clear(ctx.mode); }
    setState('LOSE');
    ui().overlays.show('serie', { score: res.score, rank: res.rank, newBest: res.newBest, nextLevel: ctx.levelNo });
  }

  // ---------- clock ----------
  var lastT = 0;
  function resetClock() { lastT = 0; }
  function frame(t) {
    if (ctx.state !== 'PLAY' || !ctx.game || ctx.mode !== 'timed') { lastT = 0; return; }
    if (!lastT) { lastT = t; return; }
    var dt = Math.min(250, t - lastT); lastT = t;
    var ev = SS.game.tick(ctx.game, dt);
    if (ev.length) dispatch(ev); else refreshHud();
  }
  function pause() { if (ctx.state === 'PLAY') setState('PAUSE'); }
  function resume() { if (ctx.state === 'PAUSE') setState('PLAY'); }
  function back() {
    var O = ui().overlays, cur = O.current();
    if (cur === 'howto' || cur === 'scores' || cur === 'settings') { O.show(ctx.state === 'PAUSE' ? 'pause' : 'title', ctx.state === 'PAUSE' ? { game: ctx.game, save: ctx.save, serie: R().serieScore(ctx) } : { save: ctx.save }); return true; }
    if (ctx.state === 'PLAY') { pause(); return true; }
    if (ctx.state === 'PAUSE') { resume(); return true; }
    return false;
  }

  app.ctx = ctx; app.guard = guard;
  app.setState = setState; app.startMode = startMode; app.loadLevel = loadLevel; app.nextLevel = nextLevel; app.retryLevel = retryLevel; app.restartLevel = restartLevel;
  app.quitToTitle = quitToTitle; app.onDrop = onDrop; app.onShift = onShift; app.onCollect = onCollect; app.onSpend = onSpend; app.onTouch = onTouch; app.undo = undo; app.toggleBunny = toggleBunny;
  app.rescue = rescue; app.hint = hint; app.extend = extend; app.endSerie = endSerie; app.dispatch = dispatch; app.frame = frame; app.resetClock = resetClock;
  app.pause = pause; app.resume = resume; app.back = back; app.writeSave = writeSave; app.refreshHud = refreshHud; app.resumePlay = resumePlay;
  app.storeRun = function () { if (ctx.mode && !ctx.debug) R().store(ctx); };
  app.debugLevel = debugLevel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
