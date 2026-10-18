// src/main.js: boot, viewport measuring, layout of the board area, lifecycle and the settings handlers. Last script
// before the inline boot guard. Defines SS.main.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var C = SS.config || {};
  var doc = root.document;
  var DEBOUNCE_MS = 150, LATE_ROTATE_MS = 500;
  var booted = false, probe = null, resizeTimer = 0;

  function ctx() { return SS.app.ctx; }
  function guard() { return SS.app.guard.apply(null, arguments); }

  // ---- viewport ----
  function measure() {
    var vv = root.visualViewport, w, h;
    if (vv && !(vv.scale > 1.01) && vv.width > 0 && vv.height > 0) { w = vv.width; h = vv.height; }
    else { w = root.innerWidth || doc.documentElement.clientWidth; h = root.innerHeight || doc.documentElement.clientHeight; }
    return { vw: Math.max(1, Math.round(w)), vh: Math.max(1, Math.round(h)) };
  }
  function readSafe() {
    if (!probe) {
      probe = doc.createElement('div'); probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
      doc.body.appendChild(probe);
    }
    var cs = root.getComputedStyle(probe);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 };
  }
  function relayout() {
    var m = measure(), safe = readSafe(), de = doc.documentElement.style;
    de.setProperty('--vw', m.vw + 'px'); de.setProperty('--vh', m.vh + 'px'); de.setProperty('--safe-top', safe.top + 'px'); de.setProperty('--safe-bottom', safe.bottom + 'px');
    var hudH = SS.ui.hud ? SS.ui.hud.height() : 0; if (!hudH) hudH = safe.top + 6 + 44 + 6;
    de.setProperty('--hud-h', hudH + 'px');
    // the board gets everything under the HUD band (its 4 px edge plus the badges hanging off the pills) down to the safe area
    var top = hudH + 8, bottom = safe.bottom + 8;
    var lay = { vw: m.vw, vh: m.vh, safe: safe, board: { x: 4 + safe.left, y: top, w: m.vw - 8 - safe.left - safe.right, h: Math.max(160, m.vh - top - bottom) } };
    ctx().lay = lay;
    if (SS.ui.board) guard('board', SS.ui.board.layout, lay.board);
    return lay;
  }
  function scheduleRelayout() { if (resizeTimer) root.clearTimeout(resizeTimer); resizeTimer = root.setTimeout(function () { resizeTimer = 0; guard('main', relayout); }, DEBOUNCE_MS); }
  function wireViewport() {
    if (root.visualViewport) root.visualViewport.addEventListener('resize', scheduleRelayout);
    root.addEventListener('resize', scheduleRelayout);
    root.addEventListener('orientationchange', function () { scheduleRelayout(); root.setTimeout(function () { guard('main', relayout); }, LATE_ROTATE_MS); });
  }
  // ---- lifecycle ----
  function persistNow() { var c = ctx(); if (c.state === 'PLAY') SS.app.pause(); else { SS.app.writeSave(); SS.app.storeRun(); } }
  function wireLifecycle() {
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') guard('lifecycle', persistNow); else SS.app.resetClock(); });
    root.addEventListener('pagehide', function () { guard('lifecycle', persistNow); });
    root.addEventListener('pageshow', function (e) { SS.app.resetClock(); if (e && e.persisted) guard('main', relayout); else scheduleRelayout(); });
  }
  // ---- settings ----
  /** applySpriteSet(): 2D or 3D products per the setting; the current level is preloaded again and the board rebuilt. */
  function applySpriteSet() {
    var c = ctx(), changed = SS.sprites.setFlat(!!c.save.flatIcons);
    if (!changed || !c.game) return;
    var g = c.game;
    SS.sprites.preload(g.level.types || [], function () { if (ctx().game !== g) return; SS.ui.board.rebuild(); if (ctx().state !== 'PLAY' && SS.ui.belts) SS.ui.belts.pause(); }, 2500);
  }
  function applyFlags() {
    var s = ctx().save;
    SS.lowGfx = !!s.lowGfx; doc.body.classList.toggle('low-gfx', !!s.lowGfx);
    var reduced = !!s.reducedMotion; try { reduced = reduced || !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* none */ }
    doc.body.classList.toggle('reduced-motion', reduced);
  }
  function toggle(key, value) {
    var s = ctx().save; s[key] = !!value; SS.app.writeSave();
    if (key === 'muted') guard('audio', SS.audio.engine.setMuted, !!value);
    if (key === 'lowGfx' || key === 'reducedMotion') applyFlags();
    if (key === 'flatIcons') applySpriteSet();
    if ((key === 'stillBelts' || key === 'showDepth') && ctx().game) { SS.ui.board.setOptions({ stillBelts: !!s.stillBelts, showDepth: !!s.showDepth }); SS.ui.board.rebuild(); if (ctx().state !== 'PLAY' && SS.ui.belts) SS.ui.belts.pause(); }
  }
  function setLang(code) {
    SS.strings.setLang(code); ctx().save.lang = code; SS.app.writeSave();
    SS.ui.overlays.applyLang(); SS.ui.hud.reset();
    var cur = SS.ui.overlays.current();
    if (cur) SS.ui.overlays.show(cur);
    SS.app.refreshHud();
  }
  /** markVersionSeen(): the what's-new card of this version was seen; the NEU badge disappears. */
  function markVersionSeen() { var s = ctx().save; if (s.seenVersion === C.VERSION) return; s.seenVersion = C.VERSION; SS.app.writeSave(); }
  /** whatsNewOnBoot(): existing players (any progress) see the what's-new card once per version; new players only get the badge. */
  function whatsNewOnBoot() {
    var s = ctx().save, played = s.records.relaxed.reached > 1 || s.records.timed.reached > 1 || s.records.timed.top.length > 0 || s.records.relaxed.top.length > 0;
    if (s.seenVersion === C.VERSION || !played) return;                                // new players keep the badge until they look
    if (ctx().state === 'TITLE') SS.ui.overlays.show('whatsnew');
  }
  // ---- fullscreen / app mode ----
  function standalone() { try { return !!(root.navigator.standalone || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || (root.matchMedia && root.matchMedia('(display-mode: fullscreen)').matches)); } catch (e) { return false; } }
  function canFullscreen() { return !!(doc.fullscreenEnabled && doc.documentElement.requestFullscreen) && !standalone(); }
  /** setFullscreen(on): toggles the Fullscreen API (Android Chrome and desktops; iOS Safari has no element fullscreen). */
  function setFullscreen(on) {
    if (on === undefined) on = !doc.fullscreenElement;
    try {
      if (on && !doc.fullscreenElement) { var p = doc.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(function () { /* refused */ }); }
      else if (!on && doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen();
    } catch (e) { /* not available */ }
    root.setTimeout(function () { guard('main', relayout); }, 300);
  }
  function markInstallSeen() { var s = ctx().save; if (s.seenInstallHint) return; s.seenInstallHint = true; SS.app.writeSave(); }
  /** installHintOnBoot(): once, on the title, when the game runs inside a browser tab on a phone. */
  function installHintOnBoot() {
    var s = ctx().save;
    if (s.seenInstallHint || standalone() || !(root.navigator && /Android|iPhone|iPad|iPod/i.test(root.navigator.userAgent))) return;
    if (ctx().state === 'TITLE' && SS.ui.overlays.current() === 'title') SS.ui.overlays.show('install');
  }
  function resetTips() { var s = ctx().save; for (var k in s.seenTips) s.seenTips[k] = false; SS.app.writeSave(); }
  // ---- progress export / import (settings) ----
  function exportProgress() {
    var text, name = 'supermarkt-sortierer-spielstand-' + SS.app.run.today() + '.json';
    try { SS.app.writeSave(); text = SS.ui.storage.exportAll(); } catch (e) { SS.ui.overlays.toast(SS.t('import_bad')); return; }
    var done = false;
    try {
      var blob = new root.Blob([text], { type: 'application/json' }), url = root.URL.createObjectURL(blob), a = doc.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none'; doc.body.appendChild(a); a.click();
      root.setTimeout(function () { doc.body.removeChild(a); root.URL.revokeObjectURL(url); }, 2000);
      done = true;
    } catch (e) { done = false; }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) root.navigator.clipboard.writeText(text).then(function () { if (!done) SS.ui.overlays.toast(SS.t('export_copied')); }, function () { /* no clipboard */ });
    if (done) SS.ui.overlays.toast(SS.t('export_done', { file: name }));
  }
  function importProgressText(text) {
    var info;
    try { info = SS.ui.storage.importAll(text); } catch (e) { SS.ui.overlays.toast(SS.t('import_bad')); return false; }
    ctx().save = SS.ui.storage.load(); SS.ui.overlays.setSave(ctx().save); applyFlags();
    if (ctx().save.lang !== SS.strings.lang()) { SS.strings.setLang(ctx().save.lang); SS.ui.overlays.applyLang(); }
    SS.ui.overlays.toast(SS.t(info.newerFormat ? 'import_newer' : 'import_done', { relaxed: info.reached.relaxed, timed: info.reached.timed }));
    var cur = SS.ui.overlays.current(); if (cur) SS.ui.overlays.show(cur);
    return true;
  }
  function importProgress() {
    var input = doc.getElementById('import-file');
    if (!input) { input = doc.createElement('input'); input.type = 'file'; input.id = 'import-file'; input.accept = '.json,application/json'; input.style.display = 'none'; doc.body.appendChild(input);
      input.addEventListener('change', function () { var f = input.files && input.files[0]; if (!f) return; var r = new root.FileReader(); r.onload = function () { importProgressText(String(r.result)); input.value = ''; }; r.readAsText(f); }); }
    input.click();
  }
  function handlers() {
    var A = SS.app;
    return {
      onPlay: function (mode) { A.startMode(mode); }, onIntroDone: function () { if (ctx().state === 'INTRO') A.setState('PLAY'); },
      onResume: function () { A.resume(); }, onRestart: function () { A.restartLevel(); }, onQuit: function () { A.quitToTitle(); },
      onNext: function () { A.nextLevel(); }, onRetry: function () { A.retryLevel(); }, onExtend: function () { A.extend(); }, onEndSerie: function () { A.endSerie(); },
      onUndo: function () { if (ctx().stuckOpen) { SS.ui.overlays.hide('stuck'); ctx().stuckOpen = false; } A.undo(); if (ctx().state === 'PLAY') A.resumePlay(); },
      onRescue: function () { A.rescue(); if (ctx().state === 'PLAY') A.resumePlay(); },
      onToggle: toggle, onLang: setLang, onResetTips: resetTips, onExport: exportProgress, onImport: importProgress,
      onWhatsNewSeen: markVersionSeen, onInstallSeen: markInstallSeen, onFullscreen: setFullscreen, canFullscreen: canFullscreen,
      onClick: function () { guard('snd', SS.sounds && SS.sounds.click); }
    };
  }
  function keyAction(code) {
    var A = SS.app, c = ctx();
    if (code === 'Escape' || code === 'KeyP') return A.back();
    if (code === 'KeyM') { toggle('muted', !c.save.muted); return true; }
    if (code === 'KeyR' && c.state === 'PAUSE') { A.restartLevel(); return true; }
    if (code === 'KeyH' && c.state === 'PLAY') { A.hint(); return true; }
    if (code === 'KeyZ' && c.state === 'PLAY') { A.undo(); return true; }
    if (code === 'Space' && (c.state === 'WIN' || c.state === 'INTRO')) { if (c.state === 'WIN') A.nextLevel(); else A.setState('PLAY'); return true; }
    return false;
  }
  // ---- boot ----
  function boot() {
    if (booted) return;
    booted = true;
    var c = ctx();
    c.save = (SS.ui.storage && guard('storage', SS.ui.storage.load)) || SS.save.normalizeSave(null);
    var legacy = SS.ui.storage && guard('storage', SS.ui.storage.legacyRun);
    if (legacy && legacy.mode === 'timed' && legacy.game && legacy.game.score > 0) { c.save = SS.save.recordRun(c.save, 'timed', { score: legacy.game.score, level: legacy.levelNo, fromLevel: 1, date: SS.app.run.today() }).save; }
    if (c.save.lang === 'de') SS.strings.setLang('de');
    SS.ui.input.installGuards(); SS.ui.input.installKeys(keyAction);
    guard('audio', SS.audio.engine.init, { muted: !!c.save.muted });
    SS.ui.hud.init({ onPause: function () { SS.app.pause(); }, onUndo: function () { SS.app.undo(); }, onBunny: function () { SS.app.toggleBunny(); }, onHint: function () { SS.app.hint(); } });
    SS.ui.overlays.init(handlers()); SS.ui.overlays.setSave(c.save);
    SS.ui.hooks = { onCoachOpen: function () { if (SS.ui.belts) SS.ui.belts.pause(); if (c.game) c.game.frozen = true; SS.ui.board.setEnabled(false); }, onCoachClose: function () { /* the last tip's callback resumes */ } };
    SS.ui.board.init(doc.getElementById('board'), {
      onDrop: SS.app.onDrop, onShift: SS.app.onShift, onCollect: SS.app.onCollect, onSpend: SS.app.onSpend, onTouch: SS.app.onTouch,
      onPick: function () { guard('snd', SS.sounds.pick); },
      onRefused: function (id, ci, reason) { if (reason === 'same') return; guard('snd', SS.sounds.refuse); SS.ui.overlays.toast(SS.t(reason === 'locked' ? 'toast_locked' : reason === 'full' ? 'toast_full' : reason === 'source' ? 'toast_source' : 'toast_nomove')); },
      onLockedTap: function (ci) { var g = c.game; if (g) SS.ui.overlays.toast(SS.t('lock_hint', { n: g.board.comps[ci].lockAt - g.board.matches })); },
      onBackTap: function () { SS.ui.overlays.toast(SS.t('back_hint')); }
    });
    applyFlags(); SS.sprites.setFlat(!!c.save.flatIcons);
    wireViewport(); wireLifecycle();
    guard('main', relayout);
    SS.app.setState('TITLE');
    root.setTimeout(function () { guard('main', relayout); }, 50);
    var q = query();
    if (q.level) root.setTimeout(function () { guard('debug', SS.app.debugLevel, q.mode || 'timed', parseInt(q.level, 10)); }, 80);   // ?level=34&mode=timed: test mode (see docs/HOW-TO-CHANGE.md)
    else root.setTimeout(function () { guard('whatsnew', whatsNewOnBoot); guard('install', installHintOnBoot); }, 120);
    doc.addEventListener('fullscreenchange', scheduleRelayout);
  }
  function query() { var out = {}; try { String(root.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); } catch (e) { /* none */ } return out; }
  function autoBoot() { if (booted || /boot-failed/.test(doc.body.className)) return; boot(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', autoBoot); else root.setTimeout(autoBoot, 0);
  SS.main = { boot: boot, relayout: relayout, handlers: handlers, keyAction: keyAction, setLang: setLang, toggle: toggle, exportProgress: exportProgress, importProgressText: importProgressText, setFullscreen: setFullscreen, standalone: standalone };
})(typeof globalThis !== 'undefined' ? globalThis : this);
