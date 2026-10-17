// src/ui/hud.js: the HUD (DESIGN 7.2, one row since v0.3): level pill with the tag badge and "Noch N", clock or moves,
// score pill with the combo fill (timed) or the combo pips (relaxed). The action buttons live in ui/bottombar.js.
// Browser-only; sets SS.ui.hud.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var C = SS.config || {};
  var doc = root.document;
  var el = {}, last = {}, handlers = {};
  var CLOCK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/></svg>';
  var MOVES = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6"/></svg>';

  function init(h) {
    handlers = h || {};
    ['hud', 'hud-level-text', 'hud-tag', 'hud-bunny', 'hud-bunny-n', 'hud-mid', 'hud-mid-icon', 'hud-mid-text', 'hud-score', 'hud-score-text', 'hud-combo', 'hud-combo-fill', 'hud-combo-text', 'hud-pips', 'hud-left', 'btn-pause'].forEach(function (id) { el[id] = doc.getElementById(id); });
    if (el['btn-pause']) el['btn-pause'].addEventListener('click', function () { if (handlers.onPause) handlers.onPause(); });
    if (el['hud-bunny']) el['hud-bunny'].addEventListener('click', function () { if (handlers.onBunny) handlers.onBunny(); });
  }
  function show(on) { if (el.hud) el.hud.hidden = !on; }
  function height() { return el.hud && !el.hud.hidden ? el.hud.offsetHeight : 0; }
  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function set(key, value, fn) { if (last[key] === value) return; last[key] = value; fn(value); }
  /** update(g, save, serie): refreshes every number (writes only what changed). */
  function update(g, save, serie) {
    if (!g) return;
    var t = SS.t, b = g.board;
    set('level', g.level.n, function (v) { el['hud-level-text'].textContent = t('level_short', { n: v }); });
    set('bunnies', b.bunnies, function (v) { el['hud-bunny-n'].textContent = String(v); el['hud-bunny'].classList.toggle('has', v > 0); el['hud-bunny'].classList.remove('pop'); void el['hud-bunny'].offsetWidth; if (v > 0) el['hud-bunny'].classList.add('pop'); });
    set('tag', g.level.tag + (g.level.turbo ? '+turbo' : ''), function () { var v = g.level.tag, txt = g.level.turbo ? t('turbo') : v === 'hard' ? t('hard') : v === 'vhard' ? t('vhard') : ''; el['hud-tag'].textContent = txt; el['hud-tag'].hidden = !txt; });
    var mid, warn = 'none';
    if (g.mode === 'timed') { mid = fmtTime(g.timeLeftMs); warn = g.timeLeftMs <= (C.TIME_WARN_S || 10) * 1000 ? 'red' : g.timeLeftMs <= (C.TIME_AMBER_S || 30) * 1000 ? 'amber' : 'none'; if (g.status !== 'playing' && g.status !== 'timeout') warn = 'none'; }
    else mid = g.moves + ' / ' + g.level.par;
    set('midIcon', g.mode, function (v) { el['hud-mid-icon'].innerHTML = v === 'timed' ? CLOCK : MOVES; });
    set('mid', mid, function (v) { el['hud-mid-text'].textContent = v; });
    set('warn', warn, function (v) { el['hud-mid'].classList.toggle('warn', v === 'red'); el['hud-mid'].classList.toggle('amber', v === 'amber'); });
    var scoreText = g.mode === 'timed' ? String((serie || 0) + g.levelScore) : String(g.levelScore || 0);
    if (g.mode === 'relaxed') scoreText = '';
    set('score', scoreText, function (v) { el['hud-score-text'].textContent = v; el['hud-score'].hidden = !v; });
    set('left', b.count, function (v) { el['hud-left'].textContent = t('left', { n: v }); });
    set('rows', g.mode, function (v) { el['hud-pips'].hidden = v === 'timed'; el['hud-combo'].hidden = v !== 'timed'; });
    if (g.mode === 'timed') {
      var frac = g.comboLeftMs > 0 ? g.comboLeftMs / (C.COMBO_WINDOW_MS || 6000) : 0;
      set('comboFill', (Math.round(frac * 20) / 20).toFixed(2), function (v) { el['hud-combo-fill'].style.transform = 'scaleX(' + v + ')'; });   // 20 steps, the 0.25 s transition smooths them
      set('combo', g.comboLeftMs > 0 ? g.combo : 0, function (v) { el['hud-combo-text'].textContent = 'Kombo x' + Math.max(1, v); el['hud-combo'].classList.toggle('hot', v >= 2); });
    } else {
      set('pips', (g.comboMovesLeft || 0) + '/' + (g.combo || 0), function () { var dots = el['hud-pips'].children; for (var i = 0; i < 3; i++) dots[i].classList.toggle('on', i < (g.comboMovesLeft || 0)); el['hud-pips'].querySelector('span').textContent = g.combo >= 2 ? 'x' + g.combo : ''; });
    }
  }
  function reset() { last = {}; }
  function flashExtend() { el['hud-mid'].classList.remove('flash'); void el['hud-mid'].offsetWidth; el['hud-mid'].classList.add('flash'); }
  ui.hud = { init: init, show: show, update: update, reset: reset, height: height, fmtTime: fmtTime, flashExtend: flashExtend };
})(typeof globalThis !== 'undefined' ? globalThis : this);
