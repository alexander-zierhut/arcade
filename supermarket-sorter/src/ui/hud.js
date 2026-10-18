// src/ui/hud.js: the HUD band (one row since v0.3.3): level pill ("Noch N" under it, coloured by the difficulty); the middle
// pill with the clock and the Serie score (timed) or the moves and the par (relaxed), plus the xN combo badge; the combo
// window as a progress line on the band's bottom edge; the action buttons Rückgängig, Tipp (relaxed only), Goldhase
// (count; tap = arm a spend) and pause. Writes the DOM
// only on change (it runs every frame in timed play). Browser-only; sets SS.ui.hud.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var C = SS.config || {};
  var doc = root.document;
  var el = {}, last = {}, handlers = {}, armed = false;
  var CLOCK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/></svg>';
  var MOVES = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6"/></svg>';
  var IDS = ['hud', 'hud-level', 'hud-level-text', 'hud-left', 'hud-mid', 'hud-mid-icon', 'hud-mid-text', 'hud-score', 'hud-score-text', 'hud-combo', 'hud-combo-fill', 'hud-combo-x', 'btn-pause', 'btn-undo', 'btn-bunny', 'btn-hint', 'bunny-count'];
  var TAGS = ['hard', 'vhard', 'turbo'];

  function init(h) {
    handlers = h || {};
    IDS.forEach(function (id) { el[id] = doc.getElementById(id); });
    wire('btn-pause', 'onPause'); wire('btn-undo', 'onUndo'); wire('btn-bunny', 'onBunny'); wire('btn-hint', 'onHint');
  }
  function wire(id, name) { if (el[id]) el[id].addEventListener('click', function () { if (handlers[name]) handlers[name](); }); }
  function show(on) { if (el.hud) el.hud.hidden = !on; }
  /** height(): the band's height (the hanging tag and combo badges are not counted; main.relayout leaves them room). */
  function height() { return el.hud && !el.hud.hidden ? el.hud.offsetHeight : 0; }
  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function set(key, value, fn) { if (last[key] === value) return; last[key] = value; fn(value); }
  /** update(g, save, serie): refreshes every number and button state (writes only what changed). */
  function update(g, save, serie) {
    if (!g) return;
    var t = SS.t, b = g.board, timed = g.mode === 'timed';
    set('level', g.level.n, function (v) { el['hud-level-text'].textContent = t('level_short', { n: v }); });
    set('left', b.count, function (v) { el['hud-left'].textContent = t('left', { n: v }); });
    // the difficulty is the level pill's colour (turbo wins over the tag); the intro card spells it out
    set('tag', g.level.turbo ? 'turbo' : g.level.tag, function (v) { TAGS.forEach(function (k) { el['hud-level'].classList.toggle(k, v === k); }); });
    // the middle pill: clock over Serie score (timed), moves over par (relaxed)
    var mid, warn = 'none';
    if (timed) { mid = fmtTime(g.timeLeftMs); warn = g.timeLeftMs <= (C.TIME_WARN_S || 10) * 1000 ? 'red' : g.timeLeftMs <= (C.TIME_AMBER_S || 30) * 1000 ? 'amber' : 'none'; if (g.status !== 'playing' && g.status !== 'timeout') warn = 'none'; }
    else mid = String(g.moves);
    set('midIcon', g.mode, function (v) { el['hud-mid-icon'].innerHTML = v === 'timed' ? CLOCK : MOVES; });
    set('mid', mid, function (v) { el['hud-mid-text'].textContent = v; });
    set('warn', warn, function (v) { el['hud-mid'].classList.toggle('warn', v === 'red'); el['hud-mid'].classList.toggle('amber', v === 'amber'); });
    set('sub', timed ? 'score:' + ((serie || 0) + g.levelScore) : 'par:' + g.level.par, function (v) {
      el['hud-score'].classList.toggle('is-par', !timed);
      el['hud-score-text'].textContent = timed ? v.slice(6) : t('par', { n: g.level.par });
    });
    // the combo: the progress line on the band's bottom edge drains with the window; the xN badge after the score shows from x2 on
    var frac = timed ? (g.comboLeftMs > 0 ? g.comboLeftMs / (C.COMBO_WINDOW_MS || 6000) : 0) : (g.comboMovesLeft || 0) / (C.COMBO_MOVES || 3);
    frac = Math.max(0, Math.min(1, frac));
    set('comboOn', frac > 0, function (v) { el['hud-combo'].hidden = !v; });
    set('comboFill', (Math.round(frac * 20) / 20).toFixed(2), function (v) { el['hud-combo-fill'].style.transform = 'scaleX(' + v + ')'; });   // 20 steps, the 0.25 s transition smooths them
    set('combo', frac > 0 ? (g.combo || 0) : 0, function (v) { el['hud-combo-x'].textContent = 'x' + Math.max(2, v); el['hud-combo-x'].classList.toggle('on', v >= 2); el['hud-combo'].classList.toggle('hot', v >= 2); });
    // the action buttons
    set('undo', !(g.undo && g.undo.length) || g.status === 'won', function (v) { el['btn-undo'].disabled = v; });
    set('bunnies', b.bunnies, function (v) { var up = v > (last.bunniesShown || 0); last.bunniesShown = v; el['bunny-count'].textContent = String(v); el['btn-bunny'].classList.toggle('has', v > 0); if (up) pulse('bunny'); });
    set('bunnyOff', b.bunnies < 1 || g.status !== 'playing', function (v) { el['btn-bunny'].disabled = v; });
    set('hintHidden', !!timed, function (v) { el['btn-hint'].hidden = v; });
    set('hintOff', g.status !== 'playing', function (v) { el['btn-hint'].disabled = v; });
  }
  /** reset(): forget the last written values (a new level: every number is written again). */
  function reset() { last = {}; }
  function flashExtend() { el['hud-mid'].classList.remove('flash'); void el['hud-mid'].offsetWidth; el['hud-mid'].classList.add('flash'); }
  function setArmed(on) { armed = !!on; if (el['btn-bunny']) el['btn-bunny'].classList.toggle('armed', armed); }
  function isArmed() { return armed; }
  /** pulse('bunny' | 'undo' | 'hint'): a short pop of that button. */
  function pulse(name) { var b = el['btn-' + name]; if (!b) return; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
  function applyLang() {
    var t = SS.t, labels = { 'btn-undo': 'undo', 'btn-bunny': 'bunny', 'btn-hint': 'hint' };
    for (var id in labels) { var b = el[id]; if (!b) continue; var l = b.querySelector('.lbl'); if (l) l.textContent = t(labels[id]); b.setAttribute('aria-label', t(labels[id])); }
    last = {};
  }
  ui.hud = { init: init, show: show, update: update, reset: reset, height: height, fmtTime: fmtTime, flashExtend: flashExtend, setArmed: setArmed, isArmed: isArmed, pulse: pulse, applyLang: applyLang };
})(typeof globalThis !== 'undefined' ? globalThis : this);
